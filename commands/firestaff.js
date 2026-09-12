const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'fire',
    description: 'Generates an embed to remove staff roles from a specified member',
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send('Usage: !fire user.tag');
        }

        const userTag = args[0];

        try {
            await message.guild.members.fetch();
            const member = message.guild.members.cache.find(m => m.user.tag.toLowerCase() === userTag.toLowerCase() || m.displayName.toLowerCase() === userTag.toLowerCase());
            if (!member) {
                return message.channel.send(`Member with user tag or display name ${userTag} not found.`);
            }

            const staffRoleButtons = [
                { label: 'Staff - Event Coordinator', roleId: '1185813396667514891' },
                { label: 'Staff - Scholar', roleId: '1178207198602608680' },
                { label: 'Staff - Scribe', roleId: '1174730223636451479' },
                { label: 'Staff - Treasurer', roleId: '1176594286469464164' },
                { label: 'Staff - Herald', roleId: '1172312195690934363' },
                { label: 'Staff - BlightVeil Envoy', roleId: '1171484082048340028' },
                { label: 'Staff - Chamberlain', roleId: '1174715276126859274' }
            ];

            const instructorRoleButtons = [
                { label: 'Tradesman Instructor', roleId: '1168327804874661931' },
                { label: 'Crewman Instructor', roleId: '1168327699203375114' },
                { label: 'Infantry Instructor', roleId: '1168327592269598760' },
                { label: 'Pilot Instructor', roleId: '1168327555917557780' }
            ];

            const rows = [];

            // Add the first set of buttons (staff roles)
            for (let i = 0; i < staffRoleButtons.length; i += 5) {
                const slice = staffRoleButtons.slice(i, i + 5);
                const row = new ActionRowBuilder().addComponents(
                    slice.map(btn => 
                        new ButtonBuilder()
                            .setCustomId(`fire_${btn.roleId}_${member.id}`)
                            .setLabel(btn.label)
                            .setStyle(ButtonStyle.Danger)
                    )
                );
                rows.push(row);
            }

            // Add an empty row as a gap
            const emptyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('empty_gap')
                    .setLabel('\u200B')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
            rows.push(emptyRow);

            // Add the second set of buttons (instructor roles)
            for (let i = 0; i < instructorRoleButtons.length; i += 5) {
                const slice = instructorRoleButtons.slice(i, i + 5);
                const instructorRow = new ActionRowBuilder().addComponents(
                    slice.map(btn => 
                        new ButtonBuilder()
                            .setCustomId(`fire_${btn.roleId}_${member.id}`)
                            .setLabel(btn.label)
                            .setStyle(ButtonStyle.Danger)
                    )
                );
                rows.push(instructorRow);
            }

            const embed = new EmbedBuilder()
                .setTitle('Staff Positions')
                .setDescription(`Please select the staff position you would like ${member.displayName} to be removed from below.`);

            await message.channel.send({ embeds: [embed], components: rows });

        } catch (error) {
            console.error(error);
            message.channel.send('There was an error generating the staff removal options.');
        }
    }
};
