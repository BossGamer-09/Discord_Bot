const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'staffapplicationembed',
    description: 'Send an embed with a dropdown for staff applications.',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Staff Application')
            .setDescription('Please select the position you want to apply for from the dropdown menu below.');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('staff_application_select')
                    .setPlaceholder('Select a position')
                    .addOptions([
                        { label: 'Event Coordinator Application', value: 'event_coordinator' },
                        { label: 'Chamberlain (Human Resources) Application', value: 'chamberlain' },
                        { label: 'Envoy (Diplomacy) Application', value: 'envoy' },
                        { label: 'Herald (Media & Marketing) Application', value: 'herald' },
                        { label: 'Scholar (Research & Development) Application', value: 'scholar' },
                        { label: 'Scribe (Records & Info) Application', value: 'scribe' },
                        { label: 'Treasure (In-Game Finance) Application', value: 'treasure' },
                    ]),
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
