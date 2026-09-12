const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'sponsorSquireEmbed',
    description: 'Sponsor a member to become a Squire.',
    async execute(message, args, client) {
        try {
            // Create the embed for Knights to sponsor squires
            const embed = new EmbedBuilder()
                .setTitle('Sponsor a Squire')
                .setDescription(
                    'Start your sponsorship of a member as a Squire by clicking the "Sponsor a Squire" button below.\n\n' +
                    'As a sponsor you will be staking your own reputation on the line to allow a BV Legion member to become a Squire of the Knights. ' +
                    'Sponsoring too many Squires that fail to be elevated to Knighthood will reflect poorly on your own standing.\n\n' +
                    'But successful sponsorships will reflect positively on your own standing.\n\n' +
                    'You will act as mentor and trainer to your squire and help ensure they rise to status of BlightVeil Knight.\n\n' +
                    'You may only become a sponsor for one Squire at a time.'
                )
                .setColor(0x0099FF)
                .setFooter({ text: 'BlightVeil Knights - Sponsor Program' })
                .setTimestamp();

            // Create the sponsor button for Knights
            const sponsorButton = new ButtonBuilder()
                .setCustomId('sponsor_squire')
                .setLabel('Sponsor a Squire')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛡️');

            // Add button to action row
            const row = new ActionRowBuilder().addComponents(sponsorButton);

            // Send the embed and button to the channel
            await message.channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error sending sponsor embed:', error);
            await message.channel.send('There was an error sending the sponsor embed. Please try again later.');
        }
    },
};