const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    EmbedBuilder, 
    PermissionsBitField, 
    Colors 
} = require('discord.js');

module.exports = {
    name: 'setnick',
    description: 'Change the nickname of a specified member using their username or display name.',
    async execute(message, args) {
        // Check if the user has the required permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
            return message.reply('You do not have permission to change nicknames.');
        }

        // Ensure arguments are provided
        if (!args.length) {
            return message.reply('Please provide the username or display name of the member.');
        }

        const memberName = args.join(' ');

        console.log(`Attempting to find member with name: ${memberName}`); // Debug log

        // Fetch all members if not already cached
        await message.guild.members.fetch();

        // Find the member by username or display name
        const member = message.guild.members.cache.find(m =>
            m.user.username.toLowerCase() === memberName.toLowerCase() ||
            m.displayName.toLowerCase() === memberName.toLowerCase()
        );

        if (!member) {
            console.log(`Member not found for name: ${memberName}`); // Debug log
            return message.reply('Member not found. Please check the username or display name.');
        }

        console.log(`Found member: ${member.user.tag}`); // Debug log

        // Create an embed for the nickname change
        const embed = new EmbedBuilder()
            .setTitle('Change Nickname')
            .setDescription(`Click the button below to change the nickname of ${member.displayName}.`)
            .setColor(Colors.Blue);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`setnick_button_${member.id}`)
                    .setLabel('Change Nickname')
                    .setStyle('Primary')
            );

        // Reply with the embed and button
        await message.reply({ embeds: [embed], components: [row] });
    }
};
