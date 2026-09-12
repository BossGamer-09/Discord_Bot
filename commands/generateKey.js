const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'generateKey',
    description: 'Generate an API key for the BlightVeil Kill Tracker.',
    async execute(message, args) {

        const embed = new EmbedBuilder()
            .setTitle('Generate BlightVeil Kill Tracker Key')
            .setDescription('Click the button below to generate a unique key for the BlightVeil Kill Tracker. Use this key in your kill tracker client to post your kills in the <#1324936826225426503> and/or <#1324936929929859122>.\n\nA key will need to be entered each time the kill tracker exe is launched.\nEach key will be valid for 1 week after it is generated.\nYou Can Generate A New Key when your old one expires.\n\nIf you have not downloaded the BV Kill Tracker yet, select this link.\n[💀 **BLIGHTVEIL KILL TRACKER DOWNLOAD LINK** 💀](https://github.com/BlightVeil/Killtracker/releases/latest)');
        const button = new ButtonBuilder()
            .setCustomId('generate_api_key')
            .setLabel('🔑 Generate Key')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        // Send the embed with button as an ephemeral message
        await message.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true, // Make sure the message is only visible to the user who triggered it
        });
    },
};
