const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'disciplineselection',
    description: 'Sends an embed for discipline selection',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Declare Your Main Discipline.')
            .setDescription("Your Main specialty discipline is what gameplay you intend to devote your skills and efforts towards.\n\n**Infantry**\nYou excel most being on the ground engaging enemy combatants in FPS combat. *Provides Infantry Candidate role*\n\n**Piloting**\nYou excel most in the cockpit, engaging enemy combatants in ship-to-ship combat. *Provides Pilot Candidate role*\n\n**Crewman**\nYou prefer to be in a multicrew ship as a gunner, engineer, capital ship combat, etc.\n\n**Support**\nYou prefer supportive roles such as Interdiction, Acquisition, or movement of valuable assets during combat.")
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_discipline')
                    .setPlaceholder('Select your main discipline')
                    .addOptions([
                        {
                            label: 'Infantry',
                            description: 'You excel most being on the ground engaging enemy combatants in FPS combat.',
                            value: 'infantry',
                        },
                        {
                            label: 'Pilot',
                            description: 'Excels in ship-to-ship combat. Provides Pilot Candidate role',
                            value: 'pilot',
                        },
                        {
                            label: 'Crewman',
                            description: 'You prefer to be in a mulitcrew ship as a gunner engineering Etc .',
                            value: 'crewman',
                        },
                        {
                            label: 'Support',
                            description: 'You prefer supportive roles.',
                            value: 'tradesman',
                        },
                    ]),
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};