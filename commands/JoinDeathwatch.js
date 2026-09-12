const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'joinDeathwatch',
    description: 'Join the Deathwatch group.',
    async execute(message, args, client) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Join the BlightVeil Deathwatch')
                .setDescription('Would you like to join the BV Deathwatch QRF force?\n\nDeathwatch is a group of skilled members who are generally available to respond on short notice to the call of fellow BlightVeil members who request help with PvP engagements.');

            const button = new ButtonBuilder()
                .setCustomId('join_deathwatch')
                .setLabel('💀 Join Deathwatch')
                .setStyle('SECONDARY');

            const row = new ActionRowBuilder().addComponents(button);

            await message.channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error sending embed:', error);
            await message.channel.send('There was an error sending the embed. Please try again later.');
        }
    },
};