const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'joinCrackheads',
    description: 'Join the Crackheads mining crew.',
    async execute(message, args, client) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Join the Crackheads Mining Crew')
                .setDescription(
                    'Want to help crack the toughest rocks in the system?\n\n' +
                    'The Crackheads are a crew of dedicated miners who respond to calls for help when fellow members hit rocks too tough to solo.\n\n' +
                    'If you like teamwork, explosives, and loud pickaxes — this is your squad.'
                );

            const button = new ButtonBuilder()
                .setCustomId('join_crackheads')
                .setLabel('⛏️ Join Crackheads')
                .setStyle(ButtonStyle.Secondary); // ✅ Use the enum properly

            const row = new ActionRowBuilder().addComponents(button);

            await message.channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error sending embed:', error);
            await message.channel.send('There was an error sending the embed. Please try again later.');
        }
    },
};
