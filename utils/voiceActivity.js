const {
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  storeTempVC,
  removeTempVC,
  getActiveTempVCCount,
  checkIfTempVC,
  connectToMySQL,
} = require('../db');

const { getHeatmapMessageId, saveHeatmapMessageId } = require('../utils/heatmapStorage');
let currentHeatmapMessageId = getHeatmapMessageId(); 

// === VOICE ACTIVITY CONSTANTS ===
const activeVoiceUsers = new Map();
const AFK_CHANNEL_ID = '1170836524854689873';
const SUMMARY_CHANNEL_ID = '1186510273251639306';
const STATIC_HEATMAP_CHANNEL_ID = '1303837974521315449';

// === VC PAUSE MANAGEMENT FUNCTIONS ===
const vcPauseStates = new Map();
const cron = require('node-cron');
const schedule = require('node-schedule');

function setVCPauseState(channelId, durationHours) {
    const unpauseTime = Date.now() + (durationHours * 60 * 60 * 1000);
    vcPauseStates.set(channelId, {
        pausedUntil: unpauseTime,
        duration: durationHours
    });
    
    // Set timeout to auto-remove pause (optional - for cleanup)
    setTimeout(() => {
        if (vcPauseStates.get(channelId)?.pausedUntil === unpauseTime) {
            vcPauseStates.delete(channelId);
        }
    }, durationHours * 60 * 60 * 1000);
}

function removeVCPauseState(channelId) {
    vcPauseStates.delete(channelId);
}

function isVCPaused(channelId) {
    const pauseState = vcPauseStates.get(channelId);
    if (!pauseState) return false;
    
    if (Date.now() > pauseState.pausedUntil) {
        vcPauseStates.delete(channelId);
        return false;
    }
    
    return true;
}

function getRemainingPauseTime(channelId) {
    const pauseState = vcPauseStates.get(channelId);
    if (!pauseState) return null;
    
    const remaining = pauseState.pausedUntil - Date.now();
    if (remaining <= 0) {
        vcPauseStates.delete(channelId);
        return null;
    }
    
    return Math.ceil(remaining / (1000 * 60)); // Return in minutes
}

// === VOICE ACTIVITY TRACKING FUNCTIONS ===

const restoreActiveSessions = async () => {
  try {
    const db = await connectToMySQL();
    const [rows] = await db.query(
      'SELECT user_id, username, channel_id, UNIX_TIMESTAMP(join_time) * 1000 AS joinTime, time_spent FROM voice_activity WHERE leave_time IS NULL'
    );

    for (const row of rows) {
      if (row.channel_id === AFK_CHANNEL_ID) continue;
      activeVoiceUsers.set(row.user_id, {
        nickname: row.username,
        channelId: row.channel_id,
        joinTime: row.joinTime,
        accumulatedTime: row.time_spent || 0,
        muted: false,
        deafened: false,
      });
    }
    console.log(`Restored ${activeVoiceUsers.size} active voice sessions from DB.`);
  } catch (error) {
    console.error('Error restoring voice sessions:', error);
  }
};

const logVoiceActivity = async (userId, nickname, channelId, action, timeSpent = 0) => {
  try {
    const db = await connectToMySQL();
    if (action === 'join') {
      await db.query(
        `INSERT INTO voice_activity 
          (user_id, username, channel_id, join_time, join_dayofweek, join_hour, time_spent, leave_time)
         VALUES (?, ?, ?, NOW(), DAYOFWEEK(NOW()), HOUR(NOW()), 0, NULL)`,
        [userId, nickname, channelId]
      );
      console.log(`[JOIN] [${nickname}] (${userId}) joined VC ${channelId}`);
    } else if (action === 'leave') {
      const [rows] = await db.query(
        'SELECT id FROM voice_activity WHERE user_id = ? AND channel_id = ? AND leave_time IS NULL ORDER BY join_time DESC LIMIT 1',
        [userId, channelId]
      );
      if (rows.length > 0) {
        await db.query(
          'UPDATE voice_activity SET leave_time = NOW(), time_spent = ? WHERE id = ?',
          [timeSpent, rows[0].id]
        );
        console.log(`[LEAVE] [${nickname}] (${userId}) left VC ${channelId}. Duration: ${timeSpent}s`);
      } else {
        console.warn(`[LEAVE] No open session found for [${nickname}] (${userId}) in VC ${channelId}`);
      }
    }
  } catch (error) {
    console.error('Error logging voice activity:', error);
  }
};

