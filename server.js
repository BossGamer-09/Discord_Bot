const { Client, Collection, GatewayIntentBits, Partials, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const express = require('express');
const fuzzball = require('fuzzball');
const bodyParser = require('body-parser');

// ========== PUBLIC ROLE API CONFIGURATION ==========
const roleApiCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 minute cache
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute
const rateLimitMap = new Map();
// ========== END PUBLIC ROLE API CONFIGURATION ==========

const playerCreationLocks = new Map();
const ExecutiveHangarManager = require('./utils/executiveHangarTimers');
const { 
    // Message ID management
    getStoredMessageIds,
    setStoredMessageIds,
    getStoredMessageIdsFromDB,        // NEW
    setStoredMessageIdsToDB,          // NEW
    
    // Prison Time Functions
    calculateMeritsFromPrisonTime,
    formatPrisonTimeDisplay,
    createPrisonTimeModal,
    handlePrisonTimeModal,
    handleInventoryQuantityModal,
    
    // Patch Adjustment Functions
    createPatchAdjustmentModal,
    handlePatchAdjustmentModal,
    handlePatchAdjustmentButton,
    handlePatchLocationSelect,
    handlePatchItemSelect,
    createPatchLocationSelect,
    sendPatchAdjustmentNotification,
    
    // Wikelo Functions
    createWikeloBundleSelect,
    createWikeloBundleButton,
    handleWikeloBundleSelect,
    handleWikeloBundleButton,
    
    // Pagination Functions
    createPaginatedDropdowns,
    handleInventoryPageNavigation,
    handleInventoryButtonWithPagination,
    
    // Database Functions
    fetchInventoryTotals,
    saveRequestToDB,
    logPatchAdjustment,
    updateInventoryQuantity,
    updateInventoryDatabase,
    markRequestClosed,
    getPendingRequestByThreadId,
    updateRequestThreadId,
    
    // Display Functions
    updateMainInventoryEmbed,
    updateMainInventoryEmbedWithDB,   // NEW
    finalizeRequest,
    BankApproveDenyButton,
    handleCloseThreadButton,
    
    // UI Components
    pool,
    dropdownRows,
    createGroupedItemDropdowns,
    createFinishedButton,
    
    // Constants
    ITEMS,
    LOCATIONS,
    WITHDRAW_REASONS,
    MERIT_ITEM_KEY,
    UEC_ITEM_KEY,
    UEC_LOCATION,
    STAFF_ROLE_ID,
    REQUEST_CHANNEL_ID,
    PATCH_ADJUST_ROLE_ID,
    PATCH_LOG_CHANNEL_ID,
    ITEM_GROUPS,
    WIKELO_BUNDLES,
} = require('./utils/inventoryDB');
const legalShips = require('./utils/legalShips');

const net = require('net');
const {
    handleReaction,
    setupChannelClosureChecker
} = require('./events/interactionCreate');
const {
    connectToMySQL,
    upsertBlightVeilMember,
    closeMySQLConnection,
    validateApiKey,
    getLeaderboardActivePlayers,
    expireEloPenalties,
    getEloHistory,
    cleanupDuplicatePlayers,
    validateConnection,
} = require('./db');
const { enqueueKillEvent } = require('./utils/reportKill');
const { fetchOnlineUsers } = require('./utils/OnlineKTUsers');
const { ChannelReviver } = require('./utils/channelReviver');
const {
    scheduleLeaderboards,
    postWeeklyLeaderboard,
    appendEloUpdateMessage ,
    postLiveEloLeaderboard,
    postLeaderboards,
} = require('./utils/leaderboards');
const { 
    evaluateSquireTrial,
    evaluateDueTrials,
    handleWeeklyEvaluateButton,
    handleWeeklyExtendButton,
    handleWeeklyUpdateButton,
    handleWeeklySkipButton,
    handleConfirmEvaluateButton,
    handleConfirmExtendButton,
    handleCancelEvaluate,
    handleCancelExtend,
    handleWeeklyEvaluationButton,
    postWeeklyTrialReminder,
    weeklyTrialReminderJob 
    } = require('./utils/evaluateSquireTrial');
const {
    trackVoiceActivity,
    scheduleMonthlySummary,
    scheduleGhostCleanup,
    scheduleHeatmapUpdate,
    generateGlobalVoiceHeatmap,
} = require('./utils/voiceActivity');
const {
    getHeatmapMessageId,
    saveHeatmapMessageId
} = require('./utils/heatmapStorage');
const { checkLM9Evaluations } = require('./utils/cultureFitReminder');
const { CommanderModeDBClean } = require('./utils/CommanderModeDBClean');
const { HeartbeatDBClean } = require('./utils/HeartbeatDBClean');
const { updateOnlineUsersEmbed } = require('./utils/OnlineKTUsers');
const { handleExpiredRoles } = require('./events/messageMonitor');
const { runEvaluationCheck, scheduleEvaluationCheck } = require('./handlers/evaluationScheduler.js');
const { registerSlashCommands, unregisterSlashCommands } = require('./handlers/commandManager.js');
const { ignoredVictimRules } = require('./utils/ignoredVictimRules');
const { updateGlicko2Api } = require('./utils/glicko2');
const {
    startCommanderSession,
    endCommanderSession,
    recordKillInSession,
} = require('./utils/commanderSessions');
dotenv.config();
const { v4: uuidv4 } = require('uuid');

// ========== SERVITOR INITIALIZATION CHECK ==========
let isServitorInitialized = false;

// Middleware to check initialization status
function checkServitorReady(req, res, next) {
    if (!isServitorInitialized) {
        return res.status(503).json({ 
            error: 'Service Unavailable', 
            message: 'Servitor is still initializing. Please try again shortly.' 
        });
    }
    next();
}
// ========== END SERVITOR INITIALIZATION CHECK ==========

// ========== VOICE RECORDING SYSTEM ==========
const { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus, EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const fsSync = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const LocalWhisperTranscriber = require('./utils/LocalWhisperTranscriber');

class VoiceRecorder extends EventEmitter {
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.config = {
      recordingsDir: path.join(__dirname, './recordings'),
      transcriptsDir: path.join(__dirname, './transcripts'),
      tempDir: path.join(__dirname, './temp_voice'),
      processedDir: path.join(__dirname, './processed_audio'),
      maxDuration: options.maxDuration || 3600000,
      whisperServer: options.whisperServer || 'http://localhost:5000',
      retryAttempts: 3,
      cleanupAfterHours: options.cleanupAfterHours || 24
    };
    this.sessions = new Map();
    this.ensureDirectories();
    this.startCleanupJob();
  }

  ensureDirectories() {
    [this.config.recordingsDir, this.config.transcriptsDir, this.config.tempDir, this.config.processedDir].forEach(dir => {
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
    });
  }


  async startRecording(interaction) {
    const guildId = interaction.guildId;
    if (this.sessions.has(guildId)) {
      return { success: false, error: 'Already recording in this server' };
    }

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.voice.channel) {
        return { success: false, error: 'You need to be in a voice channel' };
      }

      const voiceChannel = member.voice.channel;
      const sessionId = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();

      const session = {
        id: sessionId,
        guildId,
        channelId: voiceChannel.id,
        channelName: voiceChannel.name,
        userId: interaction.user.id,
        username: interaction.user.username,
        startTime: timestamp,
        status: 'connecting',
        audioStreams: new Map(),
        connection: null,
        combinedStream: null
      };

      // Join voice channel
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true
      });

      session.connection = connection;

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Voice connection timeout')), 10000);
        connection.once(VoiceConnectionStatus.Ready, () => {
          clearTimeout(timeout);
          resolve();
        });
        connection.once('error', reject);
      });

      // Create output file
      const filename = `recording_${guildId}_${timestamp}_${sessionId}`;
      session.files = {
        pcm: path.join(this.config.tempDir, `${filename}.pcm`),
        wav: path.join(this.config.recordingsDir, `${filename}.wav`),
        transcript: null
      };

      session.combinedStream = fsSync.createWriteStream(session.files.pcm);

      // Listen for speaking users
      connection.receiver.speaking.on('start', (userId) => {
        if (!session.audioStreams.has(userId)) {
          const audioStream = connection.receiver.subscribe(userId, {
            end: { behavior: EndBehaviorType.AfterSilence, duration: 100 }
          });

          const opusDecoder = new prism.opus.Decoder({
            frameSize: 960,
            channels: 2,
            rate: 48000
          });

          audioStream.pipe(opusDecoder).pipe(session.combinedStream, { end: false });
          
          session.audioStreams.set(userId, {
            userId,
            username: this.client.users.cache.get(userId)?.username || userId,
            audioStream,
            opusDecoder
          });
        }
      });

      session.status = 'recording';
      this.sessions.set(guildId, session);

      return {
        success: true,
        sessionId,
        channelName: voiceChannel.name,
        startTime: timestamp
      };

    } catch (error) {
      console.error('Error starting recording:', error);
      return { success: false, error: error.message };
    }
  }

  async checkWhisperServerHealth() {
    try {
      const response = await axios.get(`${this.config.whisperServer}/health`, {
        timeout: 5000
      });
      
      if (response.data.status === 'healthy') {
        console.log('Whisper server is healthy');
        return { healthy: true, message: 'Whisper server is ready' };
      } else {
        console.warn('Whisper server returned unhealthy status');
        return { healthy: false, message: 'Whisper server is unhealthy' };
      }
      
    } catch (error) {
      console.error('Whisper server health check failed:', error.message);
      return { 
        healthy: false, 
        message: `Whisper server is unreachable: ${error.message}` 
      };
    }
  }

  async stopRecording(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) {
      return { success: false, error: 'No active recording' };
    }

    try {
      session.status = 'stopping';

      // Stop all streams
      for (const [userId, streams] of session.audioStreams) {
        streams.audioStream?.destroy();
        streams.opusDecoder?.destroy();
      }

      // Close combined stream
      if (session.combinedStream) {
        session.combinedStream.end();
      }

      // Disconnect
      if (session.connection) {
        session.connection.destroy();
      }

      // Wait for streams to flush
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Convert to WAV
      await this.convertToWav(session.files.pcm, session.files.wav);

      // Transcribe
      const transcriptResult = await this.transcribeAudio(session.files.wav);
      session.files.transcript = transcriptResult;

      // Clean up PCM file
      if (fsSync.existsSync(session.files.pcm)) {
        fsSync.unlinkSync(session.files.pcm);
      }

      const duration = Date.now() - session.startTime;
      this.sessions.delete(guildId);

      return {
        success: true,
        sessionId: session.id,
        duration,
        wavPath: session.files.wav,
        transcript: transcriptResult.text,
        transcriptPath: transcriptResult.transcriptPath,
        wordCount: transcriptResult.wordCount,
        language: transcriptResult.language
      };

    } catch (error) {
      session.status = 'error';
      console.error('Error stopping recording:', error);
      
      // Clean up temp files even on error
      try {
        if (session.files?.pcm && fsSync.existsSync(session.files.pcm)) {
          fsSync.unlinkSync(session.files.pcm);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up PCM file:', cleanupError.message);
      }
      
      return { success: false, error: error.message };
    }
  }

  async convertToWav(pcmPath, wavPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 's16le', '-ar', '48000', '-ac', '2',
        '-i', pcmPath,
        '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
        '-y', wavPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(wavPath);
        else reject(new Error(`FFmpeg failed with code ${code}`));
      });
    });
  }

  async transcribeAudio(wavPath) {
    try {
      console.log(`[VoiceRecorder] Starting local transcription...`);
      
      // Initialize transcriber
      const transcriber = new LocalWhisperTranscriber({
        modelsDir: path.join(__dirname, './whisper_models'),
        processedDir: this.config.processedDir
      });
      
      // Process and transcribe
      const result = await transcriber.transcribeWithFallback(wavPath, {
        language: null,
        translate: false
      });
      
      // Save transcript
      const transcriptPath = await this.saveTranscript(wavPath, result);
      
      if (result.success) {
        console.log(`[VoiceRecorder] Transcription successful: ${result.wordCount || 0} words`);
        
        return {
          text: result.text,
          language: result.language,
          wordCount: result.wordCount || 0,
          transcriptPath: transcriptPath,
          segments: result.segments || []
        };
      } else {
        console.error(`[VoiceRecorder] Transcription failed: ${result.error}`);
        return {
          text: result.text || `[Transcription failed: ${result.error}]`,
          language: result.language || 'unknown',
          transcriptPath: transcriptPath,
          segments: []
        };
      }
      
    } catch (error) {
      console.error(`[VoiceRecorder] Transcription error: ${error.message}`);
      return {
        text: `[Transcription Error: ${error.message}]`,
        language: 'unknown',
        transcriptPath: null,
        segments: []
      };
    }
  }

  async saveTranscript(wavPath, result) {
    try {
      const transcriptPath = wavPath.replace('.wav', '_transcript.txt');
      
      const transcriptData = [
        `Transcription Results:`,
        `=====================`,
        `File: ${path.basename(wavPath)}`,
        `Language: ${result.language || 'unknown'}`,
        `Word Count: ${result.wordCount || 'N/A'}`,
        `Timestamp: ${new Date().toISOString()}`,
        ``,
        `Transcript:`,
        `-----------`,
        result.text || 'No transcript available',
      ];
      
      if (result.segments && result.segments.length > 0) {
        transcriptData.push(``, `Segments:`, `---------`);
        result.segments.forEach((segment, index) => {
          const start = segment.start || 0;
          const end = segment.end || 0;
          transcriptData.push(`[${start.toFixed(2)} - ${end.toFixed(2)}] ${segment.text || ''}`);
        });
      }
      
      // Use fs.promises.writeFile
      await fs.writeFile(transcriptPath, transcriptData.join('\n'));
      console.log(`[VoiceRecorder] Transcript saved: ${transcriptPath}`);
      
      return transcriptPath;
      
    } catch (error) {
      console.error(`[VoiceRecorder] Failed to save transcript: ${error.message}`);
      return null;
    }
  }

  async leaveRecording(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return { success: false, error: 'No active recording' };

    if (session.connection) session.connection.destroy();
    if (session.files?.pcm && fsSync.existsSync(session.files.pcm)) {
      fsSync.unlinkSync(session.files.pcm);
    }

    this.sessions.delete(guildId);
    return { success: true };
  }

  getRecordingStatus(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return null;

    return {
      recording: session.status === 'recording',
      startTime: session.startTime,
      channelName: session.channelName,
      duration: Date.now() - session.startTime,
      users: Array.from(session.audioStreams.values()).map(s => s.username)
    };
  }

  async cleanupOldFiles() {
    const maxAge = this.config.cleanupAfterHours * 60 * 60 * 1000;
    const now = Date.now();

    // Clean up multiple directories
    const dirsToClean = [this.config.tempDir, this.config.processedDir, this.config.recordingsDir];
    
    for (const dir of dirsToClean) {
      if (!fsSync.existsSync(dir)) continue;
      
      try {
        const files = fsSync.readdirSync(dir);
        for (const file of files) {
          const filepath = path.join(dir, file);
          const stats = fsSync.statSync(filepath);
          
          if (now - stats.mtimeMs > maxAge) {
            try {
              fsSync.unlinkSync(filepath);
              console.log(`[VoiceRecorder] Cleaned up old file: ${filepath}`);
              
              // Also clean up transcript if it exists
              if (file.endsWith('.wav')) {
                const transcriptPath = filepath.replace('.wav', '_transcript.txt');
                if (fsSync.existsSync(transcriptPath)) {
                  fsSync.unlinkSync(transcriptPath);
                }
              }
            } catch (error) {
              console.error(`[VoiceRecorder] Failed to clean up file ${filepath}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.error(`[VoiceRecorder] Error cleaning directory ${dir}:`, error.message);
      }
    }
  }

  startCleanupJob() {
    // Clean up old temp files every hour
    setInterval(() => {
      this.cleanupOldFiles();
    }, 3600000);
    
    // Initial cleanup
    this.cleanupOldFiles();
  }
}

// ========== END VOICE RECORDING SYSTEM ==========

// ========== PUBLIC API RATE LIMITING MIDDLEWARE ==========
function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean old entries
    for (const [key, data] of rateLimitMap.entries()) {
        if (now - data.windowStart > RATE_LIMIT_WINDOW) {
            rateLimitMap.delete(key);
        }
    }
    
    const rateKey = `ratelimit:${ip}`;
    const rateData = rateLimitMap.get(rateKey) || { count: 0, windowStart: now };
    
    if (now - rateData.windowStart > RATE_LIMIT_WINDOW) {
        rateData.count = 1;
        rateData.windowStart = now;
        rateLimitMap.set(rateKey, rateData);
        next();
    } else {
        rateData.count++;
        rateLimitMap.set(rateKey, rateData);
        
        if (rateData.count > RATE_LIMIT_MAX_REQUESTS) {
            res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Too many requests. Limit: ${RATE_LIMIT_MAX_REQUESTS} per minute.`,
                retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - rateData.windowStart)) / 1000)
            });
        } else {
            next();
        }
    }
}
// ========== END PUBLIC API RATE LIMITING MIDDLEWARE ==========

