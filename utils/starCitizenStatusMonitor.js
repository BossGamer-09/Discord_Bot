// Debug mode - set DEBUG_MODE=true in .env to enable debug logging
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// utils/starCitizenStatusMonitor.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { connectToMySQL } = require('../db');
const axios = require('axios');
const { parseString } = require('xml2js');

function consoleLog(message) {
  const timestamp = new Date().toISOString(); 
  const logLine = `[${timestamp}] ${message}`;
  try {
    console.log(logLine);
  } catch (err) {
    console.error('Failed to write to console:', err);
  }
}

function debugLog(message) {
  if (DEBUG_MODE) {
    const timestamp = new Date().toISOString();
    const debugLine = `[DEBUG][${timestamp}] ${message}`;
    try {
      console.log(debugLine);
    } catch (err) {
      console.error('Failed to write debug log:', err);
    }
  }
}

class StarCitizenStatusMonitor {
    constructor(client) {
        this.client = client;
        this.statusChannelId = '1446004409107742861'; // Main status embed channel ONLY
        
        // Configuration
        this.RSS_URL = 'https://status.robertsspaceindustries.com/index.xml';
        this.STATUS_API_URL = 'https://status.robertsspaceindustries.com/index.json';
        this.POLL_INTERVAL = 60 * 1000; // 1 minute for status checks
        this.CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour for cleanup
        this.recentlyProcessedIssues = new Set();
        this.PROCESS_COOLDOWN = 5 * 60 * 1000; // 5 minutes
        this.recentlyNotifiedIncidents = new Map(); // guid -> timestamp
        
        // Current state
        this.currentIncidents = [];
        this.lastStatusMessageId = null;
        this.lastFetchTime = null;
        this.isFirstRun = true;
        
        // Status translation (from Python)
        this.STATUS_TRANS = {
            'operational': { emoji: '🟢', name: 'Operational' },
            'degraded': { emoji: '🟣', name: 'Degraded' },
            'maintenance': { emoji: '🛠️', name: 'Maintenance' },
            'partial': { emoji: '🟠', name: 'Partial Disruption' },
            'major': { emoji: '🔴', name: 'Major Disruption' },
            'issues': { emoji: '🟡', name: 'Issues' },
            '_other': { emoji: '❓', name: 'Other' }
        };
        
        // Service status tracking
        this.serviceStatus = {};
        this.lastStatusSuffix = '';
        
        // Database initialization
        this.initializeDatabase();
    }

    async initialize() {
        consoleLog('[SC STATUS] Star Citizen Status Monitor initialized');
        debugLog('DEBUG MODE ENABLED - Verbose logging active');
        
        // Load saved message ID from database
        await this.loadMessageId();
        
        // Initial fetch and post
        setTimeout(async () => {
            await this.fetchAndUpdateStatus();
        }, 2000);
        
        this.startMonitoring();
        
        // Start comprehensive cleanup intervals
        this.startCleanupIntervals();
    }

