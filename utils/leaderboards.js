const { connectToMySQL, getLeaderboardData, logMatchResult, logEloUpdate, getFPSLeaderboard, getAllPlayersEloWithStats } = require('../db');
const { weaponMapping, shipMapping } = require('./gameData');
const { EmbedBuilder, Colors } = require('discord.js');
const schedule = require('node-schedule');
const fs = require('fs');

const eloDmMsgMap = new Map();

const API_LADDER_CHANNEL_ID = '1431022173627351222'; // API pool channel
const WEEKLY_FIGHT_LADDER_CHANNEL = '1330611959082782741'; // Manual pool channel
const MANUAL_LADDER_CHANNEL_ID = '1431022173627351222'; // your preferred manual/fallback channel
const LEADERBOARD_BATCH_DELAY = 500; // ms between message edits
const LEADERBOARD_UPDATE_COOLDOWN = 30000; // 30 seconds minimum between updates
const LIVE_LADDER_CHANNEL_ID = '1431022316317310976';
const MSG_IDS_FILE = './live_ladder_msgids.json';
const LADDER_GUILD_ID = 1166103102378750033;
const MANUAL_ELO_MSG_ID_FILE = './elo_update_msgid.txt';
const API_ELO_MSG_ID_FILE = './api_elomsgid.txt';
const LB_CACHE_FILE = './last_leaderboard.json';
const SUBS_FILE = './elo_dm_subs.json';
let lastLeaderboardUpdate = 0;
let leaderboardUpdatePending = false;

async function consoleLog(message) {
  const timestamp = new Date().toISOString(); 
  const logLine = `[${timestamp}] ${message}`;
  try {
    console.log(logLine);
  } catch (err) {
    console.error('Failed to write to console:', err);
  }
}

function saveMsgId(msgIdFile, messageId) {
    // Make file saving non-blocking
    Promise.resolve().then(async () => {
        try {
            const fs = require('fs').promises;
            await fs.writeFile(msgIdFile, messageId);
        } catch (err) {
            console.error(`[appendEloUpdateMessage] Failed to save message ID to ${msgIdFile}:`, err);
        }
    }).catch(() => {}); // Silent fail for non-critical operation
}

function getMsgId(msgIdFile) {
    try {
        const fs = require('fs');
        if (fs.existsSync(msgIdFile)) {
            return fs.readFileSync(msgIdFile, 'utf8').trim();
        }
    } catch (err) {
        console.error(`[appendEloUpdateMessage] Failed to read message ID from ${msgIdFile}:`, err);
    }
    return null;
}

function getEloSubscribers() {
    try {
        return new Set(JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')));
    } catch {
        return new Set();
    }
}

function saveEloSubscribers(subs) {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(Array.from(subs)));
}

async function addEloSubscriber(id) {
    const subs = getEloSubscribers();
    subs.add(id);
    saveEloSubscribers(subs);
}

async function removeEloSubscriber(id) {
    const subs = getEloSubscribers();
    subs.delete(id);
    saveEloSubscribers(subs);
}

async function deleteUserEloDMs(userId, client) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const msgIds = eloDmMsgMap.get(userId) || [];
    if (!msgIds.length) return;
    try {
        const dmChannel = await user.createDM();
        for (const id of msgIds) {
            const msg = await dmChannel.messages.fetch(id).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
        }
    } catch {}
    eloDmMsgMap.delete(userId);
}

async function sendOrUpdateEloDm(client, userId, embed) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    let dmMsgIds = eloDmMsgMap.get(userId) || [];

    // Try to edit most recent DM if possible
    let msg = null;
    if (dmMsgIds.length > 0) {
        try {
            const channel = await user.createDM();
            msg = await channel.messages.fetch(dmMsgIds[0]);
            if (msg) {
                await msg.edit({ embeds: [embed] });
                return;
            }
        } catch (e) {
            // If error, fall through to send new
        }
    }

    // Send new DM if needed
    try {
        const dm = await user.send({ embeds: [embed] });
        eloDmMsgMap.set(userId, [dm.id]);
    } catch (e) {
        // Failed to DM user (privacy or blocks)
    }
}

