module.exports = {
    name: 'rankreset',
    description: 'Resets roles and nickname of a specified member and adds default roles',
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send('Usage: !rankreset user.tag');
        }

        const userTag = args[0];
        const defaultRoles = ['1217854620064419852', '1168925938692669554'];
        
        // Roles to PRESERVE (do not remove these)
        const preservedRoles = [
            '1360292465961336902', // Shittalk
            '1360302217499770922', // SCPVP
            '1353210962093801563', // Issue Council
            '1395877928713326692', // SCPiracy
            '1360302092102930626', // Media
            '1365554822954225765', // HOSAM
            '1365554907985219584', // HOSAS
            '1365554947726381108', // HOTAS
            '1365555089414164602', // Headtracker
            '1365555135371284592', // Pedals
            '1365555185618915328', // KB/M
            '1365555236894277722', // EU
            '1365555264127897711', // NA
            '1365555289440649296', // OCE
            '1437704919191916614'  // EXECHanger
        ];

        try {
            // Use cached members instead of fetching every time
            const member = message.guild.members.cache.find(m => m.user.tag.toLowerCase() === userTag.toLowerCase());
            
            if (!member) {
                // If member not in cache, try fetching just that specific member
                try {
                    const fetchedMembers = await message.guild.members.fetch({ 
                        query: userTag.split('#')[0], // Use username part only
                        limit: 1 
                    });
                    const fetchedMember = fetchedMembers.first();
                    
                    if (!fetchedMember) {
                        return message.channel.send(`Member with user tag ${userTag} not found.`);
                    }
                    
                    return await resetMember(fetchedMember, defaultRoles, preservedRoles, message);
                } catch (fetchError) {
                    console.error('Error fetching specific member:', fetchError);
                    return message.channel.send(`Error finding member ${userTag}. They may not be in the server.`);
                }
            }

            await resetMember(member, defaultRoles, preservedRoles, message);
            
        } catch (error) {
            console.error('Rankreset error:', error);
            if (error.code === 50001) { // Missing Access error
                message.channel.send('I do not have permission to manage this member.');
            } else if (error.code === 50013) { // Missing Permissions
                message.channel.send('I do not have the required permissions to manage roles.');
            } else {
                message.channel.send('There was an error resetting roles and nickname.');
            }
        }
    }
};

async function resetMember(member, defaultRoles, preservedRoles, message) {
    // Check if bot has permission to manage roles
    if (!message.guild.members.me.permissions.has('MANAGE_ROLES')) {
        return message.channel.send('❌ I do not have permission to manage roles.');
    }

    // Check if bot can manage this specific member
    if (!member.manageable) {
        return message.channel.send('❌ I cannot manage this member (my role might be lower than theirs).');
    }

    // Get bot's highest role position
    const botHighestRole = message.guild.members.me.roles.highest.position;

    // Filter roles that the bot can actually manage AND are not in the preserved list
    const rolesToRemove = member.roles.cache.filter(role => {
        // Keep the @everyone role
        if (role.id === message.guild.id) return false;
        
        // Keep preserved roles
        if (preservedRoles.includes(role.id)) return false;
        
        // Don't try to remove managed roles (bot roles, integration roles)
        if (role.managed) return false;
        
        // Only remove roles that are below the bot's highest role
        return role.position < botHighestRole;
    });

    console.log(`[RankReset] Member roles: ${member.roles.cache.map(r => r.name).join(', ')}`);
    console.log(`[RankReset] Removable roles: ${rolesToRemove.map(r => r.name).join(', ')}`);
    console.log(`[RankReset] Preserved roles: ${member.roles.cache.filter(r => preservedRoles.includes(r.id)).map(r => r.name).join(', ')}`);
    console.log(`[RankReset] Bot's highest role: ${message.guild.members.me.roles.highest.name} (position: ${botHighestRole})`);

    // Remove manageable roles (excluding preserved ones)
    if (rolesToRemove.size > 0) {
        try {
            await member.roles.remove(rolesToRemove);
            console.log(`✅ Removed ${rolesToRemove.size} roles from ${member.user.tag}`);
        } catch (roleError) {
            console.error('Error removing roles:', roleError);
            
            // Try removing roles one by one to see which ones fail
            const failedRoles = [];
            for (const role of rolesToRemove.values()) {
                try {
                    await member.roles.remove(role);
                    console.log(`✅ Removed role: ${role.name}`);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between removals
                } catch (singleError) {
                    console.error(`❌ Failed to remove role ${role.name}:`, singleError.message);
                    failedRoles.push(role.name);
                }
            }
            
            if (failedRoles.length > 0) {
                return message.channel.send(`⚠️ Partially completed. Could not remove these roles: ${failedRoles.join(', ')}`);
            }
        }
    } else {
        console.log(`[RankReset] No roles to remove from ${member.user.tag}`);
    }

    // Check if default roles exist and are manageable
    const manageableDefaultRoles = [];
    const unavailableDefaultRoles = [];
    
    for (const roleId of defaultRoles) {
        const role = message.guild.roles.cache.get(roleId);
        if (role) {
            // Check if bot can assign this role (role exists and is below bot's highest role)
            if (role.position < botHighestRole) {
                // Check if member already has this role
                if (!member.roles.cache.has(roleId)) {
                    manageableDefaultRoles.push(roleId);
                } else {
                    console.log(`ℹ️ Member already has role: ${role.name}`);
                }
            } else {
                console.log(`❌ Cannot assign role ${role.name} - bot role position too low`);
                unavailableDefaultRoles.push(role.name);
            }
        } else {
            console.log(`❌ Default role ${roleId} not found in server`);
            unavailableDefaultRoles.push(roleId);
        }
    }

    // Add default roles (only if they don't already have them)
    if (manageableDefaultRoles.length > 0) {
        try {
            await member.roles.add(manageableDefaultRoles);
            console.log(`✅ Added ${manageableDefaultRoles.length} default roles to ${member.user.tag}`);
        } catch (roleError) {
            console.error('Error adding default roles:', roleError);
            return message.channel.send('❌ Error adding default roles.');
        }
    }

    // Reset nickname if bot has permission
    if (message.guild.members.me.permissions.has('MANAGE_NICKNAMES')) {
        try {
            if (member.nickname) {
                await member.setNickname(null);
                console.log(`✅ Reset nickname for ${member.user.tag}`);
            }
        } catch (nickError) {
            console.error('Error resetting nickname:', nickError);
            // Continue execution even if nickname reset fails
        }
    }

    // Build success message
    let successMessage = `✅ **${member.user.tag}** has been reset.\n`;
    
    if (rolesToRemove.size > 0) {
        successMessage += `• Removed ${rolesToRemove.size} roles\n`;
    }
    
    if (manageableDefaultRoles.length > 0) {
        successMessage += `• Added ${manageableDefaultRoles.length} default roles\n`;
    }
    
    // Show preserved roles that were kept
    const preservedRoleNames = member.roles.cache
        .filter(r => preservedRoles.includes(r.id))
        .map(r => r.name);
        
    if (preservedRoleNames.length > 0) {
        successMessage += `• Preserved: ${preservedRoleNames.join(', ')}\n`;
    }
    
    if (unavailableDefaultRoles.length > 0) {
        successMessage += `\n⚠️ Could not assign: ${unavailableDefaultRoles.join(', ')}`;
    }

    message.channel.send(successMessage);
}