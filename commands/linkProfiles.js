const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'linkProfiles',
    description: 'Add Streamers RSI Handles and Twitch Or Youtube URL"s.',
    async execute(message, args) {

        const embed = new EmbedBuilder()
            .setTitle('Provide Streamers RSI Handles and Twitch& Youtube URL"s ')
            .setDescription('Click the button below to Provide the RSI_Handles and URL"s .\n\nMake sure your URLs are correct to be included in our tracking system.');

        const button = new ButtonBuilder()
            .setCustomId('link_profiles_button')
            .setLabel('🔗 Add Info')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