function getPreviousLeaderboardRanks() {
    if (!fs.existsSync(LB_CACHE_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(LB_CACHE_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveCurrentLeaderboardRanks(rankArr) {
    // rankArr: Array of { username, ... } in leaderboard order
    const indexMap = rankArr.reduce((acc, row, idx) => {
        acc[row.username] = idx; // use .username because that's what leaderboard entries have
        return acc;
    }, {});
    fs.writeFileSync(LB_CACHE_FILE, JSON.stringify(indexMap));
}

async function getDisplayName(guild, userId, fallback) {
    try {
        const member = await guild.members.fetch(userId);
        return member?.nickname || member?.user?.globalName || member?.user?.username || fallback || userId;
    } catch {
        return fallback || userId;
    }
}

async function postLiveEloLeaderboard(client) {
  const now = Date.now();
  
  // If an update is already in progress, skip this one
  if (leaderboardUpdatePending) {
    consoleLog('[postLiveEloLeaderboard] Skipping - update already in progress');
    return;
  }
  
  // If we updated too recently, skip this one
  if (now - lastLeaderboardUpdate < LEADERBOARD_UPDATE_COOLDOWN) {
    consoleLog('[postLiveEloLeaderboard] Skipping - too soon since last update');
    return;
  }
  
  leaderboardUpdatePending = true;
  lastLeaderboardUpdate = now;
  
  consoleLog('[postLiveEloLeaderboard] Started');

  try {
    const channel = await client.channels.fetch(LIVE_LADDER_CHANNEL_ID).catch(err => {
      consoleLog('[postLiveEloLeaderboard] Failed to fetch channel:', err);
      return null;
    });
    
    if (!channel) {
      consoleLog('[postLiveEloLeaderboard] No channel found, aborting');
      return;
    }
    
    consoleLog('[postLiveEloLeaderboard] Channel fetched successfully');

    // 🚀 PARALLEL data fetching
    const [leaderboardData, previousRanks, existingMsgIds] = await Promise.all([
      getAllPlayersEloWithStats(channel.guild.id),
      getPreviousLeaderboardRanks(),
      loadMessageIds()
    ]);

    let leaderboard = leaderboardData;
    const membersCount = leaderboard.filter(p => p.source === 'members').length;
    const globalCount = leaderboard.filter(p => p.source === 'global').length;

    consoleLog(
      `[postLiveEloLeaderboard] Raw leaderboard fetched — Total: ${leaderboard.length} | Members: ${membersCount} | Global: ${globalCount}`
    );

    // Filter out inactive players
    leaderboard = leaderboard.filter(player => !(player.elo === 1200 && (!player.matchesPlayed || player.matchesPlayed === 0)));
    consoleLog(`[postLiveEloLeaderboard] Filtered leaderboard. Players after filter: ${leaderboard.length}`);

    leaderboard.sort((a, b) => b.elo - a.elo);

    const total = leaderboard.length;
    if (!total) {
      consoleLog('[postLiveEloLeaderboard] No players to show on leaderboard');
      await sendNoDataEmbed(channel);
      return;
    }

    consoleLog('[postLiveEloLeaderboard] Building leaderboard embeds');
    
    // 🚀 Build embeds in parallel with data processing
    const embeds = await buildLeaderboardEmbeds(leaderboard, previousRanks, total);
    consoleLog(`[postLiveEloLeaderboard] Built ${embeds.length} embeds`);

    // 🚀 PARALLEL message updates with batching
    const newMsgIds = await updateLeaderboardMessages(channel, embeds, existingMsgIds);
    
    // Save new message IDs
    saveCurrentLeaderboardRanks(leaderboard);
    await saveMessageIds(newMsgIds);
    
    consoleLog('[postLiveEloLeaderboard] Completed successfully');

  } catch (error) {
    consoleLog(`[postLiveEloLeaderboard] ERROR: ${error.message}`);
  } finally {
    // 🚨 CRITICAL: Always reset the pending flag
    leaderboardUpdatePending = false;
  }
}

async function saveMessageIds(messageIds) {
  try {
    await fs.promises.writeFile(MSG_IDS_FILE, JSON.stringify(messageIds));
  } catch (error) {
    consoleLog('[postLiveEloLeaderboard] Failed to save message IDs:', error);
  }
}

async function sendNoDataEmbed(channel) {
  const noDataEmbed = new EmbedBuilder()
    .setTitle('🥊 Live Fight Ladder')
    .setDescription('No ELO data available yet.')
    .setColor(Colors.Gold)
    .setFooter({ text: 'Leaderboard is ELO based (Glicko-2, starts at 1200).' })
    .setTimestamp();

  await channel.send({ embeds: [noDataEmbed] });
}

async function buildLeaderboardEmbeds(leaderboard, previousRanks, total) {
  const champion = leaderboard[0];
  const championEmbed = new EmbedBuilder()
    .setTitle(`👑 CURRENT CHAMPION: ${champion.username} — Apex #1`)
    .setDescription(`ELO: \`${champion.elo}\`\nWin Rate: \`N/A\`\nK/D: \`N/A\``)
    .setColor(Colors.Gold)
    .setTimestamp();

  const tierRanges = {
    'APEX #1': 'Top 1',
    'Level 10': 'Top 5%',
    'Level 9': 'Top 10%',
    'Level 8': 'Top 15%',
    'Level 7': 'Top 30%',
    'Level 6': 'Top 40%',
    'Level 5': 'Top 50%',
    'Level 4': 'Top 60%',
    'Level 3': 'Top 70%',
    'Level 2': 'Top 80%',
    'Level 1': 'Bottom 20%'
  };

  let currentTier = '';
  const rowsArr = leaderboard.slice(1).map((entry, i) => {
    const percentile = 1 - ((i + 1) / total);
    const rankTier = getRankByPercentile(percentile);
    const prevRank = previousRanks[entry.username];
    const arrow = getRankChangeArrow(prevRank, i + 1);

    let row = '';
    if (rankTier !== currentTier) {
      currentTier = rankTier;
      const banner = `\n━━━ 🏆 **${rankTier.toUpperCase()}** (${tierRanges[rankTier] || ''}) ━━━\n`;
      row += banner;
    }

    row += `**${i + 2}.** ${entry.username} ${arrow}\nELO: \`${entry.elo}\`\n`;
    return row;
  });

  const ROWS_PER_EMBED = 50;
  const embeds = [championEmbed];
  
  for (let i = 0; i < rowsArr.length; i += ROWS_PER_EMBED) {
    const chunkRows = rowsArr.slice(i, i + ROWS_PER_EMBED).join('');
    embeds.push(
      new EmbedBuilder()
        .setTitle(`🥊 Live Fight Ladder${embeds.length > 1 ? ` (cont. ${embeds.length})` : ''}`)
        .setDescription(chunkRows)
        .setColor(Colors.Gold)
        .setFooter({ text: 'Ranks auto-adjust by percentile as ELO shifts.' })
        .setTimestamp()
    );
  }
  
  return embeds;
}

function loadMessageIds() {
  if (fs.existsSync(MSG_IDS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MSG_IDS_FILE, 'utf8'));
    } catch (e) {
      consoleLog('[postLiveEloLeaderboard] Failed to parse message IDs file:', e);
    }
  }
  return [];
}

async function updateLeaderboardMessages(channel, embeds, existingMsgIds) {
  const newMsgIds = [];
  const updatePromises = [];
  
  for (let i = 0; i < embeds.length; i++) {
    const updatePromise = (async (index) => {
      // Stagger message edits to avoid rate limits
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, LEADERBOARD_BATCH_DELAY * index));
      }
      
      let msg = null;
      if (existingMsgIds[index]) {
        msg = await channel.messages.fetch(existingMsgIds[index]).catch(() => null);
        if (msg) {
          consoleLog(`[postLiveEloLeaderboard] Editing existing message ID ${existingMsgIds[index]}`);
          await msg.edit({ embeds: [embeds[index]] });
          return msg.id;
        }
      }
      
      // Send new message if editing failed or no existing message
      msg = await channel.send({ embeds: [embeds[index]] });
      consoleLog(`[postLiveEloLeaderboard] Sent new message with ID ${msg.id}`);
      return msg.id;
    })(i);
    
    updatePromises.push(updatePromise);
  }
  
  // Wait for all message updates to complete
  const results = await Promise.allSettled(updatePromises);
  
  // Collect successful message IDs
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      newMsgIds[index] = result.value;
    } else {
      consoleLog(`[postLiveEloLeaderboard] Failed to update message ${index}:`, result.reason);
      // Keep old ID if update failed
      newMsgIds[index] = existingMsgIds[index] || null;
    }
  });
  
  // 🚀 Clean up old messages in parallel
  await cleanupOldMessages(channel, existingMsgIds, embeds.length);
  
  return newMsgIds.filter(id => id !== null);
}

