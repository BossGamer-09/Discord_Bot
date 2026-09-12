const { connectToMySQL } = require('../db');
const { createCanvas } = require('canvas');
const { EmbedBuilder, AttachmentBuilder  } = require('discord.js');

async function startCommanderSession(player, apiKey, alloc_users = [], zone, status, client_ver) {
    // Always flatten alloc_users before saving
    let allocs;
    if (Array.isArray(alloc_users)) {
        allocs = alloc_users;
    } else if (typeof alloc_users === 'string') {
        try { allocs = JSON.parse(alloc_users); }
        catch { allocs = []; }
    } else {
        allocs = [];
    }

    // Clean deeply: remove all allocated_forces at any depth
    allocs = stripAllocatedForces(allocs);

    const pool = await connectToMySQL();
    const [sessions] = await pool.query(
        "SELECT * FROM commander_sessions WHERE commander_player=? AND api_key=? AND ended_at IS NULL",
        [player, apiKey]
    );
    const allocJson = JSON.stringify(allocs);

    if (sessions.length) {
        await pool.query(
            "UPDATE commander_sessions SET alloc_users=?, zone=?, status=?, client_ver=?, last_heartbeat=NOW() WHERE id=?",
            [allocJson, zone, status, client_ver, sessions[0].id]
        );
        return sessions[0].id;
    } else {
        const [result] = await pool.query(
            "INSERT INTO commander_sessions (commander_player, api_key, alloc_users, zone, status, client_ver, started_at, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [player, apiKey, allocJson, zone, status, client_ver]
        );
        return result.insertId;
    }
}

async function endCommanderSession(player, apiKey, client) {
    const pool = await connectToMySQL();
    const [sessions] = await pool.query(
        "SELECT * FROM commander_sessions WHERE commander_player=? AND api_key=? AND ended_at IS NULL",
        [player, apiKey]
    );
    if (!sessions.length) return;
    const session = sessions[0];

    // Mark session as ended
    await pool.query(
        "UPDATE commander_sessions SET ended_at=NOW() WHERE id=?",
        [session.id]
    );

    // Fetch kills for the session
    const [kills] = await pool.query(
        "SELECT * FROM commander_session_kills WHERE session_id=?",
        [session.id]
    );

    // Post summary to Discord
    await postCommanderSummary(session, kills, client);

    // CLEAN UP: Delete kills from session kill table (optional but preferred)
    await pool.query(
        "DELETE FROM commander_session_kills WHERE session_id=?",
        [session.id]
    );
}

async function recordKillInSession(apiKey, player, victim, weapon, zone, time) {
    console.log(`[recordKillInSession] Starting with apiKey: ${apiKey}, player: ${player}, victim: ${victim}, weapon: ${weapon}, zone: ${zone}, time: ${time}`)
    const pool = await connectToMySQL();
    const [sessions] = await pool.query(
        "SELECT * FROM commander_sessions WHERE api_key=? AND ended_at IS NULL",
        [apiKey]
    );
    for (const session of sessions) {
        const allocs = JSON.parse(session.alloc_users || "[]");
        if (allocs.some(u => u.player === player)) { // <--- CORRECT CHECK!
            await pool.query(
                "INSERT INTO commander_session_kills (session_id, killer, victim, weapon, zone, time) VALUES (?, ?, ?, ?, ?, ?)",
                [session.id, player, victim, weapon, zone, time]
            );
        }
    }
}

function stripAllocatedForces(obj) {
    if (Array.isArray(obj)) {
        return obj.map(stripAllocatedForces);
    } else if (obj && typeof obj === 'object') {
        const result = {};
        for (const key in obj) {
            if (key !== 'allocated_forces') {
                result[key] = stripAllocatedForces(obj[key]);
            }
        }
        return result;
    } else {
        return obj;
    }
}

function generateBarChart(grouped) {
    const victims = Object.keys(grouped);
    const counts = victims.map(v => Object.values(grouped[v]).reduce((a, b) => a + b, 0));
    const barHeight = 36;
    const width = 420;
    const height = victims.length * barHeight + 40;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#23272A';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.font = 'bold 20px Sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Kills per Victim', 20, 28);

    // Bars
    const max = Math.max(...counts, 1);
    victims.forEach((victim, i) => {
        const y = 40 + i * barHeight;
        const barLen = Math.round((counts[i] / max) * 250);
        // Bar
        ctx.fillStyle = '#4780ff';
        ctx.fillRect(170, y, barLen, barHeight - 10);

        // Name
        ctx.font = '16px Sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(victim, 20, y + barHeight / 2 + 4);

        // Count
        ctx.font = 'bold 16px Sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${counts[i]}`, 170 + barLen + 12, y + barHeight / 2 + 4);
    });

    return canvas.toBuffer();
}

function generatePieChart(grouped) {
    const { createCanvas } = require('canvas');
    // Build weapon totals
    const weaponCounts = {};
    for (const weaponSet of Object.values(grouped)) {
        for (const [weapon, count] of Object.entries(weaponSet)) {
            weaponCounts[weapon] = (weaponCounts[weapon] || 0) + count;
        }
    }
    const weapons = Object.keys(weaponCounts);
    const counts = weapons.map(w => weaponCounts[w]);
    const total = counts.reduce((a, b) => a + b, 0);
    const canvas = createCanvas(420, 320);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#23272A';
    ctx.fillRect(0, 0, 420, 320);

    // Pie chart
    let start = 0;
    const colors = ['#4780ff', '#39c5bb', '#ffab00', '#e64a19', '#d500f9', '#4caf50', '#ff4081', '#f44336', '#00bcd4'];
    weapons.forEach((weapon, i) => {
        ctx.beginPath();
        ctx.moveTo(210, 160);
        const angle = (counts[i] / total) * 2 * Math.PI;
        ctx.arc(210, 160, 100, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        // Legend
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Sans-serif';
        ctx.fillText(`${weapon}: ${counts[i]}`, 10, 28 + i * 26);
        start += angle;
    });
    ctx.font = 'bold 20px Sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Kills by Weapon', 140, 28 + weapons.length * 26 + 10);
    return canvas.toBuffer();
}

