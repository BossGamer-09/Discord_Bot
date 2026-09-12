const fuzzball = require('fuzzball');
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { validateApiKey, recordKill, connectToMySQL } = require('../db');
const fetchRSIProfileData = require('../handlers/fetchRSIProfileData');
const { weaponMapping, shipMapping } = require('./gameData');
const schedule = require('node-schedule');
const eventCache = new Map();
const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();

const REQUIRED_CLIENT_VERSION = "1.6";
const MESSAGE_DELAY = 1000;
const ALLOWED_ROLE_IDS = [
    '1370534162179555488', //AUX
    '1168221758126567559', // Conscript
    '1168233382577197086', // Squire
    '1168230900945928274', // Legionnaire
    '1168233497467551784', // Knight
    '1168233049784324136', // Centurion
    '1168233175391142008', // Prefect
    '1168233555596415087', // Marshal
    '1168233227455037551', // Proconsul
    '1168234361708089454', // Battle Commander
    '1176977627580469258', // High Council
    '1168253795818549319', //Sovereign
];

const WHITELISTED_PLAYERS = {
    // Discord ID: [Array of SC In-Game Names]
    '287438066963185664': ['PlunderLake'],
    '1245149401450807379': ['WS-3185-VG'], // SpicySola ALT
    '194648548808196099': ['JohnCoffey187'], // Yogi's Alt
    '463818871359537162': [ // Viktor's Alts
        'Foreman_Diruo',
        'John_Frum', 
        'Katie_Summers',
        'York_Vickers',
        'The_Pirate_Valet',
        'Yuri_Flack',
        'Rob_Retford',
        'Bread_Cakes',
        'Micky_Merits'
    ],
    '375939181693632513': ['APFSDS-T'], // Baggzie's Alt
    '246067535613657089': ['painalized'], // Cybers's Alt
    '229323393667825664': ['TatianaLasiter'], // Cain's ALT
    '963372076402610177': ['Isaacdic'], // S1ko's Alt
    '151533125883789313': ['Fentfed'], // Desert's ALT
    '720344087466868827': ['Enz_o'], // BossGamer09's Alt
};

const BLACKLISTED_PLAYERS = { // Use Discord ID and SC In-Game Name
    '987654321098765432': 'null',
};

function isBlacklisted(player) {
    const normalizedPlayer = preprocessName(player);
    
    // Check if player matches any Discord ID directly
    if (BLACKLISTED_PLAYERS[player]) {
        console.log(`Player "${player}" is blacklisted (Direct ID match).`);
        return player;
    }
    
    // Check if player matches any in-game name
    const match = Object.entries(BLACKLISTED_PLAYERS).find(
        ([id, name]) => preprocessName(name) === normalizedPlayer
    );

    if (match) {
        console.log(`Player "${player}" is blacklisted (Matched game name).`);
        return match[0];
    }
    
    return null;
}

function isWhitelisted(player) {
    const normalizedPlayer = preprocessName(player);
    
    // Check if player matches any Discord ID directly
    if (WHITELISTED_PLAYERS[player]) {
        console.log(`Player "${player}" is whitelisted (Direct ID match).`);
        return player;
    }
    
    // Check if player matches any in-game name
    for (const [discordId, gameNames] of Object.entries(WHITELISTED_PLAYERS)) {
        for (const gameName of gameNames) {
            if (preprocessName(gameName) === normalizedPlayer) {
                console.log(`Player "${player}" is whitelisted (Matched game name: ${gameName}).`);
                return discordId;
            }
        }
    }
    
    return null; // Don't log here - let the caller handle the messaging
}

const messageQueue = [];
let isProcessing = false;

const gameModeMapping = {
    "SC_Frontend": "Main Menu",
    "SC_Default": "Persistent Universe",
    "EA_SquadronBattle": "Squadron Battle",
    "EA_FreeFlight": "Free Flight",
    "EA_FPSGunGame": "Gun Game",
    "EA_FPSKillConfirmed": "Kill Confirmed",
    'EA_Elimination': "Elimination",
    'EA_TeamElimination': "Team Elimination",
    "EA_TonkRoyale_FreeForAll":"Tonk Battles",
    "EA_Elimination_XOnly":"Single Weapon Elim",
    "Bot_Testing":"Bot_Testing",
};