const cleanupGhostVoiceSessions = async (client) => {
  try {
    const db = await connectToMySQL();
    const [rows] = await db.query(
      'SELECT id, user_id, username, channel_id, UNIX_TIMESTAMP(join_time) * 1000 AS joinTime FROM voice_activity WHERE leave_time IS NULL'
    );

    let cleanedCount = 0;
    const now = Date.now();

    for (const row of rows) {
      if (row.channel_id === AFK_CHANNEL_ID) continue;
      const guild = client.guilds.cache.find(g => g.channels.cache.has(row.channel_id));
      if (!guild) continue;
      const member = guild.members.cache.get(row.user_id);
      if (!member) continue;
      if (member.voice.channelId === row.channel_id) continue;
      if (now - row.joinTime < 10 * 60 * 1000) continue;

      const timeSpent = Math.floor((now - row.joinTime) / 1000);
      await db.query(
        'UPDATE voice_activity SET leave_time = NOW(), time_spent = ? WHERE id = ?',
        [timeSpent, row.id]
      );
      activeVoiceUsers.delete(row.user_id);
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      console.log(`✅ Cleaned up ${cleanedCount} ghost voice sessions.`);
    }
  } catch (error) {
    console.error('Error during ghost voice session cleanup:', error);
  }
};

const trackVoiceActivity = async (client) => {
  await restoreActiveSessions();

  client.on('voiceStateUpdate', async (oldState, newState) => {
    let user = newState.member;
    if (!user) {
      try {
        user = await newState.guild.members.fetch(newState.id);
      } catch (err) {
        console.warn(`⚠️ Could not fetch member for ID ${newState.id}:`, err.message);
        return;
      }
    }

    const userId = user.id;
    const nickname = user.nickname || user.displayName || user.user.username;
    const isMuted = newState.selfMute || newState.serverMute;
    const isDeafened = newState.selfDeaf || newState.serverDeaf;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Joined a VC (from nothing)
    if (!oldChannel && newChannel && newChannel.id !== AFK_CHANNEL_ID) {
      activeVoiceUsers.set(userId, {
        nickname,
        channelId: newChannel.id,
        joinTime: (!isMuted && !isDeafened) ? Date.now() : null,
        accumulatedTime: 0,
        muted: isMuted,
        deafened: isDeafened,
      });
      await logVoiceActivity(userId, nickname, newChannel.id, 'join');
      return;
    }

    // Left VC completely
    if (oldChannel && !newChannel) {
      const prev = activeVoiceUsers.get(userId);
      if (prev) {
        if (!prev.muted && !prev.deafened && prev.joinTime) {
          const elapsed = Math.floor((Date.now() - prev.joinTime) / 1000);
          prev.accumulatedTime += elapsed;
        }
        await logVoiceActivity(userId, nickname, oldChannel.id, 'leave', prev.accumulatedTime);
        activeVoiceUsers.delete(userId);
      } else {
        await logVoiceActivity(userId, nickname, oldChannel.id, 'leave', 0);
      }
      return;
    }

    // Switched channels
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      const prev = activeVoiceUsers.get(userId);
      if (prev && !prev.muted && !prev.deafened && prev.joinTime) {
        const elapsed = Math.floor((Date.now() - prev.joinTime) / 1000);
        prev.accumulatedTime += elapsed;
      }

      if (prev) {
        await logVoiceActivity(userId, nickname, oldChannel.id, 'leave', prev.accumulatedTime);
        activeVoiceUsers.delete(userId);
      }

      activeVoiceUsers.set(userId, {
        nickname,
        channelId: newChannel.id,
        joinTime: (!isMuted && !isDeafened) ? Date.now() : null,
        accumulatedTime: 0,
        muted: isMuted,
        deafened: isDeafened,
      });
      await logVoiceActivity(userId, nickname, newChannel.id, 'join');
      return;
    }

    // Entered AFK
    if (newChannel?.id === AFK_CHANNEL_ID) {
      const prev = activeVoiceUsers.get(userId);
      if (prev) {
        if (!prev.muted && !prev.deafened && prev.joinTime) {
          const elapsed = Math.floor((Date.now() - prev.joinTime) / 1000);
          prev.accumulatedTime += elapsed;
        }
        await logVoiceActivity(userId, nickname, prev.channelId, 'leave', prev.accumulatedTime);
        activeVoiceUsers.delete(userId);
      }
      return;
    }

    // Moved out of AFK
    if (oldChannel?.id === AFK_CHANNEL_ID && newChannel?.id !== AFK_CHANNEL_ID) {
      activeVoiceUsers.set(userId, {
        nickname,
        channelId: newChannel.id,
        joinTime: (!isMuted && !isDeafened) ? Date.now() : null,
        accumulatedTime: 0,
        muted: isMuted,
        deafened: isDeafened,
      });
      await logVoiceActivity(userId, nickname, newChannel.id, 'join');
      return;
    }

    // Muted/Deafened toggle within same VC
    if (newChannel && oldChannel?.id === newChannel.id) {
      const prev = activeVoiceUsers.get(userId);
      if (!prev) return;

      const wasUnmuted = !prev.muted && !prev.deafened;
      const isNowUnmuted = !isMuted && !isDeafened;

      if (wasUnmuted && !isNowUnmuted && prev.joinTime) {
        const elapsed = Math.floor((Date.now() - prev.joinTime) / 1000);
        prev.accumulatedTime += elapsed;
        prev.joinTime = null;
      } else if (!wasUnmuted && isNowUnmuted) {
        prev.joinTime = Date.now();
      }

      prev.muted = isMuted;
      prev.deafened = isDeafened;
    }
  });
};

