const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'sendJoinLootGoblins',
    description: 'Sends an embed with a button to become a BlightVeil Loot Goblin',
    async execute(message, args) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Become a BlightVeil Loot Goblin')
                .setDescription('Do you have a compulsive need to gather loot? force?\n\nBecome a BlightVeil Loot Goblin and be called upon by your fellow BlightVeil members when they have a trove of loot they need help aquiring. Collect, load, transport, sell and any other aspect of loot logistics that may be required for a cut of the bounty they secured, all while you satiate your hunger for loot!');

            const button = new ButtonBuilder()
                .setCustomId('join_lootgoblins')
                .setLabel('💰 Become A Loot Goblin')
                .setStyle('SECONDARY');

            const row = new ActionRowBuilder().addComponents(button);

            await message.channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error sending embed:', error);
            await message.channel.send('There was an error sending the embed. Please try again later.');
        }
    },
};