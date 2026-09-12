const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'seekSponsorshipEmbed',
    description: 'Allow members to seek Knight sponsorship.',
    async execute(message, args, client) {
        try {
            // Create the embed for Legion members seeking sponsorship
            const embed = new EmbedBuilder()
                .setTitle('Seek Knight Sponsorship')
                .setDescription(
                    'Ready to become a BlightVeil Knight? Click "Seek Sponsorship" to notify the Overseers that you are seeking to become a Knight Squire.\n\n' +
                    '**Requirements:**\n' +
                    '• **Pilot Candidates:** Must have **Cracked Pilot** role\n' +
                    '• **Infantry Candidates:** Must have **CQB** & **Advanced Infantry** roles\n\n' +
                    '**What happens next?**\n' +
                    '• Overseers will review your request\n' +
                    '• If approved, a Knight may choose to sponsor you\n' +
                    '• You will begin your 15-day Squire Trial\n\n' +
                    'You can only request sponsorship once per day.'
                )
                .setColor(0x00FF00)
                .setFooter({ text: 'BlightVeil Knights - Sponsorship Seeking' })
                .setTimestamp();

            // Create the seek sponsorship button for Legion members
            const seekSponsorshipButton = new ButtonBuilder()
                .setCustomId('seek_sponsorship')
                .setLabel('Seek Sponsorship')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎯');

            // Add button to action row
            const row = new ActionRowBuilder().addComponents(seekSponsorshipButton);

            // Send the embed and button to the channel
            await message.channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error sending sponsorship embed:', error);
            await message.channel.send('There was an error sending the sponsorship embed. Please try again later.');
        }
    },
};