const generateMonthlySummary = async (client) => {
  console.log("Running monthly voice activity summary...");

  try {
    const db = await connectToMySQL();

    // Fix: 4 placeholders for 4 prefixes
    const query = `
      SELECT username, SUM(time_spent) AS total_time 
      FROM voice_activity 
      WHERE username LIKE ? OR username LIKE ? OR username LIKE ? OR username LIKE ?
      GROUP BY username 
      ORDER BY total_time DESC
      LIMIT 50
    `;

    const prefixes = ['%LM9%', '%LM8%', '%UX9%', '%UX8%'];
    const [rows] = await db.query(query, prefixes);

    const summaryChannel = await client.channels.fetch(SUMMARY_CHANNEL_ID);
    if (!summaryChannel) {
      console.error("Summary channel not found!");
      return;
    }

    const baseEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Monthly Voice Activity Summary')
      .setDescription('Voice activity stats for members with prefixes LM8, LM9, UX8, UX9.')
      .setTimestamp()
      .setFooter({ text: 'Blightveil', iconURL: 'https://cdn.discordapp.com/attachments/1324402341058711613/1324402540397461524/BlightVeilArtboard-large_2PNG.png' });

    if (rows.length === 0) {
      const embed = EmbedBuilder.from(baseEmbed)
        .addFields({ name: 'No Data', value: 'No voice activity recorded this month.', inline: false });
      await summaryChannel.send({ embeds: [embed] });
      return;
    }

    // Convert seconds to formatted time string
    const formatTime = secs => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      return `${h}h ${m}m ${s}s`;
    };

    // Batch fields into groups of 25 embeds max
    const fields = rows.map(row => ({
      name: row.username,
      value: formatTime(row.total_time),
      inline: false
    }));

    while (fields.length > 0) {
      const embed = EmbedBuilder.from(baseEmbed);
      embed.addFields(fields.splice(0, 25));
      await summaryChannel.send({ embeds: [embed] });
    }

    // Optional: Clean up after summary - be sure you want this!
    await db.query(
      'DELETE FROM voice_activity WHERE username LIKE ? OR username LIKE ? OR username LIKE ? OR username LIKE ?',
      prefixes
    );

  } catch (err) {
    console.error('Error fetching monthly voice activity summary:', err);
  }
};

async function generateGlobalVoiceHeatmap(client, channelId, heatmapMessageId = null) {
  const db = await connectToMySQL();

  const [rows] = await db.query(`
    SELECT join_dayofweek, join_hour, SUM(time_spent) AS total_time
    FROM voice_activity
    WHERE time_spent > 0
      AND join_dayofweek IS NOT NULL
      AND join_hour IS NOT NULL
    GROUP BY join_dayofweek, join_hour
  `);

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxTime = 0;

  // Fill heatmap and track max time
  for (const row of rows) {
    const dayIndex = Number(row.join_dayofweek) - 1; // MySQL: 1=Sun → 0=Sun
    const hour = Number(row.join_hour);
    const time = Number(row.total_time);

    if (
      Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6 &&
      Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
      Number.isFinite(time) && time >= 0
    ) {
      heatmap[dayIndex][hour] = time;
      if (time > maxTime) maxTime = time;
    }
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Precompute all recorded day-hour pairs
  const recordedPairs = new Set(
    rows.map(r => `${Number(r.join_dayofweek) - 1}-${Number(r.join_hour)}`)
  );

  const getBlock = (value, recorded) => {
    if (!recorded) return '·'; // No data recorded at all
    if (value === 0 || maxTime === 0) return '░';
    const ratio = value / maxTime;
    if (ratio > 0.75) return '█';
    if (ratio > 0.5) return '▓';
    if (ratio > 0.25) return '▒';
    return '░';
  };

  const formatHalf = (startHour, label) => {
    // Make each hour label 3 chars wide by padding space on right
    const hourLabels = [...Array(12).keys()]
      .map(i => String(startHour + i).padStart(2, '0') + ' ');

    const header = `${label}  ` + hourLabels.join('');

    const rowsLines = heatmap.map((row, dayIdx) => {
      const dayLabel = DAYS[dayIdx].padEnd(3) + ' ';
      // Each block + 2 spaces (total 3 chars per hour column)
      const blocks = row
        .slice(startHour, startHour + 12)
        .map((val, h) => {
          const hour = startHour + h;
          const recorded = recordedPairs.has(`${dayIdx}-${hour}`);
          return getBlock(val, recorded) + '  '; // 1 block + 2 spaces = 3 chars wide
        })
        .join('');
      return `${dayLabel}${blocks}`;
    });

    return [header, ...rowsLines];
  };

  const topHalf = formatHalf(0, 'AM');
  const bottomHalf = formatHalf(12, 'PM');

  const description = [
    "This chart shows when people were talking in voice channels, by day and hour.",
    "",
    "**Legend:**",
    "`█` = Busiest (lots of people talking)",
    "`▓` = Very active",
    "`▒` = Some talking",
    "`░` = A little talking",
    "`·` = No talking / no data",
    "",
    "All times shown in UTC."
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🗺️ Global Voice Activity Heatmap')
    .setDescription(description)
    .addFields(
      {
        name: 'AM (UTC 00–11)',
        value: '```txt\n' + topHalf.join('\n') + '\n```',
        inline: false,
      },
      {
        name: 'PM (UTC 12–23)',
        value: '```txt\n' + bottomHalf.join('\n') + '\n```',
        inline: false,
      }
    )
    .setColor('#00cc99')
    .setTimestamp();

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error(`Channel with ID ${channelId} not found or inaccessible.`);
      return null;
    }

    let message = null;
    if (heatmapMessageId) {
      try {
        message = await channel.messages.fetch(heatmapMessageId);
      } catch {
        console.warn(`Heatmap message ID ${heatmapMessageId} not found in channel.`);
      }
    }

    if (!message) {
      message = await channel.send({ embeds: [embed] });
      console.log(`📌 Posted new heatmap message. Update stored HEATMAP_MESSAGE_ID to: ${message.id}`);
      return message.id;
    } else {
      await message.edit({ embeds: [embed] });
      console.log('✅ Heatmap updated successfully.');
      return heatmapMessageId;
    }
  } catch (error) {
    console.error('❌ Failed to update or send heatmap:', error);
    return null;
  }
}

