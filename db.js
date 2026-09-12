const mysql = require('mysql2/promise');
const { EmbedBuilder, Colors } = require('discord.js');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const DEFAULT_ELO = 1200;
const K = 32;


const levels = [
    { count: 3, roleId: '1226674659492364438' },  // Distinction - Level 1
    { count: 7, roleId: '1226679328448708700' },  // Distinction - Level 2
    { count: 15, roleId: '1226679388221734914' }, // Distinction - Level 3
    { count: 25, roleId: '1226679385638305842' }, // Distinction - Level 4
    { count: 35, roleId: '1226679383201284268' }, // Distinction - Level 5
    { count: 50, roleId: '1226679728337981500' }, // Distinction - Level 6
    { count: 65, roleId: '1226679725330530354' }, // Distinction - Level 7
    { count: 85, roleId: '1226679720930709584' }, // Distinction - Level 8
    { count: 105, roleId: '1226679719391662080' }, // Distinction - Level 9
    { count: 150, roleId: '1226679718548340736' }, // Distinction - Level 10
];

let pool;

// Establish MySQL connection pool
async function connectToMySQL() {
    if (!pool) {
        try {
            pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASS,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                //connectTimeout: 20000,  // Increased connection timeout
                //timeout: 30000,         // Query timeout
            });
            console.log('Connected to MySQL database.');
        } catch (err) {
            console.error('Error connecting to MySQL:', err);
            throw err;
        }
    }
    return pool;
}

// Add to db.js
async function validateConnection() {
    if (!pool) {
        await connectToMySQL();
        return true;
    }
    
    try {
        // Test the connection
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        return true;
    } catch (error) {
        console.error('Database connection validation failed:', error);
        // Try to reconnect
        pool = null;
        await connectToMySQL();
        return false;
    }
}


