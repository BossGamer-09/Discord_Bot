const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'orginterface',
    description: 'Centralized Org Interface for roles, applications, and training',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('⚜️ BlightVeil Org Interface ⚜️')
            .setDescription(
                "Welcome to the Org Interface!\n\n" +
                "📌 Choose from the menu below"
            );

        const mainMenu = new StringSelectMenuBuilder()
            .setCustomId('org_main_menu')
            .setPlaceholder('📂 Select a Category')
            .addOptions([
                { label: '🎖️ Discipline Selection', value: 'discipline' },
                { label: '📘 Instructor Applications', value: 'instructor' },
                { label: '📑 Staff Applications', value: 'staff' },
                { label: '🎓 Training Requests', value: 'training' },
            ]);

        const row = new ActionRowBuilder().addComponents(mainMenu);

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
