const { updateTotalNominations, addNomination, resetNominationsForUser, updateRoles } = require('../db'); // UpdateRoles is now imported from db.js

module.exports = {
    name: 'nomset',
    description: 'Manually set the number of nominations for a member',
    async execute(message, args) {
        const memberName = args.slice(0, -1).join(' ').toLowerCase();
        const nominationCount = parseInt(args[args.length - 1], 10);

        if (isNaN(nominationCount)) {
            return message.channel.send('Please provide a valid number of nominations.');
        }

        await message.guild.members.fetch();
        const member = message.guild.members.cache.find(m => 
            m.user.tag.toLowerCase().includes(memberName) || 
            m.displayName.toLowerCase().includes(memberName)
        );

        if (!member) {
            return message.channel.send(`Member ${memberName} not found.`);
        }

        try {
            // Reset previous nominations for this user
            await resetNominationsForUser(member.id);

            // Add new nominations based on the provided nomination count
            for (let i = 0; i < nominationCount; i++) {
                await addNomination(member.id, member.user.username, 'Manual Override', `Set by ${message.author.tag}`, null);
            }

            // Update the total nominations count in the members table
            await updateTotalNominations(member.id);

            // Fetch the updated total nominations
            const totalNominations = nominationCount; 

            // Update roles based on the updated distinction level
            await updateRoles(member, totalNominations);

            message.channel.send(`Set ${member.displayName}'s nominations to ${nominationCount}.`);
        } catch (error) {
            console.error('Error updating nominations or roles:', error);
            return message.channel.send('There was an error updating the nominations or roles. Please try again later.');
        }
    }
};