async function cleanupOldMessages(channel, existingMsgIds, currentCount) {
  const cleanupPromises = [];
  
  for (let i = currentCount; i < existingMsgIds.length; i++) {
    const cleanupPromise = channel.messages.fetch(existingMsgIds[i])
      .then(msg => {
        if (msg) {
          consoleLog(`[postLiveEloLeaderboard] Deleting old message ID ${existingMsgIds[i]}`);
          return msg.delete().catch(() => {});
        }
      })
      .catch(() => {}); // Message already deleted or inaccessible
    
    cleanupPromises.push(cleanupPromise);
  }
  
  await Promise.allSettled(cleanupPromises);
}

async function updateLiveEloMessage(client, killerRow, victimRow, killerOld, killerNew, victimOld, victimNew, pool = 'MANUAL') {
    console.log('[updateLiveEloMessage] START', { killer: killerRow.username, victim: victimRow.username, pool });

    const isApi = pool === 'API';
    const channelId = isApi ? API_LADDER_CHANNEL_ID : MANUAL_LADDER_CHANNEL_ID;
    const msgIdFile = isApi ? API_ELO_MSG_ID_FILE : MANUAL_ELO_MSG_ID_FILE;

    const channel = await client.channels.fetch(channelId).catch(err => {
        console.error('[updateLiveEloMessage] Channel fetch failed:', err);
        return null;
    });
    if (!channel) return;

    const guild = channel.guild || await client.guilds.fetch(LADDER_GUILD_ID);
    const killerName = await getDisplayName(guild, killerRow.user_id, killerRow.username) || killerRow.username || 'Unknown';
    const victimName = await getDisplayName(guild, victimRow.user_id, victimRow.username) || victimRow.username || 'Unknown';

    const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;
    const newEntry = ` **${killerName}** defeated **${victimName}** in FreeFlight!\n` +
                     `**ELO:**\n- ${killerName}: \`${killerOld} → ${killerNew}\`\n- ${victimName}: \`${victimOld} → ${victimNew}\`\n` +
                     `*${timestamp}*\n\n`;

    const lastMsgId = getMsgId(msgIdFile);
    let msg = lastMsgId ? await channel.messages.fetch(lastMsgId).catch(() => null) : null;

    if (msg?.embeds?.[0]) {
        const combined = (msg.embeds[0].description || '') + newEntry;

        if (combined.length <= 4096) {
            await msg.edit({
                embeds: [new EmbedBuilder(msg.embeds[0].data).setDescription(combined).setTimestamp()]
            });
        } else {
            const newMsg = await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(isApi ? '🥊 API ELO Audit Log' : '⚔️ Dojo Fight ELO Audit Log')
                        .setDescription(newEntry)
                        .setColor(isApi ? Colors.Gold : Colors.Purple)
                        .setTimestamp()
                ]
            });
            saveMsgId(msgIdFile, newMsg.id);
        }
    } else {
        const newMsg = await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(isApi ? '🥊 API ELO Audit Log' : '⚔️ Dojo Fight ELO Audit Log')
                    .setDescription(newEntry)
                    .setColor(isApi ? Colors.Gold : Colors.Purple)
                    .setTimestamp()
            ]
        });
        saveMsgId(msgIdFile, newMsg.id);
    }

    // ⬇️ Log into SQL
    await logEloUpdate({
        killerId: killerRow.user_id,
        killerName,
        victimId: victimRow.user_id,
        victimName,
        killerOld,
        killerNew,
        victimOld,
        victimNew,
        poolName: pool
    });

    try {
        await postLiveEloLeaderboard(client);
        console.log('[updateLiveEloMessage] Leaderboard refreshed.');
    } catch (err) {
        console.error('[updateLiveEloMessage] Leaderboard update failed:', err);
    }
}