// ========== PUBLIC ROLE API HELPER FUNCTIONS ==========
// Helper: Fetch and format role data with caching
async function fetchRoleData(guildId) {
    const cacheKey = `roles:${guildId}`;
    const cachedData = roleApiCache.get(cacheKey);
    
    if (cachedData) {
        consoleLog(`[PUBLIC-API] Role data cache HIT for guild ${guildId}`);
        return cachedData;
    }
    
    consoleLog(`[PUBLIC-API] Role cache MISS for guild ${guildId}, fetching from Discord...`);
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw new Error('Guild not found');
        }
        
        // Fetch all members to ensure cache is populated
        await guild.members.fetch({ withPresences: false, timeout: 30000 });
        
        const rolesData = [];
        
        // Sort roles by position (highest first)
        const sortedRoles = [...guild.roles.cache.values()]
            .sort((a, b) => b.position - a.position);
        
        for (const role of sortedRoles) {
            // Skip @everyone and managed roles (bot roles)
            if (role.id === guild.id || role.managed) continue;
            
            // Get members with this role
            const membersWithRole = role.members.map(member => ({
                id: member.id,
                username: member.user.username,
                displayName: member.displayName,
                joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null
            }));
            
            // Only include roles that have members
            if (membersWithRole.length > 0) {
                rolesData.push({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    position: role.position,
                    memberCount: membersWithRole.length,
                    members: membersWithRole
                });
            }
        }
        
        const response = {
            guild: {
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount,
                fetchedAt: new Date().toISOString()
            },
            roles: rolesData,
            totalRoles: rolesData.length
        };
        
        // Cache the data for 5 minutes
        roleApiCache.set(cacheKey, response);
        
        return response;
        
    } catch (error) {
        consoleLog(`[PUBLIC-API] Error fetching role data: ${error.message}`);
        throw error;
    }
}
// ========== END PUBLIC ROLE API HELPER FUNCTIONS ==========

// Channel revival configuration
const REVIVAL_CHANNEL_IDS = [
    //'', // Template   
    '1360017567145529355', // CQB Specialty Info 
    '1314671685386899609', // Grant Specialty 
    '1360023727382728999', //Cracked Infantry
    '1431325379217457263', //Advanced Infantry
    '1369006181107896461', // Cracked Pilot
    '1422840881253318706', //Entombed-Rise
    '1279093497235898368', //Feedback IC
    '1420555126258663535', //Event Attendance Log
    '1318324633396580472', //Sponsor A Knight
    '1431325379217457263', //Advanced Infantry Req
    '1429265608314191932', //Dev Thoughts
    '1345074295604514867', //Inf Master Doc
    '1345110640230010980', //Plt Master Doc
    
];
const REVIVAL_INTERVAL_DAYS = 5;

// ----- Discord Client -----
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
    ],
    rest: {
        rejectOnRateLimit: ['/guilds/*/members'],
    },
});

// Command handling
client.commands = new Collection(); // For prefix commands (!command)
client.slashCommands = new Collection(); // For slash commands (/command)
client.events = new Collection();

const myCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
client.fightSessions = new Map();
const requestCache = new Map();
client.claimedChannels = new Map();
client.streamerRequestDMs = new Map();

// Member cache for player lookups - 1 hour TTL
const memberCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
let lastMemberFetch = 0;
const MEMBER_FETCH_INTERVAL = 3600000; // 1 hour

// MySQL connection
connectToMySQL()
    .then(() => consoleLog("Connected to MySQL"))
    .catch(err => console.error("Failed to connect to MySQL", err));

// Enhanced API Call Logging
const oldRequest = client.rest.request;
client.rest.request = async function (method, url, options) {
    const startTime = Date.now();
    const response = await oldRequest.call(this, method, url, options);
    return response;
};
client.on('rateLimit', (info) => consoleLog(`Rate limit hit: ${info}`));

// Load prefix commands
const loadPrefixCommands = (dir) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) loadPrefixCommands(filePath);
        else if (file.isFile() && file.name.endsWith('.js')) {
            try {
                const command = require(path.resolve(filePath));
                // Check if it's a prefix command (has name and execute but not data property)
                if (command.name && typeof command.execute === 'function' && !command.data) {
                    client.commands.set(command.name.toLowerCase(), command);
                    consoleLog(`Loaded prefix command: ${command.name.toLowerCase()} from ${filePath}`);
                }
                // Check if it's a slash command (has data property)
                else if (command.data && typeof command.execute === 'function') {
                    client.slashCommands.set(command.data.name, command);
                    consoleLog(`Loaded slash command: ${command.data.name} from ${filePath}`);
                }
            } catch (error) {
                console.error(`Error loading command file ${filePath}:`, error.message);
            }
        }
    }
};

// Load commands from commands folder
loadPrefixCommands('./commands');

// Load events
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(path.resolve(`./events/${file}`));
    client.events.set(event.name, event);
    if (event.once) {
        client.once(event.name, (...args) => {
            if (event.name !== 'voiceStateUpdate') {
                consoleLog(`Event '${event.name}' triggered (once).`);
            }
            event.execute(...args, client, myCache);
        });
    } else {
        client.on(event.name, (...args) => {
            if (event.name !== 'voiceStateUpdate') {
                consoleLog(`Event '${event.name}' triggered.`);
            }
            event.execute(...args, client, myCache);
        });
    }
}

// Prefix command handler
client.on('messageCreate', async (message) => {
    // Ignore bot messages and messages without prefix
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    
    if (!command) {
        // Optional: Provide a helpful message about slash commands
        if (commandName === 'help' || commandName === 'commands') {
            await message.reply('Some commands are now available as slash commands (`/`). Try typing `/` to see available commands.');
        }
        return;
    }
    
    try { 
        await command.execute(message, args, client); 
    } catch (error) {
        console.error(`Error executing prefix command "${commandName}": ${error}`);
        await message.reply(`There was an error trying to execute that command!`);
    }
});

// Reaction listeners
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) try { await reaction.fetch(); } catch (error) { return; }
    await handleReaction(reaction, user, true);
});
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) try { await reaction.fetch(); } catch (error) { return; }
    await handleReaction(reaction, user, false);
});