// General-purpose query wrapper
async function queryDatabase(query, params) {
    const db = await connectToMySQL();
    try {
        const [results] = await db.query(query, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

async function getMembersByGuild(guildId) {
    const db = await connectToMySQL();
    try {
        const [rows] = await db.query('SELECT user_id, username, display_name, updated_at FROM members WHERE guild_id = ?', [guildId]);
        return rows;
    } catch (error) {
        console.error('Error fetching members by guild:', error);
        throw error;
    }
}


async function storeTempVC(guildId, parentId, vcId) {
  const db = await connectToMySQL();
  await db.query(
    'INSERT INTO temp_vcs (guild_id, parent_id, vc_id) VALUES (?, ?, ?)',
    [guildId, parentId, vcId]
  );
}

async function removeTempVC(vcId) {
  const db = await connectToMySQL();
  const [rows] = await db.query('SELECT * FROM temp_vcs WHERE vc_id = ?', [vcId]);

  if (rows.length > 0) {
    await db.query('DELETE FROM temp_vcs WHERE vc_id = ?', [vcId]);
    console.log(`Temp VC removed from database: ${vcId}`);
    return true;
  }

  return false;
}

async function getActiveTempVCCount(parentId) {
  const db = await connectToMySQL();
  const [rows] = await db.query(
    'SELECT COUNT(*) AS count FROM temp_vcs WHERE parent_id = ?',
    [parentId]
  );
  return rows[0]?.count || 0;
}

// Check if a channel ID is a temp VC in DB
async function checkIfTempVC(vcId) {
  const db = await connectToMySQL();
  const [rows] = await db.query('SELECT * FROM temp_vcs WHERE vc_id = ?', [vcId]);
  return rows.length > 0;
}

async function getOrphanedTempVCs(guild) {
  const db = await connectToMySQL();
  const [rows] = await db.query('SELECT vc_id FROM temp_vcs');
  return rows
    .filter((row) => !guild.channels.cache.has(row.vc_id))
    .map((row) => row.vc_id);
}

async function upsertBlightVeilMember(userId, guildId, username, memberRoles, token) {
    const db = pool;  // MySQL connection pool
    const connection = await db.getConnection();

    // Calculate total nominations from the nominations table
    const [nominationRows] = await connection.query(
        'SELECT COUNT(*) AS total_nominations FROM nominations WHERE user_id = ?',
        [userId]
    );
    const totalNominations = nominationRows[0].total_nominations || 0;

    // Define role mappings
    const hierarchyRoles = {
        '1173822659071578182': 'Command',
        '1173822697956982794': 'Officer',
        '1173822842442367026': 'Leader',
        '1173822915574251570': 'Member',
        '1373070720258670712': 'Auxiliary'
    };

    const divisionRoles = {
        '1168253795818549319': 'Sovereign',
        '1168234521301356715': 'High Council',
        '1168214951446454352': 'BlightVeil Knights',
        '1168215961757810779': 'BlightVeil Legion',
        '1370534162179555488': 'Auxiliary'
    };

    const rankRoles = {
        '1173822995198902362': 'Rank 1',
        '1173823118163325009': 'Rank 2',
        '1173823121942396978': 'Rank 3',
        '1173823125918588969': 'Rank 4',
        '1173823127977996399': 'Rank 5',
        '1173823128976228473': 'Rank 6',
        '1173823129810911254': 'Rank 7',
        '1173823130742050907': 'Rank 8',
        '1173823132260384899': 'Rank 9'
    };

    const titleRoles = {
        '1176977627580469258': 'High Council',
        '1176977966857728090': 'Imperator',
        '1168233227455037551': 'Battle Commander',
        '1168233227455037551': 'Proconsul',
        '1168233555596415087': 'Marshal',
        '1168233175391142008': 'Prefect',
        '1168233049784324136': 'Centurion',
        '1168233497467551784': 'Knight',
        '1168230900945928274': 'Legionnaire',
        '1168233382577197086': 'Squire',
        '1168221758126567559': 'Conscript'
    };

    const specialtyRoleMappings = {
        '1314636682120925295': 'Brawler',
        '1314636684918526033': 'Striker',
        '1314636688038826075': 'Scout',
        '1314636690589220925': 'Interdictor',
        '1314636662151843952': 'Helmsman (Combination)',
        '1314636665179869276': 'Pirate (Combination)',
        '1314636695383179354': 'LRS',
        '1314636698176585778': 'CQB',
        '1314636700831453254': 'Mechanized',
        '1314636710235340880': 'ATG',
        '1314636712819032155': 'Engineer',
        '1314636715683745822': 'Bombardier',
        '1314636720498675782': 'Hauler',
        '1314636723052875917': 'Miner',
        '1314636725687160926': 'Architect',
        '1314636728660787340': 'Salvager',
    };

    // Extract specialty roles by name
    const specialtyRoles = memberRoles
        .filter(roleId => Object.keys(specialtyRoleMappings).includes(roleId))
        .map(roleId => specialtyRoleMappings[roleId]); // Map role IDs to their names

    // Convert specialty roles to a comma-separated string
    const specialtyRolesString = specialtyRoles.join(',');

    const staffRoles = {
        '1174715276126859274': 'Chamberlain',
        '1171484082048340028': 'BlightVeil Envoy',
        '1172312195690934363': 'Herald',
        '1176594286469464164': 'Treasurer',
        '1174730223636451479': 'Scribe',
        '1178207198602608680': 'Scholar',
        '1185813396667514891': 'Event Coordinator'
    };

    const instructorRoles = {
        '1168327555917557780': 'Pilot Instructor',
        '1168327592269598760': 'Infantry Instructor',
        '1168327699203375114': 'Crewman Instructor',
        '1168327804874661931': 'Tradesman Instructor'
    };

    const reactionGroupRoles = {
        '1235058557863460954': 'Deathwatch',
        '1262768748876660806': 'Loot Goblin'
    };

    const mainDisciplineRoles = {
        '1168285269926101103': 'Pilot',
        '1168285299416248422': 'Infantry',
        '1168287118582349944': 'Crewman',
        '1168285383012925501': 'Tradesman'
    };

    const secondaryInterestRoles = {
        '1285585726536159302': 'Secondary - Pilot',
        '1285585932417761320': 'Secondary - Infantry',
        '1285585929884667925': 'Secondary - Crewman',
        '1285585927170822185': 'Secondary - Tradesman'
    };

    const commendationRoles = {
        '1179489896554041424': 'BlightVeil Medal of Glory',
        '1176955192953020416': 'Valiant Medal of Slaughter',
        '1250794474481647617': 'Tournament Champion',
        '1179511959805239296': 'Distinguished Command Medal',
        '1179470795773333634': 'Distinguished Pilot Medal',
        '1176959504492007635': 'Distinguished Infantry Medal',
        '1181295806461005964': 'Distinguished Crewman Medal',
        '1181295837553369169': 'Distinguished Tradesman Medal',
        '1179490981591142440': 'Commendation of Excellence',
        '1179491522748624977': 'Commendation of Distinction',
        '1179490984762019921': 'Commendation of Prowess',
        '1179490989019242658': 'Commendation of Potential',
        '1179511948321243256': 'Exceptional Marksmanship Medal',
        '1179511949713752215': 'Operational Performance Medal',
        '1179511435471093851': 'Crest of Knighthood',
        '1280978643589271593': 'Troll Lord',
        '1280978452694040577': 'Meme Lord'
    };

    // Distinction Level Roles
    const distinctionLevels = {
        '1226679718548340736': 'Distinction - Level 10',
        '1226679719391662080': 'Distinction - Level 9',
        '1226679720930709584': 'Distinction - Level 8',
        '1226679725330530354': 'Distinction - Level 7',
        '1226679728337981500': 'Distinction - Level 6',
        '1226679383201284268': 'Distinction - Level 5',
        '1226679385638305842': 'Distinction - Level 4',
        '1226679388221734914': 'Distinction - Level 3',
        '1226679328448708700': 'Distinction - Level 2',
        '1226674659492364438': 'Distinction - Level 1'
    };

    // Filter out members that do not have a hierarchy role
    const hasHierarchyRole = memberRoles.some(role => Object.keys(hierarchyRoles).includes(role));
    if (!hasHierarchyRole) {
        connection.release();
        return;
    }

    // Define variables with default null values
    let hierarchyRole = null;
    let divisionRole = null;
    let rank = null;
    let title = null;
    let staffRole = null;
    let instructorRole = null;
    let reactionGroupRole = null;
    let mainDiscipline = null;
    let secondaryInterest = null;
    let commendations = [];
    let distinctionLevel = null;

    // Process roles and assign corresponding values
    for (const role of memberRoles) {
        if (hierarchyRoles[role]) hierarchyRole = hierarchyRoles[role];
        if (divisionRoles[role]) divisionRole = divisionRoles[role];
        if (rankRoles[role]) rank = rankRoles[role];
        if (titleRoles[role]) title = titleRoles[role];
        if (staffRoles[role]) staffRole = staffRoles[role];
        if (instructorRoles[role]) instructorRole = instructorRoles[role];
        if (reactionGroupRoles[role]) reactionGroupRole = reactionGroupRoles[role];
        if (mainDisciplineRoles[role]) mainDiscipline = mainDisciplineRoles[role];
        if (secondaryInterestRoles[role]) secondaryInterest = secondaryInterestRoles[role];
        if (commendationRoles[role]) commendations.push(commendationRoles[role]);
        if (distinctionLevels[role]) distinctionLevel = distinctionLevels[role];
    }

    // Convert the array of commendations into a string
    const commendationsString = commendations.length > 0 ? commendations.join(', ') : null;

    // Define the query to insert or update member data
    const query = `
        INSERT INTO members (
            user_id, guild_id, username, hierarchy_role, division_role, 
            rank, title, main_discipline, specialty_roles, secondary_interest,
            total_nominations, distinction_level, staff_role, instructor_role, 
            reaction_group_role, commendations, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            hierarchy_role = VALUES(hierarchy_role),
            division_role = VALUES(division_role),
            rank = VALUES(rank),
            title = VALUES(title),
            main_discipline = VALUES(main_discipline),
            specialty_roles = VALUES(specialty_roles),
            secondary_interest = VALUES(secondary_interest),
            total_nominations = VALUES(total_nominations),
            distinction_level = VALUES(distinction_level),
            staff_role = VALUES(staff_role),
            instructor_role = VALUES(instructor_role),
            reaction_group_role = VALUES(reaction_group_role),
            commendations = VALUES(commendations),
            updated_at = VALUES(updated_at);
    `;

    await connection.query(query, [
        userId,
        guildId,
        username,
        hierarchyRole || null,
        divisionRole || null,
        rank || null,
        title || null,
        mainDiscipline || null,
        null, // Replace this with specialty roles if applicable
        secondaryInterest || null,
        totalNominations || null,
        distinctionLevel || null,
        staffRole || null,
        instructorRole || null,
        reactionGroupRole || null,
        commendationsString || null,
        new Date(),
    ]);

    // Release the connection after the query
    //console.log(`Member ${username} data updated in MySQL.`);
    connection.release();
}

// Add a nomination
async function addNomination(userId, username, nominatorId, dateOrEvent, reason, guild) {
    if (!guild) {
        console.error('Guild object is missing when calling addNomination');
        return;
    }

    // Ensure IDs are treated as strings
    const stringUserId = String(userId);
    const stringNominatorId = String(nominatorId);

    try {
        console.log('Inserting user_id into nominations:', stringUserId);

        await queryDatabase(
            `INSERT INTO nominations (user_id, username, nominator_id, date_or_event, reason, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP);`,
            [stringUserId, username, stringNominatorId, dateOrEvent, reason]
        );
        console.log(`Nomination added for user ${stringUserId}`);
        await updateTotalNominations(stringUserId, guild);
    } catch (error) {
        console.error('Error adding nomination:', error);
    }
}

// Get all nominations for a user
async function getNominationsForUser(userId) {
    const stringUserId = String(userId); // Ensure userId is treated as a string
    try {
        console.log('Fetching nominations for userId:', stringUserId);

        const rows = await queryDatabase(
            `SELECT user_id, username, nominator_id, date_or_event, reason, created_at
            FROM nominations
            WHERE user_id = ?;`,
            [stringUserId]
        );

        if (!rows || rows.length === 0) {
            console.log(`No nominations found for user: ${stringUserId}`);
            return [];
        }

        console.log('Nominations fetched for user:', stringUserId, rows);
        return rows;
    } catch (error) {
        console.error('Error fetching nominations for user:', stringUserId, error);
        return [];
    }
}

// Reset nominations for a user
async function resetNominationsForUser(userId) {
    const stringUserId = String(userId); // Ensure userId is treated as a string
    try {
        await queryDatabase('DELETE FROM nominations WHERE user_id = ?', [stringUserId]);
        await updateTotalNominations(stringUserId);
        console.log(`Nominations reset for user ${stringUserId}`);
    } catch (error) {
        console.error('Error resetting nominations:', error);
    }
}

// Update total nominations and distinction level
async function updateTotalNominations(userId, guild) {
    if (!guild) {
        console.error('Guild object is missing when calling updateTotalNominations');
        return;
    }

    const stringUserId = String(userId); // Ensure userId is treated as a string

    try {
        console.log(`Updating total nominations for user: ${stringUserId}`);

        // Fetch total nominations for the user
        const rows = await queryDatabase(
            `SELECT COUNT(*) AS total_nominations FROM nominations WHERE user_id = ?;`,
            [stringUserId]
        );
        const totalNominations = rows[0]?.total_nominations || 0;
        console.log(`Total nominations for user ${stringUserId}: ${totalNominations}`);

        // Determine the current distinction level based on the total nominations
        let currentDistinctionLevel = null;
        for (const level of levels) {
            if (totalNominations >= level.count) {
                currentDistinctionLevel = level.roleId;
            }
        }

        console.log(`Current distinction level for user ${stringUserId}: ${currentDistinctionLevel}`);

        // Fetch the user's previous distinction level from the database
        const currentRows = await queryDatabase(
            `SELECT distinction_level FROM members WHERE user_id = ?;`,
            [stringUserId]
        );
        const previousDistinctionLevel = currentRows[0]?.distinction_level || null;
        console.log(`Previous distinction level for user ${stringUserId}: ${previousDistinctionLevel}`);

        // Update the user's total nominations and distinction level in the database
        await queryDatabase(
            `UPDATE members
            SET total_nominations = ?, distinction_level = ?
            WHERE user_id = ?;`,
            [totalNominations, currentDistinctionLevel, stringUserId]
        );

        console.log(`User ${stringUserId} updated: total nominations = ${totalNominations}, distinction level = ${currentDistinctionLevel}`);
    } catch (error) {
        console.error(`Error updating total nominations for user ${stringUserId}:`, error);
    }
}

// Update roles based on total nominations
async function updateRoles(member, totalNominations) {
    let currentLevel = 'None';

    // Determine the current distinction level based on total nominations
    for (let i = levels.length - 1; i >= 0; i--) {
        if (totalNominations >= levels[i].count) {
            currentLevel = levels[i].roleId;
            break;
        }
    }

    const guildMember = await member.guild.members.fetch(member.id);

    // Remove any previous distinction roles
    for (let i = 0; i < levels.length; i++) {
        const role = member.guild.roles.cache.get(levels[i].roleId);
        if (role && guildMember.roles.cache.has(role.id)) {
            await guildMember.roles.remove(role);
        }
    }

    // Add the new distinction level role
    const newRole = member.guild.roles.cache.get(currentLevel);
    if (newRole) {
        await guildMember.roles.add(newRole);
    }

    console.log(`Updated distinction level role for ${member.user.tag}: ${currentLevel}`);
}

// Record a kill in killtrackerdaily
async function recordKill(killData) {
    const db = await connectToMySQL();

    const {
        killer,
        victim,
        game_mode,
        weapon,
        killers_ship,
        zone,
        time
    } = killData;

    let formattedTime;

    try {
        // Sanitize the time input
        const sanitizedTime = time?.replace(/[<>]/g, '') || null;
        if (!sanitizedTime || isNaN(new Date(sanitizedTime).getTime())) {
            throw new Error(`Invalid time value: ${time}`);
        }
        formattedTime = new Date(sanitizedTime).toISOString().slice(0, 19).replace('T', ' ');
    } catch (error) {
        console.error(`Time formatting error: ${error.message}`);
        formattedTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Fallback
    }

    const query = `
        INSERT INTO DailyKillTracker (killer, victim, game_mode, weapon, killers_ship, zone, time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        await db.query(query, [killer, victim, game_mode, weapon, killers_ship, zone, formattedTime]);
        console.log(`Recorded kill: ${killer} eliminated ${victim} in ${game_mode}.`);
    } catch (error) {
        console.error('Error recording kill:', error);
        throw error;
    }
}

// Retrieve weekly leaderboard data
async function getWeeklyLeaderboardData(lastMonday, thisMonday) {
    const db = await connectToMySQL();

    const totalKillsQuery = `
        SELECT COUNT(*) AS total_kills
        FROM DailyKillTracker
        WHERE date >= ? AND date < ?
    `;

    const modeKillsQuery = `
        SELECT game_mode, COUNT(*) AS kills
        FROM DailyKillTracker
        WHERE date >= ? AND date < ?
        GROUP BY game_mode
    `;

    const zoneKillsQuery = `
        SELECT zone, COUNT(*) AS kills
        FROM DailyKillTracker
        WHERE date >= ? AND date < ?
        GROUP BY zone
    `;

    try {
        const [[{ total_kills }]] = await db.query(totalKillsQuery, [lastMonday, thisMonday]);
        const [modeKills] = await db.query(modeKillsQuery, [lastMonday, thisMonday]);
        const [zoneKills] = await db.query(zoneKillsQuery, [lastMonday, thisMonday]);

        return { total_kills, modeKills, zoneKills, };
    } catch (error) {
        console.error('Error fetching weekly leaderboard data:', error);
        throw error;
    }
}

async function getLeaderboardData(gameModes, includeAllTime = false, startDate = null, endDate = null) {
    const db = await connectToMySQL();
    
    let dateCondition = '';
    let queryParams = [];
    
    if (!includeAllTime && startDate && endDate) {
        dateCondition = 'AND time >= ? AND time < ?';
        queryParams = [startDate, endDate];
    }
    
    const gameModeCondition = gameModes.map(() => 'game_mode = ?').join(' OR ');
    queryParams = [...gameModes, ...queryParams];
    
    const query = `
        SELECT killer, COUNT(*) as kill_count
        FROM DailyKillTracker
        WHERE (${gameModeCondition}) ${dateCondition}
        GROUP BY killer
        ORDER BY kill_count DESC
        LIMIT 10
    `;
    
    try {
        const [results] = await db.query(query, queryParams);
        return results;
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        return [];
    }
}

async function generateAndStoreApiKey(userId) {
    const db = await connectToMySQL();
    const apiKey = uuidv4(); // Generate a unique API key
    try {
        await db.query(
            'INSERT INTO killtracker_keys (user_id, api_key) VALUES (?, ?)',
            [userId, apiKey]
        );
        console.log(`API key generated for user ${userId}: ${apiKey}`);
        return apiKey;
    } catch (error) {
        console.error('Error generating API key:', error);
        throw error;
    }
}

async function validateApiKey(apiKey) {
    const db = await connectToMySQL();
    try {
        //console.log('Validating API key:', apiKey); // Debug
        const [rows] = await db.query('SELECT * FROM killtracker_keys WHERE api_key = ?', [apiKey]);
        //console.log('API Key Query Result:', rows); // Debug
        return rows.length > 0; // Return true if a matching key is found
    } catch (error) {
        console.error('Error validating API key:', error);
        throw error;
    }
}

// Store Squire Trial Data
async function storeSquireTrial(
    squireId,
    squireName,
    sponsorId,
    sponsorName,
    yayVotes,
    nayVotes,
    preSquireRank,
    pollId,
    channelId,
    pollThreadId, 
    startTime,
    trialDuration,
    trialStatus,
    failureCount = 0,
    passFail = null,
    pollMessageId = null  
) {
    const db = await connectToMySQL();
    try {
        await db.query(
            `INSERT INTO squire_trials 
            (squire_id, squire_name, sponsor_id, sponsor_name, yay_votes, nay_votes, pre_squire_rank, poll_id, channel_id, poll_thread_id, started_at, trial_duration, trial_status, failure_count, pass_fail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                squireId,
                squireName,
                sponsorId,
                sponsorName,
                yayVotes || null,
                nayVotes || null,
                preSquireRank,
                pollId,
                channelId,
                pollThreadId, 
                startTime,
                trialDuration,
                trialStatus,
                failureCount,
                passFail,
                pollMessageId
            ]
        );
        console.log('Squire Trial stored successfully.');
    } catch (error) {
        console.error('Error storing squire trial data:', error);
        throw error;
    }
}

async function getSquireTrial(channelId) {
    const db = await connectToMySQL();
    try {
        const [rows] = await db.query(
            `SELECT squire_id, squire_name, sponsor_id, sponsor_name, poll_id, yay_votes, nay_votes, pre_squire_rank, failure_count, channel_id, poll_thread_id, started_at, trial_duration, trial_status, pass_fail 
            FROM squire_trials 
            WHERE channel_id = ?`,
            [channelId]
        );
        return rows[0] || null;
    } catch (error) {
        console.error('Error fetching squire trial data:', error);
        throw error;
    }
}

async function storeSquireVote(pollId, userId, voteType) {
    const db = await connectToMySQL();

    try {
        // Retrieve current votes based on pollId
        const [rows] = await db.query(
            `SELECT yay_votes, nay_votes, abstain_votes FROM squire_trials WHERE poll_id = ?`,
            [pollId]
        );

        if (rows.length === 0) {
            console.error(`No squire trial found for poll ID: ${pollId}`);
            return;
        }

        let yayVotes = rows[0].yay_votes ? rows[0].yay_votes.split(',') : [];
        let nayVotes = rows[0].nay_votes ? rows[0].nay_votes.split(',') : [];
        let abstainVotes = rows[0].abstain_votes ? rows[0].abstain_votes.split(',') : [];

        // Remove the user from any previous vote
        yayVotes = yayVotes.filter(id => id !== userId);
        nayVotes = nayVotes.filter(id => id !== userId);
        abstainVotes = abstainVotes.filter(id => id !== userId);

        // Add the user to the new vote type
        if (voteType === 'Yay') {
            yayVotes.push(userId);
        } else if (voteType === 'Nay') {
            nayVotes.push(userId);
        } else if (voteType === 'Abstain') {
            abstainVotes.push(userId);
        }

        // Update the database with new votes
        await db.query(
            `UPDATE squire_trials SET yay_votes = ?, nay_votes = ?, abstain_votes = ? WHERE poll_id = ?`,
            [yayVotes.join(','), nayVotes.join(','), abstainVotes.join(','), pollId]
        );

        console.log(`Vote updated: User ${userId} voted ${voteType} in poll ${pollId}`);
        return { updatedVote: voteType };
    } catch (error) {
        console.error('Error storing vote:', error);
        throw error;
    }
}

async function incrementFailureCount(trialChannelId) {
    const db = await connectToMySQL();
    try {
        await db.query(
            `UPDATE squire_trials 
             SET failure_count = failure_count + 1 
             WHERE channel_id = ?`,
            [trialChannelId]
        );
        console.log(`Failure count incremented for trial with channel ID ${trialChannelId}.`);
    } catch (error) {
        console.error('Error incrementing failure count:', error);
        throw error;
    }
}

async function updateSquireTrialStatus(trialChannelId, status) {
    try { // Add the 'try' keyword to start the try-catch block
        const db = await connectToMySQL();
        await db.query(
            `UPDATE squire_trials 
             SET trial_status = ?, evaluated_at = NOW() 
             WHERE channel_id = ?`,
            [status, trialChannelId]
        );
        console.log(`Squire trial with channel ID ${trialChannelId} updated to status: ${status}.`);
    } catch (error) {
        console.error('Error updating squire trial status:', error);
        throw error;
    }
}

async function addEvaluation(userId, guildId, type) {
    const db = await connectToMySQL();
    await db.query(
        'INSERT INTO evaluations (user_id, guild_id, start_date, type) VALUES (?, ?, NOW(), ?) ON DUPLICATE KEY UPDATE start_date = NOW(), type = ?',
        [userId, guildId, type, type]
    );
}

async function removeEvaluation(userId) {
    const db = await connectToMySQL();
    await db.query('DELETE FROM evaluations WHERE user_id = ?', [userId]);
}

async function getDueEvaluations() {
    const db = await connectToMySQL();
    const [rows] = await db.query(`
        SELECT * FROM evaluations
        WHERE start_date <= NOW() - INTERVAL 30 DAY
        AND posted = FALSE
    `);
    return rows;
}

async function markEvaluationAsPosted(userId) {
    const db = await connectToMySQL();
    await db.query(`UPDATE evaluations SET posted = TRUE WHERE user_id = ?`, [userId]);
}

async function listEvaluations(guildId) {
    try {
        const db = await connectToMySQL();
        // Filter by guild_id and sort by start_date
        const [rows] = await db.query(
            'SELECT * FROM evaluations WHERE guild_id = ? ORDER BY start_date ASC',
            [guildId]
        );
        return rows;
    } catch (error) {
        console.error('Database error in listEvaluations:', error);
        throw error;
    }
}

// Get a user's ELO, creating a row if it doesn't exist
async function getUserElo(fighterId) {
    const db = await connectToMySQL();
    const [rows] = await db.query('SELECT elo FROM elo_ratings WHERE fighter_id=?', [fighterId]);
    if (rows.length) return rows[0].elo;
    await db.query('INSERT INTO elo_ratings (fighter_id, elo) VALUES (?, ?)', [fighterId, DEFAULT_ELO]);
    return DEFAULT_ELO;
}

// Set a user's ELO
async function setUserElo(fighterId, newElo) {
    const db = await connectToMySQL();
    await db.query(
        'INSERT INTO elo_ratings (fighter_id, elo) VALUES (?, ?) ON DUPLICATE KEY UPDATE elo=?',
        [fighterId, newElo, newElo]
    );
}

// Update ELO for both after fight
async function updateElo(fighterId, opponentId, fighterResult) {
    let eloA = await getUserElo(fighterId);
    let eloB = await getUserElo(opponentId);

    const resultA = fighterResult === 'WIN' ? 1 : 0;
    const resultB = 1 - resultA;

    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));

    const newEloA = Math.round(eloA + K * (resultA - expectedA));
    const newEloB = Math.round(eloB + K * (resultB - expectedB));

    await setUserElo(fighterId, newEloA);
    await setUserElo(opponentId, newEloB);

    return { newEloA, newEloB };
}