async function appendEloUpdateMessage(
    client,
    killerRow,
    victimRow,
    killerOldGlicko,
    killerNewGlicko,
    victimOldGlicko,
    victimNewGlicko,
    pool = 'MANUAL'
) {
    const effectivePool = pool === 'ACK' ? 'API' : pool;
    console.log('[appendEloUpdateMessage] START', {
        killer: killerRow.username,
        victim: victimRow.username,
        pool: effectivePool
    });

    const isApi = effectivePool === 'API';
    const channelId = isApi ? API_LADDER_CHANNEL_ID : MANUAL_LADDER_CHANNEL_ID;
    const msgIdFile = isApi ? API_ELO_MSG_ID_FILE : MANUAL_ELO_MSG_ID_FILE;

    // 🚨 TRULY NON-BLOCKING: Start leaderboard update immediately without waiting
    const leaderboardPromise = postLiveEloLeaderboard(client).catch(err => {
        console.error('[appendEloUpdateMessage] Leaderboard update failed (non-blocking):', err);
    });

    // 🚨 Channel fetch is critical - we need this to proceed
    const channel = await client.channels.fetch(channelId).catch(err => {
        console.error('[appendEloUpdateMessage] Channel fetch failed:', err);
        return null;
    });
    if (!channel) {
        console.log('[appendEloUpdateMessage] Aborted - no channel');
        return;
    }

    const guild = channel.guild || await client.guilds.fetch(LADDER_GUILD_ID);
    
    // 🚨 PARALLEL: Fetch display names concurrently
    const [killerName, victimName] = await Promise.all([
        getDisplayName(guild, killerRow.user_id, killerRow.username).catch(() => killerRow.username || 'Unknown'),
        getDisplayName(guild, victimRow.user_id, victimRow.username).catch(() => victimRow.username || 'Unknown')
    ]);

    const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;

    // ----------------- Message content -----------------
    const newEntry = ` **${killerName}** defeated **${victimName}** in FreeFlight!\n` +
                     `**Glicko2 ELO:**\n- ${killerName}: \`${killerOldGlicko} → ${killerNewGlicko}\`\n- ${victimName}: \`${victimOldGlicko} → ${victimNewGlicko}\`\n` +
                     `*${timestamp}*\n\n`;

    const lastMsgId = getMsgId(msgIdFile);
    
    // 🚨 PARALLEL: Fetch message while preparing other operations
    const msgFetchPromise = lastMsgId ? 
        channel.messages.fetch(lastMsgId).catch(() => null) : 
        Promise.resolve(null);

    // 🚨 Prepare DM notifications while waiting for message fetch
    const subs = getEloSubscribers();
    const dmPromises = [];
    
    for (const userId of subs) {
        const strUserId = String(userId);
        const strKillerId = String(killerRow.user_id);
        const strVictimId = String(victimRow.user_id);

        let dmDescription = '';
        if (strUserId === strKillerId) {
            dmDescription = `You defeated **${victimName}**!\nGlicko2 ELO: \`${killerOldGlicko} → ${killerNewGlicko}\`\n*${timestamp}*`;
        } else if (strUserId === strVictimId) {
            dmDescription = `You were defeated by **${killerName}**!\nGlicko2 ELO: \`${victimOldGlicko} → ${victimNewGlicko}\`\n*${timestamp}*`;
        }

        if (dmDescription) {
            const dmPromise = sendOrUpdateEloDm(
                client,
                strUserId,
                new EmbedBuilder()
                    .setTitle('Your Glicko2 ELO Update')
                    .setDescription(dmDescription)
                    .setColor(Colors.Blurple)
                    .setTimestamp()
            ).catch(err => {
                console.error(`[appendEloUpdateMessage] Failed to DM ${strUserId}:`, err);
            });
            dmPromises.push(dmPromise);
        }
    }

    // 🚨 Get the message now that we've prepared other operations
    const msg = await msgFetchPromise;

    // 🚨 CRITICAL OPERATIONS: Message update and database logging
    const criticalOperations = [];

    // Discord message operation
    const messageOperation = (async () => {
        if (msg?.embeds?.[0]) {
            const combined = (msg.embeds[0].description || '') + newEntry;

            if (combined.length <= 4096) {
                await msg.edit({
                    embeds: [new EmbedBuilder(msg.embeds[0].data).setDescription(combined).setTimestamp()]
                });
            } else {
                const newMsg = await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(isApi ? '🥊 API Glicko2 ELO Audit Log' : '⚔️ Dojo Fight Glicko2 ELO Audit Log')
                            .setDescription(newEntry)
                            .setColor(isApi ? Colors.Gold : Colors.Purple)
                            .setTimestamp()
                    ]
                });
                saveMsgId(msgIdFile, newMsg.id);
            }
        } else {
            const newMsg = await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(isApi ? '🥊 API Glicko2 ELO Audit Log' : '⚔️ Dojo Fight Glicko2 ELO Audit Log')
                        .setDescription(newEntry)
                        .setColor(isApi ? Colors.Gold : Colors.Purple)
                        .setTimestamp()
                ]
            });
            saveMsgId(msgIdFile, newMsg.id);
        }
    })().catch(err => {
        console.error('[appendEloUpdateMessage] Discord message failed:', err);
    });
    criticalOperations.push(messageOperation);

    // Database logging operation
    const dbOperation = logMatchResult({
        poolName: effectivePool,
        killerId: killerRow.user_id,
        killerName,
        victimId: victimRow.user_id,
        victimName,
        killerOldGlicko,
        killerNewGlicko,
        victimOldGlicko,
        victimNewGlicko
    }).catch(err => {
        console.error('[appendEloUpdateMessage] DB insert failed:', err);
    });
    criticalOperations.push(dbOperation);

    // 🚨 Wait ONLY for critical operations (message + database)
    await Promise.allSettled([...criticalOperations, ...dmPromises]);
    
    // 🚨 LEADERBOARD: Completely non-blocking - don't wait for it at all
    // The leaderboardPromise is already running in the background
    
    console.log('[appendEloUpdateMessage] Completed (non-blocking) - leaderboard update running in background');
}

async function getCategoryStats(gameModes, startDate, endDate) {
    const db = await connectToMySQL();
    
    try {
        // Total kills query
        const totalKillsQuery = `
            SELECT COUNT(*) as totalKills
            FROM DailyKillTracker 
            WHERE game_mode IN (?) AND time >= ? AND time < ?
        `;
        
        // Top weapon query
        const topWeaponQuery = `
            SELECT weapon, COUNT(*) as weaponCount
            FROM DailyKillTracker 
            WHERE game_mode IN (?) AND time >= ? AND time < ? 
            AND weapon IS NOT NULL AND weapon != 'Unknown'
            GROUP BY weapon 
            ORDER BY weaponCount DESC 
            LIMIT 1
        `;

        const [[{ totalKills }]] = await db.query(totalKillsQuery, [gameModes, startDate, endDate]);
        const [[topWeaponData]] = await db.query(topWeaponQuery, [gameModes, startDate, endDate]);
        
        // Process weapon name using your mapping
        const topWeapon = topWeaponData ? 
            (weaponMapping[topWeaponData.weapon] || topWeaponData.weapon) : 
            'No data';
        
        return {
            totalKills: totalKills || 0,
            topWeapon: topWeapon
        };
        
    } catch (error) {
        console.error('Error fetching category stats:', error);
        return { totalKills: 0, topWeapon: 'No data' };
    }
}

//Leaderboards Start

function cleanUpName(name) {
    if (!name) return "Unknown";
    return name.replace(/_\d+$/, '') || "Unknown";
}

function getDisplayWeapon(weapon) {
    if (!weapon) return "Unknown Weapon";
    
    if (weaponMapping[weapon]) {
        return weaponMapping[weapon];
    }
    
    const matchingKey = Object.keys(weaponMapping).find(key => 
        key.startsWith(weapon) || weapon.startsWith(key)
    );
    
    if (matchingKey) {
        return weaponMapping[matchingKey];
    }
    
    return cleanUpName(weapon) || "Unknown Weapon";
}

