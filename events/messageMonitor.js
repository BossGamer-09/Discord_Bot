const { Events } = require('discord.js');
const { connectToMySQL } = require('../db');
const blockedWords = require('../utils/blockedWords');

const targetChannelId = '1360296169019932835';
const roleId = '1360295855550238941';
const guildId = '1166103102378750033';

// Safe full-word checker
function containsBlockedWord(text) {
    if (!text) return false;

    const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    const words = normalized.split(/\s+/);
    const joined = normalized.replace(/\s+/g, '');

    for (const bw of blockedWords) {
        if (words.includes(bw)) return true;
        if (joined.includes(bw)) return true;

        // Check for spaced-out letters: b a d w o r d
        const spacedPattern = bw.split('').join(' ?');
        const regex = new RegExp(`\\b${spacedPattern}\\b`, 'i');
        if (regex.test(normalized)) return true;
    }

    return false;
}


async function handleMessage(message) {
    if (!message || message.author?.bot) return;

    const content = message.content;
    const wordMatched = containsBlockedWord(content);
    const attachmentMatched = message.attachments?.some(a => containsBlockedWord(a.name));
    const embedMatched = message.embeds?.some(e => containsBlockedWord(e.url));

    if (!(wordMatched || attachmentMatched || embedMatched)) return;

    try {
        const connection = await connectToMySQL();
        const [rows] = await connection.execute(
            'SELECT strikes, role_expiration FROM user_strikes WHERE user_id = ?',
            [message.author.id]
        );

        let strikes = 1;
        let roleDuration = 0;
        let newExpiration = null;

        if (rows.length > 0) {
            strikes = rows[0].strikes + 1;

            if (strikes === 2) roleDuration = 2 * 60 * 60 * 1000;
            else if (strikes === 5) roleDuration = 12 * 60 * 60 * 1000;
            else if (strikes > 5) roleDuration = 24 * 60 * 60 * 1000;

            if (roleDuration > 0) newExpiration = new Date(Date.now() + roleDuration);

            await connection.execute(
                'UPDATE user_strikes SET strikes = ?, role_expiration = ? WHERE user_id = ?',
                [strikes, newExpiration, message.author.id]
            );
        } else {
            await connection.execute(
                'INSERT INTO user_strikes (user_id, strikes) VALUES (?, ?)',
                [message.author.id, 1]
            );
        }

        if (roleDuration > 0) {
            const member = await message.guild.members.fetch(message.author.id);
            if (member) {
                await member.roles.add(roleId);

                setTimeout(async () => {
                    await member.roles.remove(roleId);
                    await connection.execute(
                        'UPDATE user_strikes SET role_expiration = NULL WHERE user_id = ?',
                        [message.author.id]
                    );
                }, roleDuration);
            }
        }

        await message.delete().catch(() => {});
        await message.channel.send({
            content: `Knock that shit off, <@${message.author.id}>.`,
            allowedMentions: { users: [message.author.id] }
        });

    } catch (err) {
        console.error('Error handling offensive message:', err);
    }
}

async function handleExpiredRoles(client) {
    try {
        const connection = await connectToMySQL();
        const [rows] = await connection.execute(
            'SELECT user_id, role_expiration FROM user_strikes WHERE role_expiration IS NOT NULL AND role_expiration > NOW()'
        );

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return console.error('Guild not found');

        for (const row of rows) {
            try {
                const member = await guild.members.fetch(row.user_id);
                if (member) {
                    await member.roles.add(roleId);

                    const remainingTime = new Date(row.role_expiration).getTime() - Date.now();

                    setTimeout(async () => {
                        await member.roles.remove(roleId);
                        await connection.execute(
                            'UPDATE user_strikes SET role_expiration = NULL WHERE user_id = ?',
                            [row.user_id]
                        );
                    }, remainingTime);
                }
            } catch (err) {
                console.warn(`Failed updating member ${row.user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Failed to handle expired roles:', err);
    }
}

module.exports = [
    {
        name: Events.MessageCreate,
        execute: handleMessage
    },
    {
        name: Events.MessageUpdate,
        async execute(oldMessage, newMessage) {
            await handleMessage(newMessage);
        }
    }
];

module.exports.handleExpiredRoles = handleExpiredRoles;