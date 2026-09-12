const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'sendRequestDeathwatchEmbed',
    description: 'Sends an embed with a button to request Deathwatch assistance',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Request Deathwatch Assistance')
            .setDescription('Use this panel to request PvP assistance from the BlightVeil Deathwatch forces.\n\nThe Deathwatch is the quick reaction force of BlightVeil members consisting of Knights and The Legion that will respond quickly to assist other BlightVeil members in PvP engagements.\n\nThe Deathwatch is NOT a general SOS group and should be requested ONLY for PvP conflicts that the requesting member needs assistance with.\n\nWhen you click the button below, you will be prompted to choose what type of assistance you need. A channel and voice room will be generated with a ping to Deathwatch forces.');

        const button = new ButtonBuilder()
            .setCustomId('request_deathwatch')
            .setLabel('💀 Request Deathwatch')
            .setStyle(ButtonStyle.Secondary); // ✅ Use enum instead of string

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