const scheduleMonthlySummary = (client) => {
  schedule.scheduleJob('0 0 * * *', async () => {  // Runs daily at midnight
    if (new Date().getDate() === 1) {  // Only run on 1st day of month
      console.log("Running monthly summary (first of the month)");
      await generateMonthlySummary(client);
    }
  });
};

const scheduleGhostCleanup = (client) => {
  schedule.scheduleJob('*/15 * * * *', () => cleanupGhostVoiceSessions(client));
};

const scheduleHeatmapUpdate = (client, channelId) => {
  schedule.scheduleJob('*/30 * * * *', async () => {
    const newMessageId = await generateGlobalVoiceHeatmap(client, channelId, currentHeatmapMessageId);
    if (newMessageId && newMessageId !== currentHeatmapMessageId) {
      currentHeatmapMessageId = newMessageId;
      saveHeatmapMessageId(newMessageId);  // <-- persist to file
    }
  });
};

// === RED CHANNEL CONFIGURATION ===
// Store active popup messages for cleanup
const activeRedChannelPopups = new Map();

// === PAUSE VC DELETION HANDLER ===
async function handlePauseVCDeletion(interaction, client) {
    try {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return await interaction.reply({
                content: '❌ You must be in a voice channel to use this feature.',
                ephemeral: true,
            });
        }

        // Check if this is a temp VC
        const isTemp = await checkIfTempVC(voiceChannel.id);
        if (!isTemp) {
            return await interaction.reply({
                content: '❌ This feature is only available for temporary voice channels.',
                ephemeral: true,
            });
        }

        // Create pause duration selection menu
        const pauseMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`pause_duration_menu_${voiceChannel.id}`)
                .setPlaceholder('Select pause duration...')
                .addOptions([
                    {
                        label: '1 Hour',
                        value: '1_hour',
                        description: 'Pause deletion for 1 hour',
                        emoji: '⏰'
                    },
                    {
                        label: '4 Hours',
                        value: '4_hours',
                        description: 'Pause deletion for 4 hours',
                        emoji: '🕓'
                    },
                    {
                        label: '6 Hours',
                        value: '6_hours',
                        description: 'Pause deletion for 6 hours',
                        emoji: '🕕'
                    },
                    {
                        label: 'Cancel Pause',
                        value: 'cancel_pause',
                        description: 'Remove any existing pause',
                        emoji: '❌'
                    }
                ])
        );

        await interaction.reply({
            content: '⏸️ **Pause VC Deletion**\nSelect how long you want to prevent this VC from being automatically deleted:',
            components: [pauseMenu],
            ephemeral: true,
        });

    } catch (error) {
        console.error('Error handling pause VC deletion:', error);
        await interaction.reply({
            content: '❌ An error occurred while setting up pause options.',
            ephemeral: true,
        });
    }
}

