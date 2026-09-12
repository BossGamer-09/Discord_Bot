const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'entomb',
    description: 'Manage knight entombment with interactive buttons',
    async execute(message, args) {
        // Permission check - restrict to Knights only
        const isKnight = message.member.roles.cache.has('1168214951446454352');
        
        if (!isKnight) {
            return message.channel.send('Only Knights can use the entombment system.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🏰 Knight Entombment System 🏰')
            .setDescription(
                '**Choose your path:**\n\n' +
                '🧊 **Entomb** - Enter stasis for an extended break\n' +
                '⚔️ **Rise** - Request to return from entombment (requires Overseer approval)\n\n' +
                '⚰️ **Entomb Knight** - Initiate entombment proceedings for another knight (requires majority vote)'
            )
            .setColor('#2F3136')
            .setFooter({ text: 'BlightVeil - By Any Means, We Prosper' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('entomb_knight')
                    .setLabel('🧊 Entomb')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('rise_knight')
                    .setLabel('⚔️ Rise')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('entomb_knight_button')
                    .setLabel('Entomb Knight')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚰️')
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
};