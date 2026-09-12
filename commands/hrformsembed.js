const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'hrformsembed',
    description: 'Send an embed with a dropdown to select HR forms',
    async execute(message) {
        console.log('Executing hrformsembed command');  // Debug log
        try {
            const embed = new EmbedBuilder()
                .setTitle('Chamberlain Forms')
                .setDescription('Select which form you need from the dropdown menu below.');

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_hr_form')
                        .setPlaceholder('Select a form...')
                        .addOptions([
                            {
                                label: 'Punitive Action Form',
                                value: 'punitive_action_form',
                            },
                        ])
                );

            console.log('Sending message with embed and components');  // Debug log
            await message.channel.send({ embeds: [embed], components: [row] });
            console.log('Message sent successfully');  // Debug log
        } catch (error) {
            console.error('Error executing hrformsembed command:', error);
        }
    },
};
