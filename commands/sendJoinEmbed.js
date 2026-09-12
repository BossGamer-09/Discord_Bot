const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'sendJoinEmbed',
    description: 'Sends an embed with a button to join BlightVeil',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Join BlightVeil')
            .setDescription('Create a ticket that will provide you with a private channel to ask questions you may have about joining BlightVeil...\n\nIn this private personal channel you will be provided with a clickable link for our new member onboarding form. It is very fast and easy and is your path to joining BlightVeil as a full member.');

        const button = new ButtonBuilder()
            .setCustomId('joinBlightVeilLegion')
            .setLabel('Join BlightVeil')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
