const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { connectToMySQL } = require('../db');

const MAX_EMBED_DESCRIPTION_LENGTH = 4096;

// ✅ Sanitize usernames (avoid markdown abuse or excessive length)
function cleanUsername(name) {
    if (!name) return '[Unknown]';
    const safe = name.replace(/[*_`~|\\]/g, ''); // Strip common markdown/escape chars
    return safe.length > 100 ? safe.slice(0, 97) + '...' : safe;
}

async function fetchOnlineUsers() {
    let connection;
    try {
        const pool = await connectToMySQL();
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT player_name FROM heartbeats WHERE last_seen > NOW() - INTERVAL 1 MINUTE'
        );
        return rows.map(row => cleanUsername(row.player_name));
    } catch (error) {
        console.error('Error fetching online users:', error);
        return [];
    } finally {
        if (connection) connection.release(); // ✅ Always release
    }
}

function splitUsersIntoChunks(users) {
    const chunks = [];
    let currentChunk = [];

    for (const user of users) {
        const currentLength = currentChunk.join('\n').length + user.length + 1;
        if (currentLength >= MAX_EMBED_DESCRIPTION_LENGTH - 1000) {
            chunks.push(currentChunk);
            currentChunk = [user];
        } else {
            currentChunk.push(user);
        }
    }

    if (currentChunk.length) chunks.push(currentChunk);
    return chunks;
}

function createEmbed(userListText, includeTrackerInfo = false, userCount = 0) {
    const statusEmoji = userCount > 0 ? '🟢' : '🔴';
    const baseText = `**${statusEmoji} Active Users (${userCount}):**\n${userListText || 'No users are online.'}`;

    const trackerInfo = includeTrackerInfo
        ? `\n\n---\n\n` +
        '**🔑 Generate BlightVeil Kill Tracker Key**\n' +
        'Click the button below to generate a unique key for the BlightVeil Kill Tracker. Use this key in your kill tracker client to post your kills in the <#1324936826225426503> and/or <#1324936929929859122>.\n\n' +
        'A key will need to be entered each time the kill tracker exe is launched.\nEach key will be valid for **1 week** after it is generated.\nYou can generate a new key when your old one expires.\n\n' +
        '[💀 **BLIGHTVEIL KILL TRACKER DOWNLOAD LINK** 💀](https://github.com/BlightVeil/Killtracker/releases/latest)\n' +
        '[Check Your Kills](https://checkkills.blightveil.org/)'
        : '';

    return new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Online Kill Tracker Users')
        .setDescription(baseText + trackerInfo)
        .setTimestamp()
        .setFooter({ text: 'BlightveilKillTracker V1.5', iconURL: 'https://i.imgur.com/mP2vn3Q.png' });
}

async function updateOnlineUsersEmbed(channel) {
    try {
        const onlineUsers = await fetchOnlineUsers();
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessages = messages
            .filter(msg => msg.author.id === channel.client.user.id)
            .first(2);

        let embedsToSend = [];
        let includeTrackerInfo = true;

        const chunks = splitUsersIntoChunks(onlineUsers.length > 0 ? onlineUsers : ['No users are online.']);
        embedsToSend = chunks.map(chunk => {
            const embed = createEmbed(chunk.join('\n'), includeTrackerInfo, onlineUsers.length);
            includeTrackerInfo = false;
            return embed;
        });

        // 🔘 Generate Key Button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('generate_api_key')
                .setLabel('🔑 Generate Key')
                .setStyle(ButtonStyle.Primary)
        );

        for (let i = 0; i < embedsToSend.length; i++) {
            const options = { embeds: [embedsToSend[i]] };
            if (i === 0) {
                options.components = [row];
            }

            if (botMessages[i]) {
                await botMessages[i].edit(options);
            } else {
                await channel.send({
                    ...options,
                    ephemeral: true, // Make the embed message visible only to the user
                });
            }
        }

        if (botMessages[1] && embedsToSend.length === 1) {
            await botMessages[1].delete();
        }

        console.log(`[TrackerEmbed] Updated with ${onlineUsers.length} active users.`);
    } catch (error) {
        console.error('Error updating online users embed:', error);
    }
}


module.exports = {
    fetchOnlineUsers,
    updateOnlineUsersEmbed
};