function getDisplayShip(ship) {
    if (!ship) return "Unknown Ship";
    
    if (shipMapping[ship]) {
        return shipMapping[ship];
    }
    
    const matchingKey = Object.keys(shipMapping).find(key => 
        key.startsWith(ship) || ship.startsWith(key)
    );
    
    if (matchingKey) {
        return shipMapping[matchingKey];
    }
    
    return cleanUpName(ship) || "Unknown Ship";
}

function getDisplayZone(zone) {
    if (!zone) return "Unknown Zone";
    return shipMapping[zone] || cleanUpName(zone) || "Unknown Zone";
}

function getBaseWeaponId(weaponId) {
    if (!weaponId) return "unknown";
    
    let baseId = weaponId
        .replace(/_store\d+$/, '')
        .replace(/_tint\d+$/, '')
        .replace(/_camo\d+$/, '')
        .replace(/_spc_\d+$/, '')
        .replace(/_gungame$/, '')
        .replace(/_luminalia$/, '')
        .replace(/_iae\d+$/, '')
        .replace(/_firerats\d+$/, '')
        .replace(/_exec_\w+$/, '')
        .replace(/_military$/, '')
        .replace(/_civilian$/, '')
        .replace(/_\w+_\d+$/, '');
    
    return baseId;
}

function groupWeaponsByBaseId(weapons) {
    console.log("=== DEBUG WEAPON GROUPING ===");
    
    const grouped = {};
    
    weapons.forEach(weapon => {
        const baseId = getBaseWeaponId(weapon.weapon);
        const displayName = getDisplayWeapon(baseId);
        
        const killCount = weapon.weapon_count;
        
        if (grouped[displayName]) {
            grouped[displayName].weapon_count += killCount;
        } else {
            grouped[displayName] = {
                display_name: displayName,
                weapon_count: killCount,
                original_id: weapon.weapon
            };
        }
    });
    
    console.log("Final grouped weapons:", Object.keys(grouped));
    console.log("=== END DEBUG ===");
    
    return Object.values(grouped)
        .sort((a, b) => b.weapon_count - a.weapon_count)
        .slice(0, 5);
}

function isShipWeapon(weaponId) {
    if (!weaponId) return false;
    
    const shipWeaponIndicators = [
        'KLWE_', 'HRST_', 'RSI_', 'BEHR_', 'AMRS_', 'APAR_', 'ESPR_', 'GATS_', 
        'KBAR_', 'VNCL_', 'MXOX_', 'KRON_', 'GLSN_', 'Krig_', 'MRCK_', 'BMBRCK_'
    ];
    
    return shipWeaponIndicators.some(indicator => 
        weaponId.startsWith(indicator)
    );
}

function isFPSWeapon(weaponId) {
    if (!weaponId) return false;
    
    const fpsWeaponIndicators = [
        'none_', 'gmni_', 'behr_', 'ksar_', 'hdgw_', 'klwe_', 'lbco_', 'volt_',
        'utfl_', 'apar_special_'
    ];
    
    return fpsWeaponIndicators.some(indicator => 
        weaponId.startsWith(indicator)
    );
}

// Weapon category detection
function isShipWeapon(weaponId) {
    if (!weaponId) return false;
    
    const shipWeaponIndicators = [
        'KLWE_', 'HRST_', 'RSI_', 'BEHR_', 'AMRS_', 'APAR_', 'ESPR_', 'GATS_', 
        'KBAR_', 'VNCL_', 'MXOX_', 'KRON_', 'GLSN_', 'Krig_', 'MRCK_', 'BMBRCK_'
    ];
    
    return shipWeaponIndicators.some(indicator => 
        weaponId.startsWith(indicator)
    );
}

function isFPSWeapon(weaponId) {
    if (!weaponId) return false;
    
    const fpsWeaponIndicators = [
        'none_', 'gmni_', 'behr_', 'ksar_', 'hdgw_', 'klwe_', 'lbco_', 'volt_',
        'utfl_', 'apar_special_'
    ];
    
    return fpsWeaponIndicators.some(indicator => 
        weaponId.startsWith(indicator)
    );
}

// UTC Date Range Functions
function getUTCDateRangeForPreviousDay() {
    const now = new Date();
    const yesterdayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    return {
        start: yesterdayUTC,
        end: todayUTC
    };
}

function getUTCWeekRange() {
    const now = new Date();
    const currentDay = now.getUTCDay();
    const currentDate = now.getUTCDate();
    
    // Calculate Monday of this week (UTC)
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), currentDate - (currentDay === 0 ? 6 : currentDay - 1)));
    thisMonday.setUTCHours(0, 0, 0, 0);
    
    // Calculate Monday of last week
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    
    return {
        start: lastMonday,
        end: thisMonday
    };
}

function formatUTCDate(date) {
    return date.toISOString().split('T')[0];
}

async function getCategoryStats(gameModes, startDate, endDate) {
    const db = await connectToMySQL();
    
    const gameModeCondition = gameModes.map(() => 'game_mode = ?').join(' OR ');
    const queryParams = [...gameModes, startDate, endDate];
    
    const totalKillsQuery = `
        SELECT COUNT(*) as total_kills
        FROM DailyKillTracker
        WHERE (${gameModeCondition}) AND time >= ? AND time < ?
    `;
    
    const topWeaponQuery = `
        SELECT weapon, COUNT(*) as weapon_count
        FROM DailyKillTracker
        WHERE (${gameModeCondition}) AND time >= ? AND time < ?
        AND weapon IS NOT NULL AND weapon != 'Unknown' AND weapon != 'N/A'
        GROUP BY weapon
        ORDER BY weapon_count DESC
        LIMIT 1
    `;
    
    try {
        const [[{ total_kills }]] = await db.query(totalKillsQuery, queryParams);
        const [[topWeaponData]] = await db.query(topWeaponQuery, queryParams);
        
        return {
            totalKills: total_kills || 0,
            topWeapon: getDisplayWeapon(topWeaponData?.weapon)
        };
    } catch (error) {
        console.error('Error fetching category stats:', error);
        return { totalKills: 0, topWeapon: 'Unknown Weapon' };
    }
}