// Save result as before
async function saveFightResult(fighterId, opponentId, result) {
    const db = await connectToMySQL();
    await db.query(
        'INSERT INTO fight_results (fighter_id, opponent_id, result) VALUES (?, ?, ?)',
        [fighterId, opponentId, result]
    );
}

async function getAllPlayersEloWithStats(guildId) {
  const sql = `
    SELECT 
      m.user_id AS id,
      m.username,
      m.dojo_glicko_elo AS elo,
      m.rank,
      m.title,
      m.hierarchy_role,
      m.division_role,
      m.guild_id,
      'members' AS source
    FROM members m
    WHERE m.guild_id = ? AND m.dojo_glicko_elo IS NOT NULL

    UNION

    SELECT
      gp.id AS id,
      gp.username,
      gp.dojo_glicko_elo AS elo,
      NULL AS rank,
      NULL AS title,
      NULL AS hierarchy_role,
      NULL AS division_role,
      NULL AS guild_id,
      'global' AS source
    FROM global_players gp
    WHERE gp.id NOT IN (
      SELECT user_id FROM members WHERE guild_id = ?
    )
    AND gp.dojo_glicko_elo IS NOT NULL

    ORDER BY elo DESC
  `;

  const [rows] = await pool.query(sql, [guildId, guildId]);
  return rows;
}

