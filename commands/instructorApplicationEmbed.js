const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'instructorapplicationembed',
    description: 'Send instructor application embed with dropdown',
    execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('Instructor Application')
            .setDescription('Please select the type of instructor application you want to submit.');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('instructor_application_select')
                    .setPlaceholder('Select an application type')
                    .addOptions([
                        {
                            label: 'Pilot Instructor Application',
                            value: 'pilot_instructor',
                        },
                        {
                            label: 'Infantry Instructor Application',
                            value: 'infantry_instructor',
                        },
                        {
                            label: 'Crewman Instructor Application',
                            value: 'crewman_instructor',
                        },
                        {
                            label: 'Support Instructor Application',
                            value: 'tradesman_instructor',
                        },
                    ])
            );

        message.channel.send({ embeds: [embed], components: [row] });
    },
};