const readyEvent = client.once ? 'clientReady' : 'ready';
client.once(readyEvent, async () => {
    consoleLog(`Servitor Connection Valid`);
    consoleLog(`Logged in as ${client.user.tag}!`);
    try {
        const db = await connectToMySQL(); // <-- Ensure MySQL connection
        
        // Get guild reference first
        const guild = client.guilds.cache.get('1166103102378750033');
        if (!guild) throw new Error('Guild not found.');

        // ========== PUBLIC ROLE API READY CHECK ==========
        consoleLog('Initializing public role API cache system...');
        // Pre-warm cache for the main guild
        try {
            const mainGuildId = '1166103102378750033';
            await fetchRoleData(mainGuildId);
            consoleLog(`[PUBLIC-API] Pre-warmed role cache for guild ${mainGuildId}`);
        } catch (error) {
            consoleLog(`[PUBLIC-API] Failed to pre-warm cache: ${error.message}`);
        }
        // ========== END PUBLIC ROLE API INITIALIZATION ==========
        
        // ========== REGISTER SLASH COMMANDS ==========
        consoleLog('Registering slash commands...');
        try {
            const commands = [];
            for (const [name, command] of client.slashCommands) {
                commands.push(command.data.toJSON());
            }
            
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            
            consoleLog(`Started refreshing ${commands.length} application (/) commands.`);
            
            // Register commands globally
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            
            consoleLog(`Successfully reloaded ${data.length} application (/) commands.`);
            
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }
        // ========== END SLASH COMMAND REGISTRATION ==========

        // ========== ENHANCED MEMBER CACHE SYSTEM ==========
        consoleLog('Initializing enhanced member cache system...');
        await refreshMemberCache(); // Initial cache load

        // Pre-warm cache from database with COMPLETE player data
        consoleLog('Pre-warming member cache from database...');
        try {
            const [allMembers] = await db.query(`
                SELECT 
                    user_id AS id, 
                    username, 
                    dojo_elo_api,
                    dojo_glicko_elo,
                    dojo_glicko_rd, 
                    dojo_glicko_vol,
                    matches_played,
                    kills,
                    deaths,
                    'members' as table_name
                FROM members 
                UNION 
                SELECT 
                    id, 
                    username, 
                    dojo_elo_api,
                    dojo_glicko_elo,
                    dojo_glicko_rd,
                    dojo_glicko_vol,
                    matches_played,
                    kills,
                    deaths,
                    'global_players' as table_name
                FROM global_players
            `);

            allMembers.forEach(member => {
                const normalizedName = normalizeName(member.username);
                // Store COMPLETE player data in cache
                memberCache.set(normalizedName, { 
                    id: member.id, 
                    username: member.username,
                    dojo_elo_api: member.dojo_elo_api || 1200,
                    dojo_glicko_elo: member.dojo_glicko_elo || 1200,
                    dojo_glicko_rd: member.dojo_glicko_rd || 350,
                    dojo_glicko_vol: member.dojo_glicko_vol || 0.06,
                    matchesPlayed: member.matches_played || 0,
                    kills: member.kills || 0,
                    deaths: member.deaths || 0,
                    table: member.table_name
                });
            });
            consoleLog(`Pre-warmed cache with ${allMembers.length} complete member records from database`);
        } catch (error) {
            consoleLog(`Error pre-warming cache: ${error.message}`);
            await appendLog(`Cache pre-warm error: ${error.message}`);
        }
        // ========== END OF ENHANCED SECTION ==========

        const channel = await client.channels.fetch('1329181164933480578');
        consoleLog(`Channel fetched: ${channel?.name || 'Unknown'}`);

        // -----------------------------
        // Run Elo penalties expiration
        // -----------------------------
        consoleLog('Starting Elo penalties expiration...');
        await expireEloPenalties(db); // Run once on startup
        setInterval(() => {
            expireEloPenalties(db).catch(err => 
                consoleLog(`Elo penalties interval error: ${err.message}`)
            );
        }, 10 * 60 * 1000); // Repeat every 10 minutes
        consoleLog('Elo penalties expiration initialized');

        // ========== INITIALIZE VOICE RECORDER ==========
        consoleLog('Initializing voice recording system...');
        client.voiceRecorder = new VoiceRecorder(client, {
          whisperServer: process.env.WHISPER_SERVER || 'http://localhost:5000',
          maxDuration: 7200000 // 2 hours
        });
        consoleLog('Voice recording system initialized');
        
        // Check Whisper server health
        consoleLog('Checking Whisper server health...');
        const health = await client.voiceRecorder.checkWhisperServerHealth();
        if (health.healthy) {
          consoleLog('✅ Whisper server is ready');
        } else {
          consoleLog(`⚠️ Whisper server warning: ${health.message}`);
        }
        // ========== END VOICE RECORDER INIT ==========

        // -----------------------------
        // Initialize various services
        // -----------------------------
        consoleLog('Initializing evaluation system...');
        await runEvaluationCheck(client);
        scheduleEvaluationCheck(client);
        
        consoleLog('Initializing voice activity tracking...');
        scheduleMonthlySummary(client);
        scheduleGhostCleanup(client);
        await startDailyCleanup();

        // HEATMAP INTEGRATION
        consoleLog('Initializing heatmap system...');
        const HEATMAP_CHANNEL_ID = '1186510273251639306';
        let currentHeatmapMessageId = await getHeatmapMessageId();
        const newHeatmapMessageId = await generateGlobalVoiceHeatmap(client, HEATMAP_CHANNEL_ID, currentHeatmapMessageId);
        if (newHeatmapMessageId && newHeatmapMessageId !== currentHeatmapMessageId) {
            await saveHeatmapMessageId(newHeatmapMessageId);
            consoleLog(`Heatmap message updated: ${newHeatmapMessageId}`);
        }
        scheduleHeatmapUpdate(client, HEATMAP_CHANNEL_ID);

        consoleLog('Running initial evaluations...');
        evaluateDueTrials(guild);
        await handleExpiredRoles(client);

        // Update members in batches with logging
        consoleLog(`Updating member database (${guild.members.cache.size} members to process)...`);
        const members = guild.members.cache;
        const batchSize = 15;
        let processed = 0;

        for (let i = 0; i < members.size; i += batchSize) {
            const batch = Array.from(members.values()).slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (member) => {
                const memberRoles = member.roles.cache.map(role => role.id);
                try { 
                    await upsertBlightVeilMember(member.id, guild.id, member.user.username, memberRoles);
                    
                    // Update cache with COMPLETE member data
                    const normalizedName = normalizeName(member.user.username);
                    // Fetch fresh data to ensure we have ELO values
                    const [freshData] = await db.query(`
                        SELECT user_id as id, username, dojo_elo_api, dojo_glicko_elo, dojo_glicko_rd, dojo_glicko_vol, matches_played, kills, deaths
                        FROM members WHERE user_id = ?
                    `, [member.id]);
                    
                    if (freshData.length > 0) {
                        const playerData = freshData[0];
                        memberCache.set(normalizedName, { 
                            id: playerData.id, 
                            username: playerData.username,
                            dojo_elo_api: playerData.dojo_elo_api || 1200,
                            dojo_glicko_elo: playerData.dojo_glicko_elo || 1200,
                            dojo_glicko_rd: playerData.dojo_glicko_rd || 350,
                            dojo_glicko_vol: playerData.dojo_glicko_vol || 0.06,
                            matchesPlayed: playerData.matches_played || 0,
                            kills: playerData.kills || 0,
                            deaths: playerData.deaths || 0,
                            table: 'members'
                        });
                    }
                    
                    processed++;
                } catch (err) { 
                    console.error(`Error updating member ${member.user.username} in MySQL:`, err);
                    await appendLog(`Member update error: ${member.user.username} - ${err.message}`);
                }
            }));
            
            // Log progress every few batches
            if (processed % 50 === 0) {
                consoleLog(`Member update progress: ${processed}/${members.size}`);
            }
            
            // Rate limiting between batches
            if (i + batchSize < members.size) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        consoleLog(`Member database update completed: ${processed} members processed`);

        // Action log system
        consoleLog('Initializing action log system...');
        const actionLogEvent = client.events.get('actionLog');
        if (actionLogEvent) {
            await actionLogEvent.execute(client);
            consoleLog('Action log system started');
        }
        /*  
        // ========== LEADERBOARDS INITIALIZATION ==========
        consoleLog('Initializing leaderboards system...');

        /* 
        // Post leaderboards immediately on startup (for today)  
        try {
            consoleLog('Posting initial daily leaderboards...');
            
            // TEST: Send reminder to ALL active trial threads
            //await postWeeklyTrialReminderToAllActive(client);
            
            consoleLog('Initial daily leaderboards posted successfully');
        } catch (error) {
            consoleLog(`Error posting initial leaderboards: ${error.message}`);
            await appendLog(`Leaderboards initial post error: ${error.message}`);
        }
        */
        // Leaderboards
        consoleLog('Scheduling leaderboards...');
        //scheduleLeaderboards(client);

        // Initialize ELO system components
        consoleLog('Initializing ELO system components...');
        try {
            // Start the report queue processing
            consoleLog('Starting report queue processing...');
            processReportQueue();
            
            // Initialize player creation locks cleanup
            setInterval(() => {
                // Clean up any stale locks (older than 5 minutes)
                const now = Date.now();
                for (const [key, lock] of playerCreationLocks.entries()) {
                    // If lock has been resolved for more than 5 minutes, clean it up
                    if (lock._cleanupTime && (now - lock._cleanupTime) > 300000) {
                        playerCreationLocks.delete(key);
                    }
                }
            }, 300000); // Run every 5 minutes
            
            consoleLog('ELO system components initialized successfully');
        } catch (error) {
            consoleLog(`ELO system initialization error: ${error.message}`);
            await appendLog(`ELO system init error: ${error.message}`);
        }

        // -----------------------------
        // Set up intervals with error handling
        // -----------------------------
        consoleLog('Setting up interval tasks...');
        
        // Enhanced cache refresh interval with validation
        setInterval(async () => { 
            try { 
                consoleLog('Running scheduled member cache refresh...');
                await refreshMemberCache();
                consoleLog('Member cache refresh completed successfully');
            } catch (error) {
                consoleLog(`Member cache refresh error: ${error.message}`);
                await appendLog(`Member cache refresh error: ${error.message}`);
            }
        }, MEMBER_FETCH_INTERVAL);
        
        // ELO fight cache cleanup (remove old fight keys)
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of eloFightCache.entries()) {
                if (now - timestamp > 60000) { // Older than 60 seconds
                    eloFightCache.delete(key);
                }
            }
        }, 30000); // Run every 30 seconds
        
        setInterval(async () => { 
            try { 
                await evaluateDueTrials(guild); 
            } catch (error) {
                consoleLog(`Evaluate trials error: ${error.message}`);
                await appendLog(`Evaluate trials error: ${error.message}`);
            }
        }, 3600000);
        
        setInterval(async () => { 
            try { 
                /* await checkLM9Evaluations(guild); */ 
            } catch (error) {
                consoleLog(`LM9 evaluations error: ${error.message}`);
            }
        }, 86400000);

        setInterval(() => {
            validateAndCleanCache();
        }, 300000); // Every 5 minutes
         
        setInterval(async () => {
            if (new Date().getDate() === 1) {
                try { 
                    await generateMonthlySummary(client); 
                    consoleLog('Monthly summary generated');
                } catch (error) {
                    consoleLog(`Monthly summary error: ${error.message}`);
                    await appendLog(`Monthly summary error: ${error.message}`);
                }
            }
        }, 86400000);
        /*
        setInterval(async () => { 
            try { 
                await updateOnlineUsersEmbed(channel); 
            } catch (error) {
                consoleLog(`Online users embed error: ${error.message}`);
            }
        }, 60000);
        */
        /*
        setInterval(async () => { 
            try { 
                await HeartbeatDBClean(); 
            } catch (error) {
                consoleLog(`Heartbeat cleanup error: ${error.message}`);
                await appendLog(`Heartbeat cleanup error: ${error.message}`);
            }
        }, 60000);
        */
        /*
        setInterval(async () => { 
            try { 
                await CommanderModeDBClean(); 
            } catch (error) {
                consoleLog(`Commander mode cleanup error: ${error.message}`);
                await appendLog(`Commander mode cleanup error: ${error.message}`);
            }
        }, 300000);
        */
        setInterval(async () => { 
            try { 
                await handleExpiredRoles(client); 
            } catch (error) {
                consoleLog(`Expired roles error: ${error.message}`);
                await appendLog(`Expired roles error: ${error.message}`);
            }
        }, 3600000);

        // Database connection health check
        setInterval(async () => {
            try {
                const [result] = await db.query('SELECT 1 as health_check');
                if (result[0].health_check !== 1) {
                    throw new Error('Database health check failed');
                }
            } catch (error) {
                consoleLog(`Database health check failed: ${error.message}`);
                await appendLog(`Database health check failed: ${error.message}`);
            }
        }, 300000); // Every 5 minutes

        consoleLog('Initializing channel revival system...');
        const channelReviver = new ChannelReviver(client, REVIVAL_CHANNEL_IDS, REVIVAL_INTERVAL_DAYS);
        channelReviver.start();
        consoleLog('Channel revival system started');

        consoleLog('Initializing channel closure system...');
        setupChannelClosureChecker(client);
        consoleLog('Channel closure system initialized');

        // ========== STAR CITIZEN STATUS MONITOR INITIALIZATION ==========
        consoleLog('Initializing Star Citizen Status Monitor...');
        try {
            const StarCitizenStatusMonitor = require('./utils/starCitizenStatusMonitor');
            client.starCitizenMonitor = new StarCitizenStatusMonitor(client);
            await client.starCitizenMonitor.initialize();
            consoleLog('Star Citizen Status Monitor initialized successfully');
        } catch (error) {
            consoleLog(`Star Citizen Status Monitor initialization error: ${error.message}`);
            await appendLog(`SC Status Monitor init error: ${error.message}`);
        }
        // ========== END STAR CITIZEN STATUS MONITOR ==========

        // ========== EXECUTIVE HANGAR MANAGER INITIALIZATION ==========
        consoleLog('Initializing Executive Hangar Manager...');
        try {
            const ExecutiveHangarManager = require('./utils/executiveHangarTimers');
            client.hangarManager = new ExecutiveHangarManager(client);
            await client.hangarManager.initialize();
            consoleLog('Executive Hangar Manager initialized successfully');
        } catch (error) {
            consoleLog(`Executive Hangar Manager initialization error: ${error.message}`);
            await appendLog(`Hangar Manager init error: ${error.message}`);
        }
        // ========== END EXECUTIVE HANGAR MANAGER ==========


        // ========== INVENTORY MESSAGE INITIALIZATION ==========
        console.log('Initializing inventory messages...');
        for (const guild of client.guilds.cache.values()) {
          try {
            // Use the new database-backed function
            await updateMainInventoryEmbedWithDB(guild);
            console.log('Inventory messages initialized successfully');
          } catch (error) {
            console.error('Failed to initialize inventory messages:', error);
            // Fallback to old method if database function fails
            try {
              const messageIds = await updateMainInventoryEmbed(guild, []);
              setStoredMessageIds(messageIds);
              console.log('Inventory messages initialized with fallback method');
            } catch (fallbackError) {
              console.error('Fallback method also failed:', fallbackError);
            }
          }
        }
        // ========== END INVENTORY INITIALIZATION ==========

        // Status rotation
        consoleLog('Setting up status rotation...');
        const statuses = [
            'Tracking Kill Events', 'Monitoring Commander Mode',
            'Watching the Veil', 'Calculating UEC Totals', 'Standing by for Orders',
            'Monitoring Star Citizen Status' // Added new status
        ];
        let statusIndex = 0;
        setInterval(() => {
            client.user.setPresence({
                status: 'online',
                activities: [{ name: statuses[statusIndex], type: 'WATCHING' }]
            });
            statusIndex = (statusIndex + 1) % statuses.length;
        }, 60000);

        consoleLog("Servitor Initialization Complete");
        await appendLog("Servitor Initialization Complete - All systems operational");
        
        // ========== SET SERVITOR AS INITIALIZED ==========
        isServitorInitialized = true;
        consoleLog("Servitor is now ready to accept API requests");

    } catch (error) {
        console.error('Error during bot initialization:', error);
        await appendLog(`CRITICAL: Bot initialization failed - ${error.message}\nStack: ${error.stack}`);
        // Don't set isServitorInitialized to true if initialization failed
    }
});