// Updated: Get leaderboard, joined with ELO
async function getFPSLeaderboard(limit = 10, days = 7, guild) {
    const db = await connectToMySQL();
    const [rows] = await db.query(`
    SELECT fr.fighter_id, COUNT(*) AS fights, SUM(result='WIN') AS wins,
            er.elo
    FROM fight_results fr
    LEFT JOIN elo_ratings er ON er.fighter_id = fr.fighter_id
    WHERE fr.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    GROUP BY fr.fighter_id
    HAVING fights > 0
    ORDER BY er.elo DESC
    LIMIT ?
    `, [days, limit]);
    const entries = [];
    for (const row of rows) {
        const winRate = row.fights ? row.wins / row.fights : 0;
        let name = row.fighter_id;
        try {
            if (guild) {
                const member = await guild.members.fetch(row.fighter_id).catch(()=>null);
                if (member) name = member.displayName;
            }
        } catch {}
        entries.push({
            id: row.fighter_id,
            name,
            fights: row.fights,
            wins: row.wins,
            winRate,
            elo: row.elo || 1200
        });
    }
    return entries;
}

const RSI_SCRAPE_COOLDOWN_HOURS = 24;

async function updateRsiProfile(username) {
    const pool = await connectToMySQL();
    try {
        const [rows] = await pool.query('SELECT last_scrape, profile_missing FROM rsi_profiles WHERE username = ?', [username]);
        const now = new Date();

        if (rows.length > 0) {
            const { last_scrape: lastScrape, profile_missing: profileMissing } = rows[0];

            if (profileMissing) {
                //console.log(`Skipping missing RSI profile: ${username}`);
                return;
            }

            if (lastScrape && (now - new Date(lastScrape)) < RSI_SCRAPE_COOLDOWN_HOURS * 3600000) {
                return;
            }
        }

        const profileUrl = `https://robertsspaceindustries.com/en/citizens/${username}`;
        const response = await axios.get(profileUrl);
        const $ = cheerio.load(response.data);

        const safeGet = el => (el ? el.text().trim() : null);

        let orgElement = $('div.main-org.right-col div.info p.entry a[href^="/orgs/"]');
        let orgName = safeGet(orgElement);

        // Optional fallback selector example (adjust as needed)
        if (!orgName) {
            const fallbackOrgElement = $('div.main-org div.alt-org-selector a'); 
            orgName = safeGet(fallbackOrgElement);
        }

        // Scrape SID here
        const sidLabel = $('span.label').filter((i, el) => $(el).text().trim() === 'Spectrum Identification (SID)');
        const sid = safeGet(sidLabel.parent().find('strong.value'));

        console.log(`Scraped orgName for ${username}:`, orgName);
        console.log(`Scraped SID for ${username}:`, sid);

        const displayName = safeGet($('div.profile.left-col div.info p.entry strong.value').first());
        const handleLabel = $('span.label').filter((i, el) => $(el).text().trim() === 'Handle name');
        const handleName = safeGet(handleLabel.parent().find('strong.value'));

        await pool.query(
            `
            INSERT INTO rsi_profiles (username, org_name, sid, display_name, handle_name, last_scrape, profile_missing)
            VALUES (?, ?, ?, ?, ?, ?, FALSE)
            ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                handle_name = VALUES(handle_name),
                last_scrape = VALUES(last_scrape),
                profile_missing = FALSE,
                org_name = VALUES(org_name),
                sid = VALUES(sid)
            `,
            [username, orgName, sid, displayName, handleName, now]
        );

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn(`RSI profile not found for ${username} (404)`);

            await pool.query(
                `
                INSERT INTO rsi_profiles (username, profile_missing, last_scrape)
                VALUES (?, TRUE, ?)
                ON DUPLICATE KEY UPDATE
                    profile_missing = TRUE,
                    last_scrape = VALUES(last_scrape)
                `,
                [username, new Date()]
            );
        } else {
            console.error(`Error updating RSI profile for ${username}:`, error.message);
        }
    }
}

