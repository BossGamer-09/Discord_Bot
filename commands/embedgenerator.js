const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'embedgenerator',
    description: 'Creates an embed generator UI to make and post complex embeds',
    async execute(message) {
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('🔧 Complex Embed Generator')
            .setDescription(
                'Select **Make an Embed** below to create a complex embed message with multiple fields and customization options.\n\n**⚠️ Editing Permissions:**\n• Original author can always edit\n• Required roles: X, Y, Z (any one)'
            )
            .setColor(0x3498db) // Blue color
            .addFields(
                { name: '✨ Features', value: '• Multiple embed fields\n• Custom colors\n• Images & thumbnails\n• Author & footer\n• Timestamps\n• Edit after posting!' },
                { name: '📋 How It Works', value: '1. Click the button\n2. Enter basic info\n3. Add optional features\n4. Preview and send!\n5. Edit anytime with the edit button' }
            )
            .setFooter({ text: 'Create professional-looking embeds easily' });

        // Create the button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('make_embed')
                .setLabel('Make an Embed')
                .setStyle(1) // PRIMARY style
                .setEmoji('🔧')
        );

        // Send the embed with the button
        await message.channel.send({ embeds: [embed], components: [row] });
    },
};