const gameModeToChannelMap = {
    "SC_Frontend": "1324936826225426503",
    "SC_Default": "1324936826225426503",
    "EA_SquadronBattle": "1324936929929859122",
    "EA_FreeFlight": "1324936929929859122",
    "EA_FPSGunGame": "1324936929929859122",
    "EA_FPSKillConfirmed": "1324936929929859122",
    'EA_Elimination': "1324936929929859122",
    'EA_TeamElimination': "1324936929929859122",
    "EA_TonkRoyale_FreeForAll":"1324936929929859122",
    "Single Weapon Elim":"1324936929929859122",
    "Bot_Testing":"1391557294201901116",
};

// Utility Functions

function getDisplayGameMode(game_mode) {
    // Check for partial matches in the mapping
    for (const key in gameModeMapping) {
        if (key == game_mode) {
            //console.log(`[getDisplayGameMode] Found game mode ${gameModeMapping[key]} for "${game_mode}"`);
            return gameModeMapping[key];
        }
    }
    // If no match is found, return the original or a default value
    console.log(`[getDisplayGameMode] Did not find game mode with "${game_mode}"`);
    return game_mode || "NA";
}

function getChannelIdForGameMode(game_mode) {
    // Use partial match logic for mapping
    const matchedKey = Object.keys(gameModeToChannelMap).find(key => game_mode.includes(key));
    const channelId = matchedKey ? gameModeToChannelMap[matchedKey] : "1324936929929859122";

    if (!matchedKey) {
        console.log(`No specific channel found for game mode "${game_mode}". Using default channel.`);
    }
    return channelId;
}

function getDisplayWeapon(weapon) {
    if (!weapon) return "Unknown Weapon";
    return weaponMapping[weapon] || cleanUpName(weapon) || "Unknown Weapon";
}

function getDisplayKillersShip(ship) {
    if (!ship) return "Unknown Ship";
    return shipMapping[ship] || cleanUpName(ship) || "Unknown Ship";
}

function cleanUpName(name) {
    if (!name) return "Unknown"; // Handle null, undefined, empty string
    return name.replace(/_\d+$/, '');
}

function preprocessName(name) {
    return name
        .replace(/\[.*?\]/g, '') // Remove anything in square brackets
        .replace(/[^a-zA-Z0-9]/g, '') // Remove non-alphanumeric characters
        .trim()
        .toLowerCase(); // Normalize case
}

function findBestMatch(playerName, discordMembers, threshold = 80) {
    const processedPlayerName = preprocessName(playerName);

    // Try to match via name using fuzzball logic
    let bestMatch = null;
    let highestScore = 0;

    discordMembers.forEach(member => {
        const processedDiscordName = preprocessName(member.displayName);

        const similarityScore = fuzzball.ratio(processedPlayerName, processedDiscordName);

        if (similarityScore > highestScore) {
            highestScore = similarityScore;
            bestMatch = member;
        }
    });

    // Check if the best match meets the threshold
    if (bestMatch && highestScore >= threshold) {
        console.log(`Best match for "${playerName}" is "${bestMatch.displayName}" with a score of ${highestScore}`);
        return bestMatch;
    }

    console.log(`No suitable match found for "${playerName}".`);
    return null;
}

function formatTimestamp(isoString) {
    const cleanedString = isoString.replace(/[<>]/g, '');
    const date = new Date(cleanedString);

    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }

    const epochSeconds = Math.floor(date.getTime() / 1000); // Convert milliseconds to seconds
    return `<t:${epochSeconds}:f>`;
}