// Updated postLeaderboards function with UTC time
async function postLeaderboards(client, guild) {
    const leaderboardChannelId = '1303837974521315449';

    const leaderboardCategories = [
        {
            title: "🚀 Persistent Universe - Yesterday's Top Killers",
            gameModes: ["SC_Default"],
            color: Colors.Blue,
            description: "Most kills in the PU yesterday",
            emoji: "🚀"
        },
        {
            title: "🕹 Arena Commander Pilots - Yesterday's Top Killers",
            gameModes: ["EA_SquadronBattle", "EA_FreeFlight"],
            color: Colors.Red,
            description: "Most pilot kills in Squadron Battle & Free Flight yesterday",
            emoji: "🕹"
        },
        {
            title: "🔫 Arena Commander FPS - Yesterday's Top Killers",
            gameModes: ["EA_FPSGunGame", "EA_Elimination", "EA_FPSKillConfirmed", "EA_TeamElimination"],
            color: Colors.Green,
            description: "Most FPS kills in Elimination, Kill Confirmed & Gun Game yesterday",
            emoji: "🔫"
        }
    ];

    const channel = await client.channels.fetch(leaderboardChannelId).catch(err => {
        console.error(`Failed to fetch channel with ID ${leaderboardChannelId}:`, err);
        return null;
    });

    if (!channel) {
        console.error(`Channel with ID ${leaderboardChannelId} not found.`);
        return;
    }

    // FIXED: Use UTC date range for PREVIOUS DAY
    const { start: yesterday, end: today } = getUTCDateRangeForPreviousDay();
    const yesterdayDateString = formatUTCDate(yesterday);

    for (const category of leaderboardCategories) {
        try {
            // Get top 10 killers for this category
            const leaderboardData = await getLeaderboardData(category.gameModes, false, yesterday, today);
            
            // Get total kills and top weapon for this category
            const statsData = await getCategoryStats(category.gameModes, yesterday, today);
            
            const leaderboardEntries = leaderboardData.map((row, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = index < 3 ? medals[index] : `${index + 1}.`;
                return `${medal} **${row.killer}** - \`${row.kill_count} kills\``;
            }).join('\n');

            const description = `${category.description}\n**Date:** ${yesterdayDateString} (UTC)\n\n**Total Kills:** \`${statsData.totalKills}\`\n**Top Weapon:** \`${statsData.topWeapon}\`\n\n${leaderboardEntries.length > 0 ? leaderboardEntries : "No kills recorded yesterday."}`;

            const embed = new EmbedBuilder()
                .setTitle(category.title)
                .setDescription(description)
                .setColor(category.color)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Error processing leaderboard category "${category.title}":`, error);
        }
    }
}

// Updated postWeeklyLeaderboard function with proper weapon grouping by base ID and UTC time
async function postWeeklyLeaderboard(client) {
    const leaderboardChannelId = '1168278367359995904';

    const bannerImages = [
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325848407000092755/float.gif?ex=677d480d&is=677bf68d&hm=e293fcaa544f5a789d051e730a365e9edfc61fe53493c724fc8a1ea9cab7b613&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325851845276598334/9fa5oj.gif?ex=677d4b41&is=677bf9c1&hm=ba0c79733352bd79391e7cfea62aab0b40c58f77756e1016a65f1c2364288f7e&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325851859839225896/1197138-dogfight-amp_main_img-2.jpg?ex=677d4b44&is=677bf9c4&hm=bf696d3ac14c97ab1a37853f976a6cafa45cc4c023a66195144d09177936d745&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325851886796013608/22316726982_e67423111b_b.jpg?ex=677d4b4a&is=677bf9ca&hm=b799cf563931858d0cd2b652df20db8fe8d98017237947517849af9723472675&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325851944912162943/giphy1.gif?ex=677d4b58&is=677bf9d8&hm=366474c0794ce58f120f18bd1a7aad7ca6e4af56d196a32d459818ec6971e6eb&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325851960506581002/giphy.gif?ex=677d4b5c&is=677bf9dc&hm=c43d01d93bf7ff2e476094b04101c7c8e5f65a994de2d27cb156eae157c5fcfb&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325851985387458590/giphy2.gif?ex=677d4b62&is=677bf9e2&hm=0e4cb2f0d970cc0ed10a4976f341c981a0cca3c59b2e8d3fba83abeb9bb37087&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852003514974299/giphy3.gif?ex=677d4b66&is=677bf9e6&hm=f454816ef2371432b8dcf53d1b84bc7f58d7afe82be770c7441bb53171fe6c98&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852024008347821/giphyfancy.gif?ex=677d4b6b&is=677bf9eb&hm=41c9388678f5687141ac3d807cb14deea2fd6a42bcad37aacd75139afb2d3f4e&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852033408040970/giphypico.gif?ex=677d4b6d&is=677bf9ed&hm=c9fc501fab2990f53f9ba24134396c61aa0ada227e76c97d379ddd20a36d20a3&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852057617305691/giphyred.gif?ex=677d4b73&is=677bf9f3&hm=80579fff7001b71b12bdf303ef19be1d0c594794c144ca58a72b2e718848006f&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852083756204062/image.png?ex=677d4b79&is=677bf9f9&hm=9f6611e1375afeeb17652914a871d19c53e04f028858c71edbaa2cf60177ffcf&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852101116563466/jtcontention.webp?ex=677d4b7e&is=677bf9fe&hm=08e698ba3af6933dc3ec94c352a2787e082ed41246ec7740d576288bb3bb82e2&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852124818702367/ScreenShot-2024-06-14_16-20-15-B9D.jpg?ex=677d4b83&is=677bfa03&hm=6a491b9ebad1d681fa57755cb8f1d8933476a61257112882d8967304c037a683&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325852137778974804/TOW_Snip.JPG?ex=677d4b86&is=677bfa06&hm=831d1fd87b738055b0e86ecac2e73358df6a21bdba97ef8e9b5d782e2708971a&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1325908688921169970/giphy4.gif?ex=677d8031&is=677c2eb1&hm=0a838a91e3dcda0547640e25815208c750746afc2801e1520e1942c3feab1d1c&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465650346725376/giphy123.gif?ex=678a70df&is=67891f5f&hm=72b337093a75d831b3d681fbe2123498434cc16a890000b272613c8d71db9113&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465650791583856/running-star-citizen.gif?ex=678a70df&is=67891f5f&hm=f6c96ae0d0f0e53d2850caca9c8d1f78c25defcb1537095d5700962d89501def&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465651164745819/star-citizen_1.gif?ex=678a70df&is=67891f5f&hm=50a1cb043c30d20bbb9cea0be5f553e4e914b361bb4ba856dccac6cd22632151&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465651600818286/star-citizen.gif?ex=678a70df&is=67891f5f&hm=5eb1bef15dd26ff2c059d80cec5ecae5176b409ad984c3058250a9187bd204b2&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465652079235114/star-citizen-crusader.gif?ex=678a70df&is=67891f5f&hm=96872021a867177cf6d173681169f8f5cf0602f1ca3e23afea9dc40c205b4373&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465652536148009/star-citizen-polaris.gif?ex=678a70df&is=67891f5f&hm=f98a75826b9facc29c95b0c0c0be886e69278b02123eccc43b477665a94b5914&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1329465653014564967/star-citizen-scorpius.gif?ex=678a70df&is=67891f5f&hm=3e161e4613d18e0f1ede309405335703fdf0387d17688244b45d0803bfb26aae&',
        'https://cdn.discordapp.com/attachments/1324402341058711613/1333844939724816494/loadupgiphy.gif?ex=679a5f67&is=67990de7&hm=1356efa280c53b965fb73650fb140add153dcd854697ccdfb2ca54ba33342bc8&',
    ];
    
    const channel = await client.channels.fetch(leaderboardChannelId).catch(err => {
        console.error(`Failed to fetch channel with ID ${leaderboardChannelId}:`, err);
        return null;
    });

    if (!channel) {
        console.error(`Channel with ID ${leaderboardChannelId} not found.`);
        return;
    }

    // Use UTC week range
    const { start: lastMonday, end: thisMonday } = getUTCWeekRange();
    const weekRangeString = `${formatUTCDate(lastMonday)} to ${formatUTCDate(thisMonday)}`;

    try {
        const db = await connectToMySQL();
        
        // Base statistics
        const totalKillsQuery = `
            SELECT COUNT(*) AS total_kills
            FROM DailyKillTracker
            WHERE time >= ? AND time < ?
        `;
        
        const uniqueKillsQuery = `
            SELECT COUNT(DISTINCT victim) AS unique_kills
            FROM DailyKillTracker
            WHERE time >= ? AND time < ?
        `;

        const modeKillsQuery = `
            SELECT game_mode, COUNT(*) AS kills
            FROM DailyKillTracker
            WHERE time >= ? AND time < ?
            GROUP BY game_mode
        `;

        const mostKilledZoneQuery = `
            SELECT zone, COUNT(*) AS zone_count
            FROM DailyKillTracker
            WHERE time >= ? AND time < ?
            AND zone IS NOT NULL AND zone != 'Unknown' AND zone != 'N/A'
            GROUP BY zone
            ORDER BY zone_count DESC
            LIMIT 1
        `;

        // Get all weapons first, then categorize them properly
        const allWeaponsQuery = `
            SELECT weapon, COUNT(*) AS weapon_count
            FROM DailyKillTracker
            WHERE time >= ? AND time < ? 
            AND weapon IS NOT NULL AND weapon != 'Unknown' AND weapon != 'N/A'
            GROUP BY weapon
            ORDER BY weapon_count DESC
        `;

        const topVehiclesQuery = `
            SELECT killers_ship, COUNT(*) AS ship_count
            FROM DailyKillTracker
            WHERE time >= ? AND time < ? 
            AND killers_ship IS NOT NULL 
            AND killers_ship != 'Unknown' AND killers_ship != 'N/A'
            AND killers_ship != 'FPS' AND killers_ship NOT LIKE '%fps%'
            GROUP BY killers_ship
            ORDER BY ship_count DESC
            LIMIT 5
        `;

        // Better player categorization based on game mode and weapon type
        const topInfantryPlayersQuery = `
            SELECT killer, COUNT(*) AS kill_count
            FROM DailyKillTracker
            WHERE time >= ? AND time < ?
            AND (
                game_mode IN ('EA_FPSGunGame', 'EA_Elimination', 'EA_FPSKillConfirmed', 'EA_TeamElimination')
                OR (killers_ship IS NULL OR killers_ship = 'Unknown' OR killers_ship = 'N/A' OR killers_ship = 'FPS')
            )
            GROUP BY killer
            ORDER BY kill_count DESC
            LIMIT 10
        `;

        const topVehiclePlayersQuery = `
            SELECT killer, COUNT(*) AS kill_count
            FROM DailyKillTracker
            WHERE time >= ? AND time < ?
            AND game_mode IN ('EA_FreeFlight', 'EA_SquadronBattle', 'SC_Default')
            AND killers_ship IS NOT NULL 
            AND killers_ship != 'Unknown' AND killers_ship != 'N/A'
            AND killers_ship != 'FPS' AND killers_ship NOT LIKE '%fps%'
            GROUP BY killer
            ORDER BY kill_count DESC
            LIMIT 10
        `;

        // Execute all queries with UTC dates
        const [[{ total_kills }]] = await db.query(totalKillsQuery, [lastMonday, thisMonday]);
        const [[{ unique_kills }]] = await db.query(uniqueKillsQuery, [lastMonday, thisMonday]);
        const [modeKills] = await db.query(modeKillsQuery, [lastMonday, thisMonday]);
        const [[mostKilledZoneData]] = await db.query(mostKilledZoneQuery, [lastMonday, thisMonday]);
        const [allWeapons] = await db.query(allWeaponsQuery, [lastMonday, thisMonday]);
        const [topVehicles] = await db.query(topVehiclesQuery, [lastMonday, thisMonday]);
        const [topInfantryPlayers] = await db.query(topInfantryPlayersQuery, [lastMonday, thisMonday]);
        const [topVehiclePlayers] = await db.query(topVehiclePlayersQuery, [lastMonday, thisMonday]);

        // Process mode kills
        const persistentUniverseModes = ['SC_Frontend', 'SC_Default'];
        let persistentUniverseKills = 0;
        let arenaCommanderKills = 0;

        modeKills.forEach(({ game_mode, kills }) => {
            if (persistentUniverseModes.includes(game_mode)) {
                persistentUniverseKills += kills;
            } else {
                arenaCommanderKills += kills;
            }
        });

        // Categorize weapons properly
        const infantryWeapons = allWeapons.filter(weapon => isFPSWeapon(weapon.weapon));
        const vehicleWeapons = allWeapons.filter(weapon => isShipWeapon(weapon.weapon));
        
        // Group weapons by base ID to avoid duplicates
        const groupedInfantryWeapons = groupWeaponsByBaseId(infantryWeapons);
        const groupedVehicleWeapons = groupWeaponsByBaseId(vehicleWeapons);

        // Format lists with proper name cleaning
        const formatWeaponList = (weapons) => {
            return weapons.map((weapon, index) => {
                return `${index + 1}. ${weapon.display_name}\n   \`${weapon.weapon_count} kills\``;
            }).join('\n\n') || 'No data available';
        };

        const formatVehicleList = (vehicles) => {
            return vehicles.map((vehicle, index) => {
                const displayName = getDisplayShip(vehicle.killers_ship);
                return `${index + 1}. ${displayName}\n   \`${vehicle.ship_count} kills\``;
            }).join('\n\n') || 'No data available';
        };

        const formatPlayerList = (players) => {
            return players.map((player, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = index < 3 ? medals[index] : '';
                return `${index + 1}. ${player.killer} ${medal}\n   \`${player.kill_count} kills\``;
            }).join('\n\n') || 'No data available';
        };

        // Create embeds
        const selectedBanner = bannerImages[Math.floor(Math.random() * bannerImages.length)];

        // Main summary embed
        const mainEmbed = new EmbedBuilder()
            .setTitle('BlightVeil Weekly Kills')
            .setDescription(`**BlightVeil Kill Report**\nFrom ${weekRangeString} (UTC)
            **🚀 Persistent Universe**
            Total PU Kills: \`${persistentUniverseKills}\`
            **🕹 Arena Commander**  
            Total AC Kills: \`${arenaCommanderKills}\`
            **Total Unique Players Killed**: \`${unique_kills}\`
            **Most Active Location**: \`${getDisplayZone(mostKilledZoneData?.zone)}\``)
            .setThumbnail('https://cdn.discordapp.com/attachments/1176596448041779270/1300872217210523648/BlightVeilArtboard_4PNG.png')
            .setColor('#690404')
            .setImage(selectedBanner);

        // Weapons and Vehicles embed
        const weaponsEmbed = new EmbedBuilder()
            .setTitle('Top Equipment')
            .setColor('#690404')
            .addFields(
                {
                    name: '🔫 Top Infantry Weapons',
                    value: formatWeaponList(groupedInfantryWeapons),
                    inline: true
                },
                {
                    name: '🚀 Top Vehicle Weapons',
                    value: formatWeaponList(groupedVehicleWeapons),
                    inline: true
                },
                {
                    name: '🛸 Top Vehicles',
                    value: formatVehicleList(topVehicles),
                    inline: false
                }
            );

        // Player leaderboards embed
        const playersEmbed = new EmbedBuilder()
            .setTitle('Top Players')
            .setColor('#690404')
            .addFields(
                {
                    name: '----- Top 10 - Infantry -----',
                    value: formatPlayerList(topInfantryPlayers),
                    inline: true
                },
                {
                    name: '----- Top 10 - Vehicle -----',
                    value: formatPlayerList(topVehiclePlayers),
                    inline: true
                }
            );

        // Send all embeds
        await channel.send({ embeds: [mainEmbed, weaponsEmbed, playersEmbed] });
        console.log('Weekly leaderboard posted successfully with UTC time range.');

    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
    }
}

