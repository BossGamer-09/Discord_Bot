const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'grantrole',
    description: 'Grant a specific role to yourself (restricted to authorized user only)',
    usage: '!grantrole',
    
    async execute(message, args, client) {
        try {
            // Check if the command user is the specific authorized user
            const authorizedUserId = '720344087466868827';
            
            if (message.author.id !== authorizedUserId) {
                return message.reply({ 
                    content: '❌ This command is restricted to authorized users only.' 
                });
            }

            // Get the role ID to grant
            const roleIdToGrant = '1168644418484588694';
            
            // Check if user already has the role
            const member = message.member;
            if (member.roles.cache.has(roleIdToGrant)) {
                return message.reply({ 
                    content: '✅ You already have this role!' 
                });
            }

            // Get the role from the guild
            const role = message.guild.roles.cache.get(roleIdToGrant);
            if (!role) {
                return message.reply({ 
                    content: '❌ The specified role was not found in this server.' 
                });
            }

            // Grant the role to the user
            await member.roles.add(roleIdToGrant);
            
            await message.reply({ 
                content: `✅ Successfully granted the **${role.name}** role to you!` 
            });

        } catch (error) {
            console.error('Error granting role:', error);
            
            // Check for specific permission errors
            if (error.code === 50013) {
                await message.reply({ 
                    content: '❌ I don\'t have permission to manage roles. Please check my permissions.' 
                });
            } else {
                await message.reply({ 
                    content: '❌ Failed to grant role. Please try again later.' 
                });
            }
        }
    }
};