function buildKillEmbed(
    player,
    victim,
    time,
    zone,
    weapon,
    game_mode = "NA",
    killers_ship = "N/A",
    victim_avatar,
    victim_org,
    victim_org_link,
    anonymize_state,
    anonymous,
    victim_enlisted_date // NEW
) {
    const cleanedTime = time?.replace(/[<>]/g, '') || new Date().toISOString();
    const formattedTime = isNaN(Date.parse(cleanedTime)) ? 'Invalid Date' : formatTimestamp(cleanedTime);

    const displayGameMode = getDisplayGameMode(game_mode);
    const cleanZone = cleanUpName(zone);
    const displayWeapon = getDisplayWeapon(cleanUpName(weapon));
    const displayKillersShip = getDisplayKillersShip(cleanUpName(killers_ship));
    const displayVictimZone = shipMapping[cleanUpName(zone)] || cleanZone;
    const displayPlayer = (anonymous === true || (anonymize_state && anonymize_state.enabled)) ? "BlightVeil" : player;

    // Default avatar override logic
    const defaultRSIAvatar = "https://cdn.robertsspaceindustries.com/static/images/account/avatar_default_big.jpg";
    const fallbackAvatar = "https://cdn.discordapp.com/attachments/1176596448041779270/1300872217210523648/BlightVeilArtboard_4PNG.png";
    let avatarToUse;
    if (!victim_avatar || victim_avatar === defaultRSIAvatar) {
        avatarToUse = fallbackAvatar;
    } else {
        avatarToUse = victim_avatar;
    }

    return new EmbedBuilder()
        .setTitle('BlightVeil Kill')
        .setDescription(`${displayPlayer} eliminated [${victim}](https://robertsspaceindustries.com/citizens/${victim})`)
        .setColor('#690404')
        .setThumbnail(avatarToUse)
        .addFields(
            { name: 'Killer', value: displayPlayer, inline: true },
            { name: 'Killers Ship', value: displayKillersShip, inline: true },
            { name: 'Killers Weapon', value: displayWeapon, inline: true },
            { name: 'Victim', value: `[${victim}](https://robertsspaceindustries.com/citizens/${victim})`, inline: true },
            { name: 'Victim Zone', value: displayVictimZone, inline: true },
            { name: 'Victim Organization', value: victim_org_link ? `[${victim_org}](${victim_org_link})` : victim_org, inline: true },
            { name: 'Enlisted', value: victim_enlisted_date || 'Unknown', inline: true }, // <--- NEW LINE
            { name: 'Game Mode', value: displayGameMode, inline: true },
            { name: 'Time', value: formattedTime, inline: false },
            { name: ' ', value: '[Download BV KillTracker V1.6](https://github.com/BlightVeil/Killtracker/releases/latest)' }
        )
        .setFooter({
            text: 'By Any Means, We Prosper!',
            iconURL: 'https://cdn.discordapp.com/attachments/1324402341058711613/1324402540397461524/BlightVeilArtboard-large_2PNG.png'
        });
}