async function cleanupDuplicatePlayers() {
    const db = await connectToMySQL();
    
    // Find players that exist in both tables
    const [duplicates] = await db.query(`
        SELECT m.username, m.user_id as member_id, 
               m.dojo_elo_api as member_elo, m.dojo_glicko_elo as member_glicko,
               m.matches_played as member_matches, m.kills as member_kills, m.deaths as member_deaths,
               g.id as global_id, 
               g.dojo_elo_api as global_elo, g.dojo_glicko_elo as global_glicko,
               g.matches_played as global_matches, g.kills as global_kills, g.deaths as global_deaths
        FROM members m
        JOIN global_players g ON LOWER(m.username) = LOWER(g.username)
    `);

    for (const dup of duplicates) {
        console.log(`[CLEANUP] Handling duplicate: ${dup.username}`); // FIXED
        
        // Always prefer members table, merge data from global_players into members
        const totalMatches = (dup.member_matches || 0) + (dup.global_matches || 0);
        const totalKills = (dup.member_kills || 0) + (dup.global_kills || 0);
        const totalDeaths = (dup.member_deaths || 0) + (dup.global_deaths || 0);
        
        // Use the higher ELO value (more recent gameplay)
        const bestElo = Math.max(dup.member_elo || 1200, dup.global_elo || 1200);
        const bestGlicko = Math.max(dup.member_glicko || 1200, dup.global_glicko || 1200);
        
        // Update members table with merged data
        await db.query(`
            UPDATE members 
            SET matches_played = ?, kills = ?, deaths = ?, 
                dojo_elo_api = ?, dojo_glicko_elo = ?
            WHERE user_id = ?
        `, [totalMatches, totalKills, totalDeaths, bestElo, bestGlicko, dup.member_id]);
        
        console.log(`[CLEANUP] Merged data for ${dup.username}: matches=${totalMatches}, kills=${totalKills}, deaths=${totalDeaths}, elo=${bestElo}`); // FIXED
        
        // Delete only from global_players
        await db.query('DELETE FROM global_players WHERE id = ?', [dup.global_id]);
        console.log(`[CLEANUP] Deleted global_players record for ${dup.username}`); // FIXED
    }
    
    console.log(`[CLEANUP] Completed! Processed ${duplicates.length} duplicates.`); // FIXED
}

