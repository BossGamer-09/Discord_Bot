// utils/executiveHangarTimers.js
const { EmbedBuilder } = require('discord.js');
const { connectToMySQL } = require('../db');
const axios = require('axios');

function consoleLog(message) {
  const timestamp = new Date().toISOString(); 
  const logLine = `[${timestamp}] ${message}`;
  try {
    console.log(logLine);
  } catch (err) {
    console.error('Failed to write to console:', err);
  }
}

class ExecutiveHangarManager {
    constructor(client) {
        this.client = client;
        this.notificationChannelId = '1437701010893050006';
        
        // Role IDs to ping for notifications
        this.NOTIFICATION_ROLES = {
            PHASE_CHANGE: '1437704919191916614',
            LIGHT_UPDATE: '1437704919191916614' 
        };
        
        // EXACT durations from the website's JavaScript - will be updated from website
        this.OPEN_DURATION = 3900417;
        this.CLOSE_DURATION = 7200771;
        this.CYCLE_DURATION = this.OPEN_DURATION + this.CLOSE_DURATION;
        this.INITIAL_OPEN_TIME = new Date('2025-11-21T21:24:11.000-05:00').getTime();
        
        // Light thresholds from the website (in milliseconds)
        this.LIGHT_THRESHOLDS = [
            { min: 0, max: 12*60*1000, lights: 5 },
            { min: 12*60*1000, max: 24*60*1000, lights: 4 },
            { min: 24*60*1000, max: 36*60*1000, lights: 3 },
            { min: 36*60*1000, max: 48*60*1000, lights: 2 },
            { min: 48*60*1000, max: 60*60*1000, lights: 1 },
            { min: 60*60*1000, max: 65*60*1000, lights: 0 },
            { min: 65*60*1000, max: 89*60*1000, lights: 0 },
            { min: 89*60*1000, max: 113*60*1000, lights: 1 },
            { min: 113*60*1000, max: 137*60*1000, lights: 2 },
            { min: 137*60*1000, max: 161*60*1000, lights: 3 },
            { min: 161*60*1000, max: 185*60*1000, lights: 4 }
        ];
        
        this.TOTAL_LIGHTS = 5;
        
        // Current state
        this.currentPhase = 'RED';
        this.currentLights = 0;
        this.timeRemaining = 0;
        this.lastSyncTime = Date.now();
        this.lastStatusMessageId = null;
        this.lastNotifiedPhase = 'RED';
        this.lastNotifiedLights = 0;
        this.patchInfo = 'Updated Nov 21, 2025 for Star Citizen Patch 4.4.0-LIVE (Server Version 10724199)';
        
        // Cache for performance
        this._lastProgress = null;
        this._lastProgressTime = 0;
        
        // Notification tracking
        this.lastNotificationTime = 0;
        this.notificationCooldown = 2 * 60 * 1000;
        
        // Ping message cleanup
        this.recentPingMessages = [];
        this.maxPingMessages = 1;
        this.cleanupCooldown = 5 * 60 * 1000;
        this.lastCleanupTime = 0;

        // Website sync
        this.websiteUrl = 'https://exec.xyxyll.com/';
        this.lastWebsiteSync = 0;
        this.websiteSyncCooldown = 2 * 60 * 1000;
        this.websiteSyncAttempts = 0;
        this.maxWebsiteSyncAttempts = 3;
        
        // Debug mode - TURNED OFF for cleaner logs
        this.debugMode = false;
    }

    async initialize() {
        consoleLog('[HANGAR TIMER] Executive Hangar timer system initialized');
        
        await this.loadMessageId();
        await this.cleanupDuplicateStatusMessages(); // Clean up duplicates on startup
        await this.syncWithWebsite(true);
        await this.loadAndCleanupPingMessages();
        
        this.calculateCurrentState();
        setTimeout(() => {
            this.postOrUpdateHangarStatus();
        }, 2000);
        
        this.startMonitoring();
    }