async function enqueueKillEvent(client, killData) {
    const apiKey = killData.api_key;
    //console.log(`[enqueueKillEvent] Starting with API key: ${apiKey}`);
    //console.log('[enqueueKillEvent] Kill Data:', killData);
    // Validate API key
    if (!apiKey) {
        console.log('Kill event rejected: No API key provided in headers');
        return "error";
    }
    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) {
            console.log(`Kill event rejected: Invalid API key "${apiKey}"`);
            return "error";
        }
    } catch (error) {
        console.error('Error validating API key:', error);
        return "error";
    }

    const { anonymize_state, player, victim, time, zone, weapon, game_mode, client_ver, killers_ship } = killData.report_body;
    //console.log(`[enqueueKillEvent] Starting to fetch org members with player: ${player}, killers_ship: ${killers_ship}, victim: ${victim}, weapon: ${weapon}, zone: ${zone}, time: ${time}, game_mode: ${game_mode}, client_ver: ${client_ver}`)

    // Fetch org members
    const channelId = getChannelIdForGameMode(game_mode);
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
        console.error(`Channel not found for game mode "${game_mode}".`);
        return "error";
    }
    const guild = client.guilds.cache.get('1166103102378750033');
    if (!guild) throw new Error('Guild not found.');
    console.log(`[enqueueKillEvent] Starting member fetch for guild: ${guild.name} (${guild.memberCount} members REPORTKILL------)`);
    
    try {
        await guild.members.fetch({ 
            timeout: 15000, // 15 second timeout
            force: true // Use cache when possible
        });
        console.log(`[enqueueKillEvent] Member fetch completed for ${guild.name}`);
    } catch (error) {
        if (error.code === 'GuildMembersTimeout') {
            console.log(`[enqueueKillEvent] Member fetch timed out for ${guild.name}, using available cache (${guild.members.cache.size} members loaded)`);
        } else {
            console.log(`[enqueueKillEvent] Member fetch error for ${guild.name}: ${error.message}`);
        }
    }

    let playerId;
    // Whitelist check
    const whitelistedId = isWhitelisted(player);
    if (whitelistedId) {
        console.log(`Whitelisted player "${player}" (ID: ${whitelistedId}) bypassing checks.`);
        playerId = whitelistedId;
    } else {
        console.log(`Player "${player}" is not whitelisted, proceeding with guild member checks.`);
        
        // Blacklist check
        const blacklistedId = isBlacklisted(player);
        if (blacklistedId) {
            console.log(`Kill event ignored: Player "${player}" is blacklisted.`);
            return "ignore";
        }
        
        // Attempt to resolve the player ID from guild members
        const guildMember = guild.members.cache.find(member =>
            preprocessName(member.displayName) === preprocessName(player)
        );
        playerId = guildMember?.id || player;
        
        if (guildMember && isBlacklisted(guildMember.id)) {
            console.log(`Kill event ignored: Player "${player}" (Resolved ID: ${guildMember.id}) is blacklisted.`);
            return "ignore";
        }
        
        if (!client_ver || !client_ver.startsWith("1.6")) {
            console.log(`Kill event disregarded: Client version mismatch. Expected version starting with 1.6, got ${client_ver}`);
            return "ignore";
        }
        
        // List of victims to ignore
        const ignoredVictims = [
            "kopion", "marok", "pu_human", "pc_archetypes", "pu_pilots"
        ];

        if (
            victim && (
                ignoredVictims.some(name => victim.toLowerCase().includes(name)) ||
                victim.toLowerCase().startsWith("quasigrazer") ||
                victim.toLowerCase().startsWith("shipjacker") ||
                (victim.toLowerCase().startsWith("vlk") && !victim.toLowerCase().startsWith("vlk_apex_")) ||
                victim.toLowerCase().startsWith("argo_atls")
            )
        ) {
            console.log(`Ignored event: Victim "${victim}" matches an ignored case.`);
            return "ignore";
        }
        
        // Skip self-kills
        if (player === victim) {
            console.log(`Skipped kill event: Killer and victim are the same person (${player})`);
            return "ignore";
        }
        
        // Eligible members based on roles
        const eligibleMembers = guild.members.cache.filter(member =>
            member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))
        );
        
        // Attempt fuzzball match
        const bestMatch = findBestMatch(player, eligibleMembers);
        if (!bestMatch) {
            console.log(`Kill event ignored: Player "${player}" is not whitelisted and no suitable match was found.`);
            return "error";
        }
        
        console.log(`Authenticated player "${player}" via guild member match: "${bestMatch.displayName}"`);
        playerId = bestMatch.id;
    }

    // Deduplicate event
    const eventId = `${player}-${victim}-${time}-${game_mode}`;
    if (eventCache.has(eventId)) {
        console.log(`Duplicate event detected: ${eventId}. Skipping.`);
        return "dupe";
    }
    eventCache.set(eventId, true);
    setTimeout(() => eventCache.delete(eventId), 30 * 60 * 1000);

    // --- Direct RSI Profile Scrape (Faster & More Reliable) ---
    let victimDetails = { 
        handle: victim, 
        org: "Unknown", 
        orgSID: null, 
        avatar: null, 
        enlisted_date: null 
    };

    try {
        console.log(`[RSI SCRAPER] Fetching victim details for "${victim}"`);
        const fallbackProfile = await fetchRSIProfileData(victim);
        
        victimDetails = {
            handle: fallbackProfile.handle || victim,
            org: fallbackProfile.org_name || "No organization",
            orgSID: fallbackProfile.org_short || null,
            avatar: fallbackProfile.avatar_url || null,
            enlisted_date: fallbackProfile.enlisted_date || null
        };
        
        console.log('[RSI SCRAPER] Victim details fetched successfully:', victimDetails);
    } catch (err) {
        console.error("[RSI SCRAPER] Error scraping RSI profile:", err);
        // Continue with basic victim details even if scrape fails
    }

    try {
        // Validate timestamp
        const timestamp = time?.replace(/[<>]/g, '') || new Date().toISOString();
        if (isNaN(Date.parse(timestamp))) {
            console.error(`Invalid timestamp provided: ${time}`);
            return "error";
        }

        // Check for existing duplicate messages
        const existingMessage = messageQueue.find(
            msg => msg.killer === player && msg.victim === victim && msg.game_mode === game_mode
        );
        if (existingMessage) {
            console.log('Duplicate kill event detected in messageQueue. Skipping enqueue.');
            return "dupe";
        }

        // Record the kill in the database
        await recordKill({
            killer: player,
            victim,
            game_mode,
            weapon,
            zone,
            killers_ship,
            time: timestamp,
        });

        // Build and enqueue embed message
        const orgLink = victimDetails.orgSID
            ? `https://robertsspaceindustries.com/orgs/${victimDetails.orgSID}`
            : null;
        
        //console.log(`[enqueueKillEvent] Starting buildKillEmbed with player: ${player}, killers_ship: ${killers_ship}, victim handle: ${victimDetails.handle}, victim avatar: ${victimDetails.avatar}, victim org: ${victimDetails.org}, org link: ${orgLink}, weapon: ${weapon}, zone: ${zone}, timestamp: ${timestamp}, game_mode: ${game_mode}, anonymize_state: ${anonymize_state}`)
        const embed = buildKillEmbed(
            player,
            victimDetails.handle,
            timestamp,
            zone,
            weapon,
            game_mode,
            killers_ship,
            victimDetails.avatar,
            victimDetails.org,
            orgLink,
            anonymize_state,
            false,
            victimDetails.enlisted_date
        );
        messageQueue.push({ client, channelId: getChannelIdForGameMode(game_mode), embed });

        if (!isProcessing) {
            processQueue();
        }
        return "success";
    } catch (error) {
        console.error('Error processing kill event:', error);
        return "error";
    }
}

