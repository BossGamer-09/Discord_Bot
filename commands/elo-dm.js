const fs = require('fs');
const SUBS_FILE = './elo_dm_subs.json';
const MSGS_FILE = './elo_dm_msgs.json';

function getEloSubscribers() {
    try {
        return new Set(JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')));
    } catch {
        return new Set();
    }
}

function saveEloSubscribers(subs) {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(Array.from(subs), null, 2));
}

function getMsgMap() {
    try {
        return JSON.parse(fs.readFileSync(MSGS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveMsgMap(map) {
    fs.writeFileSync(MSGS_FILE, JSON.stringify(map, null, 2));
}

const eloDmMsgMap = new Map();

// ---- DM Logic ----
async function sendOrUpdateEloDm(client, userId, embed) {
    const user = await client.users.fetch(userId).catch(err => {
        console.error(`Failed to fetch user ${userId}:`, err);
        return null;
    });
    if (!user) return;

    let msgMap = getMsgMap();
    let lastMsgId = msgMap[userId];

    try {
        const dmChannel = await user.createDM();
        let msg = null;

        if (lastMsgId) {
            msg = await dmChannel.messages.fetch(lastMsgId).catch(() => null);
        }
        if (msg) {
            await msg.edit({ embeds: [embed] });
            console.log(`Edited existing ELO DM message for user ${user.tag} (${userId})`);
        } else {
            msg = await dmChannel.send({ embeds: [embed] });
            console.log(`Sent new ELO DM message to user ${user.tag} (${userId})`);
        }
        msgMap[userId] = msg.id;
        saveMsgMap(msgMap);
    } catch (e) {
        console.error(`Failed to send/edit ELO DM to user ${user ? user.tag : userId}:`, e);
    }
}

async function deleteUserEloDMs(userId, client) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    let msgMap = getMsgMap();
    const msgId = msgMap[userId];
    if (!msgId) return;

    try {
        const dmChannel = await user.createDM();
        const msg = await dmChannel.messages.fetch(msgId).catch(() => null);
        if (msg) {
            await msg.delete();
            console.log(`Deleted ELO DM message for user ${user.tag} (${userId})`);
        }
    } catch (e) {
        console.error(`Failed to delete ELO DM message for user ${user.tag} (${userId}):`, e);
    }

    delete msgMap[userId];
    saveMsgMap(msgMap);
    eloDmMsgMap.delete(userId);
}

// ---- Command Handler ----
module.exports = {
    name: 'elo-dm',
    description: 'Add/remove user from ELO DM notifications.',
    usage: '!elo-dm add @user OR !elo-dm remove @user',

    async execute(message, args, client) {
        if (!args[0] || !['add', 'remove'].includes(args[0].toLowerCase())) {
            return message.reply("Usage: `!elo-dm add @user` or `!elo-dm remove @user`");
        }
        const action = args[0].toLowerCase();
        const user = message.mentions.users.first();
        if (!user) return message.reply("Please mention a user.");

        const subs = getEloSubscribers();

        if (action === 'add') {
            if (subs.has(user.id)) return message.reply(`${user} is already subscribed.`).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
            subs.add(user.id);
            saveEloSubscribers(subs);
            return message.reply(`You have been subscribed to ELO DM updates.`).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
        }

        if (action === 'remove') {
            if (!subs.has(user.id)) return message.reply(`${user} is not subscribed.`).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
            await deleteUserEloDMs(user.id, client);
            subs.delete(user.id);
            saveEloSubscribers(subs);
            return message.reply(`You have been unsubscribed from ELO DM updates and your update messages were deleted.`).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
        }
    },

    // Expose helper functions for use elsewhere
    getEloSubscribers,
    saveEloSubscribers,
    sendOrUpdateEloDm,
    deleteUserEloDMs,
    eloDmMsgMap,
};