    /**
     * Clean up duplicate status messages on startup
     */
    async cleanupDuplicateStatusMessages() {
        try {
            const channel = this.client.channels.cache.get(this.notificationChannelId);
            if (!channel) return;

            const messages = await channel.messages.fetch({ limit: 50 });
            const statusMessages = messages.filter(msg => 
                msg.author.id === this.client.user.id &&
                msg.embeds.some(embed => 
                    embed.title && embed.title.includes('EXECUTIVE HANGAR TIMER')
                )
            );

            // Keep only the most recent status message
            const sortedMessages = Array.from(statusMessages.values())
                .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            
            if (sortedMessages.length > 1) {
                const messagesToDelete = sortedMessages.slice(1);
                for (const message of messagesToDelete) {
                    try {
                        await message.delete();
                        consoleLog(`[HANGAR TIMER] Deleted duplicate message: ${message.id}`);
                    } catch (error) {
                        // Silent fail
                    }
                }
                consoleLog(`[HANGAR TIMER] Cleaned up ${messagesToDelete.length} duplicate status messages`);
            }
        } catch (error) {
            consoleLog(`[HANGAR TIMER] Error cleaning duplicate messages: ${error.message}`);
        }
    }

    /**
     * Sync with the official website to get accurate timing and patch info
     */
    async syncWithWebsite(force = false) {
        try {
            const now = Date.now();
            if (!force && now - this.lastWebsiteSync < this.websiteSyncCooldown) {
                return true;
            }

            consoleLog('[HANGAR TIMER] Syncing with website...');
            
            const response = await axios.get(this.websiteUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const html = response.data;
            
            // Extract patch info from the website
            const patchInfoMatch = html.match(/Updated\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s+for\s+Star\s+Citizen\s+Patch\s+[^<]+/);
            if (patchInfoMatch) {
                this.patchInfo = patchInfoMatch[0].trim();
            }

            // Extract timing variables from app.js
            const appJsMatch = html.match(/src="([^"]*app\.js[^"]*)"/i);
            if (appJsMatch) {
                const appJsUrl = new URL(appJsMatch[1], this.websiteUrl).href;
                
                try {
                    const appJsResponse = await axios.get(appJsUrl, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    });
                    
                    const appJsContent = appJsResponse.data;
                    
                    // Extract and use the latest timing values from the website
                    const initialOpenTimeMatch = appJsContent.match(/INITIAL_OPEN_TIME\s*=\s*new\s+Date\(['"]([^'"]+)['"]\)/);
                    const openDurationMatch = appJsContent.match(/OPEN_DURATION\s*=\s*(\d+)/);
                    const closeDurationMatch = appJsContent.match(/CLOSE_DURATION\s*=\s*(\d+)/);
                    
                    if (initialOpenTimeMatch) {
                        this.INITIAL_OPEN_TIME = new Date(initialOpenTimeMatch[1]).getTime();
                        consoleLog(`[HANGAR TIMER] Updated INITIAL_OPEN_TIME: ${new Date(this.INITIAL_OPEN_TIME).toISOString()}`);
                    }
                    
                    if (openDurationMatch) {
                        this.OPEN_DURATION = parseInt(openDurationMatch[1]);
                        consoleLog(`[HANGAR TIMER] Updated OPEN_DURATION: ${this.OPEN_DURATION}ms`);
                    }
                    
                    if (closeDurationMatch) {
                        this.CLOSE_DURATION = parseInt(closeDurationMatch[1]);
                        consoleLog(`[HANGAR TIMER] Updated CLOSE_DURATION: ${this.CLOSE_DURATION}ms`);
                    }
                    
                    this.CYCLE_DURATION = this.OPEN_DURATION + this.CLOSE_DURATION;
                    consoleLog(`[HANGAR TIMER] Updated CYCLE_DURATION: ${this.CYCLE_DURATION}ms`);
                    
                } catch (jsError) {
                    consoleLog(`[HANGAR TIMER] Failed to fetch app.js: ${jsError.message}`);
                }
            }

            this.lastWebsiteSync = now;
            this.websiteSyncAttempts = 0;
            
            consoleLog('[HANGAR TIMER] Website sync completed');
            return true;
            
        } catch (error) {
            this.websiteSyncAttempts++;
            consoleLog(`[HANGAR TIMER] Website sync failed: ${error.message}`);
            
            if (this.websiteSyncAttempts >= this.maxWebsiteSyncAttempts) {
                this.websiteSyncCooldown = 30 * 60 * 1000;
                consoleLog('[HANGAR TIMER] Multiple sync failures, increasing cooldown');
            }
            
            return false;
        }
    }