async function processQueue() {
    if (isProcessing) {
        console.log('processQueue already running. Skipping invocation.');
        return; // Prevent concurrent executions
    }

    console.log('Starting processQueue');
    isProcessing = true;

    while (messageQueue.length > 0) {
        const { client, channelId, embed } = messageQueue.shift();
        try {
            const channel = await client.channels.fetch(channelId);

            // Ensure channel is valid for sending messages
            if (
                channel.type === ChannelType.PublicThread ||
                channel.type === ChannelType.PrivateThread ||
                channel.type === ChannelType.GuildText
            ) {
                await channel.send({ embeds: [embed] });
                console.log(`Message sent to channel: ${channel.name}`);
            } else {
                console.error(`Invalid channel type: ${channel.type} for channel ${channel.name}`);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }

        // Delay between messages to avoid spamming
        await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));
    }

    console.log('Ending processQueue');
    isProcessing = false;
}

// Schedule to delete expired API keys
async function deleteExpiredKeys() {
    const db = await connectToMySQL();
    try {
        const query = `
            DELETE FROM killtracker_keys
            WHERE is_permanent = FALSE 
            AND created_at < NOW() - INTERVAL 1 WEEK
        `;
        const [result] = await db.query(query);
        console.log(`Expired API keys deleted: ${result.affectedRows}`);
    } catch (error) {
        console.error('Error deleting expired API keys:', error);
    }
}

// Schedule the job to run every minute
schedule.scheduleJob('* * * * *', deleteExpiredKeys); // Runs every minute

module.exports = { enqueueKillEvent };