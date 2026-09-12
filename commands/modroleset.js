const {
    EmbedBuilder,
    ActionRowBuilder,
    UserSelectMenuBuilder,
    PermissionsBitField,
} = require('discord.js');

module.exports = {
    name: 'modroleset',
    description: 'Allows a moderator to add/remove a specific role from a user',
    async execute(message, args) {
        // Check if the user has required moderator role(s)
        const allowedRoles = ['1173822659071578182', '1173822842442367026']; // Command & Leader
        const isAllowed = message.member.roles.cache.some(role => allowedRoles.includes(role.id));

        if (!isAllowed) {
            return message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('Moderator Role Assignment')
            .setDescription('Select a user below to **add or remove** chatPVP Restricted Role. STOP them Talking in chatpvp channel')
            .setColor('DarkPurple');

        const row = new ActionRowBuilder()
            .addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('mod_role_toggle')
                    .setPlaceholder('Select a user')
                    .setMaxValues(1)
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    },
};
