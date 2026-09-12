const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'giveawaycontrol',
    description: 'Creates a control embed for managing giveaways',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('Giveaway Control Panel')
            .setDescription('Use the buttons below to manage the giveaway process.')
            .setColor('ORANGE');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('giveaway_control_embed')  // Button to trigger giveaway control modal
                .setLabel('Giveaway Embed')
                .setStyle('SUCCESS'),
            new ButtonBuilder()
                .setCustomId('giveaway_entry_embed_select_winner')  // Button to select winner
                .setLabel('Select Winner')
                .setStyle('PRIMARY'),
            new ButtonBuilder()
                .setCustomId('giveaway_entry_embed_cancel')  // Button to cancel giveaway
                .setLabel('Close Giveaway')
                .setStyle('DANGER')
        );

        // Send the embed with buttons
        await message.channel.send({ embeds: [embed], components: [row] });
    },
};