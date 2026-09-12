const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'nicknamechange',
    description: 'Send nickname change request message',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Nickname Request')
            .setDescription('To request a change to your discord display name please interact with the button below and enter your Star Citizen in-game name.');

        const button = new ButtonBuilder()
            .setCustomId('nickname_change_request')
            .setLabel('Nickname Change Request')
            .setStyle('PRIMARY');

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({ embeds: [embed], components: [row] });
    }
};
