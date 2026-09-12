const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'grantspecialtyembed',
    description: 'Send an embed with a dropdown for granting specialties.',
    async execute(message, args) {
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Grant Specialty')
            .setDescription(
                `Use the options below to select a specialty category\n\n` +
                `You will then be able to select the specific specialty you wish to grant to a member, ` +
                `then enter the username of the member receiving the specialty\n\n` +
                `Specialties should only be granted to members who have successfully met the criteria to receive them`
            );

        // Create the dropdown menu
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('grant_specialty_select')
                    .setPlaceholder('Make a selection')
                    .addOptions([
                        { label: 'Pilot Specialties', value: 'pilot_specialties' },
                        { label: 'Infantry Specialties', value: 'infantry_specialties' },
                        { label: 'Crewman Specialties', value: 'crewman_specialties' },
                        { label: 'Tradesman Specialties', value: 'tradesman_specialties' },
                    ])
            );

        // Send the embed with the dropdown menu
        await message.channel.send({ embeds: [embed], components: [row] });
    },
};