async function getLeaderboardActivePlayers({ playername = '', pagenumber, numberofrow } = {}) {
    const pool = await connectToMySQL();

    const pageNum = Number.isInteger(+pagenumber) && +pagenumber >= 0 ? +pagenumber : 0;
    const numRows = Number.isInteger(+numberofrow) && +numberofrow > 0 ? +numberofrow : null;

    const membersNameFilter = playername ? 'AND m.username LIKE ?' : '';
    const globalNameFilter = playername ? 'AND g.username LIKE ?' : '';

    const membersParams = playername ? [`%${playername}%`] : [];
    const globalParams = playername ? [`%${playername}%`] : [];

    // Query members with kills & deaths + sid - UPDATED: matches_played > 10
    const [membersRows] = await pool.query(
        `
        SELECT 
            m.user_id AS id,
            m.username,
            m.dojo_elo_api,
            m.dojo_glicko_elo,
            m.matches_played,
            m.kills,
            m.deaths,
            rp.org_name,
            rp.sid
        FROM members m
        LEFT JOIN rsi_profiles rp ON rp.username = m.username
        WHERE m.matches_played > 10
        ${membersNameFilter}
        `,
        membersParams
    );

    // Query global players with kills & deaths + sid - UPDATED: matches_played > 10
    const [globalRows] = await pool.query(
        `
        SELECT 
            g.id,
            g.username,
            g.dojo_elo_api,
            g.dojo_glicko_elo,
            g.matches_played,
            g.kills,
            g.deaths,
            rp.org_name,
            rp.sid
        FROM global_players g
        LEFT JOIN rsi_profiles rp ON rp.username = g.username
        WHERE g.matches_played > 10
        ${globalNameFilter}
        `,
        globalParams
    );

    // Helper to safely calculate kd ratio
    function calculateKD(kills, deaths) {
        if (!kills) kills = 0;
        if (!deaths || deaths === 0) return kills; // Avoid div by zero, treat kd as kills if no deaths
        return kills / deaths;
    }

    // Combine players and calculate kd, include sid
    const combined = [
        ...membersRows.map(p => ({
            id: p.id,
            username: p.username,
            dojoElo: p.dojo_elo_api,
            glickoElo: p.dojo_glicko_elo,
            matchesPlayed: p.matches_played,
            kd: calculateKD(p.kills, p.deaths),
            orgName: p.org_name || null,
            sid: p.sid || null,
            table: 'members',
        })),
        ...globalRows.map(p => ({
            id: p.id,
            username: p.username,
            dojoElo: p.dojo_elo_api,
            glickoElo: p.dojo_glicko_elo,
            matchesPlayed: p.matches_played,
            kd: calculateKD(p.kills, p.deaths),
            orgName: p.org_name || null,
            sid: p.sid || null,
            table: 'global_players',
        })),
    ];

    if (combined.length === 0) {
        return [];
    }

    // Sort descending by glickoElo
    combined.sort((a, b) => b.glickoElo - a.glickoElo);

    // Update RSI profiles concurrently with limited concurrency (e.g., max 5 parallel)
    const concurrencyLimit = 5;
    for (let i = 0; i < combined.length; i += concurrencyLimit) {
        const chunk = combined.slice(i, i + concurrencyLimit);
        await Promise.all(chunk.map(async (p) => {
            try {
                await updateRsiProfile(p.username);
            } catch (err) {
                console.error(`Failed updating RSI profile for ${p.username}:`, err.message);
            }
        }));
    }

    // Paginate after sorting
    if (numRows !== null) {
        const start = pageNum * numRows;
        return combined.slice(start, start + numRows);
    }

    return combined;
}

