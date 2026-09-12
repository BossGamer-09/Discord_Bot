const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'deletevc',
    description: 'Delete a voice channel by ID',
    usage: '!deletevc <channel-id>',
    
    async execute(message, args, client) {
        try {
            // Check if BOT has permission to manage channels
            if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ 
                    content: '❌ I need the "Manage Channels" permission to delete voice channels.' 
                });
            }

            // Check if user has required roles
            const allowedRoleIds = [
                '1173822659071578182', // Command role
                '1173822697956982794', // Officer role
                '1173822842442367026'  // Leader role
            ];

            const hasAllowedRole = message.member.roles.cache.some(role => 
                allowedRoleIds.includes(role.id)
            );

            if (!hasAllowedRole) {
                return message.reply({ 
                    content: '❌ You need one of the following roles to use this command: Command, Officer, or Leader.' 
                });
            }

            // Validate arguments
            if (args.length < 1) {
                return message.reply({ 
                    content: `❌ Usage: \`${this.usage}\`\nExample: \`!deletevc 123456789012345678\`` 
                });
            }

            const channelId = args[0];

            // Validate channel ID format
            if (!channelId.match(/^\d{17,19}$/)) {
                return message.reply({ 
                    content: '❌ Please provide a valid channel ID (17-19 digit number).' 
                });
            }

            // Fetch the channel
            const channel = await message.guild.channels.fetch(channelId).catch(() => null);
            
            if (!channel) {
                return message.reply({ 
                    content: '❌ Channel not found. Please check the channel ID.' 
                });
            }

            // Verify it's a voice channel
            if (channel.type !== 2) { // Voice channel = 2
                return message.reply({ 
                    content: '❌ The provided channel is not a voice channel.' 
                });
            }

            // Store channel info for confirmation message
            const channelName = channel.name;
            const channelCategory = channel.parent ? channel.parent.name : 'No Category';

            // Delete the voice channel
            await channel.delete(`Deleted by ${message.author.tag}`);

            await message.reply({ 
                content: `✅ Successfully deleted voice channel **${channelName}** from category **${channelCategory}**` 
            });

        } catch (error) {
            console.error('Error deleting voice channel:', error);
            
            let errorMessage = '❌ Failed to delete voice channel. ';
            
            if (error.code === 50013) { // Missing Permissions
                errorMessage += 'I lack the necessary permissions to delete channels.';
            } else if (error.code === 10003) { // Unknown Channel
                errorMessage += 'Channel not found or already deleted.';
            } else if (error.code === 50035) { // Invalid Form Body
                errorMessage += 'Invalid channel ID.';
            } else {
                errorMessage += 'Please try again later.';
            }
            
            await message.reply({ content: errorMessage });
        }
    }
};