// ========== SLASH COMMAND HANDLER ==========
client.on('interactionCreate', async (interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.slashCommands.get(interaction.commandName);

        if (!command) {
            console.error(`No slash command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            // Check if the command has an executeSlash method for slash commands
            if (command.executeSlash) {
                await command.executeSlash(interaction);
            } else if (command.execute) {
                // Fallback to execute if executeSlash doesn't exist
                await command.execute(interaction);
            } else {
                throw new Error(`Command ${interaction.commandName} has no execute method.`);
            }
        } catch (error) {
            console.error(`Error executing slash command ${interaction.commandName}:`, error);
            
            // Try to reply with error
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                }
            } catch (replyError) {
                console.error('Could not send error reply:', replyError);
            }
        }
    }
    // Handle autocomplete interactions
    else if (interaction.isAutocomplete()) {
        const command = client.slashCommands.get(interaction.commandName);
        
        if (!command || !command.autocomplete) {
            console.error(`No autocomplete handler for ${interaction.commandName}`);
            return interaction.respond([]);
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
        }
    }
    // Handle other interaction types (buttons, modals, selects) if needed
    // else if (interaction.isButton()) { ... }
    // else if (interaction.isModalSubmit()) { ... }
});

function validateAndCleanCache() {
    consoleLog('[CACHE CLEANUP] Starting cache validation...');
    const allKeys = memberCache.keys();
    let cleanedCount = 0;
    
    allKeys.forEach(key => {
        const value = memberCache.get(key);
        // Remove entries that don't have proper structure
        if (!value || typeof value !== 'object' || !value.username || value.dojo_elo_api === undefined) {
            memberCache.del(key);
            cleanedCount++;
        }
    });
    
    if (cleanedCount > 0) {
        consoleLog(`[CACHE CLEANUP] Removed ${cleanedCount} invalid cache entries`);
    }
    
    consoleLog(`[CACHE CLEANUP] Cache validation complete. Current size: ${memberCache.keys().length}`);
}

// Daily cleanup function
function startDailyCleanup() {
    // Run every 24 hours (86400000 milliseconds)
    setInterval(async () => { 
        try { 
            console.log('[DAILY CLEANUP] Starting scheduled duplicate cleanup...');
            await cleanupDuplicatePlayers();
            console.log('[DAILY CLEANUP] Duplicate cleanup completed successfully');
        } catch (error) {
            console.error(`[DAILY CLEANUP] Error during scheduled cleanup: ${error.message}`);
        }
    }, 86400000); // 24 hours in milliseconds
    
    console.log('[DAILY CLEANUP] Scheduled daily cleanup running every 24 hours');
    
    // Run immediately on startup as well
    setTimeout(async () => {
        try {
            console.log('[STARTUP CLEANUP] Running initial duplicate cleanup...');
            await cleanupDuplicatePlayers();
            console.log('[STARTUP CLEANUP] Initial cleanup completed');
        } catch (error) {
            console.error(`[STARTUP CLEANUP] Error during initial cleanup: ${error.message}`);
        }
    }, 30000); // Wait 30 seconds after startup
}

// Close MySQL connection on exit
process.on('SIGINT', async () => {
    await closeMySQLConnection();
    consoleLog("MySQL connection closed.");
    process.exit();
});

// ----- HTTP Server -----
const app = express();
const PORT = 25966;
app.use(bodyParser.json());
app.use('/api/public', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// --- Utility and State ---
const eloFightCache = new Map();
const LOG_FILE = path.resolve('./kill_events_log.txt');

function normalizeTime(timeStr) {
  if (!timeStr) return '';
  // Remove leading/trailing angle brackets
  const cleanStr = timeStr.replace(/^<|>$/g, '');
  const date = new Date(cleanStr);
  if (isNaN(date)) return cleanStr; // fallback if invalid date

  // Return ISO string without milliseconds: "2025-08-02T19:27:24Z"
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function normalizeName(name) {
  return name.toString().trim().toLowerCase();
}

async function appendLog(message) {
  const timestamp = new Date().toISOString(); 
  const logLine = `[${timestamp}] ${message}\n`;
  try {
    await fs.promises.appendFile(LOG_FILE, logLine);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

async function consoleLog(message) {
  const timestamp = new Date().toISOString(); 
  const logLine = `[${timestamp}] ${message}`;
  try {
    console.log(logLine);
  } catch (err) {
    console.error('Failed to write to console:', err);
  }
}

/**
 * Get or create player record with CORRECT stale cache detection
 * FIXED: Actually refreshes stale entries from database
 */
async function getOrCreatePlayer(db, identifier) {
    if (!identifier) return null;

    const normalizedName = normalizeName(identifier.toString());

    // 1. Check cache first
    const cachedPlayer = memberCache.get(normalizedName);
    
    // 🚨 FIXED: If entry is marked as stale, FORCE refresh from database
    const isStale = cachedPlayer && cachedPlayer._lastInvalidated;
    
    if (cachedPlayer && cachedPlayer.dojo_elo_api !== undefined && !isStale) {
        consoleLog(`[CACHE] Cache HIT for: ${identifier} (ELO: ${cachedPlayer.dojo_elo_api})`);
        return cachedPlayer;
    }
    
    if (isStale) {
        consoleLog(`[CACHE] Cache STALE for: ${identifier} - FORCING database refresh`);
    } else {
        consoleLog(`[CACHE] Cache MISS for: ${identifier} - fetching from database`);
    }
    
    // 2. ALWAYS fetch fresh from database when stale or missing
    const [duplicateCheck] = await db.query(`
        SELECT 'members' as source_table, user_id as id, username, dojo_elo_api, dojo_glicko_elo, dojo_glicko_rd, dojo_glicko_vol, matches_played, kills, deaths
        FROM members 
        WHERE LOWER(username) = ? OR user_id = ?
        UNION ALL
        SELECT 'global_players' as source_table, id, username, dojo_elo_api, dojo_glicko_elo, dojo_glicko_rd, dojo_glicko_vol, matches_played, kills, deaths  
        FROM global_players
        WHERE LOWER(username) = ? OR id = ?
    `, [normalizedName, identifier, normalizedName, identifier]);

    let player;
    
    if (duplicateCheck.length > 0) {
        const membersRecord = duplicateCheck.find(record => record.source_table === 'members');
        const recordToUse = membersRecord || duplicateCheck[0];
        
        player = {
            id: recordToUse.id,
            username: recordToUse.username,
            dojo_elo_api: recordToUse.dojo_elo_api || 1200,
            dojo_glicko_elo: recordToUse.dojo_glicko_elo || 1200,
            dojo_glicko_rd: recordToUse.dojo_glicko_rd || 350,
            dojo_glicko_vol: recordToUse.dojo_glicko_vol || 0.06,
            matchesPlayed: recordToUse.matches_played || 0,
            kills: recordToUse.kills || 0,
            deaths: recordToUse.deaths || 0,
            table: recordToUse.source_table,
            _lastUpdated: Date.now()
        };

        consoleLog(`[GET PLAYER DEBUG] Fresh DB data for ${identifier}: Glicko ${player.dojo_glicko_elo}, matches: ${player.matchesPlayed}`);
    } else {
        // Create new player
        const defaultElo = 1200;
        const defaultRd = 350;
        const defaultVol = 0.06;

        const [result] = await db.query(`
            INSERT INTO global_players (username, dojo_elo_api, dojo_glicko_elo, dojo_glicko_rd, dojo_glicko_vol, matches_played, kills, deaths)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0)
        `, [identifier, defaultElo, defaultElo, defaultRd, defaultVol]);

        player = {
            id: result.insertId,
            username: identifier,
            dojo_elo_api: defaultElo,
            dojo_glicko_elo: defaultElo,
            dojo_glicko_rd: defaultRd,
            dojo_glicko_vol: defaultVol,
            matchesPlayed: 0,
            kills: 0,
            deaths: 0,
            table: 'global_players',
            _lastUpdated: Date.now()
        };
        
        consoleLog(`[GET PLAYER DEBUG] Created new player for ${identifier} in global_players`);
    }
    
    // 🚨 CRITICAL: ALWAYS update cache with fresh data and REMOVE stale marker
    delete player._lastInvalidated; // Remove stale marker
    memberCache.set(normalizedName, player);
    consoleLog(`[CACHE] Cached FRESH data for: ${identifier} (Glicko: ${player.dojo_glicko_elo})`);
    
    return player;
}

/**
 * Cache maintenance - cleans up old stale entries periodically
 */
function startCacheMaintenance() {
    setInterval(() => {
        const allKeys = memberCache.keys();
        let cleanedCount = 0;
        
        allKeys.forEach(key => {
            const value = memberCache.get(key);
            // Remove entries that have been stale for more than 5 minutes
            if (value && value._lastInvalidated && (Date.now() - value._lastInvalidated > 300000)) {
                memberCache.del(key);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            consoleLog(`[CACHE MAINTENANCE] Cleaned ${cleanedCount} old stale entries`);
        }
    }, 60000); // Run every minute
}

/**
 * Emergency cache rebuild - use if cache gets corrupted
 */
async function emergencyCacheRebuild() {
    consoleLog('[EMERGENCY] Performing emergency cache rebuild...');
    
    try {
        const db = await connectToMySQL();
        
        // Rebuild cache with complete data
        const [allMembers] = await db.query(`
            SELECT 
                user_id AS id, 
                username, 
                dojo_elo_api,
                dojo_glicko_elo,
                dojo_glicko_rd, 
                dojo_glicko_vol,
                matches_played,
                kills,
                deaths,
                'members' as table_name
            FROM members 
            UNION 
            SELECT 
                id, 
                username, 
                dojo_elo_api,
                dojo_glicko_elo,
                dojo_glicko_rd,
                dojo_glicko_vol,
                matches_played,
                kills,
                deaths,
                'global_players' as table_name
            FROM global_players
        `);

        allMembers.forEach(member => {
            const normalizedName = normalizeName(member.username);
            memberCache.set(normalizedName, { 
                id: member.id, 
                username: member.username,
                dojo_elo_api: member.dojo_elo_api || 1200,
                dojo_glicko_elo: member.dojo_glicko_elo || 1200,
                dojo_glicko_rd: member.dojo_glicko_rd || 350,
                dojo_glicko_vol: member.dojo_glicko_vol || 0.06,
                matchesPlayed: member.matches_played || 0,
                kills: member.kills || 0,
                deaths: member.deaths || 0,
                table: member.table_name,
                _lastUpdated: Date.now()
            });
        });
        
        consoleLog(`[EMERGENCY] Cache rebuilt with ${allMembers.length} entries`);
    } catch (error) {
        consoleLog(`[EMERGENCY] Cache rebuild failed: ${error.message}`);
    }
}

// Run emergency rebuild immediately
setTimeout(() => {
    emergencyCacheRebuild();
}, 3000);

// Start cache maintenance
startCacheMaintenance();

async function refreshMemberCache() {
    const now = Date.now();
    if (now - lastMemberFetch < MEMBER_FETCH_INTERVAL) {
        return; // Too soon to refresh
    }

    try {
        consoleLog('Refreshing member cache...');
        const guild = client.guilds.cache.get('1166103102378750033');
        if (!guild) {
            consoleLog('Guild not found for cache refresh');
            return;
        }

        // Fetch members with timeout and error handling
        await Promise.race([
            guild.members.fetch({ 
                timeout: 30000,
                force: false 
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Member fetch timeout')), 35000)
            )
        ]);
        
        lastMemberFetch = Date.now();
        consoleLog(`Member cache refreshed with ${guild.members.cache.size} members`);
        
    } catch (error) {
        consoleLog(`Member cache refresh failed: ${error.message}`);
        // Don't update lastMemberFetch on failure so we retry sooner
    }
}

// ========== PROTECTED API ENDPOINTS ==========

// Route: /validateKey (Heartbeat & Commander Mode)
app.post('/validateKey', checkServitorReady, async (req, res) => {
    // Declared in a higher scope
    let pool; 
    let connection;
    const apiKey = req.headers['authorization'];
    const { player, zone, client_ver, status, mode, player_name, is_commander, alloc_users } = req.body;
    //consoleLog(`[validateKey] Incoming request from: ${player_name}, with API key: ${apiKey}`);

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });

    try {
        const isValidKey = await validateApiKey(apiKey);

        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        pool = await connectToMySQL();
        connection = await pool.getConnection();

        // Get expiration info
        const [rows] = await connection.execute(
            'SELECT created_at FROM killtracker_keys WHERE api_key = ?',
            [apiKey]
        );
        //console.log(`[validateKey] API Key valid: ${isValidKey}, Key lookup result:`, rows);

        if (rows.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'API key not found in database' });
        }
        const createdAt = new Date(rows[0].created_at);
        const expirationDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

        if (player_name) {
            await connection.execute(
                'INSERT INTO heartbeats (player_name) VALUES (?) ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP',
                [player_name]
            );
           // console.log(`[validateKey] Updating heartbeat for player_name: ${player_name}`);
        }

        // Commander Mode
        if (mode === "commander") {
            //consoleLog(`[validateKey] Commander mode detected for player: ${player}, zone: ${zone}, status: ${status}`);

            if (!player || !zone || !client_ver || !status) {
                connection.release();
                console.warn(`[validateKey] Missing required fields for Commander Mode ${player},  ${zone},  ${client_ver},  ${status}`);
                return res.status(400).json({ error: 'Missing required fields for Commander Mode' });
            }

            const [existingCommander] = await connection.execute(
                'SELECT id, status, zone FROM commanders WHERE player = ? AND api_key = ?',
                [player, apiKey]
            );
           // consoleLog(`[validateKey] Existing commander query: ${existingCommander}`);

            let updatedStatus = status, updatedZone = zone;
            if (existingCommander.length > 0) {
                const lastStatus = existingCommander[0].status;
                const lastZone = existingCommander[0].zone;

                if (zone === "N/A") {
                    if (lastZone !== "N/A" && lastStatus === "alive") updatedStatus = "dead";
                } else {
                    if (lastZone === "N/A" && lastStatus === "dead") updatedStatus = "alive";
                }

               // consoleLog(`[validateKey] Updating commander: ${player}, status: ${updatedStatus}, zone: ${updatedZone}`);
                await connection.execute(
                    'UPDATE commanders SET zone = ?, status = ?, last_heartbeat = NOW() WHERE player = ? AND api_key = ?',
                    [updatedZone, updatedStatus, player, apiKey]
                );
            } else {
                consoleLog(`[validateKey] Inserting new commander: ${player}`);
                await connection.execute(
                    'INSERT INTO commanders (player, zone, status, api_key, last_heartbeat) VALUES (?, ?, ?, ?, NOW())',
                    [player, updatedZone, updatedStatus, apiKey]
                );
            }

            // Session logic
            const [sessions] = await pool.query(
                "SELECT * FROM commander_sessions WHERE commander_player=? AND api_key=? AND ended_at IS NULL",
                [player, apiKey]
            );
           // consoleLog(`[validateKey] Active sessions: ${sessions}`);

            let sessionId = sessions.length ? sessions[0].id : null;
            const allocGiven = Array.isArray(alloc_users) && alloc_users.length > 0;

            if (is_commander === true && allocGiven && !sessionId) {
                consoleLog(`[validateKey] Starting new commander session`);
                await startCommanderSession(player, apiKey, alloc_users, zone, status, client_ver);
            } else if (is_commander === true && sessionId) {
             //   consoleLog(`[validateKey] Heartbeat update for existing session ${sessionId}`);
                await pool.query(
                    "UPDATE commander_sessions SET zone=?, status=?, client_ver=?, last_heartbeat=NOW() WHERE id=?",
                    [zone, status, client_ver, sessionId]
                );
            } else if (is_commander === false && sessionId) {
                consoleLog(`[validateKey] Ending commander session ${sessionId}`);
                await endCommanderSession(player, apiKey, client);
            }

            connection.release();
            const [commanders] = await pool.query(
                'SELECT player, zone, status FROM commanders WHERE last_heartbeat > NOW() - INTERVAL 10 MINUTE'
            );
            return res.status(200).json({
                message: 'Commander Mode heartbeat recorded',
                commanders
            });
        }

        // Standard mode
        connection.release();
       // consoleLog(`[validateKey] Returning expiration info to ${player_name}.`);
        return res.status(200).json({
            status: 'valid',
            created_at: createdAt.toISOString(),
            expires_at: expirationDate.toISOString()
        });

    } catch (error) {
        console.error('Error handling /validateKey:', error);
        connection.release();
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * MORE AGGRESSIVE cache invalidation
 * FIXED: Forces immediate database refresh on next access
 */
async function invalidatePlayerCache(identifier) {
    const normalizedName = normalizeName(identifier);
    
    const cachedPlayer = memberCache.get(normalizedName);
    if (cachedPlayer) {
        // Set immediate stale marker that will force DB refresh
        cachedPlayer._lastInvalidated = Date.now();
        consoleLog(`[CACHE] FORCE MARKED STALE: ${identifier} (current Glicko: ${cachedPlayer.dojo_glicko_elo})`);
    } else {
        consoleLog(`[CACHE] No cache entry to mark stale for: ${identifier}`);
    }
}

/**
 * Process an Elo update given killer and victim player names.
 * USES GLICKO2 ONLY - no classic ELO calculation
 */
async function processEloUpdate(
  db,
  client,
  killerIdentifier,
  victimIdentifier,
  zone,
  game_mode,
  time,
  source = 'API',
  killers_ship,
  victims_ship
) {
  const startTime = Date.now();
  consoleLog(`[processEloUpdate] START - ${killerIdentifier} vs ${victimIdentifier}`);
  
  try {
    // Validate inputs
    if (!killerIdentifier || !victimIdentifier || game_mode !== 'EA_FreeFlight') {
      consoleLog(`[processEloUpdate] Invalid players or unsupported game mode: ${game_mode}`);
      return { didElo: false, reason: 'Invalid players or unsupported game mode' };
    }

    // Validate database connection
    if (!db || db.state === 'disconnected') {
      consoleLog('[processEloUpdate] Database connection lost, reconnecting...');
      db = await connectToMySQL();
    }

    const allowedShips = ["AEGS_Gladius", "AEGS_Gladius_PIR", "AEGS_Gladius_Valiant", "ANVL_Arrow"];

    // Normalize ship names
    const normalizeShip = (ship) => ship ? ship.split('_').slice(0, 2).join('_') : null;
    const normalizedKillerShip = normalizeShip(killers_ship);
    const normalizedVictimShip = normalizeShip(victims_ship);

    if ((normalizedKillerShip && !allowedShips.includes(normalizedKillerShip)) ||
        (normalizedVictimShip && !allowedShips.includes(normalizedVictimShip))) {
      consoleLog(`[processEloUpdate] ELO update skipped: Ship not allowed. Killer: "${normalizedKillerShip}", Victim: "${normalizedVictimShip}"`);
      return { didElo: false, reason: 'Ship not allowed' };
    }

    // 🚨 CRITICAL: INVALIDATE cache BEFORE fetching players
    consoleLog(`[processEloUpdate] Invalidating cache BEFORE update...`);
    await invalidatePlayerCache(killerIdentifier);
    await invalidatePlayerCache(victimIdentifier);

    // Get FRESH player records (cache is empty, forcing DB read)
    const playerFetchPromise = Promise.all([
      getOrCreatePlayer(db, killerIdentifier),
      getOrCreatePlayer(db, victimIdentifier)
    ]);

    const [killer, victim] = await Promise.race([
      playerFetchPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Player fetch timeout')), 10000))
    ]);

    if (!killer || !victim) {
      consoleLog(`[processEloUpdate] Players not found: killer=${!!killer}, victim=${!!victim}`);
      return { didElo: false, reason: 'Players not found and could not be created' };
    }

    consoleLog(`[processEloUpdate] Fresh player data - Killer: ${killer.username} (Glicko: ${killer.dojo_glicko_elo}), Victim: ${victim.username} (Glicko: ${victim.dojo_glicko_elo})`);

    // Deduplicate fights (30s window)
    const fightKey = `${killer.id}-${victim.id}-${zone}-${game_mode}-${Math.floor(new Date(time).getTime() / 1000 / 30)}`;
    if (eloFightCache.has(fightKey)) {
      consoleLog(`[processEloUpdate] Skipping ELO update, duplicate fight: ${fightKey}`);
      return { didElo: false, reason: 'Duplicate fight within 30s' };
    }
    eloFightCache.set(fightKey, Date.now());
    setTimeout(() => eloFightCache.delete(fightKey), 60000);

    consoleLog(`[processEloUpdate] Processing fight: ${fightKey}`);

    // 🚨 GLICKO2 ONLY - No classic ELO calculation
    const killerG = {
      dojo_elo_api: killer.dojo_glicko_elo || 1200,
      dojo_rd_api: killer.dojo_glicko_rd || 350,
      dojo_vol_api: killer.dojo_glicko_vol || 0.06
    };
    const victimG = {
      dojo_elo_api: victim.dojo_glicko_elo || 1200,
      dojo_rd_api: victim.dojo_glicko_rd || 350,
      dojo_vol_api: victim.dojo_glicko_vol || 0.06
    };

    const killerOldGlicko = killerG.dojo_elo_api;
    const victimOldGlicko = victimG.dojo_elo_api;

    const { killer: newKillerG, victim: newVictimG } = updateGlicko2Api(killerG, victimG, 1);

    consoleLog(`[processEloUpdate] Glicko2 Calculation - Killer: ${killerOldGlicko} → ${newKillerG.dojo_elo_api}, Victim: ${victimOldGlicko} → ${newVictimG.dojo_elo_api}`);

    // -------------------------------
    // 🔹 APPLY ACTIVE PENALTIES (to Glicko2 values)
    // -------------------------------
    async function getActivePenalties(identifier) {
      const [rows] = await db.query(
        `SELECT * FROM elo_penalties 
         WHERE (killerIdentifier = ? OR victimIdentifier = ?)
         AND active = 1
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [identifier, identifier]
      );
      return rows;
    }

    function applyPenalties(glicko, penalties) {
      let adjustedGlicko = glicko.dojo_elo_api;
      let totalFactor = 1.0;
      let totalPoints = 0;

      for (const p of penalties) {
        totalFactor *= (p.penalty_factor ?? 1.0);
        totalPoints += (p.penalty_points ?? 0);
      }

      adjustedGlicko = adjustedGlicko * totalFactor - totalPoints;
      if (adjustedGlicko < 0) adjustedGlicko = 0;

      return {
        ...glicko,
        dojo_elo_api: adjustedGlicko
      };
    }

    const [killerPenalties, victimPenalties] = await Promise.all([
      getActivePenalties(killerIdentifier),
      getActivePenalties(victimIdentifier)
    ]);

    let finalKillerG = newKillerG;
    let finalVictimG = newVictimG;

    if (killerPenalties.length > 0) {
      const before = finalKillerG.dojo_elo_api;
      finalKillerG = applyPenalties(finalKillerG, killerPenalties);
      consoleLog(`[processEloUpdate] Penalties applied to killer ${killerIdentifier}: ${before} → ${finalKillerG.dojo_elo_api}`);
    }

    if (victimPenalties.length > 0) {
      const before = finalVictimG.dojo_elo_api;
      finalVictimG = applyPenalties(finalVictimG, victimPenalties);
      consoleLog(`[processEloUpdate] Penalties applied to victim ${victimIdentifier}: ${before} → ${finalVictimG.dojo_elo_api}`);
    }

    // -------------------------------
    // Update GLICKO2 in database
    // -------------------------------
    try {
      await db.query(
        `UPDATE ${killer.table} SET dojo_glicko_elo = ?, dojo_glicko_rd = ?, dojo_glicko_vol = ? WHERE ${killer.table === 'members' ? 'user_id' : 'id'} = ?`,
        [finalKillerG.dojo_elo_api, finalKillerG.dojo_rd_api, finalKillerG.dojo_vol_api, killer.id]
      );
      await db.query(
        `UPDATE ${victim.table} SET dojo_glicko_elo = ?, dojo_glicko_rd = ?, dojo_glicko_vol = ? WHERE ${victim.table === 'members' ? 'user_id' : 'id'} = ?`,
        [finalVictimG.dojo_elo_api, finalVictimG.dojo_rd_api, finalVictimG.dojo_vol_api, victim.id]
      );
      consoleLog('[processEloUpdate] Glicko2 updated in database');
    } catch (e) {
      console.error('[processEloUpdate] Error updating Glicko2:', e);
      throw e;
    }

    // Increment matches played
    try {
      await db.query(`UPDATE ${killer.table} SET matches_played = IFNULL(matches_played, 0) + 1 WHERE ${killer.table === 'members' ? 'user_id' : 'id'} = ?`, [killer.id]);
      await db.query(`UPDATE ${victim.table} SET matches_played = IFNULL(matches_played, 0) + 1 WHERE ${victim.table === 'members' ? 'user_id' : 'id'} = ?`, [victim.id]);
      killer.matchesPlayed = (killer.matchesPlayed || 0) + 1;
      victim.matchesPlayed = (victim.matchesPlayed || 0) + 1;
      consoleLog('[processEloUpdate] Matches played incremented');
    } catch (e) {
      console.error('[processEloUpdate] Error incrementing matches played:', e);
      throw e;
    }

    // Update kills & deaths
    try {
      await db.query(`UPDATE ${killer.table} SET kills = IFNULL(kills, 0) + 1 WHERE ${killer.table === 'members' ? 'user_id' : 'id'} = ?`, [killer.id]);
      await db.query(`UPDATE ${victim.table} SET deaths = IFNULL(deaths, 0) + 1 WHERE ${victim.table === 'members' ? 'user_id' : 'id'} = ?`, [victim.id]);

      killer.kills = (killer.kills || 0) + 1;
      victim.deaths = (victim.deaths || 0) + 1;
      consoleLog('[processEloUpdate] Kills and deaths updated');
    } catch (e) {
      console.error('[processEloUpdate] Error updating kills and deaths:', e);
      throw e;
    }

    // 🚨 CRITICAL: INVALIDATE cache AFTER database updates
    consoleLog(`[processEloUpdate] Invalidating cache AFTER update...`);
    await invalidatePlayerCache(killerIdentifier);
    await invalidatePlayerCache(victimIdentifier);

    consoleLog(`[processEloUpdate] Cache invalidated for both players`);

    // Append message for client/Discord (non-blocking)
    try {
      appendEloUpdateMessage(
        client,
        killer,
        victim,
        killerOldGlicko, finalKillerG.dojo_elo_api, // Using Glicko values only
        victimOldGlicko, finalVictimG.dojo_elo_api, // Using Glicko values only
        killerOldGlicko, finalKillerG.dojo_elo_api, // Glicko values for both
        victimOldGlicko, finalVictimG.dojo_elo_api, // Glicko values for both
        source
      ).catch(e => {
        console.error('[processEloUpdate] Error appending Elo update message (non-blocking):', e);
        // Don't throw - this shouldn't block the ELO update
      });

      consoleLog(`[processEloUpdate] ELO message triggered (non-blocking)`);

      consoleLog(`[processEloUpdate] COMPLETE - ${Date.now() - startTime}ms`);
      return { didElo: true };
    } catch (error) {
      console.error('[processEloUpdate] Error in message appending block:', error);
      // Don't throw here since the main ELO update was successful
      return { didElo: true };
    }

  } catch (error) {
    consoleLog(`[processEloUpdate] ERROR after ${Date.now() - startTime}ms: ${error.message}`);
    return { didElo: false, reason: `Processing error: ${error.message}` };
  }
}