    /**
     * Load existing ping messages and clean up old ones on startup
     */
    async loadAndCleanupPingMessages() {
        try {
            const channel = this.client.channels.cache.get(this.notificationChannelId);
            if (!channel) return;

            const messages = await channel.messages.fetch({ limit: 50 });
            
            // Filter for ping messages
            const pingMessages = messages.filter(msg => {
                const hasRolePing = msg.content.includes(`<@&${this.NOTIFICATION_ROLES.PHASE_CHANGE}>`) || 
                                  msg.content.includes(`<@&${this.NOTIFICATION_ROLES.LIGHT_UPDATE}>`);
                
                const hasPhaseEmbed = msg.embeds.some(embed => 
                    embed.title && embed.title.includes('HANGAR PHASE TRANSITION')
                );
                const hasLightEmbed = msg.embeds.some(embed => 
                    embed.title && embed.title.includes('HANGAR LIGHT UPDATE')
                );

                return hasRolePing || hasPhaseEmbed || hasLightEmbed;
            });

            // Convert to array and sort by most recent first
            const sortedPings = Array.from(pingMessages.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            
            const messagesToKeep = sortedPings.slice(0, this.maxPingMessages);
            const messagesToDelete = sortedPings.slice(this.maxPingMessages);

            this.recentPingMessages = messagesToKeep.map(msg => msg.id);

            // Delete the old ones
            for (const message of messagesToDelete) {
                try {
                    await message.delete();
                } catch (error) {
                    // Silent fail for message deletion
                }
            }

            if (messagesToDelete.length > 0) {
                consoleLog(`[HANGAR TIMER] Cleaned up ${messagesToDelete.length} old ping messages`);
            }
            
        } catch (error) {
            consoleLog(`[HANGAR TIMER] Error loading ping messages: ${error.message}`);
        }
    }

    /**
     * Periodic cleanup of old ping messages
     */
    async periodicCleanup() {
        const now = Date.now();
        if (now - this.lastCleanupTime < this.cleanupCooldown) {
            return;
        }

        try {
            const channel = this.client.channels.cache.get(this.notificationChannelId);
            if (!channel || this.recentPingMessages.length <= this.maxPingMessages) {
                this.lastCleanupTime = now;
                return;
            }

            // Get current messages to verify they still exist
            const currentMessages = new Set();
            for (const messageId of this.recentPingMessages) {
                try {
                    await channel.messages.fetch(messageId);
                    currentMessages.add(messageId);
                } catch (error) {
                    // Message doesn't exist anymore, remove from tracking
                }
            }

            // Update tracking array with only existing messages
            this.recentPingMessages = this.recentPingMessages.filter(id => currentMessages.has(id));

            // If we're still over the limit, delete the oldest ones
            if (this.recentPingMessages.length > this.maxPingMessages) {
                const messagesToKeep = this.recentPingMessages.slice(0, this.maxPingMessages);
                const messagesToDelete = this.recentPingMessages.slice(this.maxPingMessages);

                for (const messageId of messagesToDelete) {
                    try {
                        const message = await channel.messages.fetch(messageId);
                        await message.delete();
                    } catch (error) {
                        // Silent fail for message deletion
                    }
                }

                this.recentPingMessages = messagesToKeep;
            }

            this.lastCleanupTime = now;
            
        } catch (error) {
            // Silent fail for cleanup
        }
    }

    /**
     * Calculate current state using the EXACT same logic as the website
     */
    calculateCurrentState() {
        try {
            const now = Date.now();
            
            // Debug logging
            if (this.debugMode) {
                consoleLog(`[DEBUG] now: ${new Date(now).toISOString()}`);
                consoleLog(`[DEBUG] INITIAL_OPEN_TIME: ${new Date(this.INITIAL_OPEN_TIME).toISOString()}`);
            }
            
            const elapsedTimeSinceInitialOpen = now - this.INITIAL_OPEN_TIME;
            const timeInCurrentCycle = elapsedTimeSinceInitialOpen % this.CYCLE_DURATION;
            
            if (this.debugMode) {
                consoleLog(`[DEBUG] elapsedTimeSinceInitialOpen: ${elapsedTimeSinceInitialOpen}ms`);
                consoleLog(`[DEBUG] timeInCurrentCycle: ${timeInCurrentCycle}ms`);
                consoleLog(`[DEBUG] OPEN_DURATION: ${this.OPEN_DURATION}ms`);
                consoleLog(`[DEBUG] CLOSE_DURATION: ${this.CLOSE_DURATION}ms`);
            }
            
            let status, activeLights, timeRemaining;
            
            if (timeInCurrentCycle < this.OPEN_DURATION) {
                // Hangar is ONLINE (GREEN phase)
                status = 'ONLINE';
                this.currentPhase = 'GREEN';
                timeRemaining = this.OPEN_DURATION - timeInCurrentCycle;
                
                // Find active lights based on thresholds
                const threshold = this.LIGHT_THRESHOLDS.find(t => 
                    timeInCurrentCycle >= t.min && timeInCurrentCycle < t.max
                );
                activeLights = threshold ? threshold.lights : 0;
                
            } else {
                // Hangar is OFFLINE (RED phase)
                status = 'OFFLINE';
                this.currentPhase = 'RED';
                const timeInClosePhase = timeInCurrentCycle - this.OPEN_DURATION;
                timeRemaining = this.CLOSE_DURATION - timeInClosePhase;
                
                // Find active lights based on thresholds (offset by OPEN_DURATION)
                const threshold = this.LIGHT_THRESHOLDS.find(t => 
                    timeInCurrentCycle >= t.min && timeInCurrentCycle < t.max
                );
                activeLights = threshold ? threshold.lights : 0;
            }
            
            this.currentLights = activeLights;
            this.timeRemaining = Math.floor(timeRemaining / 1000);
            this.lastSyncTime = now;
            
            if (this.debugMode) {
                consoleLog(`[DEBUG] Calculated state: Phase=${this.currentPhase}, Lights=${this.currentLights}, TimeRemaining=${this.timeRemaining}s`);
            }
            
            return true;
            
        } catch (error) {
            consoleLog(`[HANGAR TIMER] Error calculating state: ${error.message}`);
            return false;
        }
    }

    /**
     * Get current progress for display
     */
    calculateProgress() {
        // Use cache if recent
        if (this._lastProgress && (Date.now() - this._lastProgressTime) < 2000) {
            return this._lastProgress;
        }
        
        // Recalculate state
        this.calculateCurrentState();
        
        const progress = {
            currentPhase: this.currentPhase,
            timeLeft: this.timeRemaining,
            phaseTimeLeft: this.timeRemaining,
            activeLights: this.currentLights,
            totalLights: 5,
            phaseDescription: this.currentPhase === 'GREEN' ? 'Hangar Open' : 'Hangar Closed',
            statusColor: this.currentPhase,
            miniTimerText: this.getMiniTimerText(this.currentPhase, this.timeRemaining),
            synced: true,
            lastSync: this.lastSyncTime
        };

        // Cache the result
        this._lastProgress = progress;
        this._lastProgressTime = Date.now();
        
        return progress;
    }

    /**
     * Get mini timer text with Discord timestamps
     */
    getMiniTimerText(phase, phaseTimeLeft) {
        const timestamp = Math.floor((Date.now() + (phaseTimeLeft * 1000)) / 1000);
        
        switch (phase) {
            case 'RED':
                return `Opens <t:${timestamp}:R>`;
            case 'GREEN':
                return `Resets <t:${timestamp}:R>`;
            default:
                return `Changes <t:${timestamp}:R>`;
        }
    }

    /**
     * Format main timer with Discord relative timestamp
     */
    formatMainTimer(seconds) {
        const timestamp = Math.floor((Date.now() + (seconds * 1000)) / 1000);
        return `Ends <t:${timestamp}:R>`;
    }

    /**
     * Format time for display (matches website format)
     */
    formatTimeForDisplay(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    /**
     * Post or update hangar status - SINGLE MESSAGE SYSTEM
     */
    async postOrUpdateHangarStatus() {
        try {
            const channel = this.client.channels.cache.get(this.notificationChannelId);
            if (!channel) {
                consoleLog('[HANGAR TIMER] Channel not found');
                return;
            }

            const progress = this.calculateProgress();
            const embed = this.createStatusEmbed(progress);

            // Try to edit existing message
            if (this.lastStatusMessageId) {
                try {
                    if (this.debugMode) {
                        consoleLog(`[HANGAR TIMER] Attempting to edit message: ${this.lastStatusMessageId}`);
                    }
                    const existingMessage = await channel.messages.fetch(this.lastStatusMessageId);
                    await existingMessage.edit({ embeds: [embed] });
                    
                    if (this.debugMode) {
                        consoleLog('[HANGAR TIMER] Successfully edited existing message');
                    }
                    return; // Success - exit function
                } catch (error) {
                    consoleLog(`[HANGAR TIMER] Failed to edit message: ${error.message}`);
                    this.lastStatusMessageId = null; // Reset if message doesn't exist
                }
            }

            // If no existing message or edit failed, create new one
            consoleLog('[HANGAR TIMER] Creating new status message');
            const newMessage = await channel.send({ embeds: [embed] });
            this.lastStatusMessageId = newMessage.id;
            await this.saveMessageId();
            consoleLog(`[HANGAR TIMER] Created new message: ${this.lastStatusMessageId}`);
            
        } catch (error) {
            console.error('[HANGAR TIMER] Error posting/updating status:', error);
        }
    }

    /**
     * Create status embed with patch info
     */
    createStatusEmbed(progress) {
        const phaseColors = {
            'RED': 0xFF0000,
            'GREEN': 0x00FF00
        };
        
        const phaseDetails = {
            'RED': '❌ **DO NOT INSERT COMPBOARDS** - Hangar will not open\n🔴 Lights turn green every 24 minutes',
            'GREEN': '✅ **COMPBOARDS CAN BE INSERTED** - Hangar can be opened\n🟢 Lights turn off every 12 minutes'
        };

        const lightDisplay = this.createLightsDisplay(progress.activeLights, progress.totalLights, progress.currentPhase);
        
        // Determine light status text based on current state
        let lightStatus;
        if (progress.currentPhase === 'RED') {
            if (progress.activeLights === 0) {
                lightStatus = 'All lights red - first light turns green in 24 minutes';
            } else if (progress.activeLights === 5) {
                lightStatus = 'All lights green - hangar opens soon!';
            } else {
                lightStatus = `Turning green every 24min (${progress.activeLights}/5 green)`;
            }
        } else {
            if (progress.activeLights === 5) {
                lightStatus = 'All lights green - hangar is open!';
            } else if (progress.activeLights === 0) {
                lightStatus = 'All lights off - hangar closes soon!';
            } else {
                lightStatus = `Turning off every 12min (${progress.activeLights}/5 remaining)`;
            }
        }

        const footerText = `Calculated from official cycle • Updated ${this.formatLastSync()}`;

        return new EmbedBuilder()
            .setTitle('🏢 EXECUTIVE HANGAR TIMER')
            .setColor(phaseColors[progress.currentPhase])
            .setDescription(`*${this.patchInfo}*`)
            .setTimestamp()
            .setFooter({ 
                text: footerText,
                iconURL: this.client.user.displayAvatarURL() 
            })
            .addFields(
                {
                    name: `📊 ${progress.phaseDescription}`,
                    value: phaseDetails[progress.currentPhase],
                    inline: false
                },
                {
                    name: '💡 LIGHT STATUS',
                    value: `${lightDisplay}\n${lightStatus}`,
                    inline: false
                },
                {
                    name: '⏰ MAIN TIMER',
                    value: this.formatMainTimer(progress.timeLeft),
                    inline: false
                },
                {
                    name: '🔄 NEXT PHASE',
                    value: progress.miniTimerText,
                    inline: false
                }
            );
    }

    /**
     * Create light status display
     */
    createLightsDisplay(activeLights, totalLights, phase) {
        let display = '';
        for (let i = 0; i < totalLights; i++) {
            if (phase === 'RED') {
                display += i < activeLights ? '🟢' : '🔴';
            } else {
                display += i < activeLights ? '🟢' : '⚫';
            }
        }
        return display;
    }

    /**
     * Format last sync time
     */
    formatLastSync() {
        if (!this.lastSyncTime) return 'Never';
        const diff = Date.now() - this.lastSyncTime;
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        return `${Math.floor(minutes / 60)}h ago`;
    }

    /**
     * Save message ID to database
     */
    async saveMessageId() {
        try {
            const db = await connectToMySQL();
            await db.query(`
                UPDATE hangar_status_messages 
                SET message_id = ?, 
                    last_updated = NOW()
                WHERE id = 1
            `, [this.lastStatusMessageId]);
            
            consoleLog(`[HANGAR TIMER] Saved message ID to database: ${this.lastStatusMessageId}`);
        } catch (error) {
            console.error('[HANGAR TIMER] Error saving message ID:', error);
        }
    }

    /**
     * Load message ID from database
     */
    async loadMessageId() {
        try {
            const db = await connectToMySQL();
            
            // Create table with proper constraints
            await db.query(`
                CREATE TABLE IF NOT EXISTS hangar_status_messages (
                    id INT PRIMARY KEY DEFAULT 1,  -- Fixed ID
                    message_id VARCHAR(255),
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_id (id)
                )
            `);
            
            // Insert default row if it doesn't exist
            await db.query(`
                INSERT IGNORE INTO hangar_status_messages (id, message_id) 
                VALUES (1, NULL)
            `);
            
            const [savedIds] = await db.query(`
                SELECT message_id
                FROM hangar_status_messages 
                WHERE id = 1
                LIMIT 1
            `);
            
            if (savedIds.length > 0 && savedIds[0].message_id) {
                this.lastStatusMessageId = savedIds[0].message_id;
                consoleLog(`[HANGAR TIMER] Loaded message ID: ${this.lastStatusMessageId}`);
            } else {
                consoleLog('[HANGAR TIMER] No saved message ID found');
            }
        } catch (error) {
            console.error('[HANGAR TIMER] Error loading message ID:', error);
        }
    }

    /**
     * Send notification and track message for cleanup
     */
    async sendNotification(content, embed) {
        try {
            const channel = this.client.channels.cache.get(this.notificationChannelId);
            if (!channel) return null;

            const message = await channel.send({ 
                content: content,
                embeds: [embed] 
            });

            // Add new message to tracking array
            this.recentPingMessages.unshift(message.id);

            // Immediately clean up if we're over the limit
            if (this.recentPingMessages.length > this.maxPingMessages) {
                await this.cleanupOldPings();
            }

            return message;
        } catch (error) {
            consoleLog(`[HANGAR TIMER] Error sending notification: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean up old ping messages
     */
    async cleanupOldPings() {
        try {
            const channel = this.client.channels.cache.get(this.notificationChannelId);
            if (!channel || this.recentPingMessages.length <= this.maxPingMessages) return;

            const messagesToKeep = this.recentPingMessages.slice(0, this.maxPingMessages);
            const messagesToDelete = this.recentPingMessages.slice(this.maxPingMessages);

            for (const messageId of messagesToDelete) {
                try {
                    const message = await channel.messages.fetch(messageId);
                    await message.delete();
                } catch (error) {
                    // Silent fail for message deletion
                }
            }

            this.recentPingMessages = messagesToKeep;
            
        } catch (error) {
            // Silent fail for cleanup
        }
    }

    /**
     * Check for updates and send notifications if needed
     */
    async checkForUpdates() {
        const previousPhase = this.currentPhase;
        const previousLights = this.currentLights;
        
        // Recalculate current state
        this.calculateCurrentState();
        
        // Check for phase changes (major events)
        if (previousPhase !== this.currentPhase) {
            consoleLog(`[HANGAR TIMER] Phase change: ${previousPhase} -> ${this.currentPhase}`);
            await this.sendPhaseChangeNotification(previousPhase, this.currentPhase);
            this.lastNotifiedPhase = this.currentPhase;
        }
        
        // Check for important light changes
        if (previousLights !== this.currentLights) {
            const isImportantChange = this.isImportantLightChange(previousLights, this.currentLights);
            if (isImportantChange) {
                await this.sendLightChangeNotification();
            }
            
            this.lastNotifiedLights = this.currentLights;
        }
        
        // Always update the main status message
        await this.postOrUpdateHangarStatus();

        // Periodic website sync
        if (this.websiteSyncAttempts < this.maxWebsiteSyncAttempts) {
            await this.syncWithWebsite();
        }
    }

    /**
     * Check if a light change is important enough to notify
     */
    isImportantLightChange(oldLights, newLights) {
        const now = Date.now();
        
        // Cooldown check
        if (now - this.lastNotificationTime < this.notificationCooldown) {
            return false;
        }
        
        if (this.currentPhase === 'RED') {
            return (oldLights === 0 && newLights === 1) || (oldLights === 4 && newLights === 5);
        } else if (this.currentPhase === 'GREEN') {
            return (oldLights === 5 && newLights === 4) || (oldLights === 1 && newLights === 0);
        }
        
        return false;
    }

    /**
     * Send phase change notification
     */
    async sendPhaseChangeNotification(oldPhase, newPhase) {
        const messages = {
            'RED→GREEN': {
                title: '🎉 **EXECUTIVE HANGAR IS NOW OPEN!** 🎉',
                description: '✅ **COMPBOARDS CAN NOW BE INSERTED!**\n🟢 Hangar is in GREEN phase',
                ping: true,
                color: 0x00FF00
            },
            'GREEN→RED': {
                title: '🔴 **EXECUTIVE HANGAR IS NOW CLOSED**',
                description: '❌ **DO NOT INSERT COMPBOARDS**\n🔴 Hangar is in RED phase',
                ping: true,
                color: 0xFF0000
            }
        };
        
        const messageData = messages[`${oldPhase}→${newPhase}`];
        if (messageData) {
            const embed = new EmbedBuilder()
                .setTitle('🔄 HANGAR PHASE TRANSITION')
                .setColor(messageData.color)
                .setDescription(`${messageData.title}\n${messageData.description}`)
                .setTimestamp();
            
            let content = '';
            if (messageData.ping && this.NOTIFICATION_ROLES.PHASE_CHANGE) {
                content = `<@&${this.NOTIFICATION_ROLES.PHASE_CHANGE}>`;
            }

            await this.sendNotification(content, embed);
            
            this.lastNotificationTime = Date.now();
            consoleLog('[HANGAR TIMER] Sent phase change notification');
        }
    }

    /**
     * Send light change notification
     */
    async sendLightChangeNotification() {
        const progress = this.calculateProgress();
        const lightMessage = progress.currentPhase === 'RED' ?
            `🟢 **Light ${progress.activeLights} turned green** - hangar getting closer to opening!` :
            `⚫ **Light ${progress.totalLights - progress.activeLights + 1} turned off** - hangar getting closer to closing!`;
        
        const embed = new EmbedBuilder()
            .setTitle('💡 HANGAR LIGHT UPDATE')
            .setColor(0x00FFFF)
            .setDescription(`${lightMessage}\n${this.createLightsDisplay(progress.activeLights, progress.totalLights, progress.currentPhase)}`)
            .setTimestamp();
        
        let content = '';
        if (this.NOTIFICATION_ROLES.LIGHT_UPDATE) {
            content = `<@&${this.NOTIFICATION_ROLES.LIGHT_UPDATE}>`;
        }

        await this.sendNotification(content, embed);
        
        this.lastNotificationTime = Date.now();
        consoleLog('[HANGAR TIMER] Sent light change notification');
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        // Update status every 30 seconds
        setInterval(() => {
            this.postOrUpdateHangarStatus();
        }, 30 * 1000);
        
        // Check for updates every minute
        setInterval(() => {
            this.checkForUpdates().catch(console.error);
        }, 60 * 1000);
        
        // Periodic cleanup every 5 minutes
        setInterval(() => {
            this.periodicCleanup().catch(console.error);
        }, 5 * 60 * 1000);

        // Force website sync every 15 minutes
        setInterval(() => {
            this.syncWithWebsite(true).catch(console.error);
        }, 15 * 60 * 1000);
        
        consoleLog('[HANGAR TIMER] Monitoring started');
    }

    /**
     * Force immediate status update
     */
    async forceUpdate() {
        consoleLog('[HANGAR TIMER] Manual force update requested');
        await this.syncWithWebsite(true);
        await this.postOrUpdateHangarStatus();
    }

    /**
     * Debug command to check current state
     */
    async debugState() {
        consoleLog('[HANGAR TIMER] === DEBUG STATE ===');
        consoleLog(`Current Phase: ${this.currentPhase}`);
        consoleLog(`Current Lights: ${this.currentLights}`);
        consoleLog(`Time Remaining: ${this.timeRemaining}s (${this.formatTimeForDisplay(this.timeRemaining)})`);
        consoleLog(`Message ID: ${this.lastStatusMessageId}`);
        consoleLog(`Patch Info: ${this.patchInfo}`);
        consoleLog(`INITIAL_OPEN_TIME: ${new Date(this.INITIAL_OPEN_TIME).toISOString()}`);
        consoleLog(`OPEN_DURATION: ${this.OPEN_DURATION}ms (${this.OPEN_DURATION/1000/60} minutes)`);
        consoleLog(`CLOSE_DURATION: ${this.CLOSE_DURATION}ms (${this.CLOSE_DURATION/1000/60} minutes)`);
        consoleLog(`CYCLE_DURATION: ${this.CYCLE_DURATION}ms (${this.CYCLE_DURATION/1000/60} minutes)`);
        consoleLog('=== END DEBUG ===');
    }
}

module.exports = ExecutiveHangarManager;