const { postWeeklyFightLadder } = require('../utils/leaderboards');

module.exports = {
    name: 'eloladder',
    description: 'Post or update the ELO leaderboard in the ladder channel.',
    async execute(message, args, client) {
        await postWeeklyFightLadder(client);
        await message.reply('ELO ladder posted/updated.');
    }
};
