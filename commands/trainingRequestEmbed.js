const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'trainingrequestembed',
    description: 'Send training request embed with dropdown',
    execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('Request Training From A BlightVeil Instructor')
            .setDescription('Please select the discipline you would like to request training for and enter the information requested. A private channel will be created for you and an instructor will be notified.');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('training_request_select')
                    .setPlaceholder('Select a training type')
                    .addOptions([
                        {
                            label: 'Pilot Training',
                            value: 'pilot_training',
                        },
                        {
                            label: 'Infantry Training',
                            value: 'infantry_training',
                        },
                        {
                            label: 'Crewman Training',
                            value: 'crewman_training',
                        },
                        {
                            label: 'Support Training',
                            value: 'tradesman_training',
                        },
                    ])
            );

        message.channel.send({ embeds: [embed], components: [row] });
    },
};