function generateWeaponHorizontalBarChart(grouped) {
    const { createCanvas } = require('canvas');
    // Build weapon totals
    const weaponCounts = {};
    for (const weaponSet of Object.values(grouped)) {
        for (const [weapon, count] of Object.entries(weaponSet)) {
            weaponCounts[weapon] = (weaponCounts[weapon] || 0) + count;
        }
    }
    const weapons = Object.keys(weaponCounts);
    const counts = weapons.map(w => weaponCounts[w]);
    const barHeight = 32;
    const width = 420;
    const height = weapons.length * barHeight + 40;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#23272A';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.font = 'bold 20px Sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Kills by Weapon', 20, 28);

    // Bars
    const max = Math.max(...counts, 1);
    weapons.forEach((weapon, i) => {
        const y = 40 + i * barHeight;
        const barLen = Math.round((counts[i] / max) * 250);
        // Bar
        ctx.fillStyle = '#39c5bb';
        ctx.fillRect(170, y, barLen, barHeight - 8);

        // Name
        ctx.font = '16px Sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(weapon, 20, y + barHeight / 2 + 4);

        // Count
        ctx.font = 'bold 16px Sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${counts[i]}`, 170 + barLen + 12, y + barHeight / 2 + 4);
    });

    return canvas.toBuffer();
}

function splitTextIntoChunks(text, chunkSize = 1024) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + chunkSize;
        // Try not to break in the middle of a line
        if (end < text.length) {
            let lastBreak = text.lastIndexOf('\n', end);
            if (lastBreak > start) end = lastBreak + 1;
        }
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

async function postCommanderSummary(session, kills, client) {
    if (!client) return;

    // Group by victim and weapon
    const grouped = {};
    let totalKills = 0;
    for (const k of kills) {
        if (!grouped[k.victim]) grouped[k.victim] = {};
        let weapon = k.weapon.replace(/_?\d+\w*$/, '')
            .replace(/_/g, ' ')
            .replace(/\b([a-z])/g, s => s.toUpperCase());
        grouped[k.victim][weapon] = (grouped[k.victim][weapon] || 0) + 1;
        totalKills++;
    }

    // Compose victim breakdown as bullet points
    let breakdown = '';
    for (const [victim, weaponCounts] of Object.entries(grouped)) {
        const victimTotal = Object.values(weaponCounts).reduce((a, b) => a + b, 0);
        breakdown += `> 🔴 **${victim}** killed by 🟢 **${session.commander_player}**  \`${victimTotal}x\`\n`;
        for (const [weapon, count] of Object.entries(weaponCounts)) {
            breakdown += `> &nbsp;&nbsp;&nbsp;• _${weapon}_  × **${count}**\n`;
        }
    }

    // Ensure at least one valid chunk for empty sessions
    let breakdownChunks;
    if (!breakdown.trim()) {
        breakdownChunks = ['No kills recorded this session.'];
    } else {
        breakdownChunks = splitTextIntoChunks(breakdown, 1024);
    }

    // Randomize chart type if kills exist
    let attachment = undefined;
    if (totalKills > 0) {
        const chartTypes = [
            { fn: generateBarChart, name: 'kills.png' },
            { fn: generatePieChart, name: 'kills_pie.png' },
            { fn: generateWeaponHorizontalBarChart, name: 'kills_weapon.png' }
        ];
        const picked = chartTypes[Math.floor(Math.random() * chartTypes.length)];
        const chartBuffer = picked.fn(grouped);
        attachment = new AttachmentBuilder(chartBuffer, { name: picked.name });
    }

    // Build embeds
    const embeds = [];
    for (let i = 0; i < breakdownChunks.length; i++) {
        const embed = new EmbedBuilder()
            .setColor(0x304ffe)
            .setTimestamp();

        if (i === 0) {
            embed
                .setTitle(`🪖 Commander Battle Report: ${session.commander_player}`)
                .setAuthor({ name: `${session.commander_player}`, iconURL: session.commander_avatar || undefined })
                .addFields(
                    { name: 'Commander', value: `**${session.commander_player}**`, inline: true },
                    { name: 'Session Kills', value: `**${totalKills}**`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }
                );
            if (attachment) embed.setImage(`attachment://${attachment.name}`);
        } else {
            embed.setTitle(`🪖 Commander Battle Report (cont.)`);
        }

        embed.addFields({
            name: `Victim Breakdown${i > 0 ? ` (part ${i+1})` : ''}`,
            value: breakdownChunks[i] && breakdownChunks[i].trim().length > 0 ? breakdownChunks[i] : '—'
        });
        embeds.push(embed);
    }

    // Send to summary channel (first embed with image, rest without)
    const SUMMARY_CHANNEL_ID = process.env.SUMMARY_CHANNEL_ID || '1316435730691788901';
    const channel = await client.channels.fetch(SUMMARY_CHANNEL_ID);
    if (channel) {
        if (attachment) {
            await channel.send({ embeds: [embeds[0]], files: [attachment] });
        } else {
            await channel.send({ embeds: [embeds[0]] });
        }
        if (embeds.length > 1) {
            for (let i = 1; i < embeds.length; i++) {
                await channel.send({ embeds: [embeds[i]] }); // no image/attachment on extras
            }
        }
    }
}

module.exports = {
    startCommanderSession,
    endCommanderSession,
    recordKillInSession,
    stripAllocatedForces
};
