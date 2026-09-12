const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'seconddisciplineselection',
    description: 'Sends an embed for secondary discipline selection',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Declare Your Secondary Interests')
            .setDescription(
                "React with the corresponding emoji to declare your Secondary Interests. You can select multiple interests.\n\nYour Secondary Interests are meant to signify other gameplay disciplines that you are also interested in, but don't necessarily intend to focus on improving, or a gameplay discipline you enjoy but maybe your skill level or knowedge base is lacking compared to your Main Discipline.\n\n" +
                "<:Infantry:1189235332932194344> - **Infantry**\n" +
                "<:Pilot:1189226746382401647> - **Pilot**\n" +
                "<:Crewman:1189240044142202921> - **Crewman**\n" +
                "<:Tradesman:1189240348501872681> - **Support**"
            );

        // Send the embed message
        const sentMessage = await message.channel.send({ embeds: [embed] });

        // Add reactions for each discipline
        await sentMessage.react('1189235332932194344');  // Infantry
        await sentMessage.react('1189226746382401647');  // Pilot
        await sentMessage.react('1189240044142202921');  // Crewman
        await sentMessage.react('1189240348501872681');  // Tradesman
    },
};