module.exports = {
    name: 'blacklist',
    description: 'Removes all roles from a specified member and bans them from the server',
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send('Usage: !blacklist user.tag');
        }

        const userTag = args[0];

        try {
            await message.guild.members.fetch();
            const member = message.guild.members.cache.find(m => m.user.tag.toLowerCase() === userTag.toLowerCase());
            if (!member) {
                return message.channel.send(`Member with user tag ${userTag} not found.`);
            }

            // Remove all roles
            await member.roles.set([]);

            // Ban the member
            await member.ban({ reason: 'Blacklisted by an administrator.' });

            message.channel.send(`${member.displayName} has been blacklisted and banned from the server.`);
        } catch (error) {
            console.error(error);
            message.channel.send('There was an error blacklisting the member.');
        }
    }
};
