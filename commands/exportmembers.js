const { AttachmentBuilder } = require('discord.js');
const { writeFileSync } = require('fs');
const path = require('path');

module.exports = {
    name: 'exportmembers',
    description: 'Export members usernames and display names grouped by specific roles and sorted by most recent join date.',
    async execute(message) {
        if (!message.guild) {
            return message.channel.send('This command can only be used in a server.');
        }

        // IDs for included ranks
        const includedRoleIds = [
            '1173822659071578182', // Command
            '1173822697956982794', // Officer
            '1173822842442367026', // Leader
            '1173822915574251570'  // Member
        ];
        // Group roles
        const group1RoleId = '1168215961757810779'; // Legion
        const group2RoleId = '1168214951446454352'; // Knights
        const group3RoleId = '1370534162179555488'; // Aux

        try {
            await message.guild.members.fetch(); // Ensure we have latest data

            // Filter members by included roles OR any of the groups
            const filteredMembers = message.guild.members.cache
                .filter(member =>
                    member.roles.cache.some(role =>
                        includedRoleIds.includes(role.id) ||
                        role.id === group1RoleId ||
                        role.id === group2RoleId ||
                        role.id === group3RoleId
                    )
                )
                .sort((a, b) => b.joinedAt - a.joinedAt); // Sort by join date (most recent first)

            // Helper: extract rank and clean name from display name
            const extractRank = displayName => {
                const match = displayName.match(/\[([^\]]+)\]/);
                const rank = match ? match[1] : '';
                const cleanName = displayName.replace(/\[[^\]]+\]/, '').trim();
                return { rank, cleanName };
            };

            const formatDate = date => date.toISOString().split('T')[0];

            // Group members by group roles
            const group1 = filteredMembers.filter(m => m.roles.cache.has(group1RoleId));
            const group2 = filteredMembers.filter(m => m.roles.cache.has(group2RoleId));
            const group3 = filteredMembers.filter(m => m.roles.cache.has(group3RoleId));
            const others = filteredMembers.filter(m =>
                !m.roles.cache.has(group1RoleId) &&
                !m.roles.cache.has(group2RoleId) &&
                !m.roles.cache.has(group3RoleId)
            );

            // Prepare CSV
            const csvLines = [];

            const addGroupToCsv = (groupName, members) => {
                csvLines.push(`\nGroup: ${groupName}`);
                csvLines.push('Username,Display Name,Current Rank,Join Date');
                members.forEach(member => {
                    const { rank, cleanName } = extractRank(member.displayName);
                    csvLines.push(`"${member.user.tag}","${cleanName}","${rank}","${formatDate(member.joinedAt)}"`);
                });
            };

            addGroupToCsv('Legion', group1);
            addGroupToCsv('Knights', group2);
            addGroupToCsv('Aux', group3);
            addGroupToCsv('Others', others);

            // Save file
            const filePath = path.join(__dirname, 'grouped_members.csv');
            writeFileSync(filePath, csvLines.join('\n'));

            const attachment = new AttachmentBuilder(filePath, { name: 'grouped_members.csv' });
            await message.channel.send({
                content: 'Here is the exported members list, grouped by roles:',
                files: [attachment]
            });
        } catch (error) {
            console.error(error);
            await message.channel.send('There was an error exporting the members. Please try again later.');
        }
    }
};
