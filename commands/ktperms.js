const { connectToMySQL } = require('../db'); // Adjust path if needed

module.exports = {
    name: 'ktperms',
    description: 'Blacklist or unblacklist a user in the kill tracker system.',
    async execute(message, args) {
        if (!args[0] || !args[1]) {
            return message.reply('You need to provide a username and action (deny/allow).');
        }

        const username = args[0];
        const action = args[1]?.toLowerCase();

        if (!['deny', 'allow'].includes(action)) {
            return message.reply('Invalid action. Use `!ktperms <username> deny` or `!ktperms <username> allow`.');
        }

        // Try to find the user by username
        const targetUser = message.guild.members.cache.find(
            user => user.user.username.toLowerCase() === username.toLowerCase()
        );

        if (!targetUser) {
            return message.reply(`Could not find a user with the username: ${username}`);
        }

        // Permissions check
        const allowedUserIds = ['97923226469953536', '246067535613657089'];
        const hasPermission =
            message.member.roles.cache.some(role =>
                ['Legion Leader', 'Sovereign', 'Division - High Council'].includes(role.name)
            ) || allowedUserIds.includes(message.author.id);

        if (!hasPermission) {
            return message.reply('You do not have permission to use this command.');
        }

        let connection;
        try {
            connection = await connectToMySQL();
            const conn = await connection.getConnection();

            await conn.beginTransaction();

            // Insert or update the blacklist table
            const upsertQuery = `
                INSERT INTO kt_blacklist (user_id, blacklisted, updated_at)
                VALUES (?, ?, NOW())
                ON DUPLICATE KEY UPDATE blacklisted = VALUES(blacklisted), updated_at = NOW()
            `;
            await conn.execute(upsertQuery, [targetUser.id, action === 'deny' ? 1 : 0]);

            // If denying, remove API key
            if (action === 'deny') {
                const deleteQuery = `DELETE FROM killtracker_keys WHERE user_id = ?`;
                await conn.execute(deleteQuery, [targetUser.id]);
                message.reply(`User ${targetUser.user.username} has been denied and their API key has been removed.`);
            } else {
                message.reply(`User ${targetUser.user.username} has been allowed.`);
            }

            await conn.commit();
            conn.release();
        } catch (error) {
            console.error('Error updating blacklist:', error);
            if (connection) {
                const conn = await connection.getConnection();
                await conn.rollback();
                conn.release();
            }
            message.reply('An error occurred while processing the blacklist update.');
        }
    },
};
