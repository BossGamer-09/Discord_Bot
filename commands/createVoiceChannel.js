const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'createvoice',
    description: 'Create a voice channel with a specific name in a category',
    usage: '!createvoice "channel-name" <category-id>',
    
    async execute(message, args, client) {
        try {
            // Check if BOT has permission to manage channels
            if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ 
                    content: '❌ I need the "Manage Channels" permission to create voice channels.' 
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

            // Parse quoted channel name and category ID
            const content = args.join(' ');
            const quotedMatch = content.match(/"([^"]+)"/);
            
            if (!quotedMatch) {
                return message.reply({ 
                    content: `❌ Usage: \`${this.usage}\`\nExample: \`!createvoice "My Voice Channel" 123456789012345678\`` 
                });
            }

            const channelName = quotedMatch[1];
            const remainingArgs = content.replace(quotedMatch[0], '').trim().split(' ');
            const categoryId = remainingArgs[0];

            if (!categoryId || !categoryId.match(/^\d{17,19}$/)) {
                return message.reply({ 
                    content: '❌ Please provide a valid category ID (17-19 digit number).' 
                });
            }

            // Fetch the category
            const category = await message.guild.channels.fetch(categoryId).catch(() => null);
            
            if (!category || category.type !== 4) {
                return message.reply({ 
                    content: '❌ Category not found or invalid.' 
                });
            }

            // Create the voice channel
            const voiceChannel = await message.guild.channels.create({
                name: channelName,
                type: 2, // Voice channel
                parent: category.id,
                reason: `Created by ${message.author.tag}`
            });

            await message.reply({ 
                content: `✅ Successfully created voice channel **${voiceChannel.name}** in category **${category.name}**\n**Channel ID:** ${voiceChannel.id}\n${voiceChannel}` 
            });

        } catch (error) {
            console.error('Error creating voice channel:', error);
            await message.reply({ 
                content: '❌ Failed to create voice channel. Please check permissions and try again.' 
            });
        }
    }
};