function debugCache() {
    const stats = memberCache.getStats();
    //consoleLog(`[CACHE DEBUG] Cache stats: ${JSON.stringify(stats)}`);
    
    // Get all keys and check a few entries
    const allKeys = memberCache.keys();
    //consoleLog(`[CACHE DEBUG] Total cache entries: ${allKeys.length}`);
    
    // Check a few entries to see if ELO data is properly cached
    const sampleKeys = allKeys.slice(0, 5);
    let validEntries = 0;
    let invalidEntries = 0;
    
    sampleKeys.forEach(key => {
        const value = memberCache.get(key);
        if (value && typeof value === 'object' && value.username) {
            //consoleLog(`[CACHE DEBUG] ${key}: ${value.username} - ELO: ${value.dojo_elo_api || 'MISSING'}`);
            if (value.dojo_elo_api !== undefined) {
                validEntries++;
            } else {
                invalidEntries++;
            }
        } else {
           // consoleLog(`[CACHE DEBUG] ${key}: Invalid cache entry type`);
            invalidEntries++;
        }
    });
    
    //consoleLog(`[CACHE DEBUG] Valid entries: ${validEntries}, Invalid entries: ${invalidEntries}`);
    
    // If we have many invalid entries, consider clearing problematic cache
    if (invalidEntries > 2) {
        //consoleLog(`[CACHE DEBUG] WARNING: High number of invalid cache entries detected`);
    }
}

