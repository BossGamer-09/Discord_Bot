const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'CompTeamManager', // Command name for !CompTeamManager
    description: 'Send an embed to manage Competitive Team roles.',
    async execute(message, args) {

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Competitive Team Manager')
            .setDescription('Use the buttons below to add or remove Competitive Team roles (Pilot / Infantry).')
            .setColor('Blue');

        // Create the buttons
        const pilotButton = new ButtonBuilder()
            .setCustomId('comp_add_pilot')
            .setLabel('Add Comp Pilot')
            .setStyle(ButtonStyle.Primary);

        const infantryButton = new ButtonBuilder()
            .setCustomId('comp_add_infantry')
            .setLabel('Add Comp Infantry')
            .setStyle(ButtonStyle.Success);

        // Add the buttons to an action row
        const row = new ActionRowBuilder().addComponents(pilotButton, infantryButton);

        // Send the embed with the buttons
        await message.channel.send({
            embeds: [embed],
            components: [row],
        });
    },
};
