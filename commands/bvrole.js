const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ALLOWED_ROLES = [
    '1168253795818549319', // SOV
    '1168644418484588694', // Steward
    '1168234521301356715', // HC
    '1308081615083278378', // Pilot Overseer
    '1308081895266844712', // Infantry Overseer
    '1308081958424940545', // Crewman Overseer
    '1308082015622664262', // Support Overseer
    '1304192471806246953', // Knights Leader
    '1304192533533819002', // Legion Leader
    '1185813396667514891'  // Event coordinator
];

// Helper function to check if a member has permission to use this command
function hasPermission(member) {
    // Check if member has any of the allowed roles
    return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

// Helper function to get all roles from the guild for autocomplete
async function getAllRoles(guild) {
    try {
        await guild.roles.fetch();
        return guild.roles.cache
            .filter(role => 
                role.name !== '@everyone' && 
                !role.managed && // Exclude bot roles
                role.members.size > 0 // Only roles with members
            )
            .map(role => ({
                name: role.name,
                value: role.name
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Error fetching roles:', error);
        return [];
    }
}

// Main function to list members by role (used by both command types)
async function listMembersByRole(roleName, guild, context = null) {
    try {
        // Fetch all members to ensure we have complete data
        await guild.members.fetch();
        
        // Find the role by name (case-insensitive)
        const role = guild.roles.cache.find(r => 
            r.name.toLowerCase() === roleName.toLowerCase()
        );

        if (!role) {
            const errorMsg = `Role "${roleName}" not found.`;
            if (context && context.editReply) {
                return context.editReply(errorMsg);
            } else if (context && context.channel) {
                return context.channel.send(errorMsg);
            }
            return errorMsg;
        }

        // Get members with the role
        const membersWithRole = guild.members.cache
            .filter(member => member.roles.cache.has(role.id))
            .map(member => member.displayName);

        if (membersWithRole.length === 0) {
            const noMembersMsg = `No members found with the role "${roleName}".`;
            if (context && context.editReply) {
                return context.editReply(noMembersMsg);
            } else if (context && context.channel) {
                return context.channel.send(noMembersMsg);
            }
            return noMembersMsg;
        }

        // Create embed with pagination if needed
        const embed = new EmbedBuilder()
            .setTitle(`Members with the role: ${role.name}`)
            .setColor(role.color || '#0000FF')
            .setTimestamp();

        // If there are too many members, split into chunks
        const maxFieldLength = 1024; // Discord embed field limit
        let currentChunk = '';
        let chunkNumber = 1;

        for (const member of membersWithRole) {
            const memberLine = `${member}\n`;
            
            if ((currentChunk.length + memberLine.length) > maxFieldLength) {
                embed.addFields({
                    name: chunkNumber === 1 ? 'Members' : `Members (Continued)`,
                    value: currentChunk,
                    inline: false
                });
                currentChunk = memberLine;
                chunkNumber++;
            } else {
                currentChunk += memberLine;
            }
        }

        // Add the last chunk
        if (currentChunk.length > 0) {
            embed.addFields({
                name: chunkNumber === 1 ? 'Members' : `Members (Continued)`,
                value: currentChunk,
                inline: false
            });
        }

        // Add total count
        embed.addFields({ 
            name: 'Total Members', 
            value: membersWithRole.length.toString(), 
            inline: true 
        });

        // Add role info
        embed.addFields({ 
            name: 'Role Info', 
            value: `ID: ${role.id}\nColor: ${role.hexColor.toUpperCase()}`, 
            inline: true 
        });

        // Send the embed
        if (context && context.editReply) {
            await context.editReply({ embeds: [embed] });
        } else if (context && context.channel) {
            await context.channel.send({ embeds: [embed] });
        }

        return embed;

    } catch (error) {
        console.error('Error in listMembersByRole:', error);
        const errorMsg = 'There was an error fetching the members. Please try again later.';
        
        if (context && context.editReply) {
            return context.editReply(errorMsg);
        } else if (context && context.channel) {
            return context.channel.send(errorMsg);
        }
        return errorMsg;
    }
}

module.exports = {
    // ================== PREFIX COMMAND VERSION (!bvrole) ==================
    name: 'bvrole',
    description: 'List members by role',
    async execute(message, args) {
        // Check permissions
        if (!hasPermission(message.member)) {
            return message.channel.send('You do not have permission to use this command.')
                .then(msg => setTimeout(() => msg.delete(), 5000))
                .catch(console.error);
        }

        // Delete the command message
        try {
            await message.delete();
        } catch (error) {
            console.error('Failed to delete message:', error);
        }

        const roleName = args.join(' ');

        if (!roleName) {
            return message.channel.send('Please specify a role name.');
        }

        // Call the main function
        await listMembersByRole(roleName, message.guild, message);
    },

    // ================== SLASH COMMAND VERSION (/bvrole) ==================
    data: new SlashCommandBuilder()
        .setName('bvrole')
        .setDescription('List all members who have a specific role')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The role to list members for')
                .setRequired(true)
                .setAutocomplete(true) // Enable autocomplete
        ),

    async executeSlash(interaction) {
        // Check permissions
        if (!hasPermission(interaction.member)) {
            return interaction.reply({ 
                content: 'You do not have permission to use this command.',
                flags: 64 // EPHEMERAL
            });
        }

        // Defer the reply to give us more time
        await interaction.deferReply();

        const roleName = interaction.options.getString('role');

        // Call the main function
        await listMembersByRole(roleName, interaction.guild, interaction);
    },

    // ================== AUTOCOMPLETE HANDLER ==================
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const focusedOption = interaction.options.getFocused(true);
        
        // Only handle autocomplete for role option
        if (focusedOption.name !== 'role') {
            await interaction.respond([]);
            return;
        }

        try {
            // Get all roles from the guild
            const allRoles = await getAllRoles(interaction.guild);
            
            // Filter roles based on user input
            const filtered = allRoles.filter(role => 
                role.name.toLowerCase().includes(focusedValue.toLowerCase()) ||
                role.value.toLowerCase().includes(focusedValue.toLowerCase())
            ).slice(0, 25); // Discord shows max 25 suggestions
            
            await interaction.respond(filtered);
        } catch (error) {
            console.error('Error in autocomplete:', error);
            await interaction.respond([]);
        }
    },

    // ================== EXPORTED FUNCTIONS ==================
    // Export helper functions for programmatic use
    listMembersByRole,
    hasPermission,
    getAllRoles
};