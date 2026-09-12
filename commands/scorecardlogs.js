const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const { connectToMySQL } = require('../db');
const { Parser } = require('json2csv');

module.exports = {
    name: 'scorecardlogs',
    description: 'Export scorecard data to CSV or view logs',
    async execute(message, args) {
        try {
            // Auto-delete the command message
            await message.delete().catch(console.error);

            // Check permissions - only allowed roles can view logs
            const ALLOWED_LOGS_ROLES = [
                '1308081895266844712', // Infantry Overseer
                '1308081615083278378', // Pilot Overseer
                '1308081958424940545', // Crewman Overseer
                '1308082015622664262', // Support Overseer
                '1168327592269598760', // Infantry Instructor
                '1168327555917557780', // Pilot Instructor
                '1168327699203375114', // Crewman Instructor
                '1168327804874661931', // Support Instructor
            ];

            if (!message.member.roles.cache.some(role => ALLOWED_LOGS_ROLES.includes(role.id))) {
                const reply = await message.channel.send('❌ You do not have permission to view scorecard logs.');
                setTimeout(() => reply.delete(), 5000);
                return;
            }

            // Show help if no arguments or help requested
            if (args.length === 0 || args[0].toLowerCase() === 'help') {
                return this.showHelp(message);
            }

            // Handle export command
            if (args[0].toLowerCase() === 'export') {
                return this.handleExport(message, args.slice(1));
            }

            // Default: show interactive logs
            await this.showScorecardLogs(message);

        } catch (error) {
            console.error('Error handling scorecard logs command:', error);
            const reply = await message.channel.send('❌ An error occurred while fetching scorecard logs.');
            setTimeout(() => reply.delete(), 5000);
        }
    },

    async showHelp(message) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Scorecard Logs Command')
            .setDescription('Export scorecard data to CSV or browse logs')
            .setColor(0x0099FF)
            .addFields(
                {
                    name: '📋 Export Commands',
                    value: [
                        '**Export all data:**',
                        '`!scorecardlogs export` - Export everything',
                        '`!scorecardlogs export current` - Only current scorecards',
                        '`!scorecardlogs export history` - Only historical records',
                        '',
                        '**Export specific user:**',
                        '`!scorecardlogs export <user_id>` - Export user\'s data',
                        '`!scorecardlogs export <user_id> current` - User\'s current only',
                        '`!scorecardlogs export <user_id> history` - User\'s history only',
                        '',
                        '**View logs:**',
                        '`!scorecardlogs` - Browse interactively'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📝 Examples',
                    value: [
                        '`!scorecardlogs export` - All data',
                        '`!scorecardlogs export current` - Current scorecards only',
                        '`!scorecardlogs export 123456789012345678` - All user data',
                        '`!scorecardlogs export 123456789012345678 history` - User\'s history'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: 'Files are downloaded as CSV attachments' })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    },

    async handleExport(message, args) {
        let userId = null;
        let dataType = 'both';
        
        if (args.length === 0) {
            userId = null;
            dataType = 'both';
        } else if (args.length === 1) {
            if (['current', 'history', 'both'].includes(args[0].toLowerCase())) {
                userId = null;
                dataType = args[0].toLowerCase();
            } else {
                userId = args[0];
                dataType = 'both';
            }
        } else if (args.length >= 2) {
            userId = args[0];
            dataType = args[1].toLowerCase();
            
            if (!['current', 'history', 'both'].includes(dataType)) {
                dataType = 'both';
            }
        }
        
        if (userId) {
            await this.exportUserCSV(message, userId, dataType);
        } else {
            await this.exportAllCSV(message, dataType);
        }
    },

    async exportUserCSV(message, userId, dataType = 'both') {
        try {
            const pool = await connectToMySQL();
            
            const results = await this.fetchUserData(pool, userId, dataType);
            
            if (results.current.length === 0 && results.history.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📊 No Data Found')
                    .setDescription(`No ${dataType === 'both' ? 'scorecard data' : dataType + ' records'} found for user \`${userId}\`.`)
                    .setColor(0xFFA500)
                    .setTimestamp();
                return message.channel.send({ embeds: [embed] });
            }

            const { csvData, fields } = this.prepareCSVData(results, dataType, userId);
            const fileName = `scorecards_${userId}_${dataType}_${new Date().toISOString().split('T')[0]}.csv`;
            
            const attachment = this.createCSVAttachment(csvData, fields, fileName);
            await this.sendExportResult(message, userId, results, dataType, attachment, true);

        } catch (error) {
            console.error('Error exporting user CSV:', error);
            await message.channel.send(`❌ Error exporting data for user \`${userId}\`.`);
        }
    },

    async exportAllCSV(message, dataType = 'both') {
        try {
            const pool = await connectToMySQL();
            
            const results = await this.fetchAllData(pool, dataType);
            
            if (results.current.length === 0 && results.history.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📊 No Data Found')
                    .setDescription(`No ${dataType === 'both' ? 'data' : dataType + ' records'} found in database.`)
                    .setColor(0xFFA500)
                    .setTimestamp();
                return message.channel.send({ embeds: [embed] });
            }

            const { csvData, fields } = this.prepareCSVData(results, dataType);
            const fileName = `scorecards_all_${dataType}_${new Date().toISOString().split('T')[0]}.csv`;
            
            const attachment = this.createCSVAttachment(csvData, fields, fileName);
            await this.sendExportResult(message, null, results, dataType, attachment, false);

        } catch (error) {
            console.error('Error exporting all CSV:', error);
            await message.channel.send('❌ Error exporting data.');
        }
    },

    async fetchUserData(pool, userId, dataType) {
        const results = { current: [], history: [] };
        
        if (dataType === 'both' || dataType === 'current') {
            const [currentRows] = await pool.execute(
                'SELECT * FROM scorecards WHERE user_id = ? ORDER BY updated_at DESC',
                [userId]
            );
            results.current = currentRows;
        }
        
        if (dataType === 'both' || dataType === 'history') {
            const [historyRows] = await pool.execute(
                'SELECT * FROM scorecard_history WHERE user_id = ? ORDER BY created_at DESC',
                [userId]
            );
            results.history = historyRows;
        }
        
        return results;
    },

    async fetchAllData(pool, dataType) {
        const results = { current: [], history: [] };
        
        if (dataType === 'both' || dataType === 'current') {
            const [currentRows] = await pool.execute(
                'SELECT * FROM scorecards ORDER BY updated_at DESC'
            );
            results.current = currentRows;
        }
        
        if (dataType === 'both' || dataType === 'history') {
            const [historyRows] = await pool.execute(
                'SELECT * FROM scorecard_history ORDER BY created_at DESC'
            );
            results.history = historyRows;
        }
        
        return results;
    },

    prepareCSVData(results, dataType, userId = null) {
        let csvData = [];
        let fields = [];
        
        if (dataType === 'both') {
            // Format current scorecards
            const currentWithType = results.current.map(row => this.formatScorecardRow(row, 'CURRENT'));
            const historyWithType = results.history.map(row => this.formatScorecardRow(row, 'HISTORICAL', true));
            csvData = [...currentWithType, ...historyWithType];
            
            fields = [
                { label: 'Record Type', value: 'record_type' },
                { label: 'Scorecard ID', value: 'scorecard_id' },
                { label: 'User ID', value: 'user_id' },
                { label: 'Tag', value: 'tag' },
                { label: 'Date', value: 'date' },
                { label: 'Version', value: 'version' },
                { label: 'Aim Snap', value: 'aim_snap' },
                { label: 'Aim Tracking', value: 'aim_tracking' },
                { label: 'Aim Accuracy', value: 'aim_accuracy' },
                { label: 'Aim Average', value: 'aim_avg' },
                { label: 'Teamplay', value: 'teamplay' },
                { label: 'Communication', value: 'comms' },
                { label: 'Strategy', value: 'strategy' },
                { label: 'Resource Management', value: 'resource_management' },
                { label: 'Game Knowledge', value: 'game_knowledge' },
                { label: 'Leadership', value: 'leadership' },
                { label: 'Mindset & Growth', value: 'mindset_growth' },
                { label: 'Created By', value: 'created_by' },
                { label: 'Created At', value: 'created_at' },
                { label: 'Updated At', value: 'updated_at' }
            ];
        } else if (dataType === 'current') {
            csvData = results.current.map(row => this.formatScorecardRow(row, 'CURRENT'));
            fields = [
                { label: 'Scorecard ID', value: 'scorecard_id' },
                { label: 'User ID', value: 'user_id' },
                { label: 'Tag', value: 'tag' },
                { label: 'Date', value: 'date' },
                { label: 'Version', value: 'version' },
                { label: 'Aim Snap', value: 'aim_snap' },
                { label: 'Aim Tracking', value: 'aim_tracking' },
                { label: 'Aim Accuracy', value: 'aim_accuracy' },
                { label: 'Aim Average', value: 'aim_avg' },
                { label: 'Teamplay', value: 'teamplay' },
                { label: 'Communication', value: 'comms' },
                { label: 'Strategy', value: 'strategy' },
                { label: 'Resource Management', value: 'resource_management' },
                { label: 'Game Knowledge', value: 'game_knowledge' },
                { label: 'Leadership', value: 'leadership' },
                { label: 'Mindset & Growth', value: 'mindset_growth' },
                { label: 'Created By', value: 'created_by' },
                { label: 'Created At', value: 'created_at' },
                { label: 'Updated At', value: 'updated_at' }
            ];
        } else if (dataType === 'history') {
            csvData = results.history.map(row => this.formatScorecardRow(row, 'HISTORICAL', true));
            fields = [
                { label: 'History ID', value: 'history_id' },
                { label: 'Scorecard ID', value: 'scorecard_id' },
                { label: 'User ID', value: 'user_id' },
                { label: 'Tag', value: 'tag' },
                { label: 'Date', value: 'date' },
                { label: 'Version', value: 'version' },
                { label: 'Aim Snap', value: 'aim_snap' },
                { label: 'Aim Tracking', value: 'aim_tracking' },
                { label: 'Aim Accuracy', value: 'aim_accuracy' },
                { label: 'Aim Average', value: 'aim_avg' },
                { label: 'Teamplay', value: 'teamplay' },
                { label: 'Communication', value: 'comms' },
                { label: 'Strategy', value: 'strategy' },
                { label: 'Resource Management', value: 'resource_management' },
                { label: 'Game Knowledge', value: 'game_knowledge' },
                { label: 'Leadership', value: 'leadership' },
                { label: 'Mindset & Growth', value: 'mindset_growth' },
                { label: 'Created By', value: 'created_by' },
                { label: 'Archived At', value: 'created_at' }
            ];
        }
        
        return { csvData, fields };
    },

    formatScorecardRow(row, recordType, isHistory = false) {
        const formattedRow = {
            record_type: recordType,
            scorecard_id: row.id || row.scorecard_id || '',
            user_id: row.user_id,
            tag: row.tag,
            date: this.formatDate(isHistory ? row.created_at : row.updated_at),
            version: row.version || 1,
            aim_snap: row.aim_snap || 0,
            aim_tracking: row.aim_tracking || 0,
            aim_accuracy: row.aim_accuracy || 0,
            aim_avg: row.aim_avg || 0,
            teamplay: row.teamplay || 0,
            comms: row.comms || 0,
            strategy: row.strategy || 0,
            resource_management: row.resource_management || 0,
            game_knowledge: row.game_knowledge || 0,
            leadership: row.leadership || '',
            mindset_growth: row.mindset_growth || '',
            created_by: row.created_by,
            created_at: this.formatDate(row.created_at),
            updated_at: isHistory ? '' : this.formatDate(row.updated_at)
        };

        // Add history-specific fields
        if (isHistory) {
            formattedRow.history_id = row.id;
            formattedRow.scorecard_id = row.scorecard_id;
            // Remove the extra id field that was used for history_id
            delete formattedRow.id;
        }

        return formattedRow;
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    createCSVAttachment(csvData, fields, fileName) {
        // Extract just the values for the parser
        const fieldValues = fields.map(f => f.value);
        const parser = new Parser({ 
            fields: fieldValues,
            header: true,
            withBOM: true // For better Excel compatibility
        });
        
        const csv = parser.parse(csvData);
        
        // Add a header comment with field descriptions
        const fieldDescriptions = fields.map(f => `# ${f.label}: ${f.value}`).join('\n');
        const csvWithHeader = `# Scorecard Data Export\n# Generated: ${new Date().toLocaleDateString()}\n${fieldDescriptions}\n\n${csv}`;
        
        const buffer = Buffer.from(csvWithHeader, 'utf-8');
        
        return new AttachmentBuilder(buffer, { name: fileName });
    },

    async sendExportResult(message, userId, results, dataType, attachment, isUserExport) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Scorecard Export Complete')
            .setColor(0x00FF00)
            .setTimestamp();
        
        if (isUserExport) {
            embed.setDescription(`Exported data for user \`${userId}\``);
            
            const fields = [];
            if (dataType === 'both' || dataType === 'current') {
                fields.push({ name: 'Current Scorecards', value: results.current.length.toString(), inline: true });
            }
            if (dataType === 'both' || dataType === 'history') {
                fields.push({ name: 'Historical Records', value: results.history.length.toString(), inline: true });
            }
            fields.push({ name: 'Data Type', value: dataType.toUpperCase(), inline: true });
            
            embed.addFields(fields);
        } else {
            embed.setDescription('Exported all scorecard data');
            
            const fields = [];
            if (dataType === 'both' || dataType === 'current') {
                fields.push({ name: 'Current Scorecards', value: results.current.length.toString(), inline: true });
            }
            if (dataType === 'both' || dataType === 'history') {
                fields.push({ name: 'Historical Records', value: results.history.length.toString(), inline: true });
            }
            if (dataType === 'both') {
                fields.push({ name: 'Total Records', value: (results.current.length + results.history.length).toString(), inline: true });
            }
            
            embed.addFields(fields);
        }
        
        embed.addFields({
            name: '📁 File',
            value: attachment.name,
            inline: false
        }, {
            name: '📋 Format',
            value: 'CSV with labeled headers and formatted dates',
            inline: false
        });
        
        await message.channel.send({ embeds: [embed], files: [attachment] });
    },

    async showScorecardLogs(message) {
        try {
            const pool = await connectToMySQL();
            
            // Get counts for both tables
            const [currentRows] = await pool.execute('SELECT COUNT(*) as count FROM scorecards');
            const [historyRows] = await pool.execute('SELECT COUNT(*) as count FROM scorecard_history');
            
            const currentCount = currentRows[0].count;
            const historyCount = historyRows[0].count;

            const overviewEmbed = new EmbedBuilder()
                .setTitle('📊 Scorecard Logs')
                .setDescription(`**Database Statistics:**\n• Current Scorecards: **${currentCount}**\n• Historical Records: **${historyCount}**\n• Total Records: **${currentCount + historyCount}**`)
                .setColor(0x0099FF)
                .addFields(
                    { 
                        name: '📋 Quick Export', 
                        value: 'Use `!scorecardlogs export` to download all data as CSV',
                        inline: false 
                    },
                    {
                        name: '📝 More Options',
                        value: 'Type `!scorecardlogs help` for full command list',
                        inline: false
                    }
                )
                .setFooter({ text: 'Select a user below to view their scorecards' })
                .setTimestamp();

            const [currentScorecards] = await pool.execute(`
                SELECT * FROM scorecards 
                ORDER BY updated_at DESC
            `);

            if (currentScorecards.length === 0) {
                await message.channel.send({ 
                    embeds: [overviewEmbed],
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            const usersScorecards = {};
            currentScorecards.forEach(scorecard => {
                if (!usersScorecards[scorecard.user_id]) {
                    usersScorecards[scorecard.user_id] = [];
                }
                usersScorecards[scorecard.user_id].push(scorecard);
            });

            const userOptions = Object.keys(usersScorecards).map((userId, index) => {
                const userScorecards = usersScorecards[userId];
                const latestScorecard = userScorecards[0];
                const scorecardCount = userScorecards.length;
                
                return {
                    label: `${userId.substring(0, 15)}${userId.length > 15 ? '...' : ''}`,
                    description: `${scorecardCount} scorecard${scorecardCount > 1 ? 's' : ''} • Last: ${latestScorecard.tag}`,
                    value: `logs_user_${userId}`
                };
            });

            if (userOptions.length > 25) {
                await this.sendPaginatedLogs(message, usersScorecards, currentScorecards);
                return;
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_scorecard_logs_user')
                .setPlaceholder('Select a user to view their scorecards...')
                .addOptions(userOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await message.channel.send({ 
                embeds: [overviewEmbed], 
                components: [row],
                flags: MessageFlags.Ephemeral 
            });

        } catch (error) {
            console.error('Error fetching scorecard logs:', error);
            await message.channel.send('❌ An error occurred while fetching scorecard logs.');
        }
    },

    async sendPaginatedLogs(message, usersScorecards, allScorecards) {
        const userKeys = Object.keys(usersScorecards);
        const pages = Math.ceil(userKeys.length / 25);
        
        for (let page = 0; page < pages; page++) {
            const startIdx = page * 25;
            const endIdx = startIdx + 25;
            const pageUsers = userKeys.slice(startIdx, endIdx);

            const embed = new EmbedBuilder()
                .setTitle(`📊 Scorecard Logs - Page ${page + 1}/${pages}`)
                .setDescription(`Showing users ${startIdx + 1}-${Math.min(endIdx, userKeys.length)} of ${userKeys.length}`)
                .setColor(0x0099FF)
                .setFooter({ text: `Total: ${allScorecards.length} current scorecards across ${userKeys.length} users` })
                .setTimestamp();

            const userOptions = pageUsers.map(userId => {
                const userScorecards = usersScorecards[userId];
                const scorecardCount = userScorecards.length;
                const tags = [...new Set(userScorecards.map(sc => sc.tag))].join(', ');
                
                return {
                    label: `${userId.substring(0, 20)}${userId.length > 20 ? '...' : ''}`,
                    description: `${scorecardCount} scorecards • ${tags}`,
                    value: `logs_user_${userId}_page_${page}`
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_scorecard_logs_page_${page}`)
                .setPlaceholder(`Select a user (Page ${page + 1}/${pages})...`)
                .addOptions(userOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await message.channel.send({ 
                embeds: [embed], 
                components: [row],
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    async handleUserLogsSelection(interaction) {
        try {
            const selectedValue = interaction.values[0];
            const userId = selectedValue.replace('logs_user_', '').split('_page_')[0];
            
            const pool = await connectToMySQL();
            const [rows] = await pool.execute(
                'SELECT * FROM scorecards WHERE user_id = ? ORDER BY updated_at DESC',
                [userId]
            );

            if (rows.length === 0) {
                await interaction.reply({ 
                    content: '❌ No scorecards found for this user.', 
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            const [historyRows] = await pool.execute(
                'SELECT COUNT(*) as count FROM scorecard_history WHERE user_id = ?',
                [userId]
            );
            const historyCount = historyRows[0].count;

            const userEmbed = new EmbedBuilder()
                .setTitle(`📊 Scorecard Details: ${userId}`)
                .setDescription(`**Current Scorecards:** ${rows.length}\n**Historical Records:** ${historyCount}\n\nUse export buttons below to get full data`)
                .setColor(0x00FF00)
                .setFooter({ text: `User ID: ${userId}` })
                .setTimestamp();

            rows.slice(0, 5).forEach((scorecard, index) => {
                userEmbed.addFields({
                    name: `${scorecard.tag} Scorecard v${scorecard.version || 1} (${new Date(scorecard.updated_at).toLocaleDateString()})`,
                    value: this.formatScorecardDetails(scorecard),
                    inline: false
                });
            });

            if (rows.length > 5) {
                userEmbed.addFields({
                    name: 'ℹ️ Note',
                    value: `Showing 5 of ${rows.length} current scorecards. Use export buttons to see all.`,
                    inline: false
                });
            }

            const currentExportButton = new ButtonBuilder()
                .setCustomId(`export_current_${userId}`)
                .setLabel('Export Current')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋');

            const historyExportButton = new ButtonBuilder()
                .setCustomId(`export_history_${userId}`)
                .setLabel('Export History')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📜');

            const bothExportButton = new ButtonBuilder()
                .setCustomId(`export_both_${userId}`)
                .setLabel('Export Both')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💾');

            const row = new ActionRowBuilder().addComponents(currentExportButton, historyExportButton, bothExportButton);

            await interaction.reply({ 
                embeds: [userEmbed], 
                components: [row],
                flags: MessageFlags.Ephemeral 
            });

        } catch (error) {
            console.error('Error handling user logs selection:', error);
            await interaction.reply({ 
                content: '❌ An error occurred while fetching user scorecards.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    formatScorecardDetails(scorecard) {
        return [
            `**Aim Skills:** ${scorecard.aim_snap}/${scorecard.aim_tracking}/${scorecard.aim_accuracy}`,
            `**Avg Aim:** ${scorecard.aim_avg}/10`,
            `**Team/Comms:** ${scorecard.teamplay}/${scorecard.comms}`,
            `**Strategy/Resource:** ${scorecard.strategy}/${scorecard.resource_management}`,
            `**Game Knowledge:** ${scorecard.game_knowledge}/10`,
            `**Leadership:** ${scorecard.leadership || 'N/A'}/10`,
            `**Mindset & Growth:** ${scorecard.mindset_growth || 'N/A'}/10`,
            `**Created by:** ${scorecard.created_by}`,
            `**Last updated:** <t:${Math.floor(new Date(scorecard.updated_at).getTime() / 1000)}:R>`
        ].join('\n');
    },

    async handleExportLogs(interaction) {
        try {
            const customId = interaction.customId;
            const userId = customId.replace('export_current_', '').replace('export_history_', '').replace('export_both_', '');
            const exportType = customId.includes('export_current_') ? 'current' : 
                             customId.includes('export_history_') ? 'history' : 'both';
            
            const pool = await connectToMySQL();
            
            let data = [];
            let title = '';

            if (exportType === 'current' || exportType === 'both') {
                const [currentRows] = await pool.execute(
                    'SELECT * FROM scorecards WHERE user_id = ? ORDER BY updated_at DESC',
                    [userId]
                );
                if (exportType === 'current') {
                    data = currentRows;
                    title = `Current Scorecards for ${userId}`;
                } else {
                    data = currentRows;
                }
            }

            if (exportType === 'history' || exportType === 'both') {
                const [historyRows] = await pool.execute(
                    'SELECT * FROM scorecard_history WHERE user_id = ? ORDER BY created_at DESC',
                    [userId]
                );
                if (exportType === 'history') {
                    data = historyRows;
                    title = `Historical Scorecards for ${userId}`;
                } else if (exportType === 'both') {
                    const currentWithType = data.map(row => this.formatScorecardRow(row, 'CURRENT'));
                    const historyWithType = historyRows.map(row => this.formatScorecardRow(row, 'HISTORICAL', true));
                    data = [...currentWithType, ...historyWithType];
                    title = `All Scorecard Data for ${userId}`;
                }
            }

            if (data.length === 0) {
                await interaction.reply({ 
                    content: `❌ No ${exportType} scorecards found for this user.`, 
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            // For larger exports, send as CSV file instead of text
            if (data.length > 10) {
                // Determine fields based on data type
                let fields = [];
                if (exportType === 'both') {
                    fields = [
                        { label: 'Record Type', value: 'record_type' },
                        { label: 'Scorecard ID', value: 'scorecard_id' },
                        { label: 'User ID', value: 'user_id' },
                        { label: 'Tag', value: 'tag' },
                        { label: 'Date', value: 'date' },
                        { label: 'Version', value: 'version' },
                        { label: 'Aim Snap', value: 'aim_snap' },
                        { label: 'Aim Tracking', value: 'aim_tracking' },
                        { label: 'Aim Accuracy', value: 'aim_accuracy' },
                        { label: 'Aim Average', value: 'aim_avg' },
                        { label: 'Teamplay', value: 'teamplay' },
                        { label: 'Communication', value: 'comms' },
                        { label: 'Strategy', value: 'strategy' },
                        { label: 'Resource Management', value: 'resource_management' },
                        { label: 'Game Knowledge', value: 'game_knowledge' },
                        { label: 'Leadership', value: 'leadership' },
                        { label: 'Mindset & Growth', value: 'mindset_growth' },
                        { label: 'Created By', value: 'created_by' }
                    ];
                } else if (exportType === 'current') {
                    fields = [
                        { label: 'Scorecard ID', value: 'scorecard_id' },
                        { label: 'User ID', value: 'user_id' },
                        { label: 'Tag', value: 'tag' },
                        { label: 'Date', value: 'date' },
                        { label: 'Version', value: 'version' },
                        { label: 'Aim Snap', value: 'aim_snap' },
                        { label: 'Aim Tracking', value: 'aim_tracking' },
                        { label: 'Aim Accuracy', value: 'aim_accuracy' },
                        { label: 'Aim Average', value: 'aim_avg' },
                        { label: 'Teamplay', value: 'teamplay' },
                        { label: 'Communication', value: 'comms' },
                        { label: 'Strategy', value: 'strategy' },
                        { label: 'Resource Management', value: 'resource_management' },
                        { label: 'Game Knowledge', value: 'game_knowledge' },
                        { label: 'Leadership', value: 'leadership' },
                        { label: 'Mindset & Growth', value: 'mindset_growth' },
                        { label: 'Created By', value: 'created_by' },
                        { label: 'Created At', value: 'created_at' },
                        { label: 'Updated At', value: 'updated_at' }
                    ];
                } else if (exportType === 'history') {
                    fields = [
                        { label: 'History ID', value: 'history_id' },
                        { label: 'Scorecard ID', value: 'scorecard_id' },
                        { label: 'User ID', value: 'user_id' },
                        { label: 'Tag', value: 'tag' },
                        { label: 'Date', value: 'date' },
                        { label: 'Version', value: 'version' },
                        { label: 'Aim Snap', value: 'aim_snap' },
                        { label: 'Aim Tracking', value: 'aim_tracking' },
                        { label: 'Aim Accuracy', value: 'aim_accuracy' },
                        { label: 'Aim Average', value: 'aim_avg' },
                        { label: 'Teamplay', value: 'teamplay' },
                        { label: 'Communication', value: 'comms' },
                        { label: 'Strategy', value: 'strategy' },
                        { label: 'Resource Management', value: 'resource_management' },
                        { label: 'Game Knowledge', value: 'game_knowledge' },
                        { label: 'Leadership', value: 'leadership' },
                        { label: 'Mindset & Growth', value: 'mindset_growth' },
                        { label: 'Created By', value: 'created_by' },
                        { label: 'Archived At', value: 'created_at' }
                    ];
                }
                
                const fieldValues = fields.map(f => f.value);
                const parser = new Parser({ 
                    fields: fieldValues,
                    header: true,
                    withBOM: true
                });
                const csv = parser.parse(data);
                
                // Add header comment
                const fieldDescriptions = fields.map(f => `# ${f.label}: ${f.value}`).join('\n');
                const csvWithHeader = `# Scorecard Data Export\n# Generated: ${new Date().toLocaleDateString()}\n# User: ${userId}\n${fieldDescriptions}\n\n${csv}`;
                
                const buffer = Buffer.from(csvWithHeader, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { 
                    name: `scorecards_${exportType}_${userId}_${new Date().toISOString().split('T')[0]}.csv`
                });

                await interaction.reply({ 
                    content: `📊 Exported **${data.length}** ${exportType} scorecard records for ${userId}`,
                    files: [attachment],
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            // For small exports, send as formatted text
            const exportData = data.map(record => {
                const isHistorical = exportType === 'history' || record.record_type === 'HISTORICAL';
                const prefix = isHistorical ? '[HISTORY]' : '[CURRENT]';
                const date = this.formatDate(record.updated_at || record.created_at);
                
                return `${prefix} ${record.tag} (${date}): ` +
                    `Aim:${record.aim_snap}/${record.aim_tracking}/${record.aim_accuracy} ` +
                    `(Avg:${record.aim_avg}) ` +
                    `Team:${record.teamplay} Comms:${record.comms} ` +
                    `Strategy:${record.strategy} Resource:${record.resource_management} ` +
                    `Knowledge:${record.game_knowledge} ` +
                    `Leadership:${record.leadership || 'N/A'} ` +
                    `Mindset:${record.mindset_growth || 'N/A'} ` +
                    `By:<@${record.created_by}>` +
                    (record.version ? ` v${record.version}` : '');
            }).join('\n');

            await interaction.reply({ 
                content: `**${title}:**\n\`\`\`\n${exportData}\n\`\`\``,
                flags: MessageFlags.Ephemeral 
            });

        } catch (error) {
            console.error('Error exporting logs:', error);
            await interaction.reply({ 
                content: '❌ An error occurred while exporting scorecard data.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    splitMessage(text, maxLength) {
        const chunks = [];
        while (text.length > maxLength) {
            let chunk = text.substring(0, maxLength);
            const lastNewline = chunk.lastIndexOf('\n');
            if (lastNewline > maxLength * 0.8) {
                chunk = chunk.substring(0, lastNewline);
            }
            chunks.push(chunk);
            text = text.substring(chunk.length);
        }
        if (text.length > 0) {
            chunks.push(text);
        }
        return chunks;
    }
};