// === PAUSE DURATION MENU HANDLER ===
async function handlePauseDurationMenu(interaction, client) {
    try {
        const selectedValue = interaction.values[0];
        const channelId = interaction.customId.replace('pause_duration_menu_', '');
        const voiceChannel = interaction.guild.channels.cache.get(channelId);

        if (!voiceChannel) {
            return await interaction.update({
                content: '❌ Voice channel no longer exists.',
                components: [],
                ephemeral: true,
            });
        }

        if (selectedValue === 'cancel_pause') {
            removeVCPauseState(channelId);
            return await interaction.update({
                content: '✅ VC deletion pause has been removed. The channel will now delete normally when empty.',
                components: [],
                ephemeral: true,
            });
        }

        // Parse duration
        const durationMap = {
            '1_hour': 1,
            '4_hours': 4,
            '6_hours': 6
        };

        const durationHours = durationMap[selectedValue];
        if (!durationHours) {
            return await interaction.update({
                content: '❌ Invalid duration selected.',
                components: [],
                ephemeral: true,
            });
        }

        // Set pause state
        setVCPauseState(channelId, durationHours);

        const unpauseTime = new Date(Date.now() + (durationHours * 60 * 60 * 1000));
        
        // First, update the original interaction (ephemeral)
        await interaction.update({
            content: "⏳ Setting pause duration...",
            components: [],
            ephemeral: true,
        });

        // Then send a non-ephemeral follow-up message
        await interaction.followUp({
            content: `✅ **VC Deletion Paused**\n⏰ This VC will not be automatically deleted for **${durationHours} hour(s)**.\n🕐 Pause expires: <t:${Math.floor(unpauseTime.getTime() / 1000)}:R>`,
            ephemeral: false,
        });

    } catch (error) {
        console.error('Error handling pause duration menu:', error);
        
        // Handle error response
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
                content: '❌ An error occurred while setting the pause duration.',
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content: '❌ An error occurred while setting the pause duration.',
                ephemeral: true,
            });
        }
    }
}

