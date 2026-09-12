const { upsertBlightVeilMember } = require('../db');  // Import MySQL functions

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        const hierarchyRoles = [
            '1173822659071578182', // Command
            '1173822697956982794', // Officer
            '1173822842442367026', // Leader
            '1173822915574251570'  // Member
        ];

        const hasBlightVeilRole = newMember.roles.cache.some(role => hierarchyRoles.includes(role.id));

        if (hasBlightVeilRole) {
            const memberRoles = newMember.roles.cache.map(role => role.id);
            const username = newMember.user.username;

            // Update the member data in MySQL
            await upsertBlightVeilMember(newMember.id, newMember.guild.id, username, memberRoles);
        }
    }
};