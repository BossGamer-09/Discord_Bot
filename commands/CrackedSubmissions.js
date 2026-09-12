const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'CrackedSubmissions', // Command name for !CrackedSubmissions
    description: 'Send an embed with a button for users to submit a cracked video.',
    async execute(message, args) {

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Submit Your Cracked Video')
            .setDescription('Click the button below to submit a cracked video. You will need to provide a YouTube link and select a discipline (infantry or pilot).');

        // Create the button that will trigger the modal
        const button = new ButtonBuilder()
            .setCustomId('submit_cracked_video') // Custom ID for the button
            .setLabel('Submit Cracked Video')
            .setStyle(ButtonStyle.Primary);

        // Add the button to the row
        const row = new ActionRowBuilder().addComponents(button);

        // Send the embed with the button to the channel
        await message.channel.send({
            embeds: [embed],
            components: [row],
        });
    },
};