// === TEMP VC OPTIONS MENU HANDLER ===
async function handleTempVCOptionsMenu(interaction, client) {
    try {
        const selectedAction = interaction.values[0];
        console.log('Selected VC Option:', selectedAction);

        if (selectedAction === 'rename_vc') {
            const modal = new ModalBuilder()
                .setCustomId('rename-vc-modal')
                .setTitle('Rename Voice Channel')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('new-name')
                            .setLabel('New Voice Channel Name')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            return await interaction.showModal(modal);
        }

        if (selectedAction === 'set_limit') {
            const modal = new ModalBuilder()
                .setCustomId('set-limit-modal')
                .setTitle('Set Occupancy Limit')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('limit')
                            .setLabel('Max Users (0 for no limit)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            return await interaction.showModal(modal);
        }

        if (selectedAction === 'set_region') {
            const regionMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('set-region-menu-main')
                    .setPlaceholder('Choose a voice region...')
                    .addOptions([
                        {
                            label: '🌐 Recommend Best Region',
                            value: 'recommend',
                            description: 'Select a good region for performance',
                        },
                        {
                            label: 'Automatic',
                            value: 'automatic',
                            description: 'Let Discord auto-select',
                        },
                    ])
            );

            return await interaction.reply({
                content: 'Select a region for your voice channel:',
                components: [regionMenu],
                ephemeral: true,
            });
        }

        if (selectedAction === 'set_bitrate') {
            const modal = new ModalBuilder()
                .setCustomId('set-bitrate-modal')
                .setTitle('Set Voice Bitrate')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('bitrate')
                            .setLabel('Bitrate in kbps (8–384)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            return await interaction.showModal(modal);
        }

        if (selectedAction === 'pause_vc_deletion') {
            return await handlePauseVCDeletion(interaction, client);
        }

        if (selectedAction === 'claim_streamer') {
            const requiredRoleId = '1378852093120614430'; // Streamer role ID

            if (!interaction.member.roles.cache.has(requiredRoleId)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use Streamer controls.',
                    ephemeral: true,
                });
            }

            const streamerMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('streamer-control-menu')
                    .setPlaceholder('Select Streamer Control Option')
                    .addOptions([
                        {
                            label: 'Claim Channel',
                            value: 'claim_streamer',
                            description: 'Take control of the voice channel',
                        },
                        {
                            label: 'Release VC',
                            value: 'release_streamer',
                            description: 'Unlock the VC and remove waiting room',
                        },
                    ])
            );

            return await interaction.reply({
                content: '🎛️ Streamer Controls:',
                components: [streamerMenu],
                ephemeral: true,
            });
        }

        if (selectedAction === 'attendance_control') {
            const attendanceRoleId = '1185813396667514891'; // Replace with actual role ID

            if (!interaction.member.roles.cache.has(attendanceRoleId)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use Attendance controls.',
                    ephemeral: true,
                });
            }

            const attendanceMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('attendance-control-menu')
                    .setPlaceholder('Select Attendance Control Option')
                    .addOptions([
                        {
                            label: 'Start Tracking Attendance',
                            value: 'start_attendance',
                            description: 'Begin tracking attendance in this VC',
                        },
                        {
                            label: 'Create Teams',
                            value: 'create_teams',
                            description: 'Shuffle attendees into teams',
                        },
                        {
                            label: 'Stop Tracking',
                            value: 'stop_attendance',
                            description: 'Stop attendance tracking',
                        },
                    ])
            );

            return await interaction.reply({
                content: '📊 Attendance Controls:',
                components: [attendanceMenu],
                ephemeral: true,
            });
        }

        // Default fallback
        await interaction.reply({
            content: '⚠️ This action is not yet supported.',
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error handling temp VC options menu interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true,
            });
        }
    }
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const parentConfigs = {
      '1311347848977055844': { prefix: 'Public VC #' },
      '1398854684977926186': { prefix: '🔵BV VC #' },
      '1398854731073458310': { prefix: '🔴BVK VC #', isRedChannel: true }, // Mark this as red channel parent
      '1310726896476094496': { prefix: 'Leader VC #' },
      '1310721271553593385': { prefix: '💫Staff VC #' },
      '1310615640939302922': { prefix: '🧑‍💻Servitor VC #' },
      '1406770454777299006': { prefix: '🟣Veil VC #' },
    };

    const roleWhitelist = new Set([
      '1173822659071578182', // Command
      '1173822697956982794', // Officer
      '1173822842442367026', // Leader
    ]);

    const streamerRoleId = '1378852093120614430';
    const attendanceRoleId = '1185813396667514891';

    client.streamerRequestDMs ||= new Map();
    client.claimedChannels ||= new Map();
    client._tempVCCleanupInProgress ||= new Set();
    client.attendanceTracking ||= new Map();

    // ---- Helper: Cleanup join request DMs ----
    const cleanupRequestDMs = async (mainChannelId) => {
      const dmList = client.streamerRequestDMs.get(mainChannelId);
      const claim = client.claimedChannels?.get(mainChannelId);
      if (!dmList || !claim?.streamerId) return;

      try {
        const streamerUser = await client.users.fetch(claim.streamerId);
        const dmChannel = await streamerUser.createDM();

        for (const { dmMessageId } of dmList) {
          try {
            const msg = await dmChannel.messages.fetch(dmMessageId);
            if (msg) await msg.delete();
          } catch {}
        }

        client.streamerRequestDMs.delete(mainChannelId);
      } catch (err) {
        console.error('Failed to cleanup join request DMs:', err);
      }
    };

    // ---- Helper: Cleanup temp VC ----
    const cleanUpTempVC = async (channelId) => {
        if (client._tempVCCleanupInProgress.has(channelId)) return;
        client._tempVCCleanupInProgress.add(channelId);

        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);

            // Remove DB entry if channel doesn't exist
            if (!channel) {
                console.log(`Cleanup: Channel ${channelId} does not exist. Removing from DB.`);
                await removeTempVC(channelId).catch(console.error);
                removeVCPauseState(channelId); // Clean up pause state
                return;
            }

            const isTemp = await checkIfTempVC(channelId);
            if (!isTemp) {
                console.log(`Cleanup: Channel ${channel.name} not marked as temp. Removing from DB.`);
                await removeTempVC(channelId).catch(console.error);
                removeVCPauseState(channelId); // Clean up pause state
                return;
            }

            // Check if VC deletion is paused
            if (isVCPaused(channelId)) {
                const remainingMinutes = getRemainingPauseTime(channelId);
                console.log(`⏸️ VC deletion paused for ${channel.name}. ${remainingMinutes} minutes remaining.`);
                return;
            }

            if (channel.members.size === 0) {
                try {
                    await channel.delete();
                    console.log(`✅ Temp VC deleted: ${channel.name}`);
                } catch (err) {
                    if (err.code !== 10003) {
                        console.error(`❌ Failed to delete temp VC ${channel.name}:`, err);
                    } else {
                        console.warn(`⚠️ Channel ${channel.name} already deleted.`);
                    }
                } finally {
                    await removeTempVC(channelId).catch(console.error);
                    removeVCPauseState(channelId); // Clean up pause state

                    const claim = client.claimedChannels?.get(channelId);
                    if (claim) {
                        await cleanupRequestDMs(channelId);
                        client.claimedChannels.delete(channelId);
                    }
                }
            } else {
                console.log(`Cleanup skipped: ${channel.name} still has ${channel.members.size} member(s).`);
            }
        } catch (error) {
            console.error('Error during temp VC cleanup:', error);
        } finally {
            client._tempVCCleanupInProgress.delete(channelId);
        }
    };

    // ---- Handle VC Join ----
    if (newState.channelId) {
      console.log(`[JOIN] [${newState.member?.displayName}] (${newState.id}) joined VC ${newState.channelId}`);

      const channel = newState.channel;
      if (channel?.type === ChannelType.GuildVoice) {
        const userLimit = channel.userLimit || 0;
        const hasBypassRole = newState.member?.roles.cache.some(role => roleWhitelist.has(role.id));

        if (userLimit > 0 && channel.members.size > userLimit && !hasBypassRole) {
          try {
            await newState.disconnect();
            console.log(`⛔ Disconnected ${newState.member?.displayName} — VC full.`);
          } catch (err) {
            console.error('Failed to disconnect user from full VC:', err);
          }
          return;
        }
      }

      const parentConfig = parentConfigs[newState.channelId];
      if (parentConfig) {
        // ---- Create Temp VC ----
        const guild = newState.guild;
        const parentChannel = guild.channels.cache.get(newState.channelId);
        if (!parentChannel) return;

        const count = (await getActiveTempVCCount(newState.channelId)) + 1;
        const tempName = `${parentConfig.prefix} ${count}`;

        try {
          const tempVC = await guild.channels.create({
            name: tempName,
            type: ChannelType.GuildVoice,
            parent: parentChannel.parentId,
            permissionOverwrites: parentChannel.permissionOverwrites.cache.map(perm => ({
              id: perm.id,
              allow: new PermissionsBitField(perm.allow).bitfield,
              deny: new PermissionsBitField(perm.deny).bitfield,
            })),
          });

          await storeTempVC(guild.id, newState.channelId, tempVC.id);
          await newState.setChannel(tempVC);
          console.log(`✅ Temp VC created: ${tempName}`);

          // ---- RED CHANNEL DM POPUP ----
          // Check if this temp VC comes from a red channel parent
          if (parentConfig.isRedChannel) {
            try {
              console.log(`🔴 User ${newState.member.displayName} joined red temp VC ${tempVC.name}`);
              
              const embed = new EmbedBuilder()
                .setTitle('⚠️ RED CHANNEL WARNING')
                .setDescription('**Hey! This is a Red Channel.**\n\nFeedback is instant and direct. If you don\'t think you can handle it, please leave now.')
                .setColor('#FF0000')
                .addFields(
                  { name: 'What to expect:', value: '• Instant feedback\n• Direct communication\n• No sugar-coating', inline: false },
                  { name: 'If you can\'t handle:', value: '• Please leave the channel\n• No hard feelings', inline: false }
                )
                .setFooter({ text: 'This message will auto-delete when you leave the channel.' })
                .setTimestamp();

              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('red_channel_acknowledge')
                  .setLabel('I Understand - I Can Handle It')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('⚠️'),
                new ButtonBuilder()
                  .setCustomId('red_channel_leave')
                  .setLabel('No Thanks - I\'ll Leave')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('👋')
              );

              // Send DM to user
              const popupMessage = await newState.member.send({
                content: '**⚠️ IMPORTANT: Red Channel Notice ⚠️**',
                embeds: [embed],
                components: [row]
              }).catch(err => {
                console.log(`❌ Could not send red channel warning to ${newState.member.displayName}:`, err.message);
                return null;
              });

              // Store the message for cleanup
              if (popupMessage) {
                activeRedChannelPopups.set(newState.id, {
                  messageId: popupMessage.id,
                  channelId: tempVC.id,
                  userDmChannelId: popupMessage.channelId
                });
                console.log(`✅ Red channel DM sent to ${newState.member.displayName}`);
              }

            } catch (error) {
              console.error('Error sending red channel warning:', error);
            }
          }

          const member = await guild.members.fetch(newState.id).catch(() => null);
          const options = [
            { label: 'Rename Voice Channel', value: 'rename_vc' },
            { label: 'Set Occupancy Limit', value: 'set_limit' },
            { label: 'Set Region', value: 'set_region' },
            { label: 'Set Bitrate', value: 'set_bitrate' },
            { label: '📊 Attendance Controls', value: 'attendance_control' },
            { label: '⏸️ Pause VC Deletion', value: 'pause_vc_deletion' },
          ];
          if (member?.roles.cache.has(streamerRoleId)) options.push({ label: 'Streamer Controls', value: 'claim_streamer' });

          const optionsMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('vc-options-menu')
              .setPlaceholder('Select an action')
              .addOptions(options)
          );

          const embed = new EmbedBuilder()
            .setTitle(`Welcome to ${tempName}!`)
            .setDescription('Use the dropdown menu below to manage this channel.')
            .setColor('#00FF00');

          await tempVC.send({ embeds: [embed], components: [optionsMenu] }).catch(console.error);
        } catch (err) {
          console.error('Error creating temp VC:', err);
        }

        return;
      }

      // ---- Streamer Waiting Room Join ----
      const claim = [...(client.claimedChannels?.values() || [])].find(c => c.waitingRoomId === newState.channelId);
      if (claim) {
        const mainVC = client.channels.cache.get(claim.mainChannelId);
        if (!mainVC || !claim.streamerId) return;

        try {
          const embed = new EmbedBuilder()
            .setTitle('Join Request')
            .setDescription(`<@${newState.id}> is requesting to join your stream channel.`)
            .setColor('#faa61a');

          const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`STRM_SELECT_${newState.id}_${newState.channelId}_${mainVC.id}`)
              .setPlaceholder('Approve or Deny')
              .addOptions([
                { label: '✅ Approve', value: `STRM_APPROVE_${newState.id}_${newState.channelId}_${mainVC.id}` },
                { label: '❌ Deny', value: `STRM_DENY_${newState.id}_${newState.channelId}_${mainVC.id}` },
              ])
          );

          const sentMessage = await mainVC.send({
            content: `<@${claim.streamerId}> You have a new join request:`,
            embeds: [embed],
            components: [row],
          });

          client.streamerRequestDMs.set(mainVC.id, client.streamerRequestDMs.get(mainVC.id) || []);
          client.streamerRequestDMs.get(mainVC.id).push({
            dmMessageId: sentMessage.id,
            userId: newState.id,
          });

          console.log(`📨 Join request sent for ${newState.member?.displayName}`);
        } catch (err) {
          console.error('❌ Failed to send join request message:', err);
        }
      }

      // ---- RED CHANNEL DM POPUP for existing temp VCs ----
      // Check if user joined an existing temp VC
      const isTemp = await checkIfTempVC(newState.channelId);
      if (isTemp) {
        // Check if this temp VC has "🔴" in its name (red channel indicator)
        const currentChannel = newState.channel;
        if (currentChannel && currentChannel.name.includes('🔴')) {
          try {
            console.log(`🔴 User ${newState.member.displayName} joined existing red temp VC ${currentChannel.name}`);
            
            const embed = new EmbedBuilder()
              .setTitle('⚠️ RED CHANNEL WARNING')
              .setDescription('**Hey! This is a Red Channel.**\n\nFeedback is instant and direct. If you don\'t think you can handle it, please leave now.')
              .setColor('#FF0000')
              .addFields(
                { name: 'What to expect:', value: '• Instant feedback\n• Direct communication\n• No sugar-coating', inline: false },
                { name: 'If you can\'t handle:', value: '• Please leave the channel\n• No hard feelings', inline: false }
              )
              .setFooter({ text: 'This message will auto-delete when you leave the channel.' })
              .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('red_channel_acknowledge')
                .setLabel('I Understand - I Can Handle It')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚠️'),
              new ButtonBuilder()
                .setCustomId('red_channel_leave')
                .setLabel('No Thanks - I\'ll Leave')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👋')
            );

            // Send DM to user
            const popupMessage = await newState.member.send({
              content: '**⚠️ IMPORTANT: Red Channel Notice ⚠️**',
              embeds: [embed],
              components: [row]
            }).catch(err => {
              console.log(`❌ Could not send red channel warning to ${newState.member.displayName}:`, err.message);
              return null;
            });

            // Store the message for cleanup
            if (popupMessage) {
              activeRedChannelPopups.set(newState.id, {
                messageId: popupMessage.id,
                channelId: newState.channelId,
                userDmChannelId: popupMessage.channelId
              });
              console.log(`✅ Red channel DM sent to ${newState.member.displayName}`);
            }

          } catch (error) {
            console.error('Error sending red channel warning:', error);
          }
        }
      }
    }

    // ---- Handle VC Leave ----
    if (oldState.channelId) {
      await cleanUpTempVC(oldState.channelId);
      
      // ---- RED CHANNEL CLEANUP ----
      // User leaves any channel - check if they had a red channel popup
      try {
        const userPopup = activeRedChannelPopups.get(oldState.id);
        if (userPopup) {
          // Try to delete the DM message
          const user = await client.users.fetch(oldState.id).catch(() => null);
          if (user) {
            try {
              const dmChannel = await user.createDM();
              const message = await dmChannel.messages.fetch(userPopup.messageId);
              await message.delete();
              console.log(`✅ Red channel DM cleaned up for ${oldState.member?.displayName}`);
            } catch (deleteErr) {
              // Message might already be deleted or inaccessible - that's fine
              console.log(`ℹ️ Red channel DM already deleted or inaccessible for ${oldState.member?.displayName}`);
            }
          }
          // Always remove from map
          activeRedChannelPopups.delete(oldState.id);
        }
      } catch (error) {
        console.error('Error cleaning up red channel warning:', error);
        // Still remove from map even if cleanup fails
        activeRedChannelPopups.delete(oldState.id);
      }
    }
  },

  // Export the handlers for use in interactionCreate.js
  handlePauseVCDeletion,
  handlePauseDurationMenu,
  handleTempVCOptionsMenu,
  isVCPaused,
  getRemainingPauseTime,
  removeVCPauseState,
  setVCPauseState,
  scheduleMonthlySummary,
  scheduleGhostCleanup,
  trackVoiceActivity,
  generateGlobalVoiceHeatmap,
  scheduleHeatmapUpdate,
  generateMonthlySummary,
  cleanupGhostVoiceSessions,
  logVoiceActivity,
  restoreActiveSessions
};