    /**
     * Initialize database tables with migration support
     */
    async initializeDatabase() {
        try {
            const db = await connectToMySQL();
            
            // Create RSIIssue table (similar to Python model)
            await db.query(`
                CREATE TABLE IF NOT EXISTS rsi_issues (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    filename VARCHAR(255) UNIQUE,
                    discord_id BIGINT UNIQUE,
                    title TEXT,
                    affected JSON,
                    resolved_at DATETIME,
                    created_at DATETIME,
                    lastmod_at DATETIME,
                    informational BOOLEAN DEFAULT FALSE,
                    resolved BOOLEAN DEFAULT FALSE,
                    severity VARCHAR(50),
                    permalink TEXT,
                    kind VARCHAR(50),
                    markdown_content LONGTEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            
            // Create sc_status_messages table
            await db.query(`
                CREATE TABLE IF NOT EXISTS sc_status_messages (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    message_id VARCHAR(255) UNIQUE,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            
            // Create subscription table
            await db.query(`
                CREATE TABLE IF NOT EXISTS sc_status_subscriptions (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    discord_user_id VARCHAR(255) NOT NULL,
                    dm_message_id VARCHAR(255) NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_notified TIMESTAMP NULL,
                    UNIQUE KEY unique_subscription (discord_user_id, dm_message_id)
                )
            `);
            
            // Create/update table for tracking DM messages to users
            await this.setupDMMessagesTable(db);
            
            debugLog('Database tables initialized');
        } catch (error) {
            console.error('[SC STATUS] Error initializing database:', error);
        }
    }

    /**
     * Setup DM messages table with migration support
     */
    async setupDMMessagesTable(db) {
        try {
            // First, check if table exists
            const [tableExists] = await db.query(`
                SHOW TABLES LIKE 'sc_status_dm_messages'
            `);
            
            if (tableExists.length === 0) {
                // Create new table with all columns
                await db.query(`
                    CREATE TABLE sc_status_dm_messages (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        discord_user_id VARCHAR(255) NOT NULL,
                        dm_message_id VARCHAR(255) NOT NULL,
                        incident_guid VARCHAR(255),
                        incident_title TEXT,
                        message_type ENUM('confirmation', 'update', 'unsubscribe') NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_user_messages (discord_user_id, message_type),
                        INDEX idx_incident_guid (incident_guid),
                        INDEX idx_created_at (created_at)
                    )
                `);
                debugLog('Created new sc_status_dm_messages table');
            } else {
                // Check if incident_guid column exists
                const [columns] = await db.query(`
                    SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
                `);
                
                if (columns.length === 0) {
                    // Add incident_guid column
                    await db.query(`
                        ALTER TABLE sc_status_dm_messages 
                        ADD COLUMN incident_guid VARCHAR(255) AFTER dm_message_id,
                        ADD COLUMN incident_title TEXT AFTER incident_guid,
                        ADD INDEX idx_incident_guid (incident_guid)
                    `);
                    debugLog('Added incident_guid and incident_title columns to sc_status_dm_messages');
                }
                
                // Check if incident_title column exists
                const [titleColumns] = await db.query(`
                    SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_title'
                `);
                
                if (titleColumns.length === 0) {
                    // Add incident_title column
                    await db.query(`
                        ALTER TABLE sc_status_dm_messages 
                        ADD COLUMN incident_title TEXT AFTER incident_guid
                    `);
                    debugLog('Added incident_title column to sc_status_dm_messages');
                }
            }
        } catch (error) {
            console.error('[SC STATUS] Error setting up DM messages table:', error);
        }
    }

    /**
     * Fetch JSON status data from RSI API
     */
    async fetchStatusJSON() {
        try {
            debugLog('Fetching JSON status from RSI...');
            
            const response = await axios.get(this.STATUS_API_URL, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            debugLog(`JSON response received: ${response.data?.systems?.length || 0} systems`);
            return response.data;
        } catch (error) {
            consoleLog(`[SC STATUS] Error fetching JSON status: ${error.message}`);
            return null;
        }
    }

    /**
     * Parse RSS feed from RSI status page
     */
    async fetchRSSFeed() {
        try {
            debugLog('Fetching RSS feed from RSI...');
            
            const response = await axios.get(this.RSS_URL, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            debugLog(`RSS feed received: ${response.data.length} bytes`);
            
            return new Promise((resolve, reject) => {
                parseString(response.data, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
            
        } catch (error) {
            consoleLog(`[SC STATUS] Error fetching RSS feed: ${error.message}`);
            return null;
        }
    }

    /**
     * Fetch HTML content for issue details
     */
    async fetchIssueHTML(permalink) {
        try {
            debugLog(`Fetching issue HTML from: ${permalink}`);
            const response = await axios.get(permalink, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            debugLog(`Issue HTML received: ${response.data.length} bytes`);
            return response.data;
        } catch (error) {
            consoleLog(`[SC STATUS] Error fetching issue HTML: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract markdown content from HTML
     */
    extractMarkdownFromHTML(html) {
        if (!html) return '';
        
        // Try to extract meaningful content first
        const meaningful = this.extractMeaningfulContent(html);
        
        // If we got good content, use it
        if (meaningful && meaningful.length > 50 && meaningful !== 'No detailed description available.') {
            debugLog(`Extracted ${meaningful.length} chars of meaningful content`);
            return meaningful.substring(0, 1500); // Limit to Discord embed limits
        }
        
        // Fallback to simple extraction
        const extracted = html
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .substring(0, 1500) // Limit length
            .trim();
            
        debugLog(`Fallback extraction: ${extracted.length} chars`);
        return extracted;
    }

    /**
     * Parse datetime from API field
     */
    parseDateTime(dateString) {
        if (!dateString || dateString.toLowerCase() === '<no value>') {
            return null;
        }

        const formats = [
            "YYYY-MM-DD HH:mm:ss Z",
            "YYYY-MM-DD HH:mm:ss",
            "YYYY-MM-DD HH:mm:ss.SSS",
            "YYYY-MM-DD HH:mm"
        ];

        for (const format of formats) {
            try {
                // Simple parsing (you might want to use moment.js or similar)
                const parts = dateString.split(' ');
                if (parts.length >= 2) {
                    const datePart = parts[0];
                    const timePart = parts[1];
                    const datetimeStr = `${datePart}T${timePart}Z`;
                    const date = new Date(datetimeStr);
                    if (!isNaN(date.getTime())) {
                        debugLog(`Parsed date: ${dateString} -> ${date}`);
                        return date;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        debugLog(`Failed to parse date: ${dateString}`);
        return null;
    }

    /**
     * Update channel name with status emojis
     */
    async updateChannelName(statusData) {
        try {
            const channel = this.client.channels.cache.get(this.statusChannelId);
            if (!channel) {
                consoleLog('[SC STATUS] Status channel not found');
                return;
            }

            // Get status suffix from systems
            const suffix = statusData.systems
                .map(system => {
                    const trans = this.STATUS_TRANS[system.status] || this.STATUS_TRANS['_other'];
                    return trans.emoji;
                })
                .join('');

            // Only update if changed
            if (this.lastStatusSuffix !== suffix) {
                const newName = `sc-status-${suffix}`;
                await channel.setName(newName);
                this.lastStatusSuffix = suffix;
                debugLog(`Updated channel name to: ${newName}`);
            }
        } catch (error) {
            consoleLog(`[SC STATUS] Error updating channel name: ${error.message}`);
        }
    }

    /**
     * Initialize and ensure all active issues have embeds in the main thread
     */
    async initializeIssuesOnStartup() {
        try {
            debugLog('Initializing issues on startup...');
            
            const jsonData = await this.fetchStatusJSON();
            if (!jsonData) {
                debugLog('No JSON data available for initialization');
                return;
            }

            const channel = this.client.channels.cache.get(this.statusChannelId);
            if (!channel) {
                consoleLog(`[SC STATUS] Status channel not found for initialization: ${this.statusChannelId}`);
                return;
            }
            
            debugLog(`Found channel: ${channel.name} (${channel.id})`);

            const db = await connectToMySQL();
            
            // Collect all open issues
            const openIssues = {};
            
            for (const system of jsonData.systems) {
                debugLog(`Processing system: ${system.name} with ${system.unresolvedIssues?.length || 0} unresolved issues`);
                
                for (const issue of system.unresolvedIssues || []) {
                    if (issue.filename && !openIssues[issue.filename]) {
                        openIssues[issue.filename] = issue;
                        debugLog(`Found open issue: ${issue.filename} - ${issue.title}`);
                    }
                }
            }

            debugLog(`Total open issues found: ${Object.keys(openIssues).length}`);

            if (Object.keys(openIssues).length === 0) {
                debugLog('No open issues to initialize');
                return;
            }

            // Process each open issue
            for (const issue of Object.values(openIssues)) {
                if (!issue.filename) continue;
                
                // Check if this issue already has an embed in the database
                const [existing] = await db.query(
                    'SELECT * FROM rsi_issues WHERE filename = ?',
                    [issue.filename]
                );

                let needsEmbed = false;
                
                if (existing.length === 0) {
                    debugLog(`Issue ${issue.filename} not in database, needs embed`);
                    needsEmbed = true;
                } else if (!existing[0].discord_id) {
                    debugLog(`Issue ${issue.filename} in database but has no discord_id, needs embed`);
                    needsEmbed = true;
                } else {
                    // Verify the embed still exists in the channel
                    try {
                        const message = await channel.messages.fetch(existing[0].discord_id);
                        debugLog(`Embed message ${existing[0].discord_id} verified to exist for ${issue.filename}`);
                    } catch (error) {
                        debugLog(`Embed message ${existing[0].discord_id} not found for ${issue.filename}, will recreate: ${error.message}`);
                        needsEmbed = true;
                    }
                }

                if (needsEmbed) {
                    debugLog(`Creating embed for issue: ${issue.title}`);
                    await this.processSingleIssue(issue, channel, db);
                } else {
                    debugLog(`Issue ${issue.filename} already has embed (ID: ${existing[0].discord_id})`);
                }
            }
            
            debugLog('Startup issue initialization complete');
        } catch (error) {
            console.error('[SC STATUS] Error initializing issues on startup:', error);
            debugLog(`Detailed error: ${error.stack}`);
        }
    }

    /**
     * Process and update issues from JSON data
     */
    async processIssues(statusData) {
        try {
            const channel = this.client.channels.cache.get(this.statusChannelId);
            if (!channel) return;

            const db = await connectToMySQL();
            
            // Collect all open issues
            const openIssues = {};
            const allCurrentFilenames = new Set();
            
            for (const system of statusData.systems) {
                debugLog(`Processing system: ${system.name} with ${system.unresolvedIssues?.length || 0} unresolved issues`);
                for (const issue of system.unresolvedIssues || []) {
                    if (issue.filename) {
                        allCurrentFilenames.add(issue.filename);
                        if (!openIssues[issue.filename]) {
                            openIssues[issue.filename] = issue;
                            debugLog(`Found issue: ${issue.filename} - ${issue.title}`);
                        }
                    }
                }
            }

            debugLog(`Total open issues: ${Object.keys(openIssues).length}`);

            // Process each open issue
            for (const issue of Object.values(openIssues)) {
                await this.processSingleIssue(issue, channel, db);
            }

            // Mark issues as resolved in database if they're no longer in the current data
            const [allDbIssues] = await db.query('SELECT filename, title FROM rsi_issues');
            for (const dbIssue of allDbIssues) {
                if (!allCurrentFilenames.has(dbIssue.filename)) {
                    debugLog(`Marking issue as resolved in database: ${dbIssue.filename}`);
                    await db.query(
                        'UPDATE rsi_issues SET resolved = TRUE, resolved_at = NOW() WHERE filename = ?',
                        [dbIssue.filename]
                    );
                }
            }

            // Process resolved issues (clean up after 1 hour)
            await this.cleanupResolvedIssues(channel, db);
            
        } catch (error) {
            consoleLog(`[SC STATUS] Error processing issues: ${error.message}`);
        }
    }

    /**
     * Check if an issue needs to be updated in the database
     */
    async needsDatabaseUpdate(issue, dbIssue) {
        if (!dbIssue) return true;
        
        // Check if resolved status changed
        if (Boolean(dbIssue.resolved) !== Boolean(issue.resolved)) {
            debugLog(`Resolved status changed: ${dbIssue.resolved} -> ${issue.resolved}`);
            return true;
        }
        
        // Check if title changed
        if (dbIssue.title !== issue.title) {
            debugLog(`Title changed: "${dbIssue.title}" -> "${issue.title}"`);
            return true;
        }
        
        // Check if severity changed
        if (dbIssue.severity !== issue.severity) {
            debugLog(`Severity changed: ${dbIssue.severity} -> ${issue.severity}`);
            return true;
        }
        
        // Check if affected services changed
        try {
            const dbAffected = dbIssue.affected ? JSON.parse(dbIssue.affected) : [];
            const newAffected = issue.affected ? JSON.parse(issue.affected) : [];
            if (JSON.stringify(dbAffected) !== JSON.stringify(newAffected)) {
                debugLog('Affected services changed');
                return true;
            }
        } catch (e) {
            // If JSON parsing fails, assume changed
            return true;
        }
        
        // Check if lastmod time is newer
        if (issue.lastmod_at && dbIssue.lastmod_at) {
            const dbLastMod = new Date(dbIssue.lastmod_at).getTime();
            const newLastMod = new Date(issue.lastmod_at).getTime();
            if (newLastMod > dbLastMod) {
                debugLog(`Last modified time is newer: ${dbLastMod} -> ${newLastMod}`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Process a single issue
     */
    async processSingleIssue(issue, channel, db) {
        try {
            // ========== REDUCED COOLDOWN OR REMOVE IT ==========
            // Only skip if we processed this VERY recently (30 seconds)
            const RECENT_COOLDOWN = 30 * 1000; // 30 seconds instead of 5 minutes
            
            // Check if we recently processed this issue
            if (this.recentlyProcessedIssues.has(issue.filename)) {
                debugLog(`Issue ${issue.filename} processed in last 30s, skipping`);
                return;
            }

            // Add to recently processed set with shorter auto-removal
            this.recentlyProcessedIssues.add(issue.filename);
            setTimeout(() => {
                this.recentlyProcessedIssues.delete(issue.filename);
            }, RECENT_COOLDOWN);
            // ====================================================
            
            debugLog(`Processing issue: ${issue.filename} - ${issue.title}`);
            debugLog(`Channel ID: ${channel.id}, Channel Name: ${channel.name}`);
            
            // Check if issue exists in database by filename
            const [existing] = await db.query(
                'SELECT * FROM rsi_issues WHERE filename = ?',
                [issue.filename]
            );

            // Debug: check what we found
            debugLog(`Found ${existing.length} existing records for ${issue.filename}`);
            
            if (existing.length > 0) {
                debugLog(`Existing discord_id: ${existing[0].discord_id}, resolved: ${existing[0].resolved}`);
            }

            // Get detailed content
            const htmlContent = await this.fetchIssueHTML(issue.permalink);
            const markdownContent = htmlContent ? this.extractMarkdownFromHTML(htmlContent) : '';

            // Normalize issue data
            const normalizedIssue = {
                filename: issue.filename,
                title: issue.title,
                affected: JSON.stringify(issue.affected || []),
                resolved_at: this.parseDateTime(issue.resolvedAt),
                created_at: this.parseDateTime(issue.createdAt),
                lastmod_at: this.parseDateTime(issue.lastMod),
                informational: issue.informational || false,
                resolved: issue.resolved || false,
                severity: issue.severity || 'unknown',
                permalink: issue.permalink?.replace(/index\.(html|xml)$/, '') || '',
                kind: issue.is || 'issue',
                markdown_content: markdownContent
            };

            const dbIssue = existing.length > 0 ? existing[0] : null;
            const shouldUpdate = await this.needsDatabaseUpdate(normalizedIssue, dbIssue);
            const isNew = existing.length === 0;

            if (!shouldUpdate && !isNew) {
                debugLog(`No changes detected for ${issue.filename}, skipping`);
                return;
            }

            // Create embed (cleaner version matching DM style)
            const embed = this.createCleanIssueEmbed(normalizedIssue);
            
            debugLog(`Created embed for issue: ${issue.title}`);
            debugLog(`Embed color: ${embed.data.color}`);
            debugLog(`Embed title: ${embed.data.title}`);

            if (isNew) {
                // Send new message
                debugLog(`Creating new message for issue: ${issue.title}`);
                try {
                    const message = await channel.send({ 
                        embeds: [embed]
                    });
                    
                    debugLog(`Successfully sent message with ID: ${message.id}`);
                    
                    // Save to database
                    await db.query(`
                        INSERT INTO rsi_issues (
                            filename, discord_id, title, affected, resolved_at,
                            created_at, lastmod_at, informational, resolved,
                            severity, permalink, kind, markdown_content
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            discord_id = VALUES(discord_id),
                            title = VALUES(title),
                            affected = VALUES(affected),
                            resolved_at = VALUES(resolved_at),
                            created_at = VALUES(created_at),
                            lastmod_at = VALUES(lastmod_at),
                            informational = VALUES(informational),
                            resolved = VALUES(resolved),
                            severity = VALUES(severity),
                            permalink = VALUES(permalink),
                            kind = VALUES(kind),
                            markdown_content = VALUES(markdown_content),
                            updated_at = NOW()
                    `, [
                        normalizedIssue.filename,
                        message.id,
                        normalizedIssue.title,
                        normalizedIssue.affected,
                        normalizedIssue.resolved_at,
                        normalizedIssue.created_at,
                        normalizedIssue.lastmod_at,
                        normalizedIssue.informational,
                        normalizedIssue.resolved,
                        normalizedIssue.severity,
                        normalizedIssue.permalink,
                        normalizedIssue.kind,
                        normalizedIssue.markdown_content
                    ]);
                    
                    debugLog(`Saved issue to database with message ID: ${message.id}`);
                } catch (sendError) {
                    console.error(`[SC STATUS] Error sending message for issue ${issue.title}:`, sendError);
                    debugLog(`Send error details: ${sendError.stack}`);
                }
            } else {
                // Update existing message
                debugLog(`Updating existing message for issue: ${issue.title}`);
                
                // Get the discord_id from the database
                const [existingWithId] = await db.query(
                    'SELECT discord_id FROM rsi_issues WHERE filename = ?',
                    [normalizedIssue.filename]
                );
                
                if (existingWithId[0]?.discord_id) {
                    try {
                        const message = await channel.messages.fetch(existingWithId[0].discord_id);
                        await message.edit({ 
                            embeds: [embed]
                        });
                        debugLog(`Successfully updated message ${existingWithId[0].discord_id}`);
                    } catch (error) {
                        debugLog(`Failed to update message, might have been deleted: ${error.message}`);
                        
                        // Message not found, send new one
                        try {
                            const message = await channel.send({ 
                                embeds: [embed]
                            });
                            
                            // Update discord_id in database
                            await db.query(
                                'UPDATE rsi_issues SET discord_id = ? WHERE filename = ?',
                                [message.id, normalizedIssue.filename]
                            );
                            
                            debugLog(`Created replacement message with ID: ${message.id}`);
                        } catch (sendError) {
                            console.error(`[SC STATUS] Error creating replacement message:`, sendError);
                        }
                    }
                }

                // Update database
                await db.query(`
                    UPDATE rsi_issues SET
                        title = ?, affected = ?, resolved_at = ?, created_at = ?,
                        lastmod_at = ?, informational = ?, resolved = ?, severity = ?,
                        permalink = ?, kind = ?, markdown_content = ?, updated_at = NOW()
                    WHERE filename = ?
                `, [
                    normalizedIssue.title,
                    normalizedIssue.affected,
                    normalizedIssue.resolved_at,
                    normalizedIssue.created_at,
                    normalizedIssue.lastmod_at,
                    normalizedIssue.informational,
                    normalizedIssue.resolved,
                    normalizedIssue.severity,
                    normalizedIssue.permalink,
                    normalizedIssue.kind,
                    normalizedIssue.markdown_content,
                    normalizedIssue.filename
                ]);
            }

        } catch (error) {
            consoleLog(`[SC STATUS] Error processing single issue: ${error.message}`);
            console.error(error);
            debugLog(`Detailed error in processSingleIssue: ${error.stack}`);
        }
    }

    /**
     * Cleanup resolved issues after 1 hour (deletes messages from main thread AND DMs)
     */
    async cleanupResolvedIssues(channel, db) {
        try {
            debugLog('[CLEANUP] Starting cleanup of resolved issues...');
            
            // Get current JSON data to check what's actually unresolved
            const jsonData = await this.fetchStatusJSON();
            const currentUnresolvedFilenames = new Set();
            
            if (jsonData && jsonData.systems) {
                for (const system of jsonData.systems) {
                    for (const issue of system.unresolvedIssues || []) {
                        if (issue.filename) {
                            currentUnresolvedFilenames.add(issue.filename);
                            debugLog(`Currently unresolved in JSON: ${issue.filename}`);
                        }
                    }
                }
            }
            
            // Get ALL issues from database that have discord_id (meaning they have embeds)
            const [allIssuesWithEmbeds] = await db.query(`
                SELECT * FROM rsi_issues 
                WHERE discord_id IS NOT NULL
                ORDER BY created_at DESC
            `);

            debugLog(`Found ${allIssuesWithEmbeds.length} issues with embeds in database`);

            let cleanedCount = 0;
            let dmCleanedCount = 0;
            
            for (const issue of allIssuesWithEmbeds) {
                try {
                    let shouldCleanup = false;
                    
                    // Check 1: Is this issue still in the current unresolved list?
                    if (!currentUnresolvedFilenames.has(issue.filename)) {
                        debugLog(`Issue ${issue.filename} NOT in current unresolved list, marking for cleanup`);
                        shouldCleanup = true;
                    }
                    // Check 2: Is it marked as resolved in the database?
                    else if (issue.resolved === true) {
                        debugLog(`Issue ${issue.filename} is marked as resolved in database`);
                        shouldCleanup = true;
                    }
                    // Check 3: Has it been marked as resolved for over an hour?
                    else if (issue.resolved_at) {
                        const resolvedTime = new Date(issue.resolved_at).getTime();
                        const timeSinceResolved = Date.now() - resolvedTime;
                        
                        if (timeSinceResolved > 60 * 60 * 1000) { // 1 hour
                            debugLog(`Issue ${issue.filename} was resolved over an hour ago`);
                            shouldCleanup = true;
                        }
                    }

                    if (shouldCleanup) {
                        debugLog(`Cleaning up resolved issue: ${issue.filename} - ${issue.title}`);
                        
                        // ========== CLEAN UP MAIN THREAD MESSAGE ==========
                        try {
                            const message = await channel.messages.fetch(issue.discord_id);
                            await message.delete();
                            debugLog(`✅ Deleted resolved issue from main thread: ${issue.title}`);
                            cleanedCount++;
                        } catch (error) {
                            // Message already deleted or not found
                            debugLog(`Could not delete message ${issue.discord_id}: ${error.message}`);
                            
                            // Even if message doesn't exist, we should clean up database
                            cleanedCount++;
                        }

                        // ========== CLEAN UP DM MESSAGES ==========
                        const dmCleaned = await this.cleanupIncidentDMMessages(issue.title, issue.filename);
                        if (dmCleaned) {
                            dmCleanedCount++;
                        }

                        // ========== CLEAN UP DATABASE ==========
                        await db.query(
                            'DELETE FROM rsi_issues WHERE filename = ?',
                            [issue.filename]
                        );
                        debugLog(`🗑️ Removed resolved issue from database: ${issue.filename}`);
                    } else {
                        debugLog(`⚠️ Issue ${issue.filename} is still active or recently resolved, keeping`);
                    }
                } catch (error) {
                    debugLog(`❌ Error processing issue ${issue.filename}: ${error.message}`);
                }
            }
            
            debugLog(`Cleanup summary: ${cleanedCount} main thread messages removed, ${dmCleanedCount} incidents cleaned from DMs`);
            
        } catch (error) {
            consoleLog(`[SC STATUS] Error cleaning up resolved issues: ${error.message}`);
            console.error(error);
        }
    }

    /**
     * Clean up DM messages for a specific incident when it's resolved
     */
    async cleanupIncidentDMMessages(incidentTitle, filename) {
        try {
            const db = await connectToMySQL();
            
            // Find ALL DM messages for this incident - with multiple matching strategies
            const [incidentMessages] = await db.query(`
                SELECT dm_message_id, discord_user_id 
                FROM sc_status_dm_messages 
                WHERE 
                    incident_title = ? 
                    OR dm_message_id LIKE ?
                    OR (incident_guid IS NOT NULL AND incident_guid LIKE ?)
            `, [incidentTitle, `%${filename}%`, `%${filename}%`]);

            debugLog(`Found ${incidentMessages.length} DM messages to clean up for incident: ${incidentTitle}`);

            let deletedCount = 0;
            for (const message of incidentMessages) {
                try {
                    const user = await this.client.users.fetch(message.discord_user_id).catch(() => null);
                    if (user) {
                        const dmChannel = await user.createDM();
                        const dmMessage = await dmChannel.messages.fetch(message.dm_message_id);
                        await dmMessage.delete();
                        deletedCount++;
                        debugLog(`🗑️ Deleted DM message ${message.dm_message_id} for user ${user.tag}`);
                    }
                } catch (error) {
                    // Message already deleted or inaccessible
                    debugLog(`Could not delete DM message ${message.dm_message_id}: ${error.message}`);
                }
            }

            // Delete from database with multiple matching strategies
            await db.query(`
                DELETE FROM sc_status_dm_messages 
                WHERE 
                    incident_title = ? 
                    OR dm_message_id LIKE ?
                    OR (incident_guid IS NOT NULL AND incident_guid LIKE ?)
            `, [incidentTitle, `%${filename}%`, `%${filename}%`]);

            debugLog(`✅ Cleaned up ${deletedCount} DM messages for incident: ${incidentTitle}`);
            
            return deletedCount > 0; // Return true if we cleaned up any messages
        } catch (error) {
            console.error('[SC STATUS] Error cleaning up incident DM messages:', error);
            return false;
        }
    }

    /**
     * Proactively clean up DM messages for resolved incidents
     */
    async cleanupResolvedIncidentDMs() {
        try {
            const db = await connectToMySQL();
            
            // Get all incidents from database that are resolved
            const [resolvedIssues] = await db.query(`
                SELECT filename, title FROM rsi_issues 
                WHERE resolved = TRUE
            `);

            debugLog(`Checking ${resolvedIssues.length} resolved issues for DM cleanup`);

            for (const issue of resolvedIssues) {
                // Check for DM messages related to this issue
                const [dmMessages] = await db.query(`
                    SELECT COUNT(*) as message_count 
                    FROM sc_status_dm_messages 
                    WHERE 
                        incident_title = ? 
                        OR dm_message_id LIKE ?
                        OR (incident_guid IS NOT NULL AND incident_guid LIKE ?)
                `, [issue.title, `%${issue.filename}%`, `%${issue.filename}%`]);

                if (dmMessages[0].message_count > 0) {
                    debugLog(`Found ${dmMessages[0].message_count} DM messages for resolved issue: ${issue.title}`);
                    await this.cleanupIncidentDMMessages(issue.title, issue.filename);
                }
            }
        } catch (error) {
            console.error('[SC STATUS] Error in cleanupResolvedIncidentDMs:', error);
        }
    }

    /**
     * Clean up ALL old DM messages (updates and confirmations) after 24 hours
     */
    async cleanupAllOldDMMessages() {
        try {
            const db = await connectToMySQL();
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Get ALL old messages (both confirmation and update)
            const [oldMessages] = await db.query(`
                SELECT discord_user_id, dm_message_id, message_type 
                FROM sc_status_dm_messages 
                WHERE created_at < ?
            `, [twentyFourHoursAgo]);

            debugLog(`Found ${oldMessages.length} old DM messages to clean up (24h+)`);

            let deletedCount = 0;
            for (const message of oldMessages) {
                try {
                    const user = await this.client.users.fetch(message.discord_user_id).catch(() => null);
                    if (user) {
                        const dmChannel = await user.createDM();
                        const dmMessage = await dmChannel.messages.fetch(message.dm_message_id);
                        await dmMessage.delete();
                        deletedCount++;
                        debugLog(`🗑️ Deleted old ${message.message_type} DM message for user ${user.tag}`);
                    }
                } catch (error) {
                    // Message already deleted or inaccessible
                    debugLog(`Could not delete old DM message ${message.dm_message_id}: ${error.message}`);
                }
            }

            // Delete from database
            await db.query(
                'DELETE FROM sc_status_dm_messages WHERE created_at < ?',
                [twentyFourHoursAgo]
            );

            debugLog(`✅ Cleaned up ${deletedCount} old DM messages (24h+)`);
            
            // Also clean up resolved incident DMs proactively
            await this.cleanupResolvedIncidentDMs();
            
            return deletedCount;
        } catch (error) {
            console.error('[SC STATUS] Error cleaning up all old DM messages:', error);
            return 0;
        }
    }

    /**
     * Better HTML content extraction
     */
    extractMeaningfulContent(html) {
        if (!html) return 'No content available.';
        
        try {
            // Remove scripts, styles, and comments
            let content = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<[^>]+>/g, ' ') // Replace tags with spaces
                .replace(/\s+/g, ' ')
                .trim();

            // Decode HTML entities
            content = content
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#x2F;/g, '/');

            // Find the first meaningful paragraph (skip CSS/JS artifacts)
            const sentences = content.split('. ').filter(sentence => {
                const trimmed = sentence.trim();
                return trimmed.length > 30 && 
                    !trimmed.includes('{') && 
                    !trimmed.includes('}') &&
                    !trimmed.includes('var(') &&
                    !trimmed.includes('margin:') &&
                    !trimmed.includes('padding:');
            });

            const meaningfulContent = sentences.slice(0, 3).join('. ');
            
            return meaningfulContent || 'No detailed description available.';
        } catch (error) {
            debugLog(`Error extracting content: ${error.message}`);
            return 'No detailed description available.';
        }
    }

    /**
     * Improved HTML description parsing for RSS feed
     */
    parseHTMLDescription(html) {
        if (!html) return '';
        
        try {
            // Remove all HTML tags
            let text = html
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<p>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<li>/gi, '• ')
                .replace(/<\/li>/gi, '\n')
                .replace(/<ul>/gi, '\n')
                .replace(/<\/ul>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            // Decode HTML entities
            text = text
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#x2F;/g, '/')
                .replace(/&rsquo;/g, "'")
                .replace(/&lsquo;/g, "'")
                .replace(/&rdquo;/g, '"')
                .replace(/&ldquo;/g, '"')
                .replace(/&ndash;/g, '-')
                .replace(/&mdash;/g, '—');

            return text;
        } catch (error) {
            debugLog(`Error parsing HTML description: ${error.message}`);
            return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    /**
     * Extract all updates from RSS description
     */
    extractAllUpdatesFromDescription(description) {
        if (!description) return [];
        
        const parsedDescription = this.parseHTMLDescription(description);
        
        // Look for UTC timestamps followed by updates
        const updatePattern = /(\d{4}\s*UTC\s*[—-]\s*[^.?!]+[.?!])/gi;
        const matches = parsedDescription.match(updatePattern);
        
        if (matches && matches.length > 0) {
            return matches.map(match => match.trim());
        }
        
        // If no UTC timestamps found, try to extract meaningful sentences
        const sentences = parsedDescription.split(/[.!?]+/).filter(s => {
            const trimmed = s.trim();
            return trimmed.length > 20 && 
                   !trimmed.includes('[Updates]') &&
                   !trimmed.toLowerCase().includes('this is an automatic message');
        });
        
        if (sentences.length > 0) {
            return sentences.slice(0, 3).map(s => s.trim() + '.');
        }
        
        return ['The Team is currently investigating elevated error rates on the Live Environment.'];
    }

    /**
     * Create clean issue embed (matches DM style)
     */
    createCleanIssueEmbed(issue) {
        // Determine colors and status
        let embedColor, statusEmoji, statusPrefix;
        
        if (issue.resolved) {
            embedColor = 0x00FF00; // Green
            statusEmoji = '✅';
            statusPrefix = 'RESOLVED';
        } else if (issue.severity === 'major') {
            embedColor = 0xFF0000; // Red
            statusEmoji = '🔴';
            statusPrefix = 'MAJOR OUTAGE';
        } else if (issue.severity === 'degraded') {
            embedColor = 0x800080; // Purple
            statusEmoji = '🟣';
            statusPrefix = 'DEGRADED';
        } else {
            embedColor = 0xFFA500; // Orange
            statusEmoji = '⚠️';
            statusPrefix = 'ACTIVE';
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${statusPrefix}: ${issue.title}`)
            .setURL(issue.permalink + 'index.html')
            .setColor(embedColor)
            .setTimestamp(new Date());

        // Build clean description
        let description = '';
        
        // Service information in clean format
        description += '### Service Information\n\n';
        
        // Determine service display name
        let serviceDisplay = 'Live Service';
        let affectedArray = [];
        
        try {
            affectedArray = JSON.parse(issue.affected);
        } catch (e) {
            // If parsing fails, extract from title
            if (issue.title.includes('Persistent Universe') || issue.title.includes('PU')) {
                affectedArray = ['Persistent Universe'];
            } else if (issue.title.includes('Arena Commander') || issue.title.includes('AC')) {
                affectedArray = ['Arena Commander'];
            } else if (issue.title.includes('Platform') || issue.title.includes('Website') || issue.title.includes('RSI')) {
                serviceDisplay = 'Platform Service';
                affectedArray = ['RSI Platform', 'Spectrum'];
            }
        }
        
        // Use first affected service if available
        if (affectedArray.length > 0) {
            serviceDisplay = affectedArray[0];
        }
        
        // Impact level
        let impactDisplay = 'Minor';
        if (issue.severity === 'major') impactDisplay = '🔴 Major';
        else if (issue.severity === 'degraded') impactDisplay = '🟣 Degraded';
        else if (issue.severity === 'partial') impactDisplay = '🟡 Partial';
        else impactDisplay = '🟢 Minor';
        
        // Status display
        let statusDisplay = issue.resolved ? '✅ Resolved' : '🔍 Investigating';
        if (issue.severity === 'degraded') statusDisplay = '🟣 Degraded';
        
        // Add service info in clean format (not table)
        description += `**Service:** ${serviceDisplay}\n`;
        description += `**Impact:** ${impactDisplay}\n`;
        description += `**Status:** ${statusDisplay}\n\n`;
        
        // Affected Services Section
        if (affectedArray.length > 0) {
            description += '**Affected Services**\n';
            description += affectedArray.join(', ') + '\n\n';
        }
        
        // Latest Updates Section - Show all updates
        const allUpdates = this.extractAllUpdatesFromDescription(issue.markdown_content || issue.title);
        if (allUpdates.length > 0) {
            description += '**Latest Updates**\n';
            allUpdates.forEach((update, index) => {
                description += `${update}\n`;
                if (index < allUpdates.length - 1) description += '\n';
            });
            description += '\n';
        } else {
            description += '**Latest Update**\n';
            description += 'The Team is currently investigating elevated error rates on the Live Environment.\n\n';
        }
        
        // Timestamps
        if (issue.created_at) {
            const relativeTime = `<t:${Math.floor(issue.created_at.getTime() / 1000)}:R>`;
            description += `**Started:** ${relativeTime}`;
            
            if (issue.lastmod_at && !issue.resolved) {
                const lastUpdated = `<t:${Math.floor(issue.lastmod_at.getTime() / 1000)}:R>`;
                description += ` • **Last Updated:** ${lastUpdated}`;
            }
            
            if (issue.resolved_at) {
                const resolvedTime = `<t:${Math.floor(issue.resolved_at.getTime() / 1000)}:R>`;
                description += ` • **Resolved:** ${resolvedTime}`;
            }
            
            description += '\n\n';
        }
        
        // More Info Link
        description += '**More Info**\n';
        description += `[View on RSI Status Page](${issue.permalink}index.html)`;
        
        embed.setDescription(description);
        
        // Footer
        embed.setFooter({ 
            text: issue.resolved ? 'Issue has been resolved' : 'Team is investigating',
            iconURL: this.client.user.displayAvatarURL() 
        });

        return embed;
    }

    /**
     * Extract latest update for embeds
     */
    extractLatestUpdateForEmbed(content) {
        if (!content || content.trim() === '') {
            return 'The Team is currently investigating elevated error rates on the Live Environment.';
        }
        
        // Clean and normalize
        let text = content
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Look for update patterns
        const patterns = [
            /(\d{4}\s*UTC\s*-\s*[^.!?]+[.!?])/,
            /(The Team is.*?[.!?])/i,
            /(We are.*?[.!?])/i,
            /(Update:.*?[.!?])/i,
            /(Maintenance.*?[.!?])/i,
            /([^.!?]{20,}[.!?])/
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[0].length > 30) {
                let result = match[0].trim();
                
                // Ensure proper ending
                if (!result.endsWith('.') && !result.endsWith('!') && !result.endsWith('?')) {
                    result += '.';
                }
                
                debugLog(`Extracted latest update: ${result.substring(0, 100)}...`);
                return result;
            }
        }
        
        return 'The Team is currently investigating elevated error rates on the Live Environment.';
    }

    /**
     * Parse incidents from RSS data (enhanced with JSON data)
     */
    parseIncidentsFromRSS(rssData, jsonData) {
        if (!rssData || !rssData.rss || !rssData.rss.channel || !rssData.rss.channel[0].item) {
            debugLog('No RSS data or items found');
            return [];
        }

        // Update service status from JSON data
        if (jsonData && jsonData.systems) {
            jsonData.systems.forEach(system => {
                this.serviceStatus[system.name] = system.status;
            });
        }

        const items = rssData.rss.channel[0].item;
        const incidents = [];
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

        items.forEach(item => {
            const title = item.title && item.title[0] ? item.title[0] : 'Unknown Title';
            const link = item.link && item.link[0] ? item.link[0] : '';
            const pubDate = item.pubDate && item.pubDate[0] ? new Date(item.pubDate[0]) : new Date();
            const guid = item.guid && item.guid[0] && item.guid[0]._ ? item.guid[0]._ : link;
            const description = item.description && item.description[0] ? item.description[0] : '';
            
            // Only process incidents from the last 30 days
            if (pubDate < thirtyDaysAgo) {
                return; // Skip old incidents
            }
            
            // Extract status from title
            let status = 'unknown';
            if (title.includes('[Resolved]')) {
                status = 'resolved';
            } else if (title.includes('[Investigating]')) {
                status = 'investigating';
            } else if (title.includes('[Monitoring]')) {
                status = 'monitoring';
            } else if (title.includes('[Update]')) {
                status = 'update';
            } else if (title.includes('Maintenance') && !title.includes('[Resolved]')) {
                status = 'maintenance';
            }

            // Extract detailed information
            const { serviceType, affectedServices, impactLevel, duration, patchInfo } = this.parseIncidentDetails(title, description, pubDate);

            incidents.push({
                title,
                link,
                pubDate,
                guid,
                description,
                status,
                serviceType,
                affectedServices,
                impactLevel,
                duration,
                patchInfo
            });
        });

        // Sort by date, newest first
        incidents.sort((a, b) => b.pubDate - a.pubDate);
        
        debugLog(`Parsed ${incidents.length} incidents from RSS`);
        return incidents;
    }

    /**
     * Create comprehensive status embed (enhanced with JSON data)
     */
    async createStatusEmbed(incidents, jsonData) {
        const embed = new EmbedBuilder()
            .setTitle('🚀 Star Citizen Status Dashboard')
            .setColor(0x0099FF)
            .setURL('https://status.robertsspaceindustries.com/')
            .setTimestamp()
            .setFooter({ 
                text: 'Real-time monitoring • Updates every minute',
                iconURL: this.client.user.displayAvatarURL() 
            });

        // Service Status Overview with JSON data
        const serviceStatusText = this.createServiceStatusOverview(jsonData);
        embed.addFields({
            name: '🛠️ SERVICE STATUS OVERVIEW',
            value: serviceStatusText,
            inline: false
        });

        // Active Incidents
        const activeIncidents = incidents.filter(i => i.status !== 'resolved');
        if (activeIncidents.length > 0) {
            activeIncidents.slice(0, 2).forEach((incident, index) => {
                const incidentText = this.formatActiveIncident(incident);
                embed.addFields({
                    name: `${this.getStatusEmoji(incident.status)} ACTIVE: ${incident.serviceType}`,
                    value: incidentText,
                    inline: false
                });
            });
        } else {
            embed.addFields({
                name: '✅ ALL SYSTEMS OPERATIONAL',
                value: 'No active incidents reported. All services are running normally.',
                inline: false
            });
        }

        // Recent Activity with clickable links
        const recentIncidents = incidents.slice(0, 3);
        if (recentIncidents.length > 0) {
            const recentActivityText = this.createRecentActivity(recentIncidents);
            embed.addFields({
                name: '📋 RECENT ACTIVITY',
                value: recentActivityText,
                inline: false
            });
        }

        // Statistics
        const statsText = this.createStatistics(incidents);
        embed.addFields({
            name: '📊 STATISTICS',
            value: statsText,
            inline: false
        });

        // Add JSON data timestamp if available
        if (jsonData && jsonData.buildDate && jsonData.buildTime) {
            embed.setDescription(`Last Change: <t:${Math.floor(new Date(`${jsonData.buildDate}T${jsonData.buildTime}Z`).getTime() / 1000)}:R>`);
        }

        // Add subscription count
        const subCount = await this.getActiveSubscriptionCount();
        embed.addFields({
            name: '🔔 SUBSCRIPTIONS',
            value: `**${subCount}** users are subscribed to updates`,
            inline: false
        });

        return embed;
    }

    /**
     * Create service status overview with JSON data
     */
    createServiceStatusOverview(jsonData) {
        let statusText = '';
        
        if (jsonData && jsonData.systems) {
            jsonData.systems.forEach(system => {
                const trans = this.STATUS_TRANS[system.status] || this.STATUS_TRANS['_other'];
                statusText += `${trans.emoji} **${system.name}**: ${trans.name}\n`;
            });
        } else {
            // Fallback to serviceStatus object
            const services = [
                { name: 'Platform', emoji: '🌐' },
                { name: 'Persistent Universe', emoji: '🌌' },
                { name: 'Arena Commander', emoji: '🎮' }
            ];

            statusText = services.map(service => {
                const status = this.serviceStatus[service.name] || 'operational';
                const trans = this.STATUS_TRANS[status] || this.STATUS_TRANS['_other'];
                return `${trans.emoji} ${service.emoji} **${service.name}** • ${trans.name}`;
            }).join('\n');
        }
        
        return statusText;
    }

    /**
     * Create action row with subscription buttons
     */
    createSubscriptionButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('sc_status_subscribe')
                    .setLabel('🔔 Subscribe to Updates')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔔'),
                new ButtonBuilder()
                    .setCustomId('sc_status_unsubscribe')
                    .setLabel('🔕 Unsubscribe')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔕')
            );
    }

    /**
     * Post or update main status message with buttons
     */
    async postOrUpdateStatus(rssData, jsonData, forceUpdate = false) {
        try {
            const channel = this.client.channels.cache.get(this.statusChannelId);
            if (!channel) {
                consoleLog('[SC STATUS] Status channel not found');
                return;
            }

            const embed = await this.createStatusEmbed(this.currentIncidents, jsonData);
            const buttons = this.createSubscriptionButtons();
            const currentTime = new Date().toLocaleString();

            if (this.lastStatusMessageId) {
                try {
                    const existingMessage = await channel.messages.fetch(this.lastStatusMessageId);
                    await existingMessage.edit({ 
                        embeds: [embed],
                        components: [buttons] 
                    });
                    debugLog(`Updated status message at ${currentTime}${forceUpdate ? ' (forced)' : ''}`);
                    return;
                } catch (error) {
                    debugLog(`Failed to update message, sending new one: ${error.message}`);
                    this.lastStatusMessageId = null;
                }
            }

            const newMessage = await channel.send({ 
                embeds: [embed],
                components: [buttons] 
            });
            this.lastStatusMessageId = newMessage.id;
            await this.saveMessageId();
            debugLog(`Posted new status message at ${currentTime}`);
            
        } catch (error) {
            console.error('[SC STATUS] Error posting/updating status:', error);
        }
    }

    /**
     * Handle subscription button interactions
     */
    async handleSubscriptionInteraction(interaction) {
        try {
            if (interaction.customId === 'sc_status_subscribe') {
                await this.subscribeUser(interaction);
            } else if (interaction.customId === 'sc_status_unsubscribe') {
                await this.unsubscribeUser(interaction);
            }
        } catch (error) {
            console.error('[SC STATUS] Error handling subscription interaction:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    }

    /**
     * Subscribe a user to status updates
     */
    async subscribeUser(interaction) {
        try {
            // Check if user is already subscribed
            const db = await connectToMySQL();
            const [existing] = await db.query(
                'SELECT * FROM sc_status_subscriptions WHERE discord_user_id = ? AND is_active = TRUE',
                [interaction.user.id]
            );

            if (existing.length > 0) {
                return interaction.reply({
                    content: '✅ You are already subscribed to Star Citizen status updates!',
                    ephemeral: true
                });
            }

            // Send initial DM with subscription info
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🔔 Star Citizen Status Updates')
                    .setDescription('You have successfully subscribed to Star Citizen status updates!')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: 'What you\'ll receive:', value: '• Service status changes\n• New incidents/outages\n• Maintenance notifications\n• Resolution updates', inline: false },
                        { name: 'How to unsubscribe:', value: 'Click the "🔕 Unsubscribe" button in the status channel', inline: false }
                    )
                    .setFooter({ text: 'Updates will be sent to this DM channel' })
                    .setTimestamp();

                const dmMessage = await interaction.user.send({ embeds: [dmEmbed] });

                // Store subscription in database
                await db.query(
                    'INSERT INTO sc_status_subscriptions (discord_user_id, dm_message_id, is_active) VALUES (?, ?, TRUE)',
                    [interaction.user.id, dmMessage.id]
                );

                // Record the confirmation message
                await db.query(
                    'INSERT INTO sc_status_dm_messages (discord_user_id, dm_message_id, message_type) VALUES (?, ?, ?)',
                    [interaction.user.id, dmMessage.id, 'confirmation']
                );

                // Send any current active issues to the newly subscribed user
                await this.sendCurrentActiveIssuesToUser(interaction.user.id);

                await interaction.reply({
                    content: '✅ Successfully subscribed to Star Citizen status updates! Check your DMs for confirmation and current active issues.',
                    ephemeral: true
                });

                debugLog(`User ${interaction.user.tag} subscribed to updates`);
            } catch (dmError) {
                console.error('[SC STATUS] Error sending DM:', dmError);
                return interaction.reply({
                    content: '❌ I couldn\'t send you a DM. Please make sure your DMs are open and try again.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('[SC STATUS] Error subscribing user:', error);
            throw error;
        }
    }

    /**
     * Send current active issues to a newly subscribed user
     */
    async sendCurrentActiveIssuesToUser(userId) {
        try {
            const db = await connectToMySQL();
            const user = await this.client.users.fetch(userId);
            
            // Get current active issues from JSON data
            const jsonData = await this.fetchStatusJSON();
            if (!jsonData) return;

            const openIssues = {};
            
            for (const system of jsonData.systems) {
                for (const issue of system.unresolvedIssues || []) {
                    if (issue.filename && !openIssues[issue.filename]) {
                        openIssues[issue.filename] = issue;
                    }
                }
            }

            // Send each active issue to the user
            for (const issue of Object.values(openIssues)) {
                // Create normalized issue object
                const normalizedIssue = {
                    filename: issue.filename,
                    title: issue.title,
                    affected: JSON.stringify(issue.affected || []),
                    resolved_at: this.parseDateTime(issue.resolvedAt),
                    created_at: this.parseDateTime(issue.createdAt),
                    lastmod_at: this.parseDateTime(issue.lastMod),
                    informational: issue.informational || false,
                    resolved: issue.resolved || false,
                    severity: issue.severity || 'unknown',
                    permalink: issue.permalink?.replace(/index\.(html|xml)$/, '') || '',
                    kind: issue.is || 'issue',
                    markdown_content: ''
                };

                // Check if we should notify this user about this issue
                const shouldNotify = await this.shouldNotifyAboutIncident(
                    { 
                        title: issue.title, 
                        guid: issue.filename,
                        status: issue.resolved ? 'resolved' : 'investigating'
                    }, 
                    userId, 
                    true
                );

                if (shouldNotify) {
                    try {
                        const dmChannel = await user.createDM();
                        const embed = this.createCleanIssueEmbed(normalizedIssue);
                        const updateMessage = await dmChannel.send({ 
                            embeds: [embed]
                        });

                        // Record this notification
                        const incidentId = issue.filename || issue.title.replace(/\s+/g, '_').substring(0, 50);
                        
                        // Check if incident_guid column exists
                        const [columnCheck] = await db.query(`
                            SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
                        `);
                        
                        if (columnCheck.length > 0) {
                            await db.query(
                                'INSERT INTO sc_status_dm_messages (discord_user_id, dm_message_id, incident_guid, incident_title, message_type) VALUES (?, ?, ?, ?, ?)',
                                [userId, updateMessage.id, incidentId, issue.title, 'update']
                            );
                        } else {
                            await db.query(
                                'INSERT INTO sc_status_dm_messages (discord_user_id, dm_message_id, message_type) VALUES (?, ?, ?)',
                                [userId, updateMessage.id, 'update']
                            );
                        }

                        debugLog(`Sent current active issue to newly subscribed user ${user.tag}: ${issue.title}`);
                    } catch (dmError) {
                        debugLog(`Failed to send current issue DM to ${user.tag}: ${dmError.message}`);
                    }
                }
            }

            debugLog(`Sent current active issues to newly subscribed user ${user.tag}`);
        } catch (error) {
            console.error('[SC STATUS] Error sending current issues to user:', error);
        }
    }

    /**
     * Unsubscribe a user from status updates and clean up their messages
     */
    async unsubscribeUser(interaction) {
        try {
            const db = await connectToMySQL();
            
            // Check if user is subscribed
            const [existing] = await db.query(
                'SELECT * FROM sc_status_subscriptions WHERE discord_user_id = ? AND is_active = TRUE',
                [interaction.user.id]
            );

            if (existing.length === 0) {
                return interaction.reply({
                    content: '❌ You are not currently subscribed to status updates.',
                    ephemeral: true
                });
            }

            // Deactivate all subscriptions for this user
            await db.query(
                'UPDATE sc_status_subscriptions SET is_active = FALSE WHERE discord_user_id = ?',
                [interaction.user.id]
            );

            // Delete all DM messages sent to this user
            await this.deleteAllUserDMMessages(interaction.user.id);

            await interaction.reply({
                content: '✅ Successfully unsubscribed from status updates. All status update messages in your DMs have been deleted.',
                ephemeral: true
            });

            debugLog(`User ${interaction.user.tag} unsubscribed from updates and messages cleaned up`);
        } catch (error) {
            console.error('[SC STATUS] Error unsubscribing user:', error);
            throw error;
        }
    }

    /**
     * Delete all DM messages sent to a user
     */
    async deleteAllUserDMMessages(userId) {
        try {
            const db = await connectToMySQL();
            
            // Get all DM messages for this user
            const [messages] = await db.query(
                'SELECT dm_message_id FROM sc_status_dm_messages WHERE discord_user_id = ?',
                [userId]
            );

            const user = await this.client.users.fetch(userId).catch(() => null);
            if (!user) {
                debugLog(`Could not fetch user ${userId} to delete DMs`);
                return;
            }

            let deletedCount = 0;
            for (const message of messages) {
                try {
                    // Try to delete the message
                    const dmChannel = await user.createDM();
                    const dmMessage = await dmChannel.messages.fetch(message.dm_message_id);
                    await dmMessage.delete();
                    deletedCount++;
                    debugLog(`Deleted DM message ${message.dm_message_id} for user ${user.tag}`);
                } catch (error) {
                    // Message may already be deleted or inaccessible
                    debugLog(`Could not delete DM message ${message.dm_message_id}: ${error.message}`);
                }
            }

            // Delete from database
            await db.query(
                'DELETE FROM sc_status_dm_messages WHERE discord_user_id = ?',
                [userId]
            );

            debugLog(`Deleted ${deletedCount} DM messages for user ${userId}`);
        } catch (error) {
            console.error('[SC STATUS] Error deleting user DM messages:', error);
        }
    }

    /**
     * Get active subscription count
     */
    async getActiveSubscriptionCount() {
        try {
            const db = await connectToMySQL();
            const [result] = await db.query(
                'SELECT COUNT(DISTINCT discord_user_id) as count FROM sc_status_subscriptions WHERE is_active = TRUE'
            );
            debugLog(`Active subscription count: ${result[0]?.count || 0}`);
            return result[0]?.count || 0;
        } catch (error) {
            console.error('[SC STATUS] Error getting subscription count:', error);
            return 0;
        }
    }

    /**
     * Send update to all subscribed users (with backward compatibility)
     */
    async sendUpdateToSubscribers(incident, isNew = false) {
        try {
            const db = await connectToMySQL();
            const [subscriptions] = await db.query(
                'SELECT discord_user_id, dm_message_id FROM sc_status_subscriptions WHERE is_active = TRUE'
            );

            if (subscriptions.length === 0) {
                debugLog('No active subscriptions to notify');
                return;
            }

            const embed = this.createCleanUpdateEmbed(incident, isNew);
            let successCount = 0;
            let failCount = 0;

            // Generate a simple incident identifier
            const incidentId = incident.guid || incident.title.replace(/\s+/g, '_').substring(0, 50);
            
            for (const sub of subscriptions) {
                try {
                    const user = await this.client.users.fetch(sub.discord_user_id);
                    
                    // Check if we already notified this user about this specific incident recently
                    // Using backward compatible query
                    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
                    
                    // First check if incident_guid column exists
                    const [columnCheck] = await db.query(`
                        SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
                    `);
                    
                    let alreadyNotified = [];
                    
                    if (columnCheck.length > 0) {
                        // Use new column if it exists
                        [alreadyNotified] = await db.query(
                            `SELECT id FROM sc_status_dm_messages 
                            WHERE discord_user_id = ? 
                            AND incident_guid = ?
                            AND message_type = 'update' 
                            AND created_at > ?`,
                            [sub.discord_user_id, incidentId, sixHoursAgo]
                        );
                    } else {
                        // Fallback to old method using dm_message_id pattern
                        [alreadyNotified] = await db.query(
                            `SELECT id FROM sc_status_dm_messages 
                            WHERE discord_user_id = ? 
                            AND message_type = 'update' 
                            AND created_at > ?
                            AND dm_message_id LIKE ?`,
                            [sub.discord_user_id, sixHoursAgo, `%${incidentId}%`]
                        );
                    }
                    
                    if (alreadyNotified.length > 0) {
                        debugLog(`Already notified user ${user.tag} about this incident recently, skipping`);
                        continue;
                    }
                    
                    // Try to get the DM channel
                    try {
                        const dmChannel = await user.createDM();
                        
                        // Send update message
                        const updateMessage = await dmChannel.send({ embeds: [embed] });
                        
                        // Check column existence before trying to insert with new columns
                        const [guidColumn] = await db.query(`
                            SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
                        `);
                        
                        if (guidColumn.length > 0) {
                            // Use new columns
                            await db.query(
                                'INSERT INTO sc_status_dm_messages (discord_user_id, dm_message_id, incident_guid, incident_title, message_type) VALUES (?, ?, ?, ?, ?)',
                                [sub.discord_user_id, updateMessage.id, incidentId, incident.title, 'update']
                            );
                        } else {
                            // Use old columns
                            await db.query(
                                'INSERT INTO sc_status_dm_messages (discord_user_id, dm_message_id, message_type) VALUES (?, ?, ?)',
                                [sub.discord_user_id, updateMessage.id, 'update']
                            );
                        }
                        
                        successCount++;
                        
                        // Update last notified time
                        await db.query(
                            'UPDATE sc_status_subscriptions SET last_notified = NOW() WHERE discord_user_id = ? AND dm_message_id = ?',
                            [sub.discord_user_id, sub.dm_message_id]
                        );
                        
                        debugLog(`Sent update to ${user.tag}`);
                    } catch (dmError) {
                        failCount++;
                        debugLog(`Failed to send DM to ${user.tag}: ${dmError.message}`);
                        
                        // If DMs are closed or user blocked bot, deactivate subscription and clean up messages
                        if (dmError.code === 50007) { // Cannot send messages to this user
                            await db.query(
                                'UPDATE sc_status_subscriptions SET is_active = FALSE WHERE discord_user_id = ?',
                                [sub.discord_user_id]
                            );
                            
                            // Also clean up their DM messages from database
                            await db.query(
                                'DELETE FROM sc_status_dm_messages WHERE discord_user_id = ?',
                                [sub.discord_user_id]
                            );
                        }
                    }
                } catch (userError) {
                    failCount++;
                    debugLog(`Failed to fetch user ${sub.discord_user_id}: ${userError.message}`);
                    
                    // Remove inactive user from subscriptions
                    await db.query(
                        'DELETE FROM sc_status_subscriptions WHERE discord_user_id = ?',
                        [sub.discord_user_id]
                    );
                    
                    // Clean up their DM messages from database
                    await db.query(
                        'DELETE FROM sc_status_dm_messages WHERE discord_user_id = ?',
                        [sub.discord_user_id]
                    );
                }
            }

            debugLog(`Sent update to ${successCount} subscribers, ${failCount} failed`);
        } catch (error) {
            console.error('[SC STATUS] Error sending update to subscribers:', error);
        }
    }

    /**
     * Create clean update embed for subscribers (matches main thread style)
     */
    createCleanUpdateEmbed(incident, isNew) {
        const embed = new EmbedBuilder()
            .setTitle(isNew ? '🚨 NEW INCIDENT' : '📢 INCIDENT UPDATE')
            .setColor(incident.status === 'resolved' ? 0x00FF00 : 0xFFA500)
            .setURL(incident.link)
            .setTimestamp();

        // Build clean description
        let description = `**${incident.title}**\n\n`;
        
        // Service information in clean format
        description += '### Service Information\n\n';
        description += `**Service:** ${incident.serviceType || 'Live Service'}\n`;
        description += `**Impact:** ${incident.impactLevel || 'Minor'}\n`;
        description += `**Status:** ${this.getStatusEmoji(incident.status)} ${incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}\n\n`;
        
        if (incident.affectedServices && incident.affectedServices.length > 0) {
            description += '**Affected Services**\n';
            description += `${incident.affectedServices.join(', ')}\n\n`;
        }

        // Add all updates from description
        const allUpdates = this.extractAllUpdatesFromDescription(incident.description);
        if (allUpdates.length > 0) {
            description += '**Latest Updates**\n';
            allUpdates.slice(0, 3).forEach((update, index) => {
                const shortUpdate = update.length > 200 ? update.substring(0, 200) + '...' : update;
                description += `${shortUpdate}\n`;
                if (index < Math.min(allUpdates.length, 3) - 1) description += '\n';
            });
            description += '\n';
        }

        description += '**More Info**\n';
        description += `[View on RSI Status Page](${incident.link})`;

        embed.setDescription(description);

        // Add footer with timestamp
        const timeAgo = `<t:${Math.floor(incident.pubDate.getTime() / 1000)}:R>`;
        embed.setFooter({ 
            text: `${isNew ? 'New incident detected' : 'Incident updated'} ${timeAgo}`,
            iconURL: this.client.user.displayAvatarURL() 
        });

        return embed;
    }

    /**
     * Check for new or updated incidents and notify subscribers (with backward compatibility)
     */
    async checkAndNotifySubscribers(newIncidents) {
        const oldIncidents = this.currentIncidents;
        const db = await connectToMySQL();
        
        // Find new incidents
        const newIncident = newIncidents.find(newInc => {
            return !oldIncidents.some(oldInc => oldInc.guid === newInc.guid);
        });

        // Find updated incidents (status changed)
        const updatedIncidents = newIncidents.filter(newInc => {
            const oldInc = oldIncidents.find(oldInc => oldInc.guid === newInc.guid);
            return oldInc && oldInc.status !== newInc.status;
        });

        // Check if we've already notified about new incidents recently (bot restart scenario)
        if (newIncident && newIncident.status !== 'resolved') {
            // Check if incident_guid column exists
            const [columnCheck] = await db.query(`
                SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
            `);
            
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
            const incidentId = newIncident.guid || newIncident.title.replace(/\s+/g, '_').substring(0, 50);
            
            let existingNotification = [];
            
            if (columnCheck.length > 0) {
                // Use new column
                [existingNotification] = await db.query(
                    `SELECT id FROM sc_status_dm_messages 
                    WHERE incident_guid = ?
                    AND message_type = 'update' 
                    AND created_at > ?`,
                    [incidentId, twelveHoursAgo]
                );
            } else {
                // Fallback to old method
                [existingNotification] = await db.query(
                    `SELECT id FROM sc_status_dm_messages 
                    WHERE message_type = 'update' 
                    AND created_at > ?
                    AND dm_message_id LIKE ?`,
                    [twelveHoursAgo, `%${incidentId}%`]
                );
            }
            
            if (existingNotification.length === 0) {
                debugLog(`New incident detected, notifying subscribers: ${newIncident.title}`);
                await this.sendUpdateToSubscribers(newIncident, true);
            } else {
                debugLog(`Already notified about this incident recently, skipping: ${newIncident.title}`);
            }
        }

        // Notify about updated incidents (but check if we already notified recently)
        for (const updatedIncident of updatedIncidents) {
            // Check if incident_guid column exists
            const [columnCheck] = await db.query(`
                SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
            `);
            
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
            const incidentId = updatedIncident.guid || updatedIncident.title.replace(/\s+/g, '_').substring(0, 50);
            
            let existingUpdate = [];
            
            if (columnCheck.length > 0) {
                // Use new column
                [existingUpdate] = await db.query(
                    `SELECT id FROM sc_status_dm_messages 
                    WHERE incident_guid = ?
                    AND message_type = 'update' 
                    AND created_at > ?`,
                    [incidentId, sixHoursAgo]
                );
            } else {
                // Fallback to old method
                [existingUpdate] = await db.query(
                    `SELECT id FROM sc_status_dm_messages 
                    WHERE message_type = 'update' 
                    AND created_at > ?
                    AND dm_message_id LIKE ?`,
                    [sixHoursAgo, `%${incidentId}%`]
                );
            }
            
            if (existingUpdate.length === 0) {
                debugLog(`Incident updated, notifying subscribers: ${updatedIncident.title}`);
                await this.sendUpdateToSubscribers(updatedIncident, false);
            } else {
                debugLog(`Already sent update for this incident recently, skipping: ${updatedIncident.title}`);
            }
        }
    }

    /**
     * Fetch and update status with subscriber notifications
     */
    async fetchAndUpdateStatus() {
        try {
            debugLog('Starting fetch and update status');
            
            // Fetch both RSS and JSON data in parallel
            const [rssData, jsonData] = await Promise.all([
                this.fetchRSSFeed(),
                this.fetchStatusJSON()
            ]);

            if (!rssData && !jsonData) {
                debugLog('Failed to fetch any data, skipping update');
                return;
            }

            // Update channel name with JSON data
            if (jsonData) {
                await this.updateChannelName(jsonData);
            }

            // Process issues from JSON data
            if (jsonData) {
                await this.processIssues(jsonData);
            }

            // Parse incidents
            const newIncidents = this.parseIncidentsFromRSS(rssData, jsonData);
            
            // Check for changes and notify subscribers
            await this.checkAndNotifySubscribers(newIncidents);
            
            const hasContentChanged = this.hasStatusChanged(newIncidents);
            
            if (hasContentChanged || this.isFirstRun) {
                debugLog(`Status changed or first run, updating embed. Found ${newIncidents.length} recent incidents`);
                this.currentIncidents = newIncidents;
                await this.postOrUpdateStatus(rssData, jsonData, true);
                this.isFirstRun = false;
            } else {
                debugLog('No content changes detected, updating timestamp only');
                await this.postOrUpdateStatus(rssData, jsonData, false);
            }
            
        } catch (error) {
            consoleLog(`[SC STATUS] Error in fetchAndUpdateStatus: ${error.message}`);
        }
    }

    /**
     * Check if we should notify about an incident (prevent duplicates)
     */
    async shouldNotifyAboutIncident(incident, userId = null, isNew = false) {
        try {
            const db = await connectToMySQL();
            
            // For new incidents, check if we notified in the last 12 hours
            // For updates, check if we notified in the last 6 hours
            const timeThreshold = isNew ? 12 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
            const timeAgo = new Date(Date.now() - timeThreshold);
            
            const incidentId = incident.guid || incident.title.replace(/\s+/g, '_').substring(0, 50);
            
            // Check if incident_guid column exists
            const [columnCheck] = await db.query(`
                SHOW COLUMNS FROM sc_status_dm_messages LIKE 'incident_guid'
            `);
            
            let existingNotification = [];
            
            if (userId) {
                // Check for this specific user
                if (columnCheck.length > 0) {
                    [existingNotification] = await db.query(
                        `SELECT id FROM sc_status_dm_messages 
                        WHERE discord_user_id = ?
                        AND incident_guid = ?
                        AND message_type = 'update' 
                        AND created_at > ?`,
                        [userId, incidentId, timeAgo]
                    );
                } else {
                    [existingNotification] = await db.query(
                        `SELECT id FROM sc_status_dm_messages 
                        WHERE discord_user_id = ?
                        AND message_type = 'update' 
                        AND created_at > ?
                        AND dm_message_id LIKE ?`,
                        [userId, timeAgo, `%${incidentId}%`]
                    );
                }
            } else {
                // Check globally (for general notifications)
                if (columnCheck.length > 0) {
                    [existingNotification] = await db.query(
                        `SELECT id FROM sc_status_dm_messages 
                        WHERE incident_guid = ?
                        AND message_type = 'update' 
                        AND created_at > ?`,
                        [incidentId, timeAgo]
                    );
                } else {
                    [existingNotification] = await db.query(
                        `SELECT id FROM sc_status_dm_messages 
                        WHERE message_type = 'update' 
                        AND created_at > ?
                        AND dm_message_id LIKE ?`,
                        [timeAgo, `%${incidentId}%`]
                    );
                }
            }
            
            return existingNotification.length === 0;
        } catch (error) {
            debugLog(`Error checking notification status: ${error.message}`);
            return true; // Default to sending if there's an error
        }
    }

    /**
     * Check if status has changed
     */
    hasStatusChanged(newIncidents) {
        if (!this.currentIncidents || this.currentIncidents.length === 0) return true;
        if (!newIncidents || newIncidents.length === 0) return false;
        
        if (this.currentIncidents.length !== newIncidents.length) return true;
        
        for (const newIncident of newIncidents) {
            const oldIncident = this.currentIncidents.find(i => i.guid === newIncident.guid);
            if (!oldIncident || oldIncident.status !== newIncident.status) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Start comprehensive cleanup intervals
     */
    startCleanupIntervals() {
        // Run comprehensive DM cleanup every hour
        setInterval(() => {
            debugLog('[CLEANUP] Running hourly DM message cleanup...');
            this.cleanupAllOldDMMessages();
        }, this.CLEANUP_INTERVAL);

        // Run initial cleanup after 1 minute
        setTimeout(() => {
            debugLog('[CLEANUP] Running initial DM message cleanup...');
            this.cleanupAllOldDMMessages();
        }, 60 * 1000);

        debugLog(`Comprehensive cleanup scheduled (hourly)`);
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        debugLog(`Starting monitoring with ${this.POLL_INTERVAL/1000} second intervals`);
        
        // Initialize issues on startup
        setTimeout(() => {
            debugLog('Starting issue initialization on startup...');
            this.initializeIssuesOnStartup().catch(error => {
                console.error('[SC STATUS] Error in startup initialization:', error);
            });
        }, 10000); // Increased delay to 10 seconds to ensure bot is fully ready
        
        // Start regular monitoring interval (every minute)
        setInterval(() => {
            const currentTime = new Date().toLocaleString();
            debugLog(`[STATUS] Scheduled update triggered at ${currentTime}`);
            this.fetchAndUpdateStatus().catch(error => {
                consoleLog(`[SC STATUS] Monitoring interval error: ${error.message}`);
            });
        }, this.POLL_INTERVAL);
        
        debugLog('Comprehensive monitoring started - status updates every minute, cleanup every hour');
    }

    /**
     * Helper methods (keep from original code)
     */
    parseIncidentDetails(title, description, pubDate) {
        const cleanDesc = this.parseHTMLDescription(description);
        
        let serviceType = 'General';
        const titleLower = title.toLowerCase();
        if (titleLower.includes('live service') || titleLower.includes('live deployment') || titleLower.includes('alpha')) {
            serviceType = '🎮 Live Service';
        } else if (titleLower.includes('platform') || titleLower.includes('rsi') || titleLower.includes('website') || titleLower.includes('launcher')) {
            serviceType = '🌐 RSI Platform';
        } else if (titleLower.includes('maintenance')) {
            serviceType = '🔧 Maintenance';
        } else if (titleLower.includes('disruption') || titleLower.includes('outage') || titleLower.includes('degraded')) {
            serviceType = '🚨 Service Disruption';
        }

        const affectedServices = this.extractAffectedServices(title, cleanDesc);
        const impactLevel = this.determineImpactLevel(title, cleanDesc);
        const duration = this.calculateIncidentDuration(title, cleanDesc, pubDate);
        const patchInfo = this.extractPatchInfo(title, cleanDesc);

        return {
            serviceType,
            affectedServices,
            impactLevel,
            duration,
            patchInfo
        };
    }

    extractAffectedServices(title, description) {
        const services = [];
        const descLower = description.toLowerCase();
        const titleLower = title.toLowerCase();
        
        const serviceChecks = [
            { keywords: ['platform', 'website', 'launcher', 'rsi platform', 'spectrum'], name: 'Platform' },
            { keywords: ['persistent universe', 'pu', 'universe', 'star marine', 'live service'], name: 'Persistent Universe' },
            { keywords: ['arena commander', 'ac', 'arena', 'commander'], name: 'Arena Commander' },
            { keywords: ['mission', 'contract', 'bounty'], name: 'Missions & Contracts' },
            { keywords: ['inventory', 'item', 'equipment'], name: 'Inventory System' },
            { keywords: ['login', 'authentication', '1900', '30009', 'account'], name: 'Authentication' },
            { keywords: ['ship', 'vehicle', 'claim', 'asop', 'terminal'], name: 'Ship Services' },
            { keywords: ['chat', 'friends', 'social', 'spectrum'], name: 'Spectrum' }
        ];

        serviceChecks.forEach(check => {
            if (check.keywords.some(keyword => descLower.includes(keyword) || titleLower.includes(keyword))) {
                services.push(check.name);
            }
        });

        return services.length > 0 ? services : ['General Services'];
    }

    determineImpactLevel(title, description) {
        const text = (title + ' ' + description).toLowerCase();
        
        if (text.includes('major outage') || text.includes('complete outage') || text.includes('global outage')) {
            return '🔴 Major';
        } else if (text.includes('partial outage') || text.includes('degraded performance') || text.includes('service disruption')) {
            return '🟡 Partial';
        } else if (text.includes('maintenance') || text.includes('update') || text.includes('deployment')) {
            return '🔧 Maintenance';
        } else {
            return '🟢 Minor';
        }
    }

    calculateIncidentDuration(title, description, startDate) {
        if (!title.includes('[Resolved]')) return null;
        
        const text = description.toLowerCase();
        const timeMatches = text.match(/(\d{4})\s*UTC/g) || [];
        
        if (timeMatches.length >= 2) {
            const times = timeMatches.map(t => t.replace('UTC', '').trim());
            return `~${times.length > 1 ? 'Multiple updates' : 'Several hours'}`;
        }
        
        return 'Unknown duration';
    }

    extractPatchInfo(title, description) {
        const patchMatch = description.match(/Alpha\s+(\d+\.\d+\.\d+)/i) || 
                          description.match(/SC\s+Alpha\s+(\d+\.\d+\.\d+)/i) ||
                          title.match(/Alpha\s+(\d+\.\d+\.\d+)/i);
        
        if (patchMatch) {
            return `Patch ${patchMatch[1]}`;
        }
        
        return null;
    }

    formatActiveIncident(incident) {
        let text = `**${incident.title}**\n`;
        text += `⏰ Started: ${this.formatDate(incident.pubDate)}\n`;
        text += `📊 Impact: ${incident.impactLevel}\n`;
        
        if (incident.affectedServices && incident.affectedServices.length > 0) {
            text += `🔧 Affected: ${incident.affectedServices.join(', ')}\n`;
        }
        
        const cleanDesc = this.parseHTMLDescription(incident.description);
        const maintenanceInfo = this.extractMaintenanceInfo(cleanDesc, incident.title);
        if (maintenanceInfo) {
            text += `\n${maintenanceInfo}\n`;
        } else {
            const firstMeaningfulUpdate = this.extractFirstMeaningfulUpdate(cleanDesc);
            if (firstMeaningfulUpdate && firstMeaningfulUpdate.length > 10) {
                text += `\n📢 **Latest:** ${firstMeaningfulUpdate}\n`;
            }
        }
        
        text += `\n[View Details](${incident.link})`;
        
        return text;
    }

    extractMaintenanceInfo(description, title) {
        if (!title.toLowerCase().includes('maintenance')) {
            return null;
        }

        const keyDetails = [];
        const startTimeMatch = description.match(/starting on.*?(\d{4}-\d{2}-\d{2} at \d{4} UTC)/i);
        const durationMatch = description.match(/not expected to exceed (\d+ hours?)/i);
        const connectionsMatch = description.match(/connections.*?disabled at (\d{4} UTC)/i);
        const serversMatch = description.match(/servers.*?offline at (\d{4} UTC)/i);
        const matchmakingMatch = description.match(/(\d{4} UTC).*?Matchmaking/);

        if (startTimeMatch) keyDetails.push(`🕐 **Starts:** ${startTimeMatch[1]}`);
        if (durationMatch) keyDetails.push(`⏱️ **Duration:** ${durationMatch[1]}`);
        if (connectionsMatch) keyDetails.push(`🔒 **Connections disabled:** ${connectionsMatch[1]}`);
        if (serversMatch) keyDetails.push(`🖥️ **Servers offline:** ${serversMatch[1]}`);
        if (matchmakingMatch) keyDetails.push(`🎯 **Matchmaking affected:** ${matchmakingMatch[1]}`);

        if (description.includes('safely stow')) {
            keyDetails.push(`⚠️ **Advise:** Safely stow vehicles before shutdown`);
        }

        if (keyDetails.length > 0) {
            return `📋 **Maintenance Details:**\n${keyDetails.join('\n')}`;
        }

        return null;
    }

    extractFirstMeaningfulUpdate(description) {
        const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        for (const sentence of sentences) {
            const cleanSentence = sentence.trim();
            if (cleanSentence.length > 20 && 
                !cleanSentence.includes('[Updates]') && 
                !cleanSentence.includes('UTC -')) {
                return cleanSentence + '.';
            }
        }
        
        return sentences[0] ? sentences[0].trim() + '.' : null;
    }

    /**
     * Create Recent Activity section with clickable links
     */
    createRecentActivity(incidents) {
        return incidents.map(incident => {
            const statusEmoji = incident.status === 'resolved' ? '✅' : this.getStatusEmoji(incident.status);
            
            // Create clickable title using Markdown link syntax
            const clickableTitle = `[${incident.title}](${incident.link})`;
            
            let text = `${statusEmoji} **${clickableTitle}**\n`;
            text += `⏱️ ${this.formatDate(incident.pubDate)} • ${incident.serviceType}`;
            
            if (incident.patchInfo) {
                text += ` • ${incident.patchInfo}`;
            }
            
            return text;
        }).join('\n\n');
    }

    createStatistics(incidents) {
        const activeCount = incidents.filter(i => i.status !== 'resolved').length;
        const resolvedCount = incidents.filter(i => i.status === 'resolved').length;
        const now = new Date();
        const last24h = incidents.filter(i => (now - i.pubDate) < (24 * 60 * 60 * 1000)).length;
        const last7d = incidents.filter(i => (now - i.pubDate) < (7 * 24 * 60 * 60 * 1000)).length;
        
        let text = `🟢 **Active:** ${activeCount}\n`;
        text += `✅ **Resolved (7d):** ${resolvedCount}\n`;
        text += `📈 **24h Activity:** ${last24h} incidents\n`;
        text += `\n[Full Status Page](https://status.robertsspaceindustries.com/) | [RSI Website](https://robertsspaceindustries.com/)`;
        
        return text;
    }

    cleanDescription(description) {
        if (!description) return '';
        
        return description
            .replace(/<!--.*?-->/g, '')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .replace(/\[.*?Updates\]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    getStatusEmoji(status) {
        const emojis = {
            'investigating': '🔍',
            'monitoring': '👀',
            'update': '📢',
            'resolved': '✅',
            'maintenance': '🔧',
            'unknown': '❓'
        };
        return emojis[status] || '❓';
    }

    formatDate(date) {
        if (!date) return 'Unknown';
        return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
    }

    async saveMessageId() {
        try {
            const db = await connectToMySQL();
            await db.query(`
                INSERT INTO sc_status_messages 
                (message_id, last_updated)
                VALUES (?, NOW())
                ON DUPLICATE KEY UPDATE
                message_id = VALUES(message_id),
                last_updated = VALUES(last_updated)
            `, [this.lastStatusMessageId]);
            
            debugLog('Saved message ID to database');
        } catch (error) {
            console.error('[SC STATUS] Error saving message ID:', error);
        }
    }

    async loadMessageId() {
        try {
            const db = await connectToMySQL();
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS sc_status_messages (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    message_id VARCHAR(255) UNIQUE,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            
            const [savedIds] = await db.query(`
                SELECT message_id
                FROM sc_status_messages 
                ORDER BY last_updated DESC 
                LIMIT 1
            `);
            
            if (savedIds.length > 0) {
                this.lastStatusMessageId = savedIds[0].message_id;
                debugLog(`Loaded saved message ID from database: ${this.lastStatusMessageId}`);
            } else {
                debugLog('No saved message ID found in database');
            }
        } catch (error) {
            console.error('[SC STATUS] Error loading message ID:', error);
        }
    }

    /**
     * Force immediate status update
     */
    async forceUpdate() {
        debugLog('Manual force update requested');
        await this.fetchAndUpdateStatus();
    }

    /**
     * Debug function for RSS parsing
     */
    async debugRSSParsing() {
        debugLog('Debugging RSS parsing...');
        const rssData = await this.fetchRSSFeed();
        if (rssData) {
            const incidents = this.parseIncidentsFromRSS(rssData, null);
            debugLog(`Found ${incidents.length} incidents`);
            incidents.forEach((incident, index) => {
                debugLog(`Incident ${index + 1}: ${incident.title}`);
                debugLog(`  Status: ${incident.status}`);
                debugLog(`  Services: ${incident.affectedServices?.join(', ')}`);
                debugLog(`  GUID: ${incident.guid}`);
                debugLog(`  Description preview: ${incident.description?.substring(0, 200)}...`);
            });
        }
    }

    /**
     * Debug function for JSON data
     */
    async debugJSONParsing() {
        debugLog('Debugging JSON parsing...');
        const jsonData = await this.fetchStatusJSON();
        if (jsonData) {
            debugLog(`Systems: ${jsonData.systems?.length || 0}`);
            jsonData.systems?.forEach((system, index) => {
                debugLog(`System ${index + 1}: ${system.name} - ${system.status}`);
                debugLog(`  Unresolved issues: ${system.unresolvedIssues?.length || 0}`);
            });
        }
    }

    /**
     * Debug function for database state
     */
    async debugDatabaseState() {
        try {
            const db = await connectToMySQL();
            
            const [issues] = await db.query('SELECT COUNT(*) as count FROM rsi_issues');
            const [subscriptions] = await db.query('SELECT COUNT(*) as count FROM sc_status_subscriptions WHERE is_active = TRUE');
            const [dmMessages] = await db.query('SELECT COUNT(*) as count FROM sc_status_dm_messages');
            
            debugLog(`Database State:`);
            debugLog(`  Issues: ${issues[0].count}`);
            debugLog(`  Active Subscriptions: ${subscriptions[0].count}`);
            debugLog(`  DM Messages: ${dmMessages[0].count}`);
            
            // Get recent issues
            const [recentIssues] = await db.query('SELECT filename, title, resolved FROM rsi_issues ORDER BY updated_at DESC LIMIT 5');
            debugLog('Recent Issues:');
            recentIssues.forEach(issue => {
                debugLog(`  ${issue.filename}: ${issue.title} (resolved: ${issue.resolved})`);
            });
            
        } catch (error) {
            debugLog(`Error debugging database: ${error.message}`);
        }
    }

    /**
     * Test command to manually initialize issues
     */
    async testInitializeIssues() {
        debugLog('Manual test: Initializing issues...');
        await this.initializeIssuesOnStartup();
        debugLog('Manual test: Issue initialization complete');
    }

    /**
     * Test command to check channel access
     */
    async testChannelAccess() {
        try {
            const channel = this.client.channels.cache.get(this.statusChannelId);
            if (!channel) {
                consoleLog(`[TEST] Channel not found: ${this.statusChannelId}`);
                return;
            }
            
            consoleLog(`[TEST] Channel found: ${channel.name} (${channel.id})`);
            consoleLog(`[TEST] Channel type: ${channel.type}`);
            consoleLog(`[TEST] Channel guild: ${channel.guild?.name || 'No guild'}`);
            
            // Try to send a test message
            const testEmbed = new EmbedBuilder()
                .setTitle('Test Embed')
                .setDescription('This is a test message to verify channel access')
                .setColor(0x00FF00)
                .setTimestamp();
                
            const testMessage = await channel.send({ embeds: [testEmbed] });
            consoleLog(`[TEST] Successfully sent test message: ${testMessage.id}`);
            
            // Delete the test message after 5 seconds
            setTimeout(() => {
                testMessage.delete().catch(() => {});
            }, 5000);
            
        } catch (error) {
            console.error('[TEST] Error testing channel access:', error);
        }
    }
}

module.exports = StarCitizenStatusMonitor;