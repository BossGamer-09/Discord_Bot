const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'sendRequestLootGoblin',
    description: 'Sends an embed with a button to request Loot Goblin assistance',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Request Loot Goblin Assistance')
            .setDescription('Use this panel to request assistance from the BlightVeil Loot Goblins.\n\nThe Loot Goblins are a quick reaction force of BlightVeil members that will respond quickly to assist other BlightVeil members with the collection, loading, transportation, selling, and any other aspects of loot logistics that may be necessary.\n\nWhen you click the button below a channel will be generated and the Loot Goblin members will be pinged. Use the generated channel to establish coordination and relay information such as what Voice Channel to use or your in-game location, etc.\n\nBy requesting the assistance of the Loot Goblins you are agreeing that any who respond to the request are entitled to an equitable share of the loot and/or resulting profits');

        const button = new ButtonBuilder()
            .setCustomId('request_lootgoblins')
            .setLabel('💰Request Loot Goblins')
            .setStyle('SECONDARY');

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};  