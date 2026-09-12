const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'CQBCertification', // Command name for !CQBCertification
    description: 'Send an embed with a button for users to submit a CQB certification video.',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Submit Your CQB Certification Video')
            .setDescription('Click the button below to submit your CQB certification footage. You will need to provide one or more YouTube links.');

        const button = new ButtonBuilder()
            .setCustomId('submit_cqb_cert')
            .setLabel('Submit CQB Certification')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({
            embeds: [embed],
            components: [row],
        });
    },
};
