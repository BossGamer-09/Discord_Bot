const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');

module.exports = {
    name: "recordfight",
    description: "Record a fight result against another member.",
    async execute(message, args, client) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('🥊 Record Your Fight')
            .setDescription('Who did you fight?\n\nThen choose your result below.')
            .setImage('https://i.imgur.com/1ISBPWP.png') // your fight panel image
            .setFooter({ text: 'PVP PILOT LADDER - BLIGHTVEIL' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_fight_form')
                .setLabel('Record Fight')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
};
