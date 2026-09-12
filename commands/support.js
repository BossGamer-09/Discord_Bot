const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'support',
    description: 'Send an embed with information on how to support BlightVeil',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Support BlightVeil')
            .setDescription(
                'If you would like to become a contributor to BlightVeil please select the link below for the platform you would like to use to donate.\n\n' +
                'Contributors receive various benefits and funds are will be used to help promote BlightVeil by allowing the organization to fund professional graphics designers, video editors, host tournaments/events with prizes and more as we grow and develop BV.'
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Patreon')
                    .setStyle('LINK')
                    .setURL('https://www.patreon.com/BlightVeil/posts'),
                new ButtonBuilder()
                    .setLabel('Ko-Fi')
                    .setStyle('LINK')
                    .setURL('https://ko-fi.com/blightveil')
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
