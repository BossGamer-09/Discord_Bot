const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { getNominationsForUser, updateTotalNominations } = require('../db');  // Import the correct DB functions
const levels = require('../data/levels');

module.exports = {
    name: 'nomcheck',
    description: 'Check nominations of a member',
    async execute(message, args) {
        const memberName = args.join(' ').toLowerCase();

        if (!memberName) {
            return message.channel.send('Please specify a member name.');
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
            // Fetch nominations and total nominations for the user
            const nominationsData = await getNominationsForUser(member.id);
            const totalNominations = nominationsData.length;

            let currentLevel = 'None';
            let nominationsForNextLevel = 'N/A';

            // Determine the current distinction level
            for (let i = 0; i < levels.length; i++) {
                if (totalNominations < levels[i].count) {
                    nominationsForNextLevel = levels[i].count - totalNominations;
                    break;
                }
                currentLevel = levels[i].roleId;
            }

            const role = message.guild.roles.cache.get(currentLevel);
            const roleName = role ? role.name : 'None';

            const embed = new EmbedBuilder()
                .setTitle(`${member.displayName}'s Nominations`)
                .addFields(
                    { name: 'Current Distinction Level', value: roleName, inline: true },
                    { name: 'Total Nominations', value: totalNominations.toString(), inline: true },
                    { name: 'Nominations Till Next Distinction Level', value: nominationsForNextLevel.toString(), inline: true }
                )
                .setColor('GREEN');

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`reset_${member.id}`)
                        .setLabel('Reset')
                        .setStyle('DANGER'),
                    new ButtonBuilder()
                        .setCustomId(`done_${member.id}`)
                        .setLabel('Done')
                        .setStyle('SECONDARY')
                );

            return message.channel.send({ embeds: [embed], components: [row], ephemeral: true });
        } catch (error) {
            console.error('Error fetching nominations from database:', error);
            message.channel.send('There was an error fetching the nominations. Please try again later.');
        }
    }
};
