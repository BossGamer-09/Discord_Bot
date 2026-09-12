const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'checkmynoms',
    description: 'Sends an embed about Distinction Levels with a button to check your nominations.',
    async execute(message, args) {
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Receiving nominations increases your Distinction Level')
            .setDescription(
                `The nominations you receive accumulate to increase your Distinction Level. Your Distinction Level acts as an indication of your contributions to BlightVeil and your fellow org members, and is one of the metrics considered for rank increases. More directly, it gives you standing, bragging rights, and notoriety within BlightVeil.\n\n
                3 Nomination = Distinction Level 1
                7 Nomination = Distinction Level 2
                15 Nomination = Distinction Level 3
                25 Nomination = Distinction Level 4
                35 Nomination = Distinction Level 5
                50 Nomination = Distinction Level 6
                65 Nomination = Distinction Level 7
                85 Nomination = Distinction Level 8
                105 Nomination = Distinction Level 9
                150 Nomination = Distinction Level 10`
            )
            .setColor('BLUE');

        // Create the button
        const button = new ButtonBuilder()
            .setCustomId('check_my_nominations') // Custom ID for the button
            .setLabel('Check My Nominations') // Button text
            .setStyle('SECONDARY'); // Grey button

        // Add the button to an Action Row
        const row = new ActionRowBuilder().addComponents(button);

        // Send the embed with the button
        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