async function expireEloPenalties(db) {
    try {
        const [result] = await db.query(
            `UPDATE elo_penalties
             SET active = 0
             WHERE active = 1
             AND expires_at IS NOT NULL
             AND expires_at <= NOW()`
        );

        if (result.affectedRows > 0) {
            consoleLog(`[expireEloPenalties] Expired ${result.affectedRows} penalty(s)`);
        }

        return result.affectedRows;
    } catch (error) {
        console.error('[expireEloPenalties] Error expiring penalties:', error);
        return 0;
    }
}

async function logMatchResult({
    poolName,
    killerId,
    killerName,
    victimId,
    victimName,
    killerOldGlicko,
    killerNewGlicko,
    victimOldGlicko,
    victimNewGlicko
}) {
    const sql = `
        INSERT INTO elo_logs
        (killer_id, killer_name, victim_id, victim_name,
         killer_old_glicko, killer_new_glicko, victim_old_glicko, victim_new_glicko,
         pool, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const params = [
        killerId,
        killerName,
        victimId,
        victimName,
        killerOldGlicko,
        killerNewGlicko,
        victimOldGlicko,
        victimNewGlicko,
        poolName
    ];

    try {
        await queryDatabase(sql, params);
        console.log(`[logMatchResult] ✅ Logged Glicko2 match: ${killerName} vs ${victimName}`);
    } catch (err) {
        console.error('[logMatchResult] ❌ Insert failed:', err.sqlMessage || err.message);
    }
}

async function getEloHistory(playername) {
    const sql = `
        SELECT 
            id as match_id,
            killer_name as player,
            victim_name as opponent,
            'win' as result,
            killer_old_glicko as old_elo,
            killer_new_glicko as new_elo,
            created_at as timestamp,
            'killer' as role
        FROM elo_logs 
        WHERE killer_name = ?
        
        UNION ALL
        
        SELECT 
            id as match_id,
            victim_name as player,
            killer_name as opponent,
            'loss' as result,
            victim_old_glicko as old_elo,
            victim_new_glicko as new_elo,
            created_at as timestamp,
            'victim' as role
        FROM elo_logs 
        WHERE victim_name = ?
        
        ORDER BY timestamp ASC
    `;

    try {
        const results = await queryDatabase(sql, [playername, playername]);
        return results;
    } catch (error) {
        console.error('[getEloHistory] Database error:', error);
        throw error;
    }
}


//EntombedKnights Start

// Database functions for entombed knights
async function saveEntombedKnight(userId, userTag, oldRank) {
    try {
        const pool = await connectToMySQL();
        const [result] = await pool.query(
            `INSERT INTO entombed_knights (user_id, user_tag, old_rank, entombed_at, entombed_by, entombed_unix) 
             VALUES (?, ?, ?, NOW(), ?, UNIX_TIMESTAMP()) 
             ON DUPLICATE KEY UPDATE 
             user_tag = VALUES(user_tag), 
             old_rank = VALUES(old_rank), 
             entombed_at = NOW(), 
             entombed_by = VALUES(entombed_by),
             entombed_unix = UNIX_TIMESTAMP()`,
            [userId, userTag, oldRank, 'System'] // or use interaction.user.tag if available
        );
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error saving entombed knight:', error);
        return false;
    }
}

async function getEntombedKnight(userId) {
    try {
        const pool = await connectToMySQL();
        const [rows] = await pool.query(
            'SELECT * FROM entombed_knights WHERE user_id = ? AND restored = 0',
            [userId]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting entombed knight:', error);
        return null;
    }
}

async function getEntombedKnight(userId) {
  try {
    const db = await connectToMySQL();
    const [rows] = await db.execute(
      `SELECT *, 
       UNIX_TIMESTAMP(entombed_at) as entombed_unix,
       entombed_at as entombed_raw
       FROM entombed_knights 
       WHERE user_id = ? AND restored_at IS NULL`,
      [userId]
    );
    
    if (rows[0]) {
      console.log('Database raw entombed_at:', rows[0].entombed_raw);
      console.log('Database UNIX timestamp:', rows[0].entombed_unix);
      console.log('Current UNIX time:', Math.floor(Date.now() / 1000));
    }
    
    return rows[0] || null;
  } catch (error) {
    console.error('Error getting entombed knight:', error);
    return null;
  }
}

async function restoreEntombedKnight(userId, restoredBy) {
  try {
    const db = await connectToMySQL();
    await db.execute(
      'UPDATE entombed_knights SET restored_at = CURRENT_TIMESTAMP, restored_by = ? WHERE user_id = ? AND restored_at IS NULL',
      [restoredBy, userId]
    );
    return true;
  } catch (error) {
    console.error('Error restoring entombed knight:', error);
    return false;
  }
}

async function getAllActiveEntombed() {
  try {
    const db = await connectToMySQL();
    const [rows] = await db.execute(
      'SELECT * FROM entombed_knights WHERE restored_at IS NULL ORDER BY entombed_at DESC'
    );
    return rows;
  } catch (error) {
    console.error('Error getting active entombed knights:', error);
    return [];
  }
}

async function storeEntombmentVote(pollId, userId, vote) {
    const db = await connectToMySQL();
    try {
        await db.query(
            `INSERT INTO entombment_votes (poll_id, user_id, vote_type, voted_at) 
            VALUES (?, ?, ?, NOW()) 
            ON DUPLICATE KEY UPDATE vote_type = VALUES(vote_type), voted_at = NOW()`,
            [pollId, userId, vote]
        );
        console.log(`Entombment vote stored: User ${userId} voted ${vote}`);
    } catch (error) {
        console.error('Error storing entombment vote:', error);
        throw error;
    }
}

async function storeEntombmentReason(pollId, userId, voteType, reason) {
    const db = await connectToMySQL();
    try {
        await db.query(
            `UPDATE entombment_votes SET reason = ? WHERE poll_id = ? AND user_id = ?`,
            [reason, pollId, userId]
        );
        console.log(`Entombment reason stored for user ${userId}`);
    } catch (error) {
        console.error('Error storing entombment reason:', error);
        throw error;
    }
}

function scheduleEntombmentEvaluation(guild, pollId, duration) {
    setTimeout(async () => {
        await evaluateEntombmentProceeding(guild, pollId);
    }, duration);
}

//EntombedKnights End 

//Scorecard Start
async function getScorecard(discordId) {
    const connection = await connectToMySQL();
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM scorecards WHERE discord_id = ?',
            [discordId]
        );
        return rows.length > 0 ? rows[0] : null;
    } finally {
        await connection.end();
    }
}

async function createOrUpdateScorecard(scorecardData) {
    const connection = await connectToMySQL();
    try {
        const {
            discord_id,
            player_name,
            rank,
            aim_snap,
            aim_tracking,
            aim_accuracy,
            teamplay,
            comms,
            strategy,
            resource_management,
            game_knowledge
        } = scorecardData;

        await connection.execute(
            `INSERT INTO scorecards (
                discord_id, player_name, rank, aim_snap, aim_tracking, aim_accuracy,
                teamplay, comms, strategy, resource_management, game_knowledge
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                player_name = VALUES(player_name),
                rank = VALUES(rank),
                aim_snap = VALUES(aim_snap),
                aim_tracking = VALUES(aim_tracking),
                aim_accuracy = VALUES(aim_accuracy),
                teamplay = VALUES(teamplay),
                comms = VALUES(comms),
                strategy = VALUES(strategy),
                resource_management = VALUES(resource_management),
                game_knowledge = VALUES(game_knowledge),
                updated_at = CURRENT_TIMESTAMP`,
            [
                discord_id, player_name, rank, aim_snap, aim_tracking, aim_accuracy,
                teamplay, comms, strategy, resource_management, game_knowledge
            ]
        );
        
        return true;
    } finally {
        await connection.end();
    }
}

async function getAllScorecards() {
    const connection = await connectToMySQL();
    try {
        const [rows] = await connection.execute(
            'SELECT discord_id, player_name, rank FROM scorecards ORDER BY player_name'
        );
        return rows;
    } finally {
        await connection.end();
    }
}
//Scorecard End


// Database functions for attendance persistence

function saveAttendanceSession(channelId, messageId, createdBy) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [result] = await pool.execute(
                `INSERT INTO attendance_sessions (channel_id, message_id, start_time, created_by) 
                 VALUES (?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE 
                 message_id = VALUES(message_id), 
                 start_time = VALUES(start_time), 
                 created_by = VALUES(created_by),
                 active = 1`,
                [channelId, messageId, Date.now(), createdBy]
            );
            resolve(result.insertId);
        } catch (err) {
            reject(err);
        }
    });
}

function getAttendanceSession(channelId) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [rows] = await pool.execute(
                `SELECT * FROM attendance_sessions WHERE channel_id = ? AND active = 1`,
                [channelId]
            );
            resolve(rows[0] || null);
        } catch (err) {
            reject(err);
        }
    });
}

function saveAttendanceRecord(channelId, userId, displayName) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [result] = await pool.execute(
                `INSERT INTO attendance_records (channel_id, user_id, check_in_time, display_name) 
                 VALUES (?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE 
                 check_in_time = VALUES(check_in_time),
                 display_name = VALUES(display_name)`,
                [channelId, userId, Date.now(), displayName]
            );
            resolve(result.insertId);
        } catch (err) {
            reject(err);
        }
    });
}

function getAttendanceRecords(channelId) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [rows] = await pool.execute(
                `SELECT user_id, display_name FROM attendance_records WHERE channel_id = ?`,
                [channelId]
            );
            resolve(rows);
        } catch (err) {
            reject(err);
        }
    });
}

function removeAttendanceRecord(channelId, userId) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [result] = await pool.execute(
                `DELETE FROM attendance_records WHERE channel_id = ? AND user_id = ?`,
                [channelId, userId]
            );
            resolve(result.affectedRows);
        } catch (err) {
            reject(err);
        }
    });
}

function endAttendanceSession(channelId) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [result] = await pool.execute(
                `UPDATE attendance_sessions SET active = 0 WHERE channel_id = ?`,
                [channelId]
            );
            resolve(result.affectedRows);
        } catch (err) {
            reject(err);
        }
    });
}

async function updateLastPromotion(userId, rankCode) {
    try {
        const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        const query = `
            INSERT INTO rank_promotions (user_id, rank_code, last_promotion_date)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                rank_code = VALUES(rank_code),
                last_promotion_date = VALUES(last_promotion_date)
        `;
        
        await queryDatabase(query, [userId, rankCode, currentDate]);
        console.log(`Updated last promotion for user ${userId} to rank ${rankCode} on ${currentDate}`);
        return true;
    } catch (error) {
        console.error('Error updating last promotion:', error);
        return false;
    }
}
async function getLastPromotion(userId) {
    try {
        const query = 'SELECT * FROM rank_promotions WHERE user_id = ?';
        const results = await queryDatabase(query, [userId]);
        return results.length > 0 ? results[0] : null;
    } catch (error) {
        console.error('Error getting last promotion:', error);
        return null;
    }
}

module.exports = {
    connectToMySQL,
    upsertBlightVeilMember,
    addNomination,
    getNominationsForUser,
    resetNominationsForUser,
    updateTotalNominations,
    updateRoles,
    storeTempVC,
    removeTempVC,
    getActiveTempVCCount,
    checkIfTempVC,
    getOrphanedTempVCs,
    recordKill,
    getLeaderboardData,
    getWeeklyLeaderboardData,
    storeSquireTrial,
    storeSquireVote,
    getSquireTrial,
    updateSquireTrialStatus,
    incrementFailureCount,
    generateAndStoreApiKey,
    validateApiKey,
    addEvaluation,
    removeEvaluation,
    getDueEvaluations,
    listEvaluations,
    getUserElo,
    setUserElo,
    updateElo,
    getFPSLeaderboard,
    saveFightResult,
    getAllPlayersEloWithStats,
    markEvaluationAsPosted,
    getLeaderboardActivePlayers,
    expireEloPenalties,
    logMatchResult,
    saveEntombedKnight,
    getEntombedKnight,
    restoreEntombedKnight,
    getAllActiveEntombed,
    storeEntombmentReason,
    scheduleEntombmentEvaluation,
    storeEntombmentVote,
    getScorecard,
    createOrUpdateScorecard,
    getAllScorecards,
    getEloHistory,
    cleanupDuplicatePlayers,
    validateConnection,
    saveAttendanceSession,
    getAttendanceSession,
    saveAttendanceRecord,
    getAttendanceRecords,
    removeAttendanceRecord,
    endAttendanceSession,
    updateLastPromotion,
    getLastPromotion,
    getMembersByGuild,
    getPromotionHistory: async function(userId) {
        try {
            const query = 'SELECT * FROM promotion_history WHERE user_id = ? ORDER BY promotion_date DESC';
            const results = await queryDatabase(query, [userId]);
            return results;
        } catch (error) {
            console.error('Error getting promotion history:', error);
            return [];
        }
    },
    
    getPromotionStats: async function() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_users,
                    AVG(DATEDIFF(CURDATE(), last_promotion_date)) as avg_days_since_promotion,
                    MIN(DATEDIFF(CURDATE(), last_promotion_date)) as min_days_since_promotion,
                    MAX(DATEDIFF(CURDATE(), last_promotion_date)) as max_days_since_promotion
                FROM rank_promotions
            `;
            const results = await queryDatabase(query, []);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error('Error getting promotion stats:', error);
            return null;
        }
    }
};