//Leaderboards End

function getRankByPercentile(percentile) {
  if (percentile === 1) return 'APEX #1';
  if (percentile >= 0.95) return 'Level 10';
  if (percentile >= 0.90) return 'Level 9';
  if (percentile >= 0.85) return 'Level 8';
  if (percentile >= 0.70) return 'Level 7';
  if (percentile >= 0.60) return 'Level 6';
  if (percentile >= 0.50) return 'Level 5';
  if (percentile >= 0.40) return 'Level 4';
  if (percentile >= 0.30) return 'Level 3';
  if (percentile >= 0.20) return 'Level 2';
  return 'Level 1';
}

function getRankChangeArrow(prev, curr) {
    if (prev === undefined) return ""; // New player
    if (curr < prev) return "⬆️";
    if (curr > prev) return "⬇️";
    return "⏺️";
}

const scheduleLeaderboards = (client) => {
    // Daily leaderboard at midnight PST
    schedule.scheduleJob({ hour: 0, minute: 0, tz: 'America/Los_Angeles' }, async () => {
        try {
            const guild = client.guilds.cache.first();
            if (!guild) {
                console.error('No guilds found in the bot cache.');
                return;
            }
            await postLeaderboards(client, guild);
        } catch (error) {
            console.error('Error posting daily leaderboard:', error);
        }
    });

    // Weekly leaderboards every Monday at midnight PST
    schedule.scheduleJob({ hour: 0, minute: 0, dayOfWeek: 1, tz: 'America/Los_Angeles' }, async () => {
        try {
            console.log('Posting weekly leaderboard...');
            await postWeeklyLeaderboard(client);
        } catch (error) {
            console.error('Error posting weekly leaderboards:', error);
        }
    });

    console.log('Leaderboard jobs scheduled.');
};


module.exports = {
    postLeaderboards,
    postWeeklyLeaderboard,
    scheduleLeaderboards,
    updateLiveEloMessage,
    appendEloUpdateMessage,
    deleteUserEloDMs,
    addEloSubscriber,
    removeEloSubscriber,
    postLiveEloLeaderboard,
};

