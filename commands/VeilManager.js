const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

module.exports = {
    name: 'VeilManager',
    description: 'Send an embed to manage Veil Members',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('Veil Manager')
            .setDescription('Use the button below to add or remove Veil roles.')
            .setColor('Blue');

        const veilButton = new ButtonBuilder()
            .setCustomId('VeilMember')
            .setLabel('Add/Remove Veil Members')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(veilButton);

        await message.channel.send({
            embeds: [embed],
            components: [row],
        });
    },
};