// Call this periodically to monitor cache
setInterval(() => {
    debugCache();
}, 60000); // Every minute


const reportQueueEvents = new EventEmitter();
const reportQueue = [];
const MAX_REPORT_QUEUE_SIZE = 1000;
const RESUME_REPORT_QUEUE_SIZE = 500;
const PROCESS_REPORT_MAX_ATTEMPTS = 3;
const PROCESS_REPORT_CACHE_TIMER = 120000; // 120 seconds
const MAX_CONCURRENT_PROCESSING = 2; // Process 2 reports at once
const PROCESS_TIMEOUT = 5000;
let processReportPaused = false;
let is_report_processing = false;

async function processReportQueue() {
  reportQueueEvents.on('data', async () => {
    if (is_report_processing) return;
    is_report_processing = true;

    try {
      while (reportQueue.length > 0 && !processReportPaused) {
        const report = reportQueue.shift();
        const { report_body, report_type, api_key } = report;
        
        consoleLog(`[processReportQueue] Processing: ${report_type} for ${report_body.player} | Queue: ${reportQueue.length}`);

        try {
          // Process with shorter timeout
          const result = await Promise.race([
            (async () => {
              if (report_type === "reportKill") {
                return await processReportKill(report_body, api_key);
              } else if (report_type === "reportACKill") {
                return await processReportACKill(report_body, api_key);
              }
              return "skip";
            })(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Processing timeout')), PROCESS_TIMEOUT)
            )
          ]);
          
          consoleLog(`[processReportQueue] Completed: ${result}`);
        } catch (error) {
          consoleLog(`[processReportQueue] Error: ${error.message} - skipping`);
          // Don't requeue to prevent infinite loops
        }

        // Smaller delay between processing
        if (reportQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      consoleLog(`[processReportQueue] Fatal error: ${error.message}`);
    } finally {
      is_report_processing = false;
    }
  });
}

async function processReportKill(
  report_body,
  apiKey
) {
  const { player, victim, time, zone, weapon, game_mode, killers_ship, anonymize_state } = report_body;

  consoleLog(`[REPORT DEBUG] Parsed fields -> player: ${player}, victim: ${victim}, time: ${time}, zone: ${zone}, game_mode: ${game_mode}, killers_ship: ${killers_ship}, weapon: ${weapon}, anonymize_state: ${JSON.stringify(anonymize_state)}`);
  await appendLog(`[REPORT DEBUG] Parsed fields -> player: ${player}, victim: ${victim}, time: ${time}, zone: ${zone}, game_mode: ${game_mode}, killers_ship: ${killers_ship}, weapon: ${weapon}, anonymize_state: ${JSON.stringify(anonymize_state)}`);

  enqueue_result = await enqueueKillEvent(client, { report_body, api_key: apiKey });
  
  const normalizedTime = normalizeTime(time);
  const requestId = `${player}-${victim}-${normalizedTime}-${game_mode}`;
  if (requestCache.has(requestId)) {
    consoleLog(`[REPORT DEBUG] Duplicate request detected -> ${requestId}`);
    await appendLog(`[REPORT DEBUG] Duplicate request detected -> ${requestId}`);
    return "dupe";
  }
  else {
    requestCache.set(requestId, true);
    setTimeout(() => requestCache.delete(requestId), PROCESS_REPORT_CACHE_TIMER);
  }

  try {
    const db = await connectToMySQL();
    consoleLog('[REPORT DEBUG] MySQL connection established');
    await appendLog('[REPORT DEBUG] MySQL connection established');

    const [apiKeyRow] = await db.query('SELECT user_id FROM killtracker_keys WHERE api_key = ? LIMIT 1', [apiKey]);
    const killerUserId = apiKeyRow[0]?.user_id;
    consoleLog(`[REPORT DEBUG] killerUserId from API key: ${killerUserId}`);
    await appendLog(`[REPORT DEBUG] killerUserId from API key: ${killerUserId}`);

    if (!killerUserId) {
      consoleLog(`[REPORT DEBUG] killerUserId from API key: ${killerUserId}`);
      await appendLog('[REPORT DEBUG] killerUserId from API key: ${killerUserId}');
      return "error"
    }

    // Bounty check
    const allowedGameModes = ['SC_Frontend', 'SC_Default'];
    if (allowedGameModes.includes(game_mode)) {
      consoleLog(`[REPORT DEBUG] Checking bounty for victim: ${victim}`);
      const [bounties] = await db.query(
        `SELECT id, username, display_name, amount, creator_discord_id
         FROM bounties
         WHERE username = ? AND status = 'active' LIMIT 1`,
        [victim]
      );

      if (bounties.length > 0) {
        const bounty = bounties[0];
        consoleLog(`[REPORT DEBUG] Active bounty found -> ${JSON.stringify(bounty)}`);
        const bountyChannel = client.channels.cache.get('1397865876979581019');
        if (bountyChannel) {
          await bountyChannel.send(
            `💰 **Bounty Payout!** 💰\n<@${bounty.creator_discord_id}> your bounty target **${bounty.display_name || bounty.username}** was killed by **${player}**!\nBounty amount of **${bounty.amount}** needs to be paid out!`
          );
        }
        await db.query(`DELETE FROM bounties WHERE id = ?`, [bounty.id]);
        consoleLog('[REPORT DEBUG] Bounty removed from database');
      }
    }

    // Elo update with killer's ship and victim's ship (zone)
    consoleLog(`[REPORT DEBUG] Calling processEloUpdate with player=${player}, victim=${victim}, killers_ship=${killers_ship}, victim_ship=${zone}`);
    const { didElo, reason } = await processEloUpdate(
      db,
      client,
      player,
      victim,
      zone,
      game_mode,
      time,
      'API',
      killers_ship,
      zone // using zone as victim_ship
    );

    consoleLog(`[REPORT DEBUG] processEloUpdate returned -> didElo: ${didElo}, reason: ${reason || 'none'}`);
    await appendLog(`[REPORT DEBUG] processEloUpdate returned -> didElo: ${didElo}, reason: ${reason || 'none'}`);

    if (enqueue_result == "dupe") {
      return "dupe";
    }
    else if (enqueue_result == "ignore") {
      return "ignore";
    }
    else if (enqueue_result == "error") {
      return "error";
    }
    else {
      consoleLog('[REPORT DEBUG] Kill event enqueued');
      try {
        await recordKillInSession(apiKey, player, victim, weapon, zone, new Date(time));
        consoleLog('[REPORT DEBUG] Kill recorded in session');
      } catch (err) {
        console.error('[REPORT DEBUG] recordKillInSession failed:', err.message);
        await appendLog(`[REPORT DEBUG] recordKillInSession failed: ${err.message}`);
        return "error"
      }

      await appendLog(`Kill event processed: player=${player}, victim=${victim}, game_mode=${game_mode}, didElo=${didElo}`);
      return "success"
    } 
  } catch (err) {
    console.error('[REPORT DEBUG] recordKillInSession failed:', err.message);
    await appendLog(`[REPORT DEBUG] recordKillInSession failed: ${err.message}`);
    return "error"
  }
}

async function processReportACKill(
  report_body
) {
  const reportedVictim = report_body?.data?.victim || report_body.victim || null;
  const reportedKiller = report_body?.data?.player || report_body.killer || report_body.player;
  const time = report_body?.data?.time || report_body.time;
  const zone = (typeof (report_body?.data?.zone || report_body.zone) === 'string')
    ? (report_body?.data?.zone || report_body.zone)
    : 'unknown_zone';
  const game_mode = report_body?.data?.game_mode || report_body.game_mode || 'EA_FreeFlight';
  const killers_ship = report_body?.data?.killers_ship || report_body.killers_ship || null;
  const victims_ship = report_body?.data?.victim_ship || report_body.victim_ship || null;

  consoleLog(`[ACK DEBUG] Parsed fields -> reportedVictim (victim): ${reportedVictim}, reportedKiller (killer): ${reportedKiller}, time: ${time}, zone: ${zone}, game_mode: ${game_mode}, killer_ship: ${killers_ship}, victim_ship: ${victims_ship}`);
  await appendLog(`[ACK DEBUG] Parsed fields -> reportedVictim (victim): ${reportedVictim}, reportedKiller (killer): ${reportedKiller}, time: ${time}, zone: ${zone}, game_mode: ${game_mode}, killer_ship: ${killers_ship}, victim_ship: ${victims_ship}`);

  const normalizedTime = normalizeTime(time);
  const requestId = `${reportedKiller}-${reportedVictim}-${normalizedTime}-${game_mode}`;
  if (requestCache.has(requestId)) {
    consoleLog(`[REPORT DEBUG] Duplicate request detected -> ${requestId}`);
    await appendLog(`[REPORT DEBUG] Duplicate request detected -> ${requestId}`);
    return "dupe";
  }
  else {
    requestCache.set(requestId, true);
    setTimeout(() => requestCache.delete(requestId), PROCESS_REPORT_CACHE_TIMER);
  }

  try {
    const db = await connectToMySQL();
    consoleLog('[ACK DEBUG] MySQL connection established');
    await appendLog('[ACK DEBUG] MySQL connection established');

    const { didElo, reason } = await processEloUpdate(
      db,
      client,
      reportedKiller,
      reportedVictim,
      zone,
      game_mode,
      time,
      'ACK',
      killers_ship,
      victims_ship
    );

    consoleLog(`[ACK DEBUG] processEloUpdate returned -> didElo: ${didElo}, reason: ${reason || 'none'}`);
    await appendLog(`[ACK DEBUG] processEloUpdate returned -> didElo: ${didElo}, reason: ${reason || 'none'}`);

    consoleLog(`[ACK DEBUG] death processed: killer=${reportedKiller}, victim=${reportedVictim}, game_mode=${game_mode}, didElo=${didElo}`);
    await appendLog(`[ACK DEBUG] death processed: killer=${reportedKiller}, victim=${reportedVictim}, game_mode=${game_mode}, didElo=${didElo}`);
    return "success"
  }
  catch (error) {
    console.error(`[ACK DEBUG] Error processing ACK death event:`, error);
    await appendLog(`[ACK DEBUG] error: ${error.message}\nStack: ${error.stack}`);
    return "error"
  }
}

// ========== PROTECTED KILL REPORT ENDPOINTS ==========

app.post('/reportKill', checkServitorReady, async (req, res) => {
  consoleLog(`--- /reportKill called ---`);
  //consoleLog(`Auth Header: ${req.headers['authorization']}`);
  //consoleLog(`Body: ${JSON.stringify(req.body, null, 2)}`);

  await appendLog(`--- /reportKill called ---
    Headers: ${JSON.stringify(req.headers)}
    Body: ${JSON.stringify(req.body)}`);

  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    await appendLog('Missing API key in /reportKill');
    return res.status(400).json({ error: 'API key is required' });
  }
  try {
    if (processReportPaused) {
      res.status(500).json({ error: 'Server is overloaded. Try to push the kill event again later.' });
    }
    const report = {
      report_body: req.body,
      report_type: "reportKill",
      api_key: req.headers['authorization']
    };
    reportQueue.push(report);
    consoleLog(`[reportKill] Pushed to reportQueue with current size: ${reportQueue.length}`);

    if (reportQueue.length >= MAX_REPORT_QUEUE_SIZE) {
      processReportPaused = true;
      consoleLog(`[reportKill] Paused! reportQueue reached max size (${reportQueue.length}).`);
    }
    reportQueueEvents.emit('data');
    res.status(200).json({ message: 'Kill event processed.' });
  } catch (error) {
    consoleLog(`[reportKill] Error adding kill event to reportQueue:`, error);
    await appendLog(`[reportKill] Error: ${error.message}\nStack: ${error.stack}`);
    res.status(500).json({ error: 'Failed to push kill event.' });
  }
});

app.post('/reportACKill', checkServitorReady, async (req, res) => {
  consoleLog(`--- /reportACKill called ---`);
  //consoleLog(`Auth Header: ${req.headers['authorization']}`);
  //consoleLog(`Body: ${JSON.stringify(req.body, null, 2)}`);

  await appendLog(`--- /reportACKill called ---
    Headers: ${JSON.stringify(req.headers)}
    Body: ${JSON.stringify(req.body)}`);

  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    await appendLog('Missing API key in /reportACKill');
    return res.status(400).json({ error: 'API key is required' });
  }
  try {
    if (processReportPaused) {
      res.status(500).json({ error: 'Server is overloaded. Try to push the ACK kill event again later.' });
    }
    const report = {
      report_body: req.body,
      report_type: "reportACKill",
      api_key: req.headers['authorization']
    };
    reportQueue.push(report);
    consoleLog(`[reportACKill] Pushed to reportQueue with current size: ${reportQueue.length}`);

    if (reportQueue.length >= MAX_REPORT_QUEUE_SIZE) {
      processReportPaused = true;
      consoleLog(`[reportACKill] Paused! reportQueue reached max size (${reportQueue.length}).`);
    }
    reportQueueEvents.emit('data');
    res.status(200).json({ message: 'ACK Kill event processed.' });
  } catch (error) {
    consoleLog(`[reportACKill] Error adding ACK kill event to reportQueue:`, error);
    await appendLog(`[reportACKill] Error: ${error.message}\nStack: ${error.stack}`);
    res.status(500).json({ error: 'Failed to push ACK kill event.' });
  }
});

