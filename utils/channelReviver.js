const { EmbedBuilder } = require('discord.js');
const { connectToMySQL } = require('../db');

class ChannelReviver {
    constructor(client, channelIds, intervalDays = 5) {
        this.client = client;
        this.channelIds = channelIds;
        this.intervalDays = intervalDays;
        this.intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        this.isRunning = false;
        this.interval = null;
    }
    
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log(`[${new Date().toISOString()}] Starting channel reviver for ${this.channelIds.length} channels...`);
        
        // Create database table if it doesn't exist
        await this.ensureTableExists();
        
        // Initial run
        await this.reviveAllChannels();
        
        // Set interval
        this.interval = setInterval(() => {
            this.reviveAllChannels();
        }, this.intervalMs);
        
        console.log(`[${new Date().toISOString()}] Channel reviver started. Interval: ${this.intervalDays} days`);
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.isRunning = false;
            console.log(`[${new Date().toISOString()}] Channel reviver stopped`);
        }
    }
    
    async ensureTableExists() {
        try {
            const db = await connectToMySQL();
            await db.query(`
                CREATE TABLE IF NOT EXISTS channel_revival_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    revival_date DATE NOT NULL UNIQUE,
                    channels_revived INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log(`[${new Date().toISOString()}] Channel revival table ensured`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to ensure table exists:`, error.message);
        }
    }
    
    async hasRunToday() {
        try {
            const db = await connectToMySQL();
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
            const [rows] = await db.query(
                'SELECT id FROM channel_revival_logs WHERE revival_date = ?',
                [today]
            );
            
            return rows.length > 0;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error checking if revival ran today:`, error.message);
            return false; // If there's an error, assume it hasn't run to be safe
        }
    }
    
    async logRevivalToDB(channelsCount) {
        try {
            const db = await connectToMySQL();
            const today = new Date().toISOString().split('T')[0];
            
            await db.query(
                'INSERT INTO channel_revival_logs (revival_date, channels_revived) VALUES (?, ?)',
                [today, channelsCount]
            );
            
            console.log(`[${new Date().toISOString()}] Channel revival logged to database for ${today}`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to log revival to database:`, error.message);
        }
    }
    
    async reviveAllChannels() {
        // Check if we've already run today
        const hasRun = await this.hasRunToday();
        if (hasRun) {
            console.log(`[${new Date().toISOString()}] Channel revival already completed today. Skipping.`);
            return;
        }
        
        console.log(`[${new Date().toISOString()}] Starting channel revival for ${this.channelIds.length} channels...`);
        
        let successfulRevivals = 0;
        let hiddenThreadsFound = 0;
        
        for (const channelId of this.channelIds) {
            try {
                const { success, isHiddenThread } = await this.reviveIfHiddenThread(channelId);
                if (success) successfulRevivals++;
                if (isHiddenThread) hiddenThreadsFound++;
                
                // Rate limiting between channels
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.log(`[${new Date().toISOString()}] Failed to process channel ${channelId}: ${error.message}`);
            }
        }
        
        // Log the successful revival to database
        if (successfulRevivals > 0) {
            await this.logRevivalToDB(successfulRevivals);
        }
        
        console.log(`[${new Date().toISOString()}] Channel revival completed: ${successfulRevivals}/${this.channelIds.length} channels revived (${hiddenThreadsFound} hidden threads found)`);
    }
    
    async reviveIfHiddenThread(channelId) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }
            
            // Check if this is a thread
            if (!channel.isThread()) {
                console.log(`[${new Date().toISOString()}] Channel ${channelId} is not a thread. Skipping.`);
                return { success: false, isHiddenThread: false };
            }
            
            // Check if thread is hidden (archived and/or locked)
            const isHidden = channel.archived || channel.locked;
            
            if (!isHidden) {
                console.log(`[${new Date().toISOString()}] Thread ${channelId} is not hidden (archived: ${channel.archived}, locked: ${channel.locked}). Skipping.`);
                return { success: false, isHiddenThread: false };
            }
            
            console.log(`[${new Date().toISOString()}] Found hidden thread: ${channel.name} (ID: ${channelId}) - archived: ${channel.archived}, locked: ${channel.locked}`);
            
            // Unarchive the thread if it's archived
            if (channel.archived) {
                try {
                    await channel.setArchived(false);
                    console.log(`[${new Date().toISOString()}] Unarchived thread: ${channel.name}`);
                } catch (archiveError) {
                    console.log(`[${new Date().toISOString()}] Could not unarchive thread ${channelId}: ${archiveError.message}`);
                }
            }
            
            // Send the dot message
            const message = await channel.send('.');
            
            // Delete after 1.5 seconds
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`[${new Date().toISOString()}] Revival message sent and deleted in thread: ${channel.name}`);
                } catch (error) {
                    console.log(`[${new Date().toISOString()}] Could not delete message in ${channel.name}: ${error.message}`);
                }
            }, 1500);
            
            return { success: true, isHiddenThread: true };
        } catch (error) {
            console.log(`[${new Date().toISOString()}] Failed to process channel ${channelId}: ${error.message}`);
            return { success: false, isHiddenThread: false };
        }
    }
    
    // Optional: Get revival history
    async getRevivalHistory(days = 30) {
        try {
            const db = await connectToMySQL();
            const [rows] = await db.query(
                'SELECT * FROM channel_revival_logs WHERE revival_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY revival_date DESC',
                [days]
            );
            return rows;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error getting revival history:`, error.message);
            return [];
        }
    }
    
    // Optional: Enhanced manual override for testing
    async forceRevival(skipHiddenCheck = false) {
        console.log(`[${new Date().toISOString()}] Manual channel revival forced${skipHiddenCheck ? ' (skipping hidden check)' : ''}`);
        
        let successfulRevivals = 0;
        let hiddenThreadsFound = 0;
        
        for (const channelId of this.channelIds) {
            try {
                if (skipHiddenCheck) {
                    // Use the original sendAndDeleteDot method if skipping hidden check
                    const success = await this.sendAndDeleteDot(channelId);
                    if (success) successfulRevivals++;
                } else {
                    const { success, isHiddenThread } = await this.reviveIfHiddenThread(channelId);
                    if (success) successfulRevivals++;
                    if (isHiddenThread) hiddenThreadsFound++;
                }
                
                // Rate limiting between channels
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.log(`[${new Date().toISOString()}] Failed to process channel ${channelId}: ${error.message}`);
            }
        }
        
        console.log(`[${new Date().toISOString()}] Manual revival completed: ${successfulRevivals}/${this.channelIds.length} channels revived${!skipHiddenCheck ? ` (${hiddenThreadsFound} hidden threads found)` : ''}`);
    }
    
    // Keep the original method for backward compatibility
    async sendAndDeleteDot(channelId) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            
            if (!channel?.isTextBased()) {
                throw new Error(`Channel ${channelId} is not accessible or not a text channel`);
            }
            
            // Send the dot message
            const message = await channel.send('.');
            
            // Delete after 1.5 seconds
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`[${new Date().toISOString()}] Revival message sent and deleted in channel: ${channel.name}`);
                } catch (error) {
                    console.log(`[${new Date().toISOString()}] Could not delete message in ${channel.name}: ${error.message}`);
                }
            }, 1500);
            
            return true; // Success
        } catch (error) {
            console.log(`[${new Date().toISOString()}] Failed to process channel ${channelId}: ${error.message}`);
            return false; // Failure
        }
    }
}

module.exports = { ChannelReviver };