const { ChannelType } = require('discord.js');
const cron = require('node-cron');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        const FORUM_CHANNEL_ID = '1174473007671017502';

        // Role IDs to ping
        const ROLE_IDS = [
            '1173822659071578182',
            '1173822697956982794',
            '1173822842442367026',
        ];

        // Schedule a task to run every Monday at 12:01 AM Pacific Time
        cron.schedule('1 0 * * 1', async () => {
            try {
                const forumChannel = await client.channels.fetch(FORUM_CHANNEL_ID);
                if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
                    console.error('Invalid forum channel ID or channel is not a forum type.');
                    return;
                }

                const now = new Date();
                const startOfWeek = new Date(now);
                const endOfWeek = new Date(now);
                endOfWeek.setDate(endOfWeek.getDate() + 7);

                const threadName = `Upcoming Leader Meeting Planning and Discussion for ${startOfWeek.toLocaleDateString('en-US')} Through ${endOfWeek.toLocaleDateString('en-US')}`;

                const roleMentions = ROLE_IDS.map(roleId => `<@&${roleId}>`).join(', ');

                const newThread = await forumChannel.threads.create({
                    name: threadName,
                    autoArchiveDuration: 4320,
                    message: {
                        content: `${roleMentions}\nUpcoming leadership meeting planning and discussion`,
                    },
                    reason: 'Weekly leader meeting thread',
                });

                console.log(`Successfully created thread: ${newThread.name}`);
            } catch (error) {
                console.error('Error creating weekly thread:', error);
            }
        });

        console.log('Scheduled weekly thread creation.');
    },
};