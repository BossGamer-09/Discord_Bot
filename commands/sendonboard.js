const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'sendonboard',
    description: 'Sends an embed with a dropdown for role selection',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Tell us why you have joined the BlightVeil discord so that we can make sure you receive the correct roles.')
            .setDescription('After making your selection, a verify message will appear. Click the Verify button when available to gain access to the server.');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('selectRole')
                    .setPlaceholder('What brings you to BlightVeil?')
                    .addOptions([
                        {
                            label: 'I would like to join BlightVeil and become a member.',
                            description: '(conscript aspirant)',
                            value: 'conscript_aspirant',
                        },
                        {
                            label: "I'm a part of another organization or a representative.",
                            description: '(external citizen)',
                            value: 'external_citizen',
                        },
                        {
                            label: "I'm just checking things out or here to join an event.",
                            description: '(visitor)',
                            value: 'visitor',
                        },
                    ]),
            );

        try {
            const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
            const filter = interaction => interaction.isSelectMenu() && interaction.customId === 'selectRole';
            const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async interaction => {
                if (!interaction.isSelectMenu()) return;

                const selectedRole = interaction.values[0];
                const member = interaction.member;
                let roleName;
                const rolesToRemove = ['1172216651601694750', '1180258600132821102', '1168925938692669554'];

                if (selectedRole === 'conscript_aspirant') {
                    await member.roles.remove(rolesToRemove);
                    await member.roles.add('1172216651601694750');
                    roleName = 'Conscript Aspirant';
                } else if (selectedRole === 'external_citizen') {
                    await member.roles.remove(rolesToRemove);
                    await member.roles.add('1180258600132821102');
                    roleName = 'External Citizen';
                } else if (selectedRole === 'visitor') {
                    await member.roles.remove(rolesToRemove);
                    await member.roles.add('1168925938692669554');
                    roleName = 'Visitor';
                }

                await interaction.update({
                    content: `You have received the ${roleName} entry role.`,
                    components: []
                });

                const verificationEmbed = new EmbedBuilder()
                    .setTitle('Verification')
                    .setDescription('Once you have selected one of the options above click the Verify button below to complete your entry into the public area of the BlightVeil discord.');

                const verifyButton = new ButtonBuilder()
                    .setCustomId('verify')
                    .setLabel('Verify')
                    .setStyle('SUCCESS');

                const verifyRow = new ActionRowBuilder()
                    .addComponents(verifyButton);

                const verifyMessage = await message.channel.send({ embeds: [verificationEmbed], components: [verifyRow] });

                const verifyFilter = interaction => interaction.isButton() && interaction.customId === 'verify';
                const verifyCollector = verifyMessage.createMessageComponentCollector({ filter: verifyFilter, time: 60000 });

                verifyCollector.on('collect', async verifyInteraction => {
                    if (!verifyInteraction.isButton()) return;

                    await verifyInteraction.member.roles.add('1217854620064419852');
                    await verifyInteraction.update({ content: 'You have been verified and your roles have been updated.', components: [] });
                    await verifyMessage.delete();

                    await sentMessage.edit({
                        content: null,
                        embeds: [embed],
                        components: [row]
                    });
                });
            });

        } catch (error) {
            console.error('Error sending embed message:', error);
        }
    },
};
