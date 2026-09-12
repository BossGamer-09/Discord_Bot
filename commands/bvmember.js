const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'bvmember',
    description: 'List roles of a member',
    async execute(message, args) {
        const searchName = args.join(' ').toLowerCase();

        if (!searchName) {
            return message.channel.send('Please specify a member name.');
        }

        try {
            await message.guild.members.fetch();
            const member = message.guild.members.cache.find(m =>
                m.user.tag.toLowerCase().includes(searchName) ||
                m.displayName.toLowerCase().includes(searchName)
            );

            if (!member) {
                return message.channel.send(`Member ${searchName} not found.`);
            }

            const roles = member.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => role.name)
                .join('\n');

            if (roles.length === 0) {
                return message.channel.send(`${member.user.tag} has no roles.`);
            }

            const embed = new EmbedBuilder()
                .setTitle(`${member.user.tag} has the following roles`)
                .setDescription(roles)
                .setColor('#0000FF');

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            message.channel.send('There was an error fetching the member roles. Please try again later.');
        }
    }
};