const { weaponMapping, shipMapping } = require('./utils/gameData');

// ========== PROTECTED DATA ENDPOINTS ==========

app.get('/api/server/data/weapons', checkServitorReady, async (req, res) => {
    const apiKey = req.headers['authorization'];

    // Only require API Key
    if (!apiKey) {
        return res.status(400).json({ error: 'Missing required authentication (API key).' });
    }

    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        const weapons = Object.entries(weaponMapping).map(([id, name]) => ({
            id,
            name
        }));
        return res.status(200).json({ weapons });
    } catch (error) {
        console.error('Error handling /api/server/data/weapons:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/server/data/ships', checkServitorReady, async (req, res) => {
    const apiKey = req.headers['authorization'];

    if (!apiKey) {
        return res.status(400).json({ error: 'Missing required authentication (API key).' });
    }

    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        const ships = Object.entries(shipMapping).map(([id, name]) => ({
            id,
            name
        }));
        return res.status(200).json({ ships });
    } catch (error) {
        console.error('Error handling /api/server/data/ships:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/server/data/ignoredVictimRules', checkServitorReady, async (req, res) => {
    const apiKey = req.headers['authorization'];
    if (!apiKey) return res.status(400).json({ error: 'Missing API key.' });

    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        // Just send the rules to the client
        res.status(200).json({ ignoredVictimRules });
    } catch (error) {
        console.error('Error handling /api/server/data/ignoredVictimRules', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/server/data/leaderboard', checkServitorReady, async (req, res) => {
  try {
    const {
      playername = '',
      orgname = '',
      pagenumber,
      numberofrow,
    } = req.query;

    const leaderboard = await getLeaderboardActivePlayers({
      playername,
      pagenumber: pagenumber !== undefined ? pagenumber : null,
      numberofrow: numberofrow !== undefined ? numberofrow : null,
    });

    if (playername && leaderboard.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'placement_matches_required',
        player: playername,
        message: `Player "${playername}" needs to complete 10 placement matches to appear on the leaderboard`,
        requirements: {
          current_status: 'not_ranked'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Error handling /api/server/data/leaderboard', error);
    res.status(500).json({ 
      success: false,
      error: 'internal_server_error',
      message: 'Internal Server Error' 
    });
  }
});

// ELO Progress API
app.get('/api/server/data/elo-progress', checkServitorReady, async (req, res) => {
  try {
    const { playername } = req.query;

    if (!playername) {
      return res.status(400).json({ error: 'Missing required parameter: playername' });
    }

    // Fetch elo history for this player
    const eloHistory = await getEloHistory(playername);

    if (!eloHistory || eloHistory.length === 0) {
      return res.status(404).json({ error: 'No ELO history found for this player' });
    }

    res.status(200).json({
      player: playername,
      progress: eloHistory.map(row => ({
        match_id: row.match_id,
        opponent: row.opponent,
        result: row.result, // win/loss/draw
        old_elo: row.old_elo,
        new_elo: row.new_elo,
        timestamp: row.timestamp,
      })),
    });
  } catch (error) {
    console.error('Error handling /api/server/data/elo-progress:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/server/data/online-users', checkServitorReady, async (req, res) => {
  try {
    const onlineUsers = await fetchOnlineUsers(5); // 5 minutes window

    res.status(200).json({
      count: onlineUsers.length,
      users: onlineUsers
    });
  } catch (error) {
    console.error('Error handling /api/server/data/online-users', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// List active penalties for a user + aggregated impact
app.get('/api/server/data/elo/penalties/:identifier', checkServitorReady, async (req, res) => {
    const { identifier } = req.params;

    try {
        const db = await connectToMySQL(); // <-- ensure connection here

        const [penalties] = await db.query(
            `SELECT id, killerIdentifier, victimIdentifier, reason, penalty_factor, penalty_points, expires_at, created_at
             FROM elo_penalties
             WHERE (killerIdentifier = ? OR victimIdentifier = ?)
               AND active = 1
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC`,
            [identifier, identifier]
        );

        let totalFactor = 1.0;
        let totalPoints = 0;
        penalties.forEach(p => {
            totalFactor *= (p.penalty_factor ?? 1.0);
            totalPoints += (p.penalty_points ?? 0);
        });

        res.status(200).json({
            identifier,
            totalFactor,
            totalPoints,
            penalties
        });
    } catch (error) {
        console.error(`Error fetching active penalties for ${identifier}`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Audit trail: all penalties ever applied
app.get('/api/server/data/elo/penalties/:identifier/audit', checkServitorReady, async (req, res) => {
  try {
    const { identifier } = req.params;

    const [allPenalties] = await db.query(
      `SELECT *
       FROM elo_penalties
       WHERE killerIdentifier = ? OR victimIdentifier = ?
       ORDER BY created_at DESC`,
      [identifier, identifier]
    );

    res.status(200).json({
      identifier,
      penalties: allPenalties
    });
  } catch (error) {
    console.error('Error fetching penalty audit for', req.params.identifier, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Resolve or expire a penalty
app.patch('/api/server/data/elo/penalties/:id', checkServitorReady, async (req, res) => {
  try {
    const { id } = req.params;
    const { active, expires_at } = req.body;

    if (active === undefined && !expires_at) {
      return res.status(400).json({ error: 'Missing required field: active or expires_at' });
    }

    const updates = [];
    const values = [];

    if (active !== undefined) {
      updates.push('active = ?');
      values.push(active ? 1 : 0);
    }

    if (expires_at) {
      updates.push('expires_at = ?');
      values.push(expires_at);
    }

    values.push(id);

    await db.query(
      `UPDATE elo_penalties SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.status(200).json({ message: 'Penalty updated' });
  } catch (error) {
    console.error('Error updating penalty', req.params.id, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new penalty
app.post('/api/server/data/elo/penalties', checkServitorReady, async (req, res) => {
  try {
    const { killerIdentifier, victimIdentifier, reason, penalty_factor, penalty_points, expires_at } = req.body;

    // Basic validation
    if (!killerIdentifier && !victimIdentifier) {
      return res.status(400).json({ error: 'At least one of killerIdentifier or victimIdentifier is required.' });
    }
    if (!reason) return res.status(400).json({ error: 'Penalty reason is required.' });

    // Set defaults
    const factor = penalty_factor ?? 1.0;
    const points = penalty_points ?? 0;

    // Convert ISO 8601 string to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    let expires = null;
    if (expires_at) {
      const d = new Date(expires_at);
      if (!isNaN(d)) {
        expires = d.toISOString().slice(0, 19).replace("T", " ");
      }
    }

    // Use the connectToMySQL utility
    const db = await connectToMySQL();

    const [result] = await db.query(
      `INSERT INTO elo_penalties
       (killerIdentifier, victimIdentifier, reason, penalty_factor, penalty_points, expires_at, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
      [killerIdentifier, victimIdentifier || null, reason, factor, points, expires]
    );

    res.status(201).json({
      message: 'Penalty created',
      penalty: {
        id: result.insertId,
        killerIdentifier,
        victimIdentifier: victimIdentifier || null,
        reason,
        penalty_factor: factor,
        penalty_points: points,
        expires_at: expires,
        active: 1,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating new penalty', req.body, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Validate or generate API Key for a user
app.get('/api/server/data/apikey/validate-or-generate/:userId', checkServitorReady, async (req, res) => {
  try {
    console.log("[DEBUG] /apikey/validate-or-generate called");
    console.log("[DEBUG] Request params:", req.params);

    const { userId } = req.params;
    if (!userId) {
      console.log("[DEBUG] Missing userId in params");
      return res.status(400).json({ error: 'Discord user ID is required' });
    }

    console.log("[DEBUG] Connecting to MySQL...");
    const db = await connectToMySQL();
    console.log("[DEBUG] Connected to MySQL");

    // 🔍 First check blacklist table
    console.log(`[DEBUG] Checking blacklist status for userId: ${userId}`);
    const [blRows] = await db.query(
      'SELECT blacklisted FROM kt_blacklist WHERE user_id = ?',
      [userId]
    );

    if (blRows.length > 0 && blRows[0].blacklisted === 1) {
      console.log(`[DEBUG] User ${userId} is blacklisted. Rejecting request.`);
      // ⛔️ IMPORTANT: return so it stops execution here
      return res.status(403).json({ error: 'Blacklisted' });
    }

    // ✅ Not blacklisted — check if API key already exists
    console.log(`[DEBUG] Querying for existing API key for userId: ${userId}`);
    const [existing] = await db.query(
      'SELECT api_key FROM killtracker_keys WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      console.log(`[DEBUG] Existing API key found for userId: ${userId}`);
      return res.status(200).json({ apiKey: existing[0].api_key, action: 'validated' });
    }

    // No key, generate one
    console.log(`[DEBUG] No existing API key found for userId: ${userId}, generating new key...`);
    const apiKey = uuidv4();

    await db.query(
      'INSERT INTO killtracker_keys (user_id, api_key) VALUES (?, ?)',
      [userId, apiKey]
    );

    console.log(`[DEBUG] New API key generated and saved for userId: ${userId}: ${apiKey}`);
    return res.status(201).json({ apiKey, action: 'generated' });

  } catch (error) {
    console.error('[ERROR] Validating/Generating API key:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/server/data/updates', checkServitorReady, async (req, res) => {
    try {
        // Add CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        const db = await connectToMySQL();
        
        // Get active updates that haven't expired, ordered by priority and creation date
        const [updates] = await db.query(`
            SELECT 
                id,
                title,
                content,
                author_name,
                created_at,
                expires_at,
                priority,
                is_active
            FROM site_updates 
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

        // Format dates for frontend
        const formattedUpdates = updates.map(update => ({
            ...update,
            created_at: new Date(update.created_at).toISOString(),
            expires_at: update.expires_at ? new Date(update.expires_at).toISOString() : null,
            is_expired: update.expires_at ? new Date(update.expires_at) < new Date() : false
        }));

        res.status(200).json({
            success: true,
            updates: formattedUpdates,
            count: formattedUpdates.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error handling /api/server/data/updates:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            updates: []
        });
    }
});

app.get('/api/server/data/kill-ticker', checkServitorReady, async (req, res) => {
    try {
        const db = await connectToMySQL();
        
        // Only get kills from last 15 minutes - no fallback
        const [kills] = await db.query(`
            SELECT 
                id,
                killer_name,
                victim_name,
                killer_old_glicko,
                killer_new_glicko,
                victim_old_glicko,
                victim_new_glicko,
                created_at
            FROM elo_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            ORDER BY created_at DESC
            LIMIT 10
        `);

        //console.log(`🔫 Kill ticker: ${kills.length} recent kills (last 15 minutes)`);
        
        res.json({
            success: true,
            kills: kills,
            source: 'recent'
        });
        
    } catch (error) {
        console.error('Error fetching kill ticker data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch kill data'
        });
    }
});

app.get('/api/server/data/legal-ships', checkServitorReady, async (req, res) => {
    const apiKey = req.headers['authorization'];
    
    if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
    }

    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
        res.setHeader('Last-Modified', new Date(legalShips.lastUpdated).toUTCString());
        res.setHeader('ETag', `"${legalShips.version}"`);

        // Check for conditional requests
        const clientModifiedSince = req.headers['if-modified-since'];
        const clientETag = req.headers['if-none-match'];
        
        if (clientETag === `"${legalShips.version}"` || 
            (clientModifiedSince && new Date(clientModifiedSince) >= new Date(legalShips.lastUpdated))) {
            return res.status(304).end(); // Not Modified
        }

        consoleLog(`[LegalShips] Serving legal ships config v${legalShips.version}`);
        
        res.status(200).json({
            success: true,
            data: legalShips,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error handling /api/server/data/legal-ships:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error' 
        });
    }
});

// ========== CLIENT STATUS ENDPOINT ==========

app.post('/api/client/status', checkServitorReady, async (req, res) => {
    const apiKey = req.headers['authorization'];
    
    if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
    }

    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        const { rsi_handle, current_ship, game_mode, client_ver } = req.body;

        if (!rsi_handle || !current_ship) {
            return res.status(400).json({ error: 'RSI handle and current ship are required' });
        }

        const db = await connectToMySQL();

        // Upsert client status
        await db.query(`
            INSERT INTO client_status (api_key, rsi_handle, current_ship, game_mode, client_ver, last_heartbeat) 
            VALUES (?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                current_ship = VALUES(current_ship),
                game_mode = VALUES(game_mode),
                client_ver = VALUES(client_ver),
                last_heartbeat = NOW()
        `, [apiKey, rsi_handle, current_ship, game_mode, client_ver]);

        consoleLog(`[ClientStatus] Updated: ${rsi_handle} in ${current_ship} (${game_mode})`);

        res.status(200).json({
            success: true,
            message: 'Client status updated'
        });

    } catch (error) {
        console.error('Error handling /api/client/status:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error' 
        });
    }
});

// Optional: Get all active clients
app.get('/api/client/status/active', checkServitorReady, async (req, res) => {
    const apiKey = req.headers['authorization'];
    
    try {
        const isValidKey = await validateApiKey(apiKey);
        if (!isValidKey) return res.status(403).json({ error: 'Invalid API key' });

        const db = await connectToMySQL();

        const [activeClients] = await db.query(`
            SELECT rsi_handle, current_ship, game_mode, client_ver, last_heartbeat 
            FROM client_status 
            WHERE last_heartbeat > NOW() - INTERVAL 2 MINUTE
            ORDER BY last_heartbeat DESC
        `);

        res.status(200).json({
            success: true,
            active_clients: activeClients,
            count: activeClients.length
        });

    } catch (error) {
        console.error('Error fetching active clients:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error' 
        });
    }
});

// ========== PUBLIC API ENDPOINTS (NO AUTH) ==========
// GET all roles for a guild
app.get('/api/public/roles', 
    checkServitorReady, // Ensure servitor is initialized
    rateLimitMiddleware, // Rate limiting
    async (req, res) => {
        try {
            // Get guild ID from query param or use default
            const guildId = req.query.guildId || '1166103102378750033'; // Your guild ID
            
            // Validate guild ID format
            if (!/^\d{17,20}$/.test(guildId)) {
                return res.status(400).json({
                    error: 'Invalid guild ID format',
                    message: 'Guild ID must be a valid Discord snowflake'
                });
            }
            
            const roleData = await fetchRoleData(guildId);
            
            // Add security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minute browser cache
            
            res.status(200).json({
                success: true,
                data: roleData,
                cached: roleApiCache.has(`roles:${guildId}`)
            });
            
        } catch (error) {
            consoleLog(`[PUBLIC-API] Error serving role data: ${error.message}`);
            
            if (error.message === 'Guild not found') {
                res.status(404).json({
                    error: 'Guild not found',
                    message: 'The specified guild is not accessible by the bot'
                });
            } else {
                res.status(500).json({
                    error: 'Internal server error',
                    message: 'Failed to fetch role data'
                });
            }
        }
    }
);

// GET single role by ID
app.get('/api/public/roles/:roleId', 
    checkServitorReady,
    rateLimitMiddleware,
    async (req, res) => {
        try {
            const { roleId } = req.params;
            const guildId = req.query.guildId || '1166103102378750033';
            
            // Validate IDs
            if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(roleId)) {
                return res.status(400).json({
                    error: 'Invalid ID format',
                    message: 'Guild ID and Role ID must be valid Discord snowflakes'
                });
            }
            
            const roleData = await fetchRoleData(guildId);
            const role = roleData.roles.find(r => r.id === roleId);
            
            if (!role) {
                return res.status(404).json({
                    error: 'Role not found',
                    message: 'The specified role does not exist or has no members'
                });
            }
            
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('Cache-Control', 'public, max-age=300');
            
            res.status(200).json({
                success: true,
                data: role
            });
            
        } catch (error) {
            consoleLog(`[PUBLIC-API] Error serving single role data: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to fetch role data'
            });
        }
    }
);
// ========== END PUBLIC API ENDPOINTS ==========

// ========== UNPROTECTED ENDPOINTS (for health checks) ==========

app.get('/api/test', (req, res) => {
  console.log('[DEBUG] /api/test hit');
  res.json({ 
    ok: true, 
    servitorInitialized: isServitorInitialized,
    status: isServitorInitialized ? 'ready' : 'initializing'
  });
});

// Optional: Add a dedicated health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: isServitorInitialized ? 'ready' : 'initializing',
    timestamp: new Date().toISOString(),
    services: {
      discord: client.isReady(),
      database: isServitorInitialized, // Assuming DB is part of initialization
      servitor: isServitorInitialized
    }
  });
});

//app.get('/api/server/data/')

// Global activeUsers map (for other uses)
const activeUsers = new Map();
setInterval(() => {
    for (const [key, user] of activeUsers) {
        if (Date.now() - user.last_seen > 10000) {
            activeUsers.delete(key);
        }
    }
}, 10000);

// Check if the port is available and start the server
const checkPort = (port) => new Promise((resolve, reject) => {
    const tester = net.createServer()
        .once('error', err => (err.code === 'EADDRINUSE' ? reject(err) : resolve()))
        .once('listening', () => tester.once('close', resolve).close())
        .listen(port);
});
checkPort(PORT)
    .then(() => {
        app.listen(PORT, () => consoleLog(`HTTP server running on port ${PORT}`));
    })
    .catch(() => {
        console.error(`Port ${PORT} is already in use.`);
        process.exit(1);
    });

// Load utils
const loadUtils = (dir) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) loadUtils(filePath);
        else if (file.isFile() && file.name.endsWith('.js')) {
            try {
                const utilModule = require(path.resolve(filePath));
                const utilName = path.basename(file.name, '.js');
                consoleLog(`Loaded utility: ${utilName} from ${filePath}`);
            } catch (error) {
                console.error(`Error loading utility file ${filePath}:`, error.message);
            }
        }
    }
};
loadUtils('./utils');

// Login function with retry logic
let retryCount = 0;
const MAX_RETRIES = 5;
async function login() {
    try {
        consoleLog("Attempting to login...");
        await client.login(process.env.DISCORD_TOKEN);
        consoleLog('Login successful');
    } catch (error) {
        if (error.httpStatus === 429 && retryCount < MAX_RETRIES) {
            const retryAfter = error.retry_after || 60000;
            retryCount++;
            consoleLog(`Rate limited. Retrying in ${retryAfter / 1000} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
            setTimeout(login, retryAfter);
        } else {
            console.error('Login failed:', error);
            process.exit(1);
        }
    }
}
login();
consoleLog('Initiating processing of reports.');
processReportQueue();
consoleLog('Processing of reports started successfully.');