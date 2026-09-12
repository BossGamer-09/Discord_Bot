const { EmbedBuilder } = require('discord.js');
const { connectToMySQL } = require('../db');

module.exports = {
    name: 'updates',
    description: 'Manage site updates banner',
    usage: '!updates add <title> | <content> | [expires] | [priority]\n' +
           '!updates list\n' +
           '!updates remove <id>\n' +
           '!updates clear-expired\n' +
           'Examples:\n' +
           '!updates add "Server Maintenance" | "Server down Friday 8PM EST" | 24h | high\n' +
           '!updates add "New Feature" | "Check leaderboards!" | 7d\n' +
           '!updates remove 5',
    
    async execute(message, args, client) {
        // Check if user has required role (adjust role IDs as needed)
        const allowedRoleIds = [
            '1168234521301356715', // High Council
            '1173822659071578182', // Command
            '1173822697956982794', // Officer
            '1173822842442367026', // Leader
            '1174715276126859274', // Chamberlain
            '1171484082048340028'  // BlightVeil Envoy
        ];

        const hasAllowedRole = message.member.roles.cache.some(role => 
            allowedRoleIds.includes(role.id)
        );

        if (!hasAllowedRole) {
            return message.reply('❌ You need an appropriate role to use this command. Required roles: High Council, Command, Officer, Leader, Chamberlain, or BlightVeil Envoy.');
        }

        if (args.length === 0) {
            return message.reply(`❌ Please specify a subcommand. Usage:\n\`\`\`${this.usage}\`\`\``);
        }

        const subcommand = args[0].toLowerCase();
        const db = await connectToMySQL();

        try {
            switch (subcommand) {
                case 'add':
                    await handleAddUpdate(message, args.slice(1), db);
                    break;
                case 'list':
                    await handleListUpdates(message, db);
                    break;
                case 'remove':
                case 'delete':
                    await handleRemoveUpdate(message, args.slice(1), db);
                    break;
                case 'clear-expired':
                case 'cleanup':
                    await handleClearExpired(message, db);
                    break;
                case 'help':
                    await showHelp(message);
                    break;
                default:
                    await message.reply(`❌ Unknown subcommand. Use:\n\`\`\`${this.usage}\`\`\``);
            }
        } catch (error) {
            console.error('Error in updates command:', error);
            await message.reply('❌ An error occurred while processing your request.');
        }
    }
};

async function handleAddUpdate(message, args, db) {
    // Join all arguments and split by pipe
    const input = args.join(' ');
    const parts = input.split('|').map(part => part.trim());
    
    if (parts.length < 2) {
        return message.reply('❌ Please provide both title and content. Format: `!updates add "Title" | "Content" | [expires] | [priority]`');
    }

    const title = parts[0];
    const content = parts[1];
    const expiresInput = parts[2] ? parts[2].trim() : 'never';
    const priority = parts[3] ? parts[3].trim().toLowerCase() : 'medium';

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(priority)) {
        return message.reply('❌ Invalid priority. Use: low, medium, high, or critical');
    }

    // Parse expiration time
    let expiresAt = null;
    if (expiresInput !== 'never') {
        const timeMatch = expiresInput.match(/^(\d+)([hdm])$/);
        if (!timeMatch) {
            return message.reply('❌ Invalid expiration format. Use: 24h, 7d, 30d, or "never"');
        }

        const amount = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        const now = new Date();

        switch (unit) {
            case 'h': now.setHours(now.getHours() + amount); break;
            case 'd': now.setDate(now.getDate() + amount); break;
            case 'm': now.setMonth(now.getMonth() + amount); break;
        }

        expiresAt = now;
    }

    // Insert into database
    const [result] = await db.query(`
        INSERT INTO site_updates (title, content, author_id, author_name, expires_at, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [title, content, message.author.id, message.author.username, expiresAt, priority]);

    const embed = new EmbedBuilder()
        .setTitle('✅ Update Added')
        .setColor(0x00FF00)
        .addFields(
            { name: 'Title', value: title, inline: true },
            { name: 'Priority', value: priority.toUpperCase(), inline: true },
            { name: 'Expires', value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'Never', inline: true },
            { name: 'Content', value: content.length > 1024 ? content.substring(0, 1021) + '...' : content }
        )
        .setFooter({ text: `Update ID: ${result.insertId}` })
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function handleListUpdates(message, db) {
    const [updates] = await db.query(`
        SELECT * FROM site_updates 
        WHERE is_active = TRUE 
        AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY 
            CASE priority 
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                WHEN 'low' THEN 4
            END,
            created_at DESC
        LIMIT 10
    `);

    if (updates.length === 0) {
        return message.reply('📭 No active updates found.');
    }

    const embed = new EmbedBuilder()
        .setTitle('📢 Active Site Updates')
        .setColor(0x0099FF)
        .setDescription(`Found ${updates.length} active update(s)`);

    updates.forEach(update => {
        const status = update.expires_at ? 
            `Expires <t:${Math.floor(new Date(update.expires_at).getTime() / 1000)}:R>` : 
            'No expiration';

        embed.addFields({
            name: `#${update.id} - ${update.title} [${update.priority.toUpperCase()}]`,
            value: `${update.content}\n**By:** ${update.author_name} | ${status}`,
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

async function handleRemoveUpdate(message, args, db) {
    if (args.length === 0) {
        return message.reply('❌ Please provide an update ID to remove. Usage: `!updates remove <id>`');
    }

    const updateId = parseInt(args[0]);
    if (isNaN(updateId)) {
        return message.reply('❌ Please provide a valid numeric update ID.');
    }

    const [result] = await db.query(
        'UPDATE site_updates SET is_active = FALSE WHERE id = ?',
        [updateId]
    );

    if (result.affectedRows === 0) {
        return message.reply('❌ Update not found or already removed.');
    }

    await message.reply(`✅ Update #${updateId} has been removed.`);
}

async function handleClearExpired(message, db) {
    const [result] = await db.query(
        'UPDATE site_updates SET is_active = FALSE WHERE expires_at < NOW() AND is_active = TRUE'
    );

    await message.reply(`✅ Cleared ${result.affectedRows} expired updates.`);
}

async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setTitle('📢 Updates Command Help')
        .setColor(0x0099FF)
        .setDescription('Manage the site updates banner that appears on the website.')
        .addFields(
            {
                name: 'Add Update',
                value: '`!updates add "Title" | "Content" | [expires] | [priority]`\nAdd a new site update with optional expiration and priority.',
                inline: false
            },
            {
                name: 'List Updates',
                value: '`!updates list`\nShow all active updates.',
                inline: false
            },
            {
                name: 'Remove Update',
                value: '`!updates remove <id>`\nRemove a specific update by ID.',
                inline: false
            },
            {
                name: 'Clear Expired',
                value: '`!updates clear-expired`\nRemove all expired updates.',
                inline: false
            },
            {
                name: 'Expiration Formats',
                value: '`24h` (24 hours)\n`7d` (7 days)\n`30d` (30 days)\n`never` (no expiration)',
                inline: true
            },
            {
                name: 'Priority Levels',
                value: '`low` `medium` `high` `critical`',
                inline: true
            },
            {
                name: 'Examples',
                value: '`!updates add "Maintenance" | "Server down Friday" | 24h | high`\n`!updates add "News" | "New feature live!" | 7d`\n`!updates remove 5`',
                inline: false
            }
        )
        .setFooter({ text: 'Requires: High Council, Command, Officer, Leader, Chamberlain, or BlightVeil Envoy role' });

    await message.reply({ embeds: [embed] });
}