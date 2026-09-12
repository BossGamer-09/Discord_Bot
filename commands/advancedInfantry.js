const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    name: 'AdvancedInfantryCertification', // Command name for !AdvancedInfantryCertification
    description: 'Send an embed with a button for users to submit an Advanced Infantry certification video.',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Submit Your Advanced Infantry Certification Video')
            .setDescription('Click the button below to submit your Advanced Infantry certification footage. You will need to provide one or more YouTube links.');

        const button = new ButtonBuilder()
            .setCustomId('submit_advanced_infantry_cert')
            .setLabel('Submit Advanced Infantry Certification')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({
            embeds: [embed],
            components: [row],
        });
    },
};
