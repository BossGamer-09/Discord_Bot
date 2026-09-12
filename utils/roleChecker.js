const commandPermissions = require("../commandPermissions.json");
const permissionGroups = require("../permissionGroups.json");

function hasPermission(interaction) {
    const BOT_OWNER_ID = "720344087466868827"; // your ID always bypasses
    const commandName = interaction.commandName;

    // Determine which group the command belongs to
    const groupName = commandPermissions[commandName] || "Public";
    const group = permissionGroups[groupName] || { allowedUserIds: [], allowedRoleIds: [] };

    // Always allow bot owner
    if (interaction.user.id === BOT_OWNER_ID) return true;

    // User ID check
    if (group.allowedUserIds.includes(interaction.user.id)) return true;

    // Role ID check
    if (interaction.member && interaction.member.roles) {
        if (interaction.member.roles.cache.some(role => group.allowedRoleIds.includes(role.id))) {
            return true;
        }
    }

    // Public commands are always allowed
    if (groupName === "Public") return true;

    return false;
}

module.exports = { hasPermission };
