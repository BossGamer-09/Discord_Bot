const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'sendRequestCrackheadsEmbed',
    description: 'Sends an embed with a button to request Crackhead miner assistance',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Request Crackhead Mining Crew')
            .setDescription(
                'Need help breaking through a tough rock? Use this panel to request assistance from the Crackheads mining team.\n\n' +
                'The Crackheads are a group of hardened miners who specialize in cracking the toughest rocks when others can’t.\n\n' +
                'This is **not** a general help system — use it only when you’ve encountered a rock you can’t crack solo.\n\n' +
                'When you click the button below, a private coordination channel will be created and the Crackheads will be pinged to assist.'
            );

        const button = new ButtonBuilder()
            .setCustomId('request_crackheads')
            .setLabel('⛏️ Request Crackheads')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
