const fs = require('fs');
const path = require('path');
const { writeFileSync } = require('fs');
const levels = require('../data/levels');
const {
    Client,
    Collection,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    ModalBuilder,
    ButtonStyle,
    TextInputStyle,
    ComponentType,
    ChannelType,
    Colors,
    PermissionFlagsBits,
    PermissionsBitField,
    UserSelectMenuBuilder,
    MessageFlags,
    AttachmentBuilder,
} = require('discord.js');
const {
    connectToMySQL,
    updateTotalNominations,
    addNomination,
    getNominationsForUser,
    resetNominationsForUser,
    updateRoles,
    storeSquireTrial,
    storeSquireVote,
    getSquireTrial,
    updateSquireTrialStatus,
    saveFightResult,
    getFPSLeaderboard,
    updateElo,
    saveEntombedKnight, 
    getEntombedKnight, 
    restoreEntombedKnight,
    storeEntombmentReason,
    scheduleEntombmentEvaluation,
    storeEntombmentVote,
    saveAttendanceSession,
    getAttendanceSession,
    saveAttendanceRecord,
    getAttendanceRecords,
    removeAttendanceRecord,
    endAttendanceSession,
} = require('../db');
const inventoryModule = require('../utils/inventoryDB');
const { 
  handlePauseVCDeletion, 
  handlePauseDurationMenu, 
  isVCPaused,
  getRemainingPauseTime 
} = require('./voiceStateUpdate');
const { 
    // Message ID management
    getStoredMessageIds,
    setStoredMessageIds,
    getStoredMessageIdsFromDB,
    setStoredMessageIdsToDB,
    
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
    updateMainInventoryEmbedWithDB,
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
} = require('../utils/inventoryDB');
const { postWeeklyFightLadder } = require('../utils/leaderboards');
const moment = require('moment-timezone');
const processingMemberships = new Map();
const TRANSCRIPTION_CHANNEL_ID = '1169011365466349649';
const rankCommand = require('../commands/rank.js');
const crypto = require('crypto');
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
    handleWeeklyEvaluationButton, // ADD THIS LINE
    postWeeklyTrialReminder,
    weeklyTrialReminderJob 
    } = require('../utils/evaluateSquireTrial');
const { v4: uuidv4 } = require('uuid');
const { generateAndStoreApiKey } = require('../db');
const handleEvaluationButton = require('../handlers/evaluationButtonHandler');
const claimedChannels = require('../handlers/claimedChannels');
const userSessions = new Map();
const voiceStateHandler = require('./voiceStateUpdate.js');
const OVERSEER_ROLES = [
    '1308081615083278378', // Pilot Overseer
    '1308081895266844712'  // Infantry Overseer
];
const IC_REPORT_CHANNEL_ID = '1279093497235898368';
const FLIGHT_OVERSEER_ROLE = '1308081615083278378';
const FLIGHT_LOG_CHANNEL = '1199178724063576154';

// FIX: Initialize interactionTimeouts as a Map immediately
const interactionTimeouts = new Map();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const blockedRoleIds = [
  '1168214951446454352', // Knights
  '1168215961757810779', // Legion
  '1370534162179555488', // AUX
  '1390451043413790911', // BlueChannelAccess
  '1185813396667514891', //Event Coordinatior
];

// ========== VOICE COMMAND HANDLERS ==========
async function handleVoiceJoin(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  
  if (!client.voiceRecorder) {
    return await interaction.editReply({
      content: '❌ Voice recording system is not initialized yet. Please try again in a moment.',
      ephemeral: true
    });
  }

  const result = await client.voiceRecorder.startRecording(interaction);
  
  if (!result.success) {
    await interaction.editReply({
      content: `❌ Failed to start recording: ${result.error}`,
      ephemeral: true
    });
    return;
  }

  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  
  const embed = new EmbedBuilder()
    .setTitle('🎙️ Recording Started')
    .setDescription(`Recording in **${result.channelName}**`)
    .addFields(
      { name: 'Session ID', value: `\`${result.sessionId}\``, inline: true },
      { name: 'Started', value: `<t:${Math.floor(result.startTime / 1000)}:R>`, inline: true },
      { name: 'Status', value: '🟢 **Recording Active**', inline: true }
    )
    .setColor(0x00FF00)
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`voice_stop_${interaction.guildId}`)
        .setLabel('Stop Recording')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⏹️'),
      new ButtonBuilder()
        .setCustomId(`voice_status_${interaction.guildId}`)
        .setLabel('Status')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId(`voice_leave_${interaction.guildId}`)
        .setLabel('Leave')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚪')
    );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

async function handleVoiceStop(interaction, client) {
  try {
    const voiceRecorder = client.voiceRecorder;
    const guildId = interaction.guildId;
    
    const result = await voiceRecorder.stopRecording(guildId);
    
    if (result.success) {
      // Create embed with transcription results
      const embed = new EmbedBuilder()
        .setTitle('🎙️ Recording Stopped')
        .setColor(0x00FF00)
        .addFields(
          { name: 'Duration', value: `${Math.floor(result.duration / 1000)} seconds`, inline: true },
          { name: 'Session ID', value: result.sessionId.slice(0, 8), inline: true },
          { name: 'File', value: path.basename(result.wavPath), inline: true }
        );
      
      if (result.transcript && result.transcript !== '[Transcription failed: No whisper implementation available]') {
        // Truncate transcript if too long
        const transcript = result.transcript.length > 1000 
          ? result.transcript.substring(0, 1000) + '...' 
          : result.transcript;
        
        embed.addFields(
          { name: 'Language', value: result.language || 'Unknown', inline: true },
          { name: 'Word Count', value: result.wordCount?.toString() || 'N/A', inline: true },
          { name: 'Transcript', value: transcript }
        );
      } else {
        embed.addFields(
          { name: 'Note', value: 'Transcription was not available or failed.' }
        );
      }
      
      // Add download button
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('voice_download')
            .setLabel('Download')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📥')
            .setDisabled(true) 
        );
      
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: false
      });
      
    } else {
      await interaction.reply({
        content: `❌ Error stopping recording: ${result.error}`,
        ephemeral: true
      });
    }
    
  } catch (error) {
    console.error('Error in handleVoiceStop:', error);
    await interaction.reply({
      content: '❌ An unexpected error occurred while stopping the recording.',
      ephemeral: true
    });
  }
}

async function handleVoiceLeave(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  
  if (!client.voiceRecorder) {
    return await interaction.editReply({
      content: '❌ Voice recording system is not initialized.',
      ephemeral: true
    });
  }

  const guildId = interaction.guildId;
  const result = await client.voiceRecorder.leaveRecording(guildId);
  
  if (!result.success) {
    await interaction.editReply({
      content: `❌ Failed to leave recording: ${result.error}`,
      ephemeral: true
    });
    return;
  }

  await interaction.editReply({
    content: '✅ Left voice channel and cleared recording session',
    ephemeral: true
  });
}

async function handleVoiceStatus(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  
  if (!client.voiceRecorder) {
    return await interaction.editReply({
      content: '❌ Voice recording system is not initialized.',
      ephemeral: true
    });
  }

  const guildId = interaction.guildId;
  const status = client.voiceRecorder.getRecordingStatus(guildId);
  
  if (!status) {
    await interaction.editReply({
      content: '📭 No active recording in this server',
      ephemeral: true
    });
    return;
  }

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setTitle('🎙️ Recording Status')
    .addFields(
      { name: 'Status', value: status.recording ? '🟢 **Recording Active**' : '🟡 **Paused**', inline: true },
      { name: 'Duration', value: `${Math.floor(status.duration / 1000)} seconds`, inline: true },
      { name: 'Channel', value: status.channelName, inline: true },
      { name: 'Started', value: `<t:${Math.floor(status.startTime / 1000)}:R>`, inline: true },
      { name: 'Participants', value: status.users.join(', ') || 'None detected', inline: true }
    )
    .setColor(status.recording ? 0x00FF00 : 0xFFFF00)
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
    ephemeral: true
  });
}
// ========== END VOICE COMMAND HANDLERS ==========


module.exports = {
    name: 'interactionCreate',
    
    async execute(interaction, client) {
        // Create a unique timeout key
        const timeoutKey = `${interaction.id}_${interaction.user.id}`;
        
        // Set a timeout to clean up if something goes wrong
        const timeout = setTimeout(() => {
            if (interactionTimeouts.has(timeoutKey)) {
                console.warn(`Interaction ${interaction.id} (${interaction.customId || 'no customId'}) timed out`);
                interactionTimeouts.delete(timeoutKey);
            }
        }, 15000); // 15 second timeout for safety
        
        interactionTimeouts.set(timeoutKey, timeout);
        
        // ========== HANDLE SLASH COMMANDS FIRST ==========
        if (interaction.isChatInputCommand()) {
            console.log('Handling slash command:', interaction.commandName);
            
            try {
                // Handle voice slash commands
                if (interaction.commandName === 'voice') {
                    const subcommand = interaction.options.getSubcommand();
                    
                    switch (subcommand) {
                        case 'join':
                            return await handleVoiceJoin(interaction, client);
                        case 'stop':
                            return await handleVoiceStop(interaction, client);
                        case 'leave':
                            return await handleVoiceLeave(interaction, client);
                        case 'status':
                            return await handleVoiceStatus(interaction, client);
                        default:
                            clearTimeout(timeout);
                            interactionTimeouts.delete(timeoutKey);
                            return await interaction.reply({
                                content: 'Unknown voice subcommand',
                                ephemeral: true
                            });
                    }
                }
                
                // Handle other slash commands if you have them
                return;
                
            } catch (error) {
                console.error('Error handling slash command:', error);
                clearTimeout(timeout);
                interactionTimeouts.delete(timeoutKey);
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while processing your command.',
                        ephemeral: true
                    });
                }
            }
            return;
        }
        
        // Then handle other interaction types
        if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu() && !interaction.isUserSelectMenu()) {
            clearTimeout(timeout);
            interactionTimeouts.delete(timeoutKey);
            return;
        }

        try {
            // Handle Button Interactions
            if (interaction.isButton()) {
                console.log('Handling button interaction with customId:', interaction.customId);

                // Handle IC Report Submission Button
                if (interaction.customId === 'submit_ic_report') {
                    const modal = new ModalBuilder()
                        .setCustomId('ic_report_modal')
                        .setTitle('Submit Your IC Report');

                    const urlInput = new TextInputBuilder()
                        .setCustomId('report_url')
                        .setLabel('Report URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Must Be Valid RSI Issue Council URL')
                        .setRequired(true);

                    const titleInput = new TextInputBuilder()
                        .setCustomId('report_title')
                        .setLabel('Report Title')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter a short title')
                        .setRequired(true);

                    const firstRow = new ActionRowBuilder().addComponents(urlInput);
                    const secondRow = new ActionRowBuilder().addComponents(titleInput);

                    modal.addComponents(firstRow, secondRow);

                    await interaction.showModal(modal);
                    clearTimeout(timeout);
                    interactionTimeouts.delete(timeoutKey);
                    return;
                }

                // Check if this is a voice command button
                if (interaction.customId === 'voice_stop') {
                    return await handleVoiceStop(interaction, client);
                }
                if (interaction.customId === 'voice_leave') {
                    return await handleVoiceLeave(interaction, client);
                }
                if (interaction.customId === 'voice_status') {
                    return await handleVoiceStatus(interaction, client);
                }

                await handleButtonInteraction(interaction, client);
                clearTimeout(timeout);
                interactionTimeouts.delete(timeoutKey);
                return;
            }

            // Handle Modal Submissions
            if (interaction.isModalSubmit()) {
                console.log('Handling modal submit interaction with customId:', interaction.customId);

                // Handle IC Report Modal Submission
                if (interaction.customId === 'ic_report_modal') {
                    const url = interaction.fields.getTextInputValue('report_url');
                    const title = interaction.fields.getTextInputValue('report_title');

                    // Validate the URL is a proper Issue Council URL
                    if (!isValidIssueCouncilURL(url)) {
                        clearTimeout(timeout);
                        interactionTimeouts.delete(timeoutKey);
                        return await interaction.reply({ 
                            content: '❌ Only valid Issue Council URLs from STAR CITIZEN are allowed.', 
                            ephemeral: true 
                        });
                    }

                    // Create the embed for the IC report
                    const embed = new EmbedBuilder()
                        .setTitle('📣 New Public IC Report')
                        .setDescription(`[${title}](${url})`)
                        .setFooter({ text: `Submitted by ${interaction.user.tag}` })
                        .setTimestamp()
                        .setColor(0x3498db);

                    // Create the "Submit Your Own" button
                    const button = new ButtonBuilder()
                        .setCustomId('submit_ic_report')
                        .setLabel('Submit Your Own IC Report')
                        .setStyle(ButtonStyle.Secondary);

                    const row = new ActionRowBuilder().addComponents(button);

                    // Fetch the target channel
                    const targetChannel = await interaction.client.channels.fetch(IC_REPORT_CHANNEL_ID);

                    if (targetChannel && targetChannel.isTextBased()) {
                        // Send the embed with the mention (don't await to avoid delays)
                        targetChannel.send({ 
                            content: '<@&1353210962093801563>', 
                            embeds: [embed], 
                            components: [row] 
                        }).catch(console.error);
                        
                        await interaction.reply({ 
                            content: '✅ Your report was submitted!', 
                            ephemeral: true 
                        });
                    } else {
                        await interaction.reply({ 
                            content: '❌ Failed to post in the target channel.', 
                            ephemeral: true 
                        });
                    }

                    clearTimeout(timeout);
                    interactionTimeouts.delete(timeoutKey);
                    return;
                }

                // Handle other modal submissions (like deny_reason_modal)
                if (interaction.customId === 'deny_reason_modal') {
                    console.log('Skipping global handler for deny_reason_modal');
                    clearTimeout(timeout);
                    interactionTimeouts.delete(timeoutKey);
                    return;
                }

                await handleModalSubmitInteraction(interaction, client);
                clearTimeout(timeout);
                interactionTimeouts.delete(timeoutKey);
                return;
            }

            // Handle String Select Menus
            if (interaction.isStringSelectMenu()) {
                console.log('Handling string select menu interaction with customId:', interaction.customId);

                // === FIGHT RESULT SELECT MENU HANDLING ===
                if (interaction.customId.startsWith('fight_select_opponent_')) {
                    const userId = interaction.user.id;
                    if (!client.fightSessions) client.fightSessions = new Map();

                    // If they already have an unresolved session, block them here
                    const session = client.fightSessions.get(userId);
                    if (session && session.locked) {
                        clearTimeout(timeout);
                        interactionTimeouts.delete(timeoutKey);
                        return interaction.reply({
                            content: '⚠️ You already have a pending or unresolved fight! Please finish or resolve it before starting another.',
                            ephemeral: true,
                        });
                    }

                    // Lock them out of further attempts until resolved
                    const newSession = {
                        opponentId: interaction.values[0],
                        locked: true // LOCK!
                    };

                    if (newSession.opponentId === userId) {
                        clearTimeout(timeout);
                        interactionTimeouts.delete(timeoutKey);
                        return interaction.reply({
                            content: '⚠️ You cannot select yourself as your opponent!',
                            ephemeral: true,
                        });
                    }

                    client.fightSessions.set(userId, newSession);

                    const resultMenu = new StringSelectMenuBuilder()
                        .setCustomId(`fight_select_result_${userId}`)
                        .setPlaceholder('Win or Loss')
                        .addOptions([
                            { label: 'Win', value: 'WIN', emoji: '🏆' },
                            { label: 'Loss', value: 'LOSS', emoji: '💀' }
                        ]);
                    const row = new ActionRowBuilder().addComponents(resultMenu);

                    await interaction.reply({
                        content: `Now select the result of your match with <@${newSession.opponentId}>:`,
                        components: [row],
                        ephemeral: true
                    });
                    
                    clearTimeout(timeout);
                    interactionTimeouts.delete(timeoutKey);
                    return;
                }

                if (interaction.customId.startsWith('fight_select_result_')) {
                    const userId = interaction.user.id;
                    if (!client.fightSessions) client.fightSessions = new Map();
                    const session = client.fightSessions.get(userId);
                    if (!session || !session.opponentId) {
                        clearTimeout(timeout);
                        interactionTimeouts.delete(timeoutKey);
                        return interaction.reply({ content: `Please select your opponent first!`, ephemeral: true });
                    }

                    session.result = interaction.values[0];
                    client.fightSessions.set(userId, session);

                    // Save to persistent challenge session
                    await setFightSession(userId, session.opponentId, session.result);

                    // Check if opponent already submitted
                    const opponentSession = await getFightSession(session.opponentId, userId);

                    if (opponentSession && opponentSession.result) {
                        if (
                            (session.result === 'WIN' && opponentSession.result === 'LOSS') ||
                            (session.result === 'LOSS' && opponentSession.result === 'WIN')
                        ) {
                            await saveFightResult(userId, session.opponentId, session.result);
                            await saveFightResult(session.opponentId, userId, opponentSession.result);
                            await updateElo(userId, session.opponentId, session.result);

                            await interaction.reply({ content: `Fight recorded for both parties.`, ephemeral: true });

                            // Remove lock for both users (let them challenge again)
                            await clearFightSession(userId, session.opponentId);
                            await clearFightSession(session.opponentId, userId);
                            await postWeeklyFightLadder(client);

                        } else if (
                            (session.result === 'WIN' && opponentSession.result === 'WIN') ||
                            (session.result === 'LOSS' && opponentSession.result === 'LOSS')
                        ) {
                            // Deny, clear sessions (remove lock)
                            await interaction.reply({
                                content: `❌ Both parties submitted the same result (WIN/WIN or LOSS/LOSS). This match is invalid and has been denied.`,
                                ephemeral: true
                            });

                            clearFightLock(client, userId, session.opponentId);
                            await clearFightSession(userId, session.opponentId);
                            await clearFightSession(session.opponentId, userId);
                        } else {
                            // Dispute detected
                            await handleFightDispute(interaction, client, {
                                userId,
                                opponentId: session.opponentId,
                                userResult: session.result,
                                opponentResult: opponentSession.result,
                            });
                        }
                    } else {
                        // Still waiting, keep the lock
                        await interaction.reply({ content: `Waiting for your opponent to submit their result.`, ephemeral: true });
                        session.interactionToNotify = interaction;
                        client.fightSessions.set(userId, session);

                        // Notify opponent (non-blocking)
                        try {
                            const logChannel = await interaction.guild.channels.fetch(FLIGHT_LOG_CHANNEL);
                            if (logChannel && logChannel.isTextBased()) {
                                logChannel.send({
                                    content:
                                        `<@${session.opponentId}>, you have been requested to submit your fight results for a recent match against <@${userId}>.\n\n` +
                                        `Please submit your result using the [Record Fight Interface](https://canary.discord.com/channels/1166103102378750033/1330611959082782741/1394821477781733376).\n\n`
                                }).catch(console.error);
                            }
                        } catch (e) {
                            console.error("Failed to notify opponent in FLIGHT_LOG_CHANNEL:", e);
                        }
                    }
                    
                    clearTimeout(timeout);
                    interactionTimeouts.delete(timeoutKey);
                    return;
                }

                // Handle optional roles selection - OPTIMIZED VERSION
                if (interaction.customId === 'select_optional_roles') {
                    // Defer immediately to avoid timeout
                    await interaction.deferReply({ ephemeral: true });
                    
                    const selectedRoleIds = interaction.values;
                    const member = interaction.member;
                    const guild = interaction.guild;
                    
                    // Define optional roles with clear names and emojis
                    const optionalRoles = {
                        '1360292465961336902': { name: 'Shittalk', emoji: '💩' },
                        '1360302217499770922': { name: 'SCPVP', emoji: '⚔️' },
                        '1353210962093801563': { name: 'Issue Council', emoji: '🐛' },
                        '1395877928713326692': { name: 'SCPiracy', emoji: '🏴‍☠️' },
                        '1360302092102930626': { name: 'Media', emoji: '🎬' },
                        '1365554822954225765': { name: 'HOSAM', emoji: '🎮' },
                        '1365554907985219584': { name: 'HOSAS', emoji: '🕹️' },
                        '1365554947726381108': { name: 'HOTAS', emoji: '✈️' },
                        '1365555089414164602': { name: 'Headtracker', emoji: '👁️' },
                        '1365555135371284592': { name: 'Pedals', emoji: '👣' },
                        '1365555185618915328': { name: 'KB/M', emoji: '⌨️' },
                        '1365555236894277722': { name: 'EU', emoji: '🇪🇺' },
                        '1365555264127897711': { name: 'NA', emoji: '🇺🇸' },
                        '1365555289440649296': { name: 'OCE', emoji: '🇦🇺' },
                        '1437704919191916614': { name: 'EXECHanger', emoji: '🔀' },
                        '1436273738734632980': { name: 'Eve Online', emoji: '🌌' }
                    };
                    
                    // Track changes for reporting
                    const changes = [];
                    const SHITTALK_ROLE_ID = '1360292465961336902';
                    const SHITTALK_LOG_CHANNEL_ID = '1360296169019932835';
                    
                    try {
                        // First, send a temporary response to keep the interaction alive
                        await interaction.editReply({ 
                            content: '⏳ Updating your roles... This may take a moment.',
                            embeds: [],
                            components: []
                        });
                        
                        // Get all role objects first (parallelize fetches)
                        const rolePromises = [];
                        const allRoleIds = [...new Set([...selectedRoleIds, ...Object.keys(optionalRoles)])];
                        
                        for (const roleId of allRoleIds) {
                            rolePromises.push(
                                guild.roles.fetch(roleId).catch(() => null)
                            );
                        }
                        
                        const roleResults = await Promise.all(rolePromises);
                        const roleMap = {};
                        allRoleIds.forEach((roleId, index) => {
                            if (roleResults[index]) {
                                roleMap[roleId] = roleResults[index];
                            }
                        });
                        
                        // Identify roles to add and remove
                        const rolesToAdd = [];
                        const rolesToRemove = [];
                        
                        for (const roleId of selectedRoleIds) {
                            if (!member.roles.cache.has(roleId) && roleMap[roleId]) {
                                rolesToAdd.push(roleMap[roleId]);
                                changes.push(`✅ Added: **${optionalRoles[roleId]?.name || 'Unknown Role'}**`);
                            }
                        }
                        
                        for (const roleId in optionalRoles) {
                            if (member.roles.cache.has(roleId) && !selectedRoleIds.includes(roleId) && roleMap[roleId]) {
                                rolesToRemove.push(roleMap[roleId]);
                                changes.push(`❌ Removed: **${optionalRoles[roleId]?.name || 'Unknown Role'}**`);
                            }
                        }
                        
                        // Process role changes in parallel if possible
                        const roleChangePromises = [];
                        
                        if (rolesToAdd.length > 0) {
                            roleChangePromises.push(
                                member.roles.add(rolesToAdd.map(r => r.id)).catch(console.error)
                            );
                        }
                        
                        if (rolesToRemove.length > 0) {
                            roleChangePromises.push(
                                member.roles.remove(rolesToRemove.map(r => r.id)).catch(console.error)
                            );
                        }
                        
                        // Wait for role changes to complete
                        await Promise.allSettled(roleChangePromises);
                        
                        // Handle Shittalk role logging (non-blocking)
                        const shittalkLogChannel = guild.channels.cache.get(SHITTALK_LOG_CHANNEL_ID) || 
                                                   await guild.channels.fetch(SHITTALK_LOG_CHANNEL_ID).catch(() => null);
                        
                        const hadShittalk = member.roles.cache.has(SHITTALK_ROLE_ID);
                        const wantsShittalk = selectedRoleIds.includes(SHITTALK_ROLE_ID);
                        
                        if (shittalkLogChannel && shittalkLogChannel.isTextBased()) {
                            if (!hadShittalk && wantsShittalk) {
                                // User added Shittalk role
                                shittalkLogChannel.send(`${member} has entered the PVP Zone.`).catch(console.error);
                            } else if (hadShittalk && !wantsShittalk) {
                                // User removed Shittalk role
                                shittalkLogChannel.send(`${member} opted out of shit talking.`).catch(console.error);
                            }
                        }
                        
                        // Prepare final response
                        let responseEmbed;
                        
                        if (changes.length === 0) {
                            responseEmbed = new EmbedBuilder()
                                .setColor(0x808080)
                                .setTitle('✅ No Changes Needed')
                                .setDescription('Your roles are already up to date!')
                                .setFooter({ 
                                    text: `Requested by ${interaction.user.tag}`,
                                    iconURL: interaction.user.displayAvatarURL() 
                                })
                                .setTimestamp();
                        } else {
                            responseEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle('✅ Roles Updated Successfully')
                                .setDescription(`**Changes Made:**\n${changes.join('\n')}`)
                                .addFields({
                                    name: '📋 Your Current Optional Roles:',
                                    value: selectedRoleIds.map(id => optionalRoles[id] ? 
                                        `${optionalRoles[id].emoji} ${optionalRoles[id].name}` : 
                                        'Unknown Role'
                                    ).join('\n') || 'No optional roles selected',
                                    inline: true
                                })
                                .setFooter({ 
                                    text: `Requested by ${interaction.user.tag}`,
                                    iconURL: interaction.user.displayAvatarURL() 
                                })
                                .setTimestamp();
                            
                            // Add helpful tips
                            if (selectedRoleIds.length > 5) {
                                responseEmbed.addFields({
                                    name: '💡 Tip',
                                    value: 'You selected many roles! Remember you can always change them later.',
                                    inline: false
                                });
                            }
                            
                            if (selectedRoleIds.length === 0) {
                                responseEmbed.addFields({
                                    name: '💡 Note',
                                    value: 'You removed all optional roles. You can add them back anytime!',
                                    inline: false
                                });
                            }
                        }
                        
                        // Send the final response
                        await interaction.editReply({ 
                            content: '',
                            embeds: [responseEmbed],
                            components: []
                        });
                        
                    } catch (error) {
                        console.error('Error updating roles:', error);
                        
                        // Check if it's an unknown interaction error
                        if (error.code === 10062) {
                            console.log('Interaction timed out before completion');
                            clearTimeout(timeout);
                            interactionTimeouts.delete(timeoutKey);
                            return;
                        }
                        
                        const errorEmbed = new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ Error Updating Roles')
                            .setDescription('There was an error updating your roles. Please try again or contact an admin.')
                            .addFields({
                                name: 'What to do:',
                                value: '1. Try selecting roles again\n2. Make sure the bot has proper permissions\n3. Contact staff if the issue persists'
                            })
                            .setFooter({ 
                                text: `Error for ${interaction.user.tag}`,
                                iconURL: interaction.user.displayAvatarURL() 
                            })
                            .setTimestamp();
                        
                        try {
                            await interaction.editReply({ 
                                content: '',
                                embeds: [errorEmbed],
                                components: []
                            });
                        } catch (editError) {
                            console.error('Failed to send error response:', editError);
                        }
                    }
                    
                    clearTimeout(timeout);
                    interactionTimeouts.delete(timeoutKey);
                    return;
                }

                await handleSelectMenuInteraction(interaction, client);
                clearTimeout(timeout);
                interactionTimeouts.delete(timeoutKey);
                return;
            }

            // Handle User Select Menus
            if (interaction.isUserSelectMenu()) {
                console.log('Handling user select menu interaction with customId:', interaction.customId);
                await handleUserSelectMenuInteraction(interaction, client);
                clearTimeout(timeout);
                interactionTimeouts.delete(timeoutKey);
                return;
            }

            console.log('Unhandled interaction type:', interaction.type);
            clearTimeout(timeout);
            interactionTimeouts.delete(timeoutKey);
            
        } catch (error) {
            console.error('Error handling interaction:', error);
            
            // Clear the timeout
            clearTimeout(timeout);
            interactionTimeouts.delete(timeoutKey);
            
            // Handle different types of errors
            if (error.code === 10062) {
                // Unknown interaction - already timed out
                console.log('Interaction timed out before response:', interaction.customId);
                return;
            }
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: 'An error occurred while processing your interaction.',
                        ephemeral: true,
                    });
                } catch (replyError) {
                    console.error('Failed to send error response:', replyError);
                }
            } else if (interaction.deferred) {
                try {
                    await interaction.editReply({
                        content: 'An error occurred while processing your interaction.',
                        embeds: [],
                        components: []
                    });
                } catch (editError) {
                    console.error('Failed to edit error response:', editError);
                }
            }
        }
    },

    // Message Create Handler for Commands
    async handleMessageCreate(message, client) {
        if (!message.content.startsWith('!') || message.author.bot) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();

        if (commandName === 'scorecard') {
            return await handleScorecardPrefixCommand(message, args, client);
        }

        const command = client.commands.get(commandName);
        if (!command) return;

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(error);
            message.reply('There was an error trying to execute that command!');
        }
    },

    async handleReaction(reaction, user, addRole) {
        try {
            if (reaction.partial) await reaction.fetch();
            if (user.bot) return;
            await handleSecondaryDisciplineSelection(reaction, user, addRole);
        } catch (error) {
            console.error('Error handling reaction:', error);
        }
    },

    handleSecondaryDisciplineSelection,
    setupChannelClosureChecker,
};

function isValidIssueCouncilURL(url) {
    const validPatterns = [
        /^https:\/\/issue-council\.robertsspaceindustries\.com\/projects\/STAR-CITIZEN\/issues\/[A-Z0-9_-]+$/i,
        /^https:\/\/issue-council\.robertsspaceindustries\.com\/projects\/RSI-[A-Z]+\/issues\/[A-Z0-9_-]+$/i
    ];
    
    return validPatterns.some(pattern => pattern.test(url));
}

async function handleButtonInteraction(interaction, client) {
    const customId = interaction.customId;

    try {
        // Exact ID matches
        const exactHandlers = {
            'nominate_button': handleNominateButton,
            'export_inventory_xml': exportInventoryXML,
            'export_inventory_csv': exportInventoryCSV,
            'check_my_nominations': handleCheckMyNominations,
            'submit_cracked_video': showCrackedVideoForm,
            'submit_cqb_cert': showCQBCertForm,
            'joinBlightVeilLegion': handleJoinBlightVeilLegion,
            'membershipApplication': handleMembershipApplication,
            'KTRestrict': handleKTRestrict,
            'KTAllow': handleKTAllow,
            'closeChannel': handleCloseChannel,
            'confirmCloseChannel': handleConfirmCloseChannel,
            'verify': handleVerifyButton,
            'nickname_change_request': handleNicknameChangeRequest,
            'verify_form': handleVerifyForm,
            'staff_application_select': handleStaffApplicationSelect,
            'instructor_application_select': handleInstructorApplicationSelect,
            'training_request_select': handleTrainingRequestSelect,
            'join_deathwatch': handleJoinDeathwatch,
            'request_deathwatch': handleRequestDeathwatch,
            'join_crackheads': handleJoinCrackheads,
            'request_crackheads': handleRequestCrackheads,
            'join_lootgoblins': handleJoinLootGoblins,
            'request_lootgoblins': handleRequestLootGoblins,
            'giveaway_control_embed': handleGiveawayControl,
            'giveaway_entry_embed_select_winner': handleSelectWinnerButton,
            'giveaway_entry_embed_cancel': handleCancelGiveawayButton,
            'giveaway_entry_embed_enter': handleGiveawayEntryEmbedButton,
            'make_embed': handleMakeEmbedButton,
            'finish_embed': handleFinishEmbedButton,
            'sponsor_squire': handleSponsorSquireButton,
            'accept_squire_trial': handleAcceptSquireTrial,
            'decline_squire_trial': handleDeclineSquireTrial,
            'confirm_end_squire_trial': handleConfirmEndSquireTrial,
            'generate_api_key': handleGenerateKTKeyButton,
            'open_fight_form': handleOpenFightForm,
            'add_bounty': handleAddBountyButton,
            'entomb_knight': handleEntombKnightButton2,
            'rise_knight': handleRiseKnightButton,
            'weekly_evaluation_start': handleWeeklyEvaluationButton,
            'red_channel_acknowledge': handleRedChannelAcknowledge,
            'red_channel_leave': handleRedChannelLeave,
            'sc_status_subscribe': handleSCStatusSubscribe,
            'sc_status_unsubscribe': handleSCStatusUnsubscribe,
            'red_channel_acknowledge': (i) => voiceStateHandler.handleRedChannelButton(i, client),
            'red_channel_leave': (i) => voiceStateHandler.handleRedChannelButton(i, client),
            'save_embed_edit': (i) => handleSaveEmbedEdit(i, client),
            'cancel_embed_edit': (i) => handleCancelEmbedEdit(i, client),
            'continue_editing': (i) => handleContinueEditing(i, client),
        };

        if (customId in exactHandlers) {
            return await exactHandlers[customId](interaction, client);
        }

        // Grouped conditions (prefix checks)
        switch (true) {
            // ========== VOICE BUTTON HANDLERS ==========
            case customId.startsWith('voice_'):
                // Extract the action from the custom ID (format: voice_[action]_[guildId])
                const parts = customId.split('_');
                const voiceAction = parts[1]; // "stop", "status", "leave", "join"
                
                switch(voiceAction) {
                    case 'stop':
                        return await handleVoiceStop(interaction, client);
                    case 'status':
                        return await handleVoiceStatus(interaction, client);
                    case 'leave':
                        return await handleVoiceLeave(interaction, client);
                    case 'join':
                        return await handleVoiceJoin(interaction, client);
                    case 'download':
                        // Handle download button (for transcript)
                        return await interaction.reply({
                            content: 'Transcript is attached above.',
                            ephemeral: true
                        });
                    default:
                        console.log('Unhandled voice button action:', voiceAction);
                        return await interaction.reply({ 
                            content: 'This voice action is not handled.', 
                            ephemeral: true 
                        });
                }

            case customId.startsWith('scorecard_create_'): {
                const parts = customId.split('_');
                console.log('Scorecard create button parts:', parts);
                
                const targetUserId = parts[2];
                const targetUsername = parts.slice(3).join('_'); // Handle usernames with underscores
                
                console.log('Target user ID:', targetUserId);
                console.log('Target username:', targetUsername);
                
                await showScorecardCreationModal(interaction, targetUserId, targetUsername);
                return;
            }

            case customId.startsWith('edit_embed_'): {
                // Check permissions
                const hasPermission = await canUserEditEmbed(interaction.user.id, interaction.message.id, interaction.guild);
                
                if (!hasPermission) {
                    const roleNames = EMBED_PERMISSIONS.REQUIRED_ROLES_ANY.map(roleId => {
                        const role = interaction.guild.roles.cache.get(roleId);
                        return role ? `• ${role.name}` : `• Role ID: ${roleId}`;
                    }).join('\n');
                    
                    return interaction.reply({ 
                        content: `❌ You do not have permission to edit this embed.\n\n**Required Roles (any one of):**\n${roleNames}\n\n*or be the original author*`, 
                        ephemeral: true 
                    });
                }
                
                return await handleEditEmbedButton(interaction, client);
            }

            case customId.startsWith('scorecard_continue_2_'): {
                const targetUserId = customId.split('_')[3];
                await showScorecardModalPart2(interaction, targetUserId);
                return;
            }

            case customId.startsWith('scorecard_continue_3_'): {
                const targetUserId = customId.split('_')[3];
                await showScorecardModalPart3(interaction, targetUserId);
                return;
            }

            case customId.startsWith('attendance_manage_'):
                return await handleAttendanceManage(interaction, client);

            case customId.startsWith('attendance_reshuffle_'):
                return await handleAttendanceReshuffle(interaction, client);

            case customId.startsWith('attendance_checkin_'):
                return await handleAttendanceCheckIn(interaction, client);

            case customId.startsWith('promote_'):
                return await handleEvaluationButton(interaction);

            case customId.startsWith('reset_'):
                return await handleResetButton(interaction);

            case customId.startsWith('back_'):
                return await handleBackButton(interaction);

            case customId.startsWith('done_'):
                return await handleDoneButton(interaction);

            case customId.startsWith('entomb_knight_button'):
                return await handleEntombKnightButton2(interaction);

            case customId.startsWith('select_knight_to_entomb'):
                return await handleSelectKnightToEntomb(interaction);
                
            case customId.startsWith('entomb_vote_'):
                return await handleEntombmentVote(interaction);

            case customId.startsWith('entomb_reason_'):
                return await handleEntombmentReasonSubmit(interaction);

            case customId.startsWith('grant_rise_'):
                return await handleGrantRiseButton(interaction, client);

            case customId.startsWith('deny_rise_'):
                return await handleDenyRiseButton(interaction, client);

            case customId.startsWith('weekly_evaluate_'):
                return await handleWeeklyEvaluateButton(interaction);

            case customId.startsWith('weekly_extend_'):
                return await handleWeeklyExtendButton(interaction);

            case customId.startsWith('weekly_update_'):
                return await handleWeeklyUpdateButton(interaction);

            case customId.startsWith('weekly_skip_'):
                return await handleWeeklySkipButton(interaction);

            case customId.startsWith('confirm_evaluate_'):
                return await handleConfirmEvaluateButton(interaction);

            case customId.startsWith('confirm_extend_'):
                return await handleConfirmExtendButton(interaction);

            case customId === 'cancel_evaluate':
                return await handleCancelEvaluate(interaction);

            case customId === 'cancel_extend':
                return await handleCancelExtend(interaction);

            case customId.startsWith('approve_') || customId.startsWith('deny_') || customId.startsWith('recog_'):
                console.log('Routing to handleApproveDenyButton...');
                return await handleApproveDenyButton(interaction);

            // Inventory Buttons with pagination
            case customId === 'inventory_input' || customId === 'inventory_withdraw': {
                const action = customId === 'inventory_input' ? 'input' : 'withdraw';
                userSessions.set(interaction.user.id, { action });

                // Use paginated dropdowns
                const components = createPaginatedDropdowns(action, 0);
                const totalPages = Math.ceil(Object.keys(ITEM_GROUPS).length / 3);

                return interaction.reply({
                    content: `Please select the item(s) you want to ${action} (Page 1/${totalPages}):`,
                    components: components,
                    flags: 64,
                });
            }

            // Handle inventory page navigation
            case customId.startsWith('inventory_page_'): {
                return await handleInventoryPageNavigation(interaction, userSessions);
            }
            
            // Wikelo bundle button
            case customId === 'wikelo_bundle_select_btn':
                return await handleWikeloBundleButton(interaction);

            case customId === 'inventory_patch_adjust':
                return await handlePatchAdjustmentButton(interaction);

            case customId === 'item_selection_finished': {
                const session = userSessions.get(interaction.user.id);
                if (!session?.items?.length) {
                    return interaction.reply({
                        content: 'You have not selected any items yet.',
                        flags: 64,
                    });
                }

                const locationSelect = new StringSelectMenuBuilder()
                    .setCustomId('select_location')
                    .setPlaceholder('Select loot location')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(LOCATIONS);

                return interaction.reply({
                    content: 'Select the location of the loot:',
                    components: [new ActionRowBuilder().addComponents(locationSelect)],
                    flags: 64,
                });
            }

            case customId.startsWith('inv_success_') || customId.startsWith('inv_failure_'):
                return await BankApproveDenyButton(interaction, pool);

            case customId.startsWith('inv_close_thread_'):
                return await handleCloseThreadButton(interaction);

            case customId.startsWith('acceptMembership_') || customId.startsWith('acceptAUX_'):
                return await handleAcceptMembership(interaction);

            case customId.startsWith('denyMembership_'):
                return await handleDenyMembership(interaction);

            case customId.startsWith('approveNickname_'):
                return await handleApproveNicknameRequest(interaction);

            case customId.startsWith('editNickname_'):
                return await handleEditNicknameRequest(interaction);

            case customId.startsWith('denyNickname_'):
                return await handleDenyNicknameRequest(interaction);

            case customId.startsWith('confirmDenyNickname_'):
                return await handleConfirmDenyNicknameRequest(interaction);

            case customId.startsWith('nicknameDenyBack_'):
                return await handleDenyBackNicknameRequest(interaction);

            case customId.startsWith('grantAmbassadorship_'):
                return await handleGrantAmbassadorship(interaction);

            case customId.startsWith('denyAmbassadorship_'):
                return await handleDenyAmbassadorship(interaction);

            case customId.startsWith('approveStaffApp_'):
                return await handleApproveStaffApp(interaction);

            case customId.startsWith('denyStaffApp_'):
                return await handleDenyStaffApp(interaction);

            case customId.startsWith('approveInstructorApp_'):
                return await handleApproveInstructorApp(interaction);

            case customId.startsWith('denyInstructorApp_'):
                return await handleDenyInstructorApp(interaction);

            case customId.startsWith('closeTrainingRequest_'):
                return await handleCloseTrainingRequest(interaction);

            case customId.startsWith('confirmCloseTrainingRequest_'):
                return await handleConfirmCloseTrainingRequest(interaction);

            case customId.startsWith('backCloseTrainingRequest_'):
                return await handleBackCloseTrainingRequest(interaction);

            case customId.startsWith('scheduleTraining_'):
                return await handleScheduleTraining(interaction);

            case customId.startsWith('deathwatch_responding_'):
                return await handleDeathwatchResponding(interaction);

            case customId.startsWith('deathwatch_resolved_'):
                return await handleDeathwatchResolved(interaction);

            case customId.startsWith('confirmCloseDeathwatch_'):
                return await handleConfirmCloseDeathwatch(interaction);

            case customId.startsWith('crackheads_responding_'):
                return await handleCrackheadsResponding(interaction);

            case customId.startsWith('crackheads_resolved_'):
                return await handleCrackheadsResolved(interaction);

            case customId.startsWith('confirmCloseCrackheads_'):
                return await handleConfirmCloseCrackheads(interaction);

            case customId.startsWith('createInterviewChannel_'):
                return await handleCreateInterviewChannel(interaction);

            case customId.startsWith('closeInterview_'):
                return await handleCloseInterview(interaction);

            case customId.startsWith('confirmCloseInterview_'):
                return await handleConfirmCloseInterview(interaction);

            case customId.startsWith('createInstructorInterviewChannel_'):
                return await handleCreateInstructorInterviewChannel(interaction);

            case customId.startsWith('closeInstructorInterview_'):
                return await handleCloseInstructorInterview(interaction);

            case customId.startsWith('confirmCloseInstructorInterview_'):
                return await handleConfirmCloseInstructorInterview(interaction);

            case customId.startsWith('award_'):
                return await handleAwardMedalButton(interaction);

            case customId.startsWith('fire_'):
                return await handleFireStaffButton(interaction);

            case customId.startsWith('setnick_button_'):
                return await handleNickOverrideButton(interaction, client);

            case customId.startsWith('lootgoblin_responding_'):
                return await handleLootGoblinsResponding(interaction);

            case customId.startsWith('lootgoblin_resolved_'):
                return await handleLootGoblinsResolved(interaction);

            case customId.startsWith('lootgoblin_confirmCloseLootGoblins_'):
                return await handleConfirmCloseLootGoblins(interaction);

            case customId.startsWith('add_bounty_'): {
                const parts = customId.split('_');
                const username = parts.slice(2, parts.length - 1).join('_'); // handles underscores in username
                const allowedUserId = parts[parts.length - 1];

                if (interaction.user.id !== allowedUserId) {
                    return interaction.reply({ content: '❌ You cannot use this button.', ephemeral: true });
                }

                await handleAddBountyButton(interaction, username);
                break;
            }

            case customId.startsWith('confirm_cancel_giveaway'):
                return await handleCancelGiveaway(interaction);

            case customId.startsWith('pilot_') || customId.startsWith('infantry_') || customId.startsWith('crewman_') || customId.startsWith('tradesman_'):
                return await handleSpecialtyButton(interaction);

            case customId.startsWith('approveSpecialtyGrant_') || customId.startsWith('denySpecialtyGrant_'):
                return await handleSpecialtyApproval(interaction);

            case customId.startsWith('approveCrackedGrant_') || customId.startsWith('denyCrackedGrant_'):
                return await handleCrackedApproval(interaction);

            case customId.startsWith('vote_yay_') || customId.startsWith('vote_nay_'):
                return await handleVoteButton(interaction);

            case customId.startsWith('STRM_APPROVE_') || customId.startsWith('STRM_DENY_'): {
                const [action, userId, waitingRoomId, mainVCId] = customId.split('_').slice(1);

                const guild = interaction.guild;
                const member = await guild.members.fetch(userId).catch(() => null);
                const waitingRoom = guild.channels.cache.get(waitingRoomId);
                const mainVC = guild.channels.cache.get(mainVCId);

                const isStillInWaitingRoom = member?.voice?.channelId === waitingRoomId;

                if (!member || !waitingRoom || !mainVC || !isStillInWaitingRoom) {
                    return interaction.update({
                        content: `⚠️ <@${userId}> is no longer in the waiting room.`,
                        embeds: [],
                        components: []
                    });
                }

                if (customId.startsWith('STRM_APPROVE_')) {
                    try {
                        await member.voice.setChannel(mainVC);
                        await interaction.update({
                            content: `✅ <@${userId}> has been moved into the channel.`,
                            embeds: [],
                            components: []
                        });
                    } catch (err) {
                        console.error('Error moving user:', err);
                        return interaction.reply({ content: '❌ Could not move the user. Check permissions.', ephemeral: true });
                    }
                } else {
                    await interaction.update({
                        content: `🚫 Request from <@${userId}> was denied.`,
                        embeds: [],
                        components: []
                    });

                    try {
                        await member.send(`❌ Your request to join **${mainVC.name}** was denied.`).catch(() => null);
                    } catch (err) {
                        console.error('Error sending DM to denied user:', err);
                    }
                }

                return;
            }

            case customId.startsWith('dispute_approve_') || customId.startsWith('dispute_deny_'): {
                if (!interaction.member.roles.cache.has(FLIGHT_OVERSEER_ROLE)) {
                    return interaction.reply({ content: 'Only Flight Overseers can resolve disputes.', ephemeral: true });
                }

                const [, action, userId, opponentId] = customId.split('_');
                const [sessionA, sessionB] = await Promise.all([
                    getFightSession(userId, opponentId),
                    getFightSession(opponentId, userId),
                ]);
                let finalResultA = sessionA?.result || 'WIN';
                let finalResultB = sessionB?.result || 'WIN';

                let finalText = '';

                if (action === 'approve') {
                    await saveFightResult(userId, opponentId, finalResultA);
                    await saveFightResult(opponentId, userId, finalResultB);
                    finalText = `✅ Fight approved by Overseer.\n<@${userId}> = **${finalResultA}**, <@${opponentId}> = **${finalResultB}**`;
                } else {
                    finalText = '❌ Fight denied/canceled by Overseer.';
                }

                const logChannel = await interaction.guild.channels.fetch(FLIGHT_LOG_CHANNEL);
                if (logChannel) {
                    await logChannel.send(finalText);
                }

                await interaction.update({ content: finalText, components: [], embeds: [] });
                const thread = interaction.channel;
                setTimeout(() => thread.setArchived(true), 5000);

                await clearFightSession(userId, opponentId);
                await clearFightSession(opponentId, userId);
                return;
            }

            case customId === 'comp_add_pilot':
            case customId === 'comp_add_infantry': {
                const ALLOWED_ROLES = [
                    '1386731565002002662',
                    '1390951685995757638',
                    '1390871349408436224'
                ];

                if (!interaction.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id))) {
                    return interaction.reply({
                        content: '❌ You do not have permission to use this button.',
                        ephemeral: true
                    });
                }

                const { ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');
                const menu = new UserSelectMenuBuilder()
                    .setCustomId(customId === 'comp_add_pilot' ? 'comp_user_pilot' : 'comp_user_infantry')
                    .setPlaceholder('Select a user to toggle role')
                    .setMinValues(1)
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(menu);
                return interaction.reply({ content: 'Select a user:', components: [row], ephemeral: true });
            }
            
            case customId === 'VeilMember': {
                const { ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');

                const ALLOWED_ROLES = [
                    '1168253795818549319', //SOV
                    '1168234521301356715', //HC
                    '1304192533533819002' // LL
                ];

                if (!interaction.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id))) {
                    return interaction.reply({
                        content: '❌ You do not have permission to use this button.',
                        ephemeral: true
                    });
                }

                const menu = new UserSelectMenuBuilder()
                    .setCustomId('veil_user_select')
                    .setPlaceholder('Select a user to add/remove Veil role')
                    .setMinValues(1)
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(menu);

                return interaction.reply({
                    content: '👤 Select a user to add/remove the **Veil** role:',
                    components: [row],
                    ephemeral: true
                });
            }

            default:
                console.log('Unhandled button interaction:', customId);
                return await interaction.reply({ content: 'This interaction is not handled.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error in handleButtonInteraction:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'There was an error processing your request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleModalSubmitInteraction(interaction, client) {
    const customId = interaction.customId;

    try {
        // Simple exact match handlers
        const exactHandlers = {
            'org-tag-modal': handleOrgTagModal,
            'cracked_video_modal': processCrackedVideoSubmission,
            'cqb_cert_modal': processCQBCertSubmission,
            'membership_application': handleMembershipApplicationForm,
            'nickname_change_form': handleNicknameChangeForm,
            'verify_form_modal': handleVerifyFormModal,
            'verify_form': handleVerifyFormModal,
            'punitive_action_form': handlePunitiveActionForm,
            'giveaway_entry_embed_modal_submit': handleGiveawayEntryEmbedModal,
            'winner_modal': handleWinnerModalSubmit,
            'cancel_giveaway_modal': handleCancelGiveawayModalSubmit,
            'rename-vc-modal': (i) => handleRenameVCModal(i, client),
            'set-limit-modal': (i) => handleSetLimitModal(i, client),
            'scorecard_modal': handleScorecardModalSubmit,
            'embed_basic_info_modal': (i) => handleEmbedBasicInfoModal(i, client),
            'add_field_modal': (i) => handleAddFieldModal(i, client),
            'set_author_modal': (i) => handleAuthorModal(i, client),
            'set_footer_modal': (i) => handleFooterModal(i, client),
            'image_modal': (i) => handleImageModal(i, 'image', client),
            'thumbnail_modal': (i) => handleImageModal(i, 'thumbnail', client),
            'edit_title_modal': (i) => handleEditTitleModal(i, client),
            'edit_description_modal': (i) => handleEditDescriptionModal(i, client),
            'edit_color_modal': (i) => handleEditColorModal(i, client),
            'edit_plain_text_modal': (i) => handleEditPlainTextModal(i, client),
            'edit_author_modal': (i) => handleEditAuthorModal(i, client),
            'edit_footer_modal': (i) => handleEditFooterModal(i, client),
            'edit_image_modal': (i) => handleEditImageModal(i, client),
            'edit_thumbnail_modal': (i) => handleEditThumbnailModal(i, client),
            'edit_add_field_modal': (i) => handleEditAddFieldModal(i, client),
            // Button modals
            'add_buttons_modal': (i) => handleAddButtonsModal(i, client),
            'edit_button_modal': (i) => handleEditButtonModal(i, client),
            // Prison time modal handler
            'prison_time_modal': (i) => handlePrisonTimeModal(i, userSessions),
            // Inventory quantity modal handler
            'quantity_modal': (i) => handleInventoryQuantityModal(i, userSessions),
        };

        if (customId in exactHandlers) {
            return await exactHandlers[customId](interaction);
        }

        // Grouped prefix matches
        switch (true) {
            case customId.startsWith('scorecard_modal_'): {
                if (customId.startsWith('scorecard_modal_1_')) {
                    await handleScorecardModalPart1(interaction);
                } else if (customId.startsWith('scorecard_modal_2_')) {
                    await handleScorecardModalPart2(interaction);
                } else if (customId.startsWith('scorecard_modal_3_')) {
                    await handleScorecardModalPart3(interaction);
                }
                return;
            }

            case customId.startsWith('nomination_form_'):
                return await handleNominationForm(interaction);

            case customId.startsWith('edit_add_field_modal'):
                return await handleEditFieldModal(interaction, client);
        
            case customId.startsWith('edit_field_'):
                return await handleEditFieldModal(interaction, client);

            case customId.startsWith('edit_nickname_form_'):
                return await handleEditNicknameForm(interaction);

            case customId.startsWith('staff_application_'):
                return await handleStaffApplicationForm(interaction);

            case customId.startsWith('instructor_application_'):
                return await handleInstructorApplicationForm(interaction);

            case customId.startsWith('vote_form_'):
                return await handleVoteFormSubmit(interaction);

            case customId.startsWith('training_request_'):
                return await handleTrainingRequestForm(interaction);

            case customId.startsWith('schedule_training_'):
                return await handleScheduleTrainingForm(interaction);

            case customId.startsWith('grantAmbassadorshipModal_'):
                return await handleGrantAmbassadorshipModal(interaction);

            case customId.startsWith('awardmedal_'):
                return await handleAwardMedalModal(interaction);

            case customId.startsWith('setnick_modal_'):
                return await handleModalNickOverride(interaction, client);

            case customId.startsWith('modal_'):
                return await handleSpecialtyModal(interaction);

            // Patch adjustment modal
            case customId.startsWith('patch_adjust_'): {
                return await handlePatchAdjustmentModal(interaction);
            }

            case customId.startsWith('add_bounty_modal_'): {
                if (!customId.endsWith(interaction.user.id)) {
                    return interaction.reply({ content: 'You are not allowed to submit this bounty.', ephemeral: true });
                }

                const amountStr = interaction.fields.getTextInputValue('bounty_amount');
                const numericAmount = parseInt(amountStr, 10);
                if (isNaN(numericAmount) || numericAmount <= 0) {
                    return interaction.reply({ content: 'Please enter a valid positive number.', ephemeral: true });
                }

                try {
                    const pool = await connectToMySQL();

                    const parts = customId.split('_');
                    const username = parts.slice(3, parts.length - 1).join('_');

                    const [rows] = await pool.query('SELECT display_name FROM rsi_profiles WHERE username = ?', [username]);
                    const displayName = rows.length > 0 ? rows[0].display_name : username;

                    await pool.query(
                    `INSERT INTO bounties (user_id, username, display_name, amount, creator_discord_id, added_by, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
                    [interaction.user.id, username, displayName, numericAmount, interaction.user.id, interaction.user.id]
                    );

                    return interaction.reply({
                        content: `Bounty of **${numericAmount}** has been added for **${displayName}**.`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error saving bounty:', error);
                    return interaction.reply({ content: 'Error saving bounty. Please try again later.', ephemeral: true });
                }
            }
            
            case customId === 'set-bitrate-modal': {
                const bitrateInput = interaction.fields.getTextInputValue('bitrate');
                const bitrate = parseInt(bitrateInput, 10);
                const voiceChannel = interaction.member?.voice?.channel;

                if (!voiceChannel) {
                    return interaction.reply({ content: 'You are not in a voice channel.', flags: 64 });
                }

                const maxBitrate = voiceChannel.guild.premiumTier > 0 ? 384000 : 96000;
                const minBitrate = 8000;

                if (isNaN(bitrate) || bitrate * 1000 < minBitrate || bitrate * 1000 > maxBitrate) {
                    return interaction.reply({
                        content: `Invalid bitrate. Please enter a number between ${minBitrate / 1000} and ${maxBitrate / 1000} kbps.`,
                        flags: 64,
                    });
                }

                await voiceChannel.setBitrate(bitrate * 1000);
                return await interaction.reply({
                    content: `Bitrate set to **${bitrate} kbps**.`,
                    flags: 64,
                });
            }

            default:
                console.warn('Unhandled modal interaction:', customId);
                return await interaction.reply({ content: 'This modal is not handled.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error in handleModalSubmitInteraction:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your submission.',
                ephemeral: true,
            });
        }
    }
}

async function handleSelectMenuInteraction(interaction, client) {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // --- handle the nomination user‐select first ---
    if (customId === 'select_nominee') {
      return await handleNomineeSelect(interaction);
    }

    if (customId.startsWith('pause_duration_menu_')) {
      return await handlePauseDurationMenu(interaction, client);
    }

    // --- exact‐match menus ---
    switch (customId) {
      case 'selectRole':
        return await handleOnboardingRoleSelection(interaction);
      case 'select_discipline':
        return await handleDisciplineSelection(interaction);
      case 'staff_application_select':
        return await handleStaffApplicationSelect(interaction);
      case 'instructor_application_select':
        return await handleInstructorApplicationSelect(interaction);
      case 'training_request_select':
        return await handleTrainingRequestSelect(interaction);
      case 'select_hr_form':
        return await handleSelectHrForm(interaction);
      case 'vc-options-menu':
        return await handleTempVCOptionsMenu(interaction, client);
      case 'set-region-menu-main':
        return await handleSetRegionMenu(interaction, 'main');
      case 'set-region-menu-recommended':
        return await handleSetRegionMenu(interaction, 'recommended');
      case customId.startsWith('pause_duration_menu_'):
        return await handlePauseDurationMenu(interaction, client);
      case 'grant_specialty_select':
        return await handleSpecialtySelection(interaction);
      case 'grant_cracked_roles_select':
        return await handleCrackedRoleSelection(interaction);
      case customId.startsWith('attendance_checkin_'):
        return await handleAttendanceCheckIn(interaction);
      case customId.startsWith('attendance_remove_'):
        return await handleAttendanceRemoveUsers(interaction, client);
      case 'select_scorecard': {
          // The value format is now: tag_username_index
          const [tag, ...usernameParts] = interaction.values[0].split('_');
          // Join the remaining parts (except the last index) to reconstruct the username
          const username = usernameParts.slice(0, -1).join('_');
          
          console.log(`[DEBUG] Select scorecard: tag=${tag}, username=${username}`);
          
          await handleScorecardSelection(interaction, username, tag);
          return;
      }
      case customId.startsWith('attendance_reshuffle_'):
        return await handleAttendanceReshuffle(interaction);

      case 'streamer-control-menu': {
        const selected = interaction.values[0];
        if (selected === 'claim_streamer') return await handleClaimChannel(interaction);
        if (selected === 'release_streamer') return await handleReleaseChannel(interaction);
        return await interaction.reply({ content: 'Streamer control option not recognized.', ephemeral: true });
      }

      // Patch location select menu
      case 'patch_location_select':
        return await handlePatchLocationSelect(interaction);

      // Wikelo bundle select menu
      case 'wikelo_bundle_select':
        return await handleWikeloBundleSelect(interaction, userSessions);

      case 'inventory_action': {
        const action = interaction.values[0];
        userSessions.set(userId, { action });
        const dropdowns = dropdownRows(action);
        const finishedButtonRow = createFinishedButton();
        const response = await interaction.reply({
          content: `Please select the item(s) you want to ${action}:`,
          components: [...dropdowns, finishedButtonRow],
          ephemeral: true,
          fetchReply: true,
        });
        userSessions.get(userId).messageId = response.id;
        return;
      }

      case 'item_selection_finished': {
        const session = userSessions.get(userId);
        if (!session?.items?.length) {
          return interaction.reply({ content: 'You have not selected any items yet.', flags: 64 });
        }
        
        // Check if we need to show the location select or go straight to finalization
        const hasNonBundleItems = session.items.some(item => {
          // Check if this item has a quantity already set (from bundle)
          return !session.quantities || !session.quantities[item];
        });
        
        if (hasNonBundleItems) {
          const locationSelect = new StringSelectMenuBuilder()
            .setCustomId('select_location')
            .setPlaceholder('Select loot location')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(LOCATIONS);
          
          return interaction.update({
            content: 'Select the location of the loot:',
            components: [new ActionRowBuilder().addComponents(locationSelect)],
            flags: 64,
          });
        } else {
          // All items are from bundles with pre-defined quantities
          if (session.action === 'withdraw') {
            const reasonSelect = new StringSelectMenuBuilder()
              .setCustomId('withdraw_reason_select')
              .setPlaceholder('Select reason for withdrawal')
              .addOptions(WITHDRAW_REASONS);

            return interaction.reply({
              content: 'Select the reason for withdrawal:',
              components: [new ActionRowBuilder().addComponents(reasonSelect)],
              flags: 64,
            });
          }
          return await finalizeRequest(interaction, session, client);
        }
      }

      case 'withdraw_reason_select': {
        const session = userSessions.get(userId);
        session.reason = interaction.values[0];
        userSessions.set(userId, session);
        return finalizeRequest(interaction, session, client);
      }

      // Embed and button related menus
      case 'embed_options_menu':
        return await handleEmbedOptionsMenu(interaction, client);

      case 'edit_embed_options':
        return await handleEditEmbedOptions(interaction, client);

      case 'edit_fields_action':
        return await handleEditFieldsAction(interaction, client);

      case 'edit_select_field':
        return await handleEditSelectField(interaction, client);

      case 'edit_remove_field':
        return await handleEditRemoveField(interaction, client);

      case 'button_management_menu':
        return await handleButtonManagementMenu(interaction, client);

      case 'remove_button_select':
        return await handleRemoveButtonSelect(interaction, client);

      case 'edit_buttons_action':
        return await handleEditButtonsAction(interaction, client);

      case 'edit_select_button':
        return await handleEditSelectButton(interaction, client);

      case 'edit_remove_button':
        return await handleEditRemoveButton(interaction, client);
    }

    // Vote form handler
    if (interaction.customId.startsWith('vote_form_')) {
        return await handleVoteFormSubmit(interaction);
    }

    // --- FIGHT LADDER: Opponent Select ---
    if (customId.startsWith('fight_select_opponent_')) {
      const userId = interaction.user.id;
      if (!client.fightSessions) client.fightSessions = new Map();
      const session = client.fightSessions.get(userId) || {};
      session.opponentId = interaction.values[0];

      if (session.opponentId === userId) {
        return interaction.reply({
          content: '⚠️ You cannot select yourself as your opponent!',
          ephemeral: true
        });
      }

      client.fightSessions.set(userId, session);

      const resultMenu = new StringSelectMenuBuilder()
        .setCustomId(`fight_select_result_${userId}`)
        .setPlaceholder('Win or Loss')
        .addOptions([
          { label: 'Win', value: 'WIN', emoji: '🏆' },
          { label: 'Loss', value: 'LOSS', emoji: '💀' }
        ]);
      const row = new ActionRowBuilder().addComponents(resultMenu);

      await interaction.reply({
        content: `Now select the result of your match with <@${session.opponentId}>:`,
        components: [row],
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === 'select_main_category') {
        const selectedCategory = interaction.values[0];
        const dropdowns = createDropdownsForCategory(selectedCategory);

        await interaction.update({
        content: `Select items from ${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}:`,
        components: dropdowns,
        ephemeral: true,
        });
    }

    // --- prefix‐based menus ---
    // Patch item select menu
    if (customId.startsWith('patch_item_select_')) {
      return await handlePatchItemSelect(interaction);
    }

    if (customId.startsWith('item_select_')) {
      const session = userSessions.get(userId);
      const merged = [...new Set([...(session.items||[]), ...interaction.values])];
      if (merged.length > 5) {
        return interaction.reply({ content: `⚠️ You can only select up to 5 items.`, flags: 64 });
      }
      session.items = merged;
      userSessions.set(userId, session);
      
      // Check if merits were selected
      if (interaction.values.includes(MERIT_ITEM_KEY)) {
        const modal = createPrisonTimeModal();
        await interaction.showModal(modal);
        return;
      }
      
      // Update the current page with the new selection
      const page = 0; // You might want to track the current page in the session
      const action = session.action || 'input';
      const components = createPaginatedDropdowns(action, page);
      const totalPages = Math.ceil(Object.keys(ITEM_GROUPS).length / 3);
      
      return interaction.update({
        content: `✅ Selected ${session.items.length} item(s). (Page ${page + 1}/${totalPages})`,
        components: components,
        flags: 64,
      });
    }
    
    if (customId === 'attendance-control-menu') {
        return await handleAttendanceControlMenu(interaction, client);
    }

    if (customId === 'select_location') {
      const session = userSessions.get(userId);
      session.location = interaction.values[0];
      userSessions.set(userId, session);

      // Check if we have any items that need quantity input (items without pre-defined quantities)
      const itemsNeedingQuantity = session.items.filter(itemKey => {
        // Skip items that already have quantities (from bundles)
        if (session.quantities?.[itemKey]) {
          return false;
        }
        // Skip merits if they already have prison time set
        if (itemKey === MERIT_ITEM_KEY && session.quantities?.[MERIT_ITEM_KEY]) {
          return false;
        }
        return true;
      });

      if (itemsNeedingQuantity.length === 0) {
        // All items have pre-defined quantities (from bundles)
        if (session.action === 'withdraw') {
          const reasonSelect = new StringSelectMenuBuilder()
            .setCustomId('withdraw_reason_select')
            .setPlaceholder('Select reason for withdrawal')
            .addOptions(WITHDRAW_REASONS);

          return interaction.reply({
            content: 'Select the reason for withdrawal:',
            components: [new ActionRowBuilder().addComponents(reasonSelect)],
            flags: 64,
          });
        }
        return await finalizeRequest(interaction, session, client);
      }

      // Some items need quantity input
      const modal = new ModalBuilder()
        .setCustomId('quantity_modal')
        .setTitle('Enter Quantities');
      
      const components = itemsNeedingQuantity
        .slice(0, 5)
        .map(itemKey => {
          const label = ITEMS.find(i => i.value === itemKey)?.label || itemKey;
          return new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`quantity_${itemKey}`)
              .setLabel(`Qty for ${label}`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          );
        });
      
      modal.addComponents(...components);
      return interaction.showModal(modal);
    }

    // --- nothing matched? ---
    console.warn('Unhandled select menu customId:', customId);
    if (!interaction.replied) {
      await interaction.reply({ content: 'Unhandled select menu interaction.', ephemeral: true });
    }
  } catch (error) {
    console.error('Error handling select menu interaction:', error);
    if (!interaction.replied) {
      await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
  }
}

async function handleUserSelectMenuInteraction(interaction, client) {
    try {
        // === SCORECARD: User Selection for Scorecard Creation ===
        if (interaction.customId === 'scorecard_user_select') {
            console.log('=== SCORECARD USER SELECT HANDLER ===');
            console.log('Interaction values:', interaction.values);
            console.log('Interaction users:', interaction.users);
            
            const selectedUser = interaction.users.first();
            
            if (!selectedUser) {
                console.error('No user selected!');
                return await interaction.reply({
                    content: '❌ No user was selected. Please try again.',
                    flags: 64
                });
            }
            
            console.log('Selected user ID:', selectedUser.id);
            console.log('Selected user tag:', selectedUser.tag);
            console.log('Selected user username:', selectedUser.username);
            
            const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
            
            const embed = new EmbedBuilder()
                .setTitle('🎯 Create Scorecard')
                .setDescription(`Click the button below to create a scorecard for **${selectedUser.tag}**`)
                .setColor(0x0099FF)
                .addFields(
                    { 
                        name: 'Instructions', 
                        value: 'You will be asked to rate the following categories:\n• Aim - Snap\n• Aim - Tracking\n• Aim - Accuracy\n• Teamplay\n• Comms\n• Strategy\n• Resource Management\n• Game Knowledge\n• Leadership\n• Mindset & Growth\n• Specialty Tag' 
                    }
                )
                .setFooter({ text: 'All scores are on a scale of 1-10 (0 = N/A)' });

            const button = new ButtonBuilder()
                .setCustomId(`scorecard_create_${selectedUser.id}_${selectedUser.username}`)
                .setLabel('Create Scorecard')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝');

            const row = new ActionRowBuilder().addComponents(button);

            await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: 64
            });
            return;
        }

        // === FIGHT LADDER: Opponent Select ===
        if (interaction.customId.startsWith('fight_select_opponent_')) {
            const userId = interaction.user.id;
            if (!client.fightSessions) client.fightSessions = new Map();
            const session = client.fightSessions.get(userId) || {};
            
            session.opponentId = interaction.users.first()?.id;

            if (session.opponentId === userId) {
                return interaction.reply({
                    content: '⚠️ You cannot select yourself as your opponent!',
                    ephemeral: true
                });
            }

            client.fightSessions.set(userId, session);

            const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
            const resultMenu = new StringSelectMenuBuilder()
                .setCustomId(`fight_select_result_${userId}`)
                .setPlaceholder('Win or Loss')
                .addOptions([
                    { label: 'Win', value: 'WIN', emoji: '🏆' },
                    { label: 'Loss', value: 'LOSS', emoji: '💀' }
                ]);
            const row = new ActionRowBuilder().addComponents(resultMenu);

            await interaction.reply({
                content: `Now select the result of your match with <@${session.opponentId}>:`,
                components: [row],
                ephemeral: true
            });
            return;
        }

        // ... rest of your existing user select menu handlers ...
        if (interaction.customId === 'select_nominee') {
            await handleNomineeSelect(interaction);
        } else if (interaction.customId.startsWith('userSelect_')) {
            await handleSpecialtyMenu(interaction);
        } else if (interaction.customId.startsWith('assign_cracked_role_')) {
            await handleCrackedRoleAssignment(interaction);
        } else if (interaction.customId === 'select_squire') {
            await handleSelectSquireMenu(interaction);
        } else if (interaction.customId === 'comp_user_pilot' || interaction.customId === 'comp_user_infantry') {
            const COMP_PILOT_ROLE_ID = '1386731852420878336';
            const COMP_INFANTRY_ROLE_ID = '1386731932364050565';
            const roleId = interaction.customId === 'comp_user_pilot' ? COMP_PILOT_ROLE_ID : COMP_INFANTRY_ROLE_ID;

            const targetUser = interaction.users.first();
            const guildMember = await interaction.guild.members.fetch(targetUser.id);

            if (guildMember.roles.cache.has(roleId)) {
                await guildMember.roles.remove(roleId);
                await interaction.reply({ content: `❌ Removed <@&${roleId}> from ${targetUser.tag}`, ephemeral: true });
            } else {
                await guildMember.roles.add(roleId);
                await interaction.reply({ content: `✅ Added <@&${roleId}> to ${targetUser.tag}`, ephemeral: true });
            }
            return;
        } else if (interaction.customId === 'veil_user_select') {
            const VEIL_ROLE_ID = '1406766839001780265';
            const LOG_CHANNEL_ID = '1406769912503865354';

            const targetUser = interaction.users.first();
            const guildMember = await interaction.guild.members.fetch(targetUser.id);

            let action;
            if (guildMember.roles.cache.has(VEIL_ROLE_ID)) {
                await guildMember.roles.remove(VEIL_ROLE_ID);
                action = 'removed';
            } else {
                await guildMember.roles.add(VEIL_ROLE_ID);
                action = 'added';
            }

            await interaction.reply({
                content: `${action === 'added' ? '✅ Added To' : '❌ Removed From'} <@&${VEIL_ROLE_ID}> for <@${targetUser.id}>`,
                flags: 64
            });

            const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                logChannel.send(`<@${targetUser.id}> was **${action}** Veil by <@${interaction.user.id}>`);
            }

            return;
        } else if (interaction.customId === 'mod_role_toggle') {
            const targetUser = interaction.users.first();
            const guildMember = await interaction.guild.members.fetch(targetUser.id);
            const roleId = '1360295855550238941';

            const hasRole = guildMember.roles.cache.has(roleId);
            if (hasRole) {
                await guildMember.roles.remove(roleId);
                await interaction.reply({ content: `❌ Removed <@&${roleId}> from ${targetUser.tag}`, ephemeral: true });
            } else {
                await guildMember.roles.add(roleId);
                await interaction.reply({ content: `✅ Added <@&${roleId}> to ${targetUser.tag}`, ephemeral: true });
            }
            return;
        } else {
            console.log('Unhandled user select menu customId:', interaction.customId);
        }
    } catch (error) {
        console.error('Error in handleUserSelectMenuInteraction:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your user select menu interaction.',
                ephemeral: true,
            });
        }
    }
}

async function handleResetButton(interaction) {
    const [action, memberId, confirmation] = interaction.customId.split('_');

    if (confirmation === 'confirm') {
        try {
            // Reset nominations for the user
            await resetNominationsForUser(memberId);

            // Fetch the member to update roles
            const member = await interaction.guild.members.fetch(memberId);
            for (const level of levels) {
                const role = interaction.guild.roles.cache.get(level.roleId);
                if (role && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                }
            }

            // Update the interaction to show success
            await interaction.update({
                content: 'Nominations have been reset.',
                components: [],
                embeds: []
            });
        } catch (error) {
            console.error('Error resetting nominations:', error);
            // Handle error by updating the interaction with a failure message
            await interaction.update({
                content: 'An error occurred while resetting nominations. Please try again later.',
                components: [],
                embeds: []
            });
        }
    } else {
        // Create a confirmation row for the user to confirm or go back
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`reset_${memberId}_confirm`)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`back_${memberId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        );

        // Prompt the user with a confirmation message
        await interaction.update({
            content: 'Are you sure you want to reset the nominations?',
            components: [confirmRow],
            embeds: []
        });
    }
}

async function handleBackButton(interaction) {
    const memberId = interaction.customId.split('_')[1];

    try {
        // Fetch nominations for the user from the database
        const nominationsData = await getNominationsForUser(memberId);

        if (nominationsData && nominationsData.length > 0) {
            const currentNominations = nominationsData.length;
            let currentLevel = 'None';
            let nominationsForNextLevel = 'N/A';

            for (const level of levels) {
                if (currentNominations < level.count) {
                    nominationsForNextLevel = level.count - currentNominations;
                    break;
                }
                currentLevel = level.roleId;
            }

            const embed = new EmbedBuilder()
                .setTitle('Nominations')
                .addFields(
                    { name: 'Current Distinction Level', value: currentLevel, inline: true },
                    { name: 'Total Nominations', value: currentNominations.toString(), inline: true },
                    { name: 'Nominations Till Next Distinction Level', value: nominationsForNextLevel.toString(), inline: true }
                )
                .setColor('#00FF00') // Use a numeric value for the color (Discord.js v14)

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reset_${memberId}`)
                    .setLabel('Reset')
                    .setStyle(ButtonStyle.Danger), // Updated style to v14 enum
                new ButtonBuilder()
                    .setCustomId(`done_${memberId}`)
                    .setLabel('Done')
                    .setStyle(ButtonStyle.Secondary) // Updated style to v14 enum
            );

            return interaction.update({ embeds: [embed], components: [row] });
        } else {
            return interaction.update({
                content: 'No nominations found for this user.',
                components: []
            });
        }
    } catch (error) {
        console.error('Error fetching nominations:', error);
        return interaction.update({
            content: 'An error occurred while fetching nominations. Please try again later.',
            components: []
        });
    }
}

async function handleDoneButton(interaction) {
    return interaction.update({ content: 'Action completed.', components: [], embeds: [] });
}

async function handleNominateButton(interaction) {
    try {
        console.log('Nominate button clicked. Displaying user select menu.');

        // Create a User Select Menu
        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId('select_nominee') // Custom ID for the menu
            .setPlaceholder('Select a user to nominate')
            .setMinValues(1)
            .setMaxValues(1); // Allow selecting one user only

        const actionRow = new ActionRowBuilder().addComponents(userSelectMenu);

        // Respond with the User Select Menu
        await interaction.reply({
            content: 'Please select a user to nominate:',
            components: [actionRow],
            ephemeral: true, // Interaction is ephemeral
        });
    } catch (error) {
        console.error('Error in handleNominateButton:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while preparing the nomination. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleNomineeSelect(interaction) {
    try {
        console.log('Nominee select interaction received.');
        const selectedUserId = interaction.values[0]; // User ID from the select menu
        const selectedUser = await interaction.guild.members.fetch(selectedUserId);

        console.log('Selected user:', selectedUser.displayName);

        // Create a modal for the nomination form
        const modal = new ModalBuilder()
            .setCustomId(`nomination_form_${selectedUserId}`) // Custom ID includes the user ID
            .setTitle('Nomination Form')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('date_event')
                        .setLabel('Date or Event')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter the date or event')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel('Reason for Nomination')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Describe why this user deserves the nomination')
                        .setRequired(true)
                )
            );

        // Show the modal
        await interaction.showModal(modal); // Displays the modal to the user
    } catch (error) {
        console.error('Error in handleNomineeSelect:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your selection. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleNominationForm(interaction) {
    try {
        console.log('Nomination form submitted.');

        const selectedUserId = interaction.customId.split('_')[2];
        const dateOrEvent = interaction.fields.getTextInputValue('date_event');
        const reason = interaction.fields.getTextInputValue('reason');

        // Fetch the selected user and nominator
        const selectedUser = await interaction.guild.members.fetch(selectedUserId);
        const nominatorTag = interaction.user.tag;
        const nominatorId = interaction.user.id;

        console.log(
            `Nomination received: ${selectedUser.displayName} by ${nominatorTag} for "${reason}" during "${dateOrEvent}"`
        );

        await interaction.reply({
            content: `Nomination for ${selectedUser.displayName} has been successfully submitted.`,
            ephemeral: true,
        });

        const approvalChannel = interaction.guild.channels.cache.get('1246159314373181490');
        if (approvalChannel) {
            const embed = new EmbedBuilder()
                .setTitle('New Nomination Pending Approval')
                .addFields(
                    { name: 'Nominee', value: selectedUser.displayName, inline: true },
                    { name: 'Nominator', value: nominatorTag, inline: true },
                    { name: 'Date/Event', value: dateOrEvent, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setColor('#FFFF00');

            // Create action row with Approve and Deny buttons
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${selectedUserId}_${nominatorId}_${nominatorTag}`)
                    .setLabel('Award Nomination')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`deny_${selectedUserId}_${nominatorId}_${nominatorTag}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`recog_${selectedUserId}_${nominatorId}_${nominatorTag}`)
                    .setLabel('Grant Recognition')
                    .setStyle(ButtonStyle.Primary)
            );

            // Send the embed with the buttons
            await approvalChannel.send({ embeds: [embed], components: [actionRow] });
        }
    } catch (error) {
        console.error('Error in handleNominationForm:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'There was an error submitting the nomination.',
                ephemeral: true,
            });
        }
    }
}

async function handleApproveDenyButton(interaction) {
    const [action, nomineeId, nominatorId, nominatorTag] = interaction.customId.split('_');

    console.log('Action:', action);
    console.log('Nominee ID from customId:', nomineeId);
    console.log('Nominator ID from customId:', nominatorId);

    // Fetch nominee from guild
    let nominee;
    try {
        nominee = await interaction.guild.members.fetch(nomineeId);
        console.log('Nominee fetched from guild:', nominee.id);
    } catch (fetchError) {
        console.error('Error fetching nominee:', fetchError);
        return interaction.reply({
            content: 'There was an error fetching the nominee. Please try again later.',
            ephemeral: true,
        });
    }

    // Safety checks for embeds
    if (!interaction.message.embeds || interaction.message.embeds.length === 0) {
        console.error('No embeds found in interaction message.');
        return interaction.reply({
            content: 'Could not find embed information. Please try again later.',
            ephemeral: true,
        });
    }

    const embed = interaction.message.embeds[0];

    if (!embed.fields || embed.fields.length === 0) {
        console.error('No fields found in embed:', embed);
        return interaction.reply({
            content: 'Could not retrieve fields from the embed. Please try again later.',
            ephemeral: true,
        });
    }

    // Extract data from the embed
    const embedFields = embed.fields;
    const dateOrEvent = embedFields.find(field => field.name === 'Date/Event')?.value;
    const reason = embedFields.find(field => field.name === 'Reason')?.value;

    if (!dateOrEvent || !reason) {
        return interaction.reply({
            content: 'Could not retrieve nomination details from the message embed. Please try again later.',
            ephemeral: true,
        });
    }

    // Handle Denial Case
    if (action === 'deny') {
        return handleDenyWithReason(interaction, nominee, nominatorId, nominatorTag, dateOrEvent, reason);
    }

    if (action === 'approve') {
        try {
            // Add nomination to the database
            await addNomination(String(nominee.id), nominee.displayName, String(nominatorId), dateOrEvent, reason, interaction.guild);

            // Fetch updated nominations
            const nominations = await getNominationsForUser(String(nominee.id));

            // Ensure only valid nominations are counted for this nominee
            const totalNominations = nominations.filter(
                n => String(n.user_id) === String(nominee.id)
            ).length;

            console.log(`Total nominations for user ${nominee.id}: ${totalNominations}`);

            // Update embed for approval
            const updatedEmbed = EmbedBuilder.from(embed)
                .setTitle('Nomination Approved')
                .setColor('#00FF00')
                .setFooter({ text: 'This nomination has been approved' })
                .setFields([
                    { name: 'Nominator', value: nominatorTag || 'Unknown', inline: true },
                    { name: 'Nominee', value: nominee.displayName || 'Unknown', inline: true },
                    { name: 'Date/Event', value: dateOrEvent || 'Unknown', inline: true },
                    { name: 'Reason', value: reason || 'Unknown', inline: true },
                    { name: 'Total Nominations', value: totalNominations.toString() || '0', inline: true },
                    { name: 'Approved by', value: interaction.user.tag || 'Unknown', inline: true },
                ]);

            // Remove the buttons after approval
            await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
            await interaction.reply({ content: 'Nomination approved and recorded.', ephemeral: true });

            // Define distinction level thresholds and roles
            const nominationThresholds = {
                1: 3,
                2: 7,
                3: 15,
                4: 25,
                5: 35,
                6: 50,
                7: 65,
                8: 85,
                9: 105,
                10: 150,
            };

            const distinctionRoles = {
                1: '1226674659492364438',
                2: '1226679328448708700',
                3: '1226679388221734914',
                4: '1226679385638305842',
                5: '1226679383201284268',
                6: '1226679728337981500',
                7: '1226679725330530354',
                8: '1226679720930709584',
                9: '1226679719391662080',
                10: '1226679718548340736',
            };

            const distinctionLevelAchieved = Object.entries(nominationThresholds).find(([level, threshold]) =>
                totalNominations === threshold
            );

            if (distinctionLevelAchieved) {
                const [level] = distinctionLevelAchieved;

                // Role assignment logic
                const currentRoles = nominee.roles.cache;
                for (const roleId of Object.values(distinctionRoles)) {
                    if (currentRoles.has(roleId)) {
                        try {
                            await nominee.roles.remove(roleId);
                            console.log(`Removed role ${roleId} from user ${nominee.id}`);
                        } catch (error) {
                            console.error(`Error removing role ${roleId} from user ${nominee.id}:`, error);
                        }
                    }
                }

                const newRoleId = distinctionRoles[level];
                if (newRoleId) {
                    try {
                        await nominee.roles.add(newRoleId);
                        console.log(`Added role ${newRoleId} to user ${nominee.id}`);
                    } catch (error) {
                        console.error(`Error adding role ${newRoleId} to user ${nominee.id}:`, error);
                    }
                }

                // Post distinction level announcement
                const announcementChannelId = '1303837974521315449';
                const announcementChannel = interaction.guild.channels.cache.get(announcementChannelId);

                if (announcementChannel) {
                    const distinctionAnnouncementEmbed = new EmbedBuilder()
                        .setTitle(`Distinction Level ${level} Attained`)
                        .setDescription(`🏅 ${nominee}, you've received an official **nomination** for **${reason}** during **${dateOrEvent}** — a high honor acknowledging your exceptional contribution.`)
                        .setColor('#7600bc');

                    await announcementChannel.send({
                        content: `<@${nominee.id}>`,
                        embeds: [distinctionAnnouncementEmbed],
                    });
                } else {
                    console.error(`Channel with ID ${announcementChannelId} not found.`);
                }
            }

            // Post in designated channel for the nomination approval
            const nominationAnnouncementEmbed = new EmbedBuilder()
                .setTitle('Nomination Awarded!')
                .setDescription(`${nominee.displayName}, you have received a nomination - **${reason}** during **${dateOrEvent}**!`)
                .setColor('#00FF00'); //green


            const nominationAnnouncementChannel = interaction.guild.channels.cache.get('1303837974521315449');

            if (nominationAnnouncementChannel) {
                await nominationAnnouncementChannel.send({
                    content: `<@${nominee.id}>`,
                    embeds: [nominationAnnouncementEmbed],
                });
            } else {
                console.error(`Channel with ID ${announcementChannelId} not found.`);
            }

        } catch (err) {
            console.error('Error approving nomination:', err);
            await interaction.reply({ content: 'There was an error approving the nomination.', ephemeral: true });
        }
    } else if (action === 'recog') {
        try {
            await interaction.deferReply({ ephemeral: true });

            if (!embed || !embed.fields) {
                console.error('Embed is invalid or missing fields:', embed);
                return await interaction.editReply({
                    content: 'Could not process recognition due to missing embed data.',
                });
            }

            const recognitionEmbed = EmbedBuilder.from(embed)
                .setTitle('Recognition Granted')
                .setColor('#FFA500')
                .setFooter({ text: 'This nomination has been recognized' })
                .setFields([
                    { name: 'Nominator', value: nominatorTag || 'Unknown', inline: true },
                    { name: 'Nominee', value: nominee.displayName || 'Unknown', inline: true },
                    { name: 'Date/Event', value: dateOrEvent || 'Unknown', inline: true },
                    { name: 'Reason', value: reason || 'Unknown', inline: true },
                    { name: 'Recognized by', value: interaction.user.tag || 'Unknown', inline: true },
                ]);

            try {
                await interaction.message.edit({ embeds: [recognitionEmbed], components: [] });
            } catch (error) {
                console.error('Error editing message:', error);
                return await interaction.editReply({
                    content: 'Recognition granted, but there was an issue updating the message.',
                });
            }

            const announcementChannel = interaction.guild.channels.cache.get('1303837974521315449');
            if (!announcementChannel || !announcementChannel.isTextBased()) {
                console.error('Invalid or inaccessible announcement channel:', announcementChannelId);
                return await interaction.editReply({
                    content: 'Recognition granted, but there was an issue sending the announcement.',
                });
            }

            const recognitionAnnouncementEmbed = new EmbedBuilder()
                .setTitle('Recognition Received!')
                .setDescription(`🌟 ${nominee}, you've been **recognized** for **${reason}** during **${dateOrEvent}** — your dedication and actions stood out! Well done!`)
                .setColor('#FFD700');

            await announcementChannel.send({
                content: `<@${nominee.id}>`,
                embeds: [recognitionAnnouncementEmbed],
            });

            await interaction.editReply({ content: 'Recognition granted and announcement sent.' });
        } catch (err) {
            console.error('Error granting recognition:', err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'There was an error granting recognition.', ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: 'There was an error granting recognition.' });
            }
        }

    } else if (action === 'deny') {
        try {
            const deniedEmbed = EmbedBuilder.from(embed)
                .setTitle('Nomination Denied')
                .setColor('#FF0000') // Use hex for red
                .setFooter({ text: 'This nomination has been denied' })
                .setFields([
                    { name: 'Nominator', value: nominatorTag || 'Unknown', inline: true },
                    { name: 'Nominee', value: nominee.displayName || 'Unknown', inline: true },
                    { name: 'Date/Event', value: dateOrEvent || 'Unknown', inline: true },
                    { name: 'Reason', value: reason || 'Unknown', inline: true },
                    { name: 'Denied by', value: interaction.user.tag || 'Unknown', inline: true },
                ]);

            // Remove the buttons after denial
            await interaction.message.edit({ embeds: [deniedEmbed], components: [] });
            await interaction.reply({ content: 'Nomination denied and recorded.', ephemeral: true });
        } catch (err) {
            console.error('Error denying nomination:', err);
            await interaction.reply({ content: 'There was an error denying the nomination.', ephemeral: true });
        }
    }
}

async function handleDenyWithReason(interaction, nominee, nominatorId, nominatorTag, dateOrEvent, reason) {
    const modal = new ModalBuilder()
        .setCustomId('deny_reason_modal')
        .setTitle('Enter Denial Reason')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('deny_reason')
                    .setLabel('Reason for denial:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);

    const filter = (modalInteraction) => modalInteraction.customId === 'deny_reason_modal' && modalInteraction.user.id === interaction.user.id;
    
    try {
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });

        const denyReason = modalInteraction.fields.getTextInputValue('deny_reason');

        const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setTitle('Nomination Denied')
            .setColor('#FF0000')
            .setFooter({ text: 'This nomination has been denied' })
            .setFields([
                { name: 'Nominator', value: nominatorTag || 'Unknown', inline: true },
                { name: 'Nominee', value: nominee.displayName || 'Unknown', inline: true },
                { name: 'Date/Event', value: dateOrEvent || 'Unknown', inline: true },
                { name: 'Reason', value: reason || 'Unknown', inline: true },
                { name: 'Denied by', value: interaction.user.tag || 'Unknown', inline: true },
                { name: 'Denial Reason', value: denyReason || 'No reason provided', inline: false },
            ]);

        await interaction.message.edit({ embeds: [deniedEmbed], components: [] });
        await modalInteraction.reply({ content: 'Nomination denied and reason recorded.', ephemeral: true });

        // Send denial reason to the nominator
        try {
            const nominator = await interaction.client.users.fetch(nominatorId);
            if (nominator) {
                await nominator.send(`Your nomination for **${nominee.displayName}** was denied.\n**Reason:** ${denyReason}`);
            }
        } catch (error) {
            console.error('Failed to send denial message to nominator:', error);
        }

    } catch (error) {
        console.error('Modal interaction error:', error);
        await interaction.followUp({ content: 'Denial process timed out or encountered an issue.', ephemeral: true });
    }
}

async function handleCheckMyNominations(interaction) {
    if (interaction.customId !== 'check_my_nominations') return;

    const member = interaction.member;

    try {
        console.log(`Fetching nominations for member: ${member.displayName} (${member.id})`);

        // Fetch nominations for the user
        const nominationsData = await getNominationsForUser(member.id);
        const totalNominations = nominationsData.length;

        let currentLevel = 'None';
        let nominationsForNextLevel = 'N/A';

        // Determine the current distinction level
        for (let i = 0; i < levels.length; i++) {
            if (totalNominations < levels[i].count) {
                nominationsForNextLevel = levels[i].count - totalNominations;
                break;
            }
            currentLevel = levels[i].roleId;
        }

        const role = interaction.guild.roles.cache.get(currentLevel);
        const roleName = role ? role.name : 'None';

        const summaryEmbed = new EmbedBuilder()
            .setTitle(`${member.displayName}'s Nominations Summary`)
            .addFields(
                { name: 'Current Distinction Level', value: roleName, inline: true },
                { name: 'Total Nominations', value: totalNominations.toString(), inline: true },
                { name: 'Nominations Till Next Distinction Level', value: nominationsForNextLevel.toString(), inline: true }
            )
            .setColor('#00FF00');

        // Create up to 10 embeds for nominations (Discord limit is 10 embeds per message)
        const nominationEmbeds = nominationsData.slice(0, 9).map((nom, index) => {
            return new EmbedBuilder()
                .setTitle(`🏅 Nomination #${index + 1}`)
                .addFields(
                    { name: 'Event / Date', value: nom.date_or_event || 'Unknown', inline: true },
                    { name: 'Nominated By', value: `<@${nom.nominator_id}>`, inline: true },
                    { name: 'Reason', value: nom.reason || 'No reason provided.' }
                )
                .setFooter({ text: `Submitted on: ${new Date(nom.created_at).toLocaleDateString()}` })
                .setColor('#0099ff');
        });

        await interaction.reply({
            content: `Here are your nominations, ${member.displayName}!`,
            embeds: [summaryEmbed, ...nominationEmbeds],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error fetching nominations:', error);
        await interaction.reply({
            content: 'There was an error fetching your nominations. Please try again later.',
            ephemeral: true
        });
    }
}

async function handleJoinBlightVeilLegion(interaction) {
    const allowedRoles = ['1172216651601694750', '1180258600132821102', '1168925938692669554', '1168254522980843602'];
    const hasAllowedRole = interaction.member.roles.cache.some(role => allowedRoles.includes(role.id));

    if (!hasAllowedRole) {
        return interaction.reply({ content: 'You do not have permission to use this button.', ephemeral: true });
    }

    const categoryID = '1226942471158628462';
    const channelName = `${interaction.member.displayName} Legion conscription channel`;

    const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryID,
        topic: `Created by: ${interaction.user.id}`,
        permissionOverwrites: [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: interaction.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            {
                id: '1168234521301356715',
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            {
                id: '1174715276126859274',
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            }
        ],
    });

    const embed = new EmbedBuilder()
        .setTitle('BlightVeil Membership Application')
        .setDescription(`@${interaction.member.displayName}, if you would like to join BlightVeil, just click the 'Membership Application' button below and fill out the form to submit your onboarding form. Once your application is accepted you will receive the rank of Conscript, LM9. As a conscript you will have access to the members portion of the discord and the ability to participate in events.\nYour time as a Conscript, LM9 and LM8, will serve as a trial period as you earn the rank of Legionnaire LM7, which denotes full membership in the BlightVeil Legion.\n\nUse this private channel to ask any questions you may have about BlightVeil.`);

    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('membershipApplication')
                .setLabel('Membership Application')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('closeChannel')
                .setLabel('Close Channel')
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttonRow] });

    await interaction.reply({ content: 'Your private channel has been created.', ephemeral: true });
}

async function handleMembershipApplication(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('membership_application')
        .setTitle('Membership Application')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('age')
                    .setLabel('Your Age?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your age')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('rsi_profile')
                    .setLabel('Your RSI Profile URL?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your RSI profile URL')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('gameplay_interests')
                    .setLabel('Star Citizen Game Interests?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter gameplay interests')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('play_time')
                    .setLabel('How long played Star Citizen?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('New Player, 6 Months, 2 Years')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('goal')
                    .setLabel('Agree to Rules + Goal (Aux, Legion, Knights)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: Yes, Legion')
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleMembershipApplicationForm(interaction) {
    const age = interaction.fields.getTextInputValue('age');
    const rsiProfile = interaction.fields.getTextInputValue('rsi_profile');
    const gameplayInterests = interaction.fields.getTextInputValue('gameplay_interests');
    const playTime = interaction.fields.getTextInputValue('play_time');
    const goalInput = interaction.fields.getTextInputValue('goal');
    let rulesAgreement = 'Not provided';
    let goalSelection = 'Not provided';

    if (goalInput.includes(',')) {
        const parts = goalInput.split(',').map(s => s.trim());
        rulesAgreement = parts[0] || 'Not provided';
        goalSelection = parts[1] || 'Not provided';
    } else {
        rulesAgreement = goalInput;
        goalSelection = 'Not provided';
    }

    // Store the channel ID where the application was submitted
    const applicationChannelId = interaction.channel.id;
    const applicationChannelName = interaction.channel.name;

    const submissionEmbed = new EmbedBuilder()
        .setTitle('Membership Application')
        .setDescription(`${interaction.user.tag} has submitted a new membership application.\n**Application Channel:** ${applicationChannelName}`)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .addFields(
            { name: 'Age', value: age },
            { name: 'RSI Profile URL', value: rsiProfile },
            { name: 'Gameplay Interests', value: gameplayInterests },
            { name: 'Play Time', value: playTime },
            { name: 'Rules Agreement', value: rulesAgreement },
            { name: 'Selected Goal', value: goalSelection },
            { name: 'Application Channel ID', value: applicationChannelId, inline: true }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`acceptMembership_${interaction.user.id}_${applicationChannelId}`)
            .setLabel('Accept Legion')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`acceptAUX_${interaction.user.id}_${applicationChannelId}`)
            .setLabel('Accept AUX')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`denyMembership_${interaction.user.id}_${applicationChannelId}`)
            .setLabel('Deny Membership')
            .setStyle(ButtonStyle.Danger)
    );

    const reviewChannel = interaction.guild.channels.cache.get('1172188603447775264');
    if (reviewChannel) {
        await reviewChannel.send({
            content: `<@&1168253795818549319> <@&1168234521301356715> <@&1174715276126859274>`,
            embeds: [submissionEmbed],
            components: [row],
        });
    }

    interaction.reply({ content: 'Your application has been submitted.', ephemeral: true });
}

async function handleAcceptMembership(interaction) {
    const [action, userId, channelId] = interaction.customId.split('_');
    const guild = interaction.guild;

    if (processingMemberships.has(userId)) {
        await interaction.reply({ content: 'This membership is already being processed. Please wait.', ephemeral: true });
        return;
    }

    processingMemberships.set(userId, true);

    try {
        await interaction.deferUpdate();

        const member = await guild.members.fetch(userId);
        const applicationChannel = guild.channels.cache.get(channelId);

        let rolesToAdd = [];
        const rolesToRemove = [
            '1172216651601694750',
            '1180258600132821102',
            '1168925938692669554'
        ];
        let nicknamePrefix = '';
        let welcomeMessage = '';
        let statusType = '';

        if (action === 'acceptMembership') {
            rolesToAdd = [
                '1168215961757810779',
                '1173822915574251570',
                '1173823132260384899',
                '1168221758126567559'
            ];
            nicknamePrefix = '[LM9]';
            welcomeMessage = `<@${member.id}>, welcome to the ranks of BlightVeil. You are now a Conscript of the BlightVeil Legion.`;
            statusType = 'APPROVED for Legion membership';
        } else if (action === 'acceptAUX') {
            rolesToAdd = [
                '1370534162179555488',
                '1172216651601694750',
                '1168221758126567559',
                '1173823132260384899'
            ];
            nicknamePrefix = '[UX9]';
            welcomeMessage = `<@${member.id}>, welcome to the ranks of BlightVeil AUX. You are now a Conscript of the BlightVeil Auxiliary Division.`;
            statusType = 'APPROVED for AUX membership';
        } else {
            await interaction.followUp({ content: 'Unknown action.', ephemeral: true });
            return;
        }

        for (const roleId of rolesToAdd) {
            const role = guild.roles.cache.get(roleId);
            if (role) await member.roles.add(role);
        }

        for (const roleId of rolesToRemove) {
            const role = guild.roles.cache.get(roleId);
            if (role && member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
            }
        }

        await member.setNickname(`${nicknamePrefix} ${member.displayName.replace(/\[[A-Z]+\d*\]\s*/g, '')}`);

        const db = await connectToMySQL();
        const column = action === 'acceptMembership' ? 'lm9_date' : 'aux_date';
        await db.query(
            `UPDATE members 
            SET ${column} = NOW() 
            WHERE user_id = ?`,
            [member.id]
        );

        const evalType = action === 'acceptMembership' ? 'LEGION' : 'AUX';
        await db.query(
            `INSERT INTO evaluations (user_id, guild_id, type, start_date)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE start_date = NOW()`,
            [member.id, guild.id, evalType]
        );

        const welcomeChannel = guild.channels.cache.get('1303837974521315449');
        if (welcomeChannel) {
            await welcomeChannel.send({
                content: welcomeMessage,
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            "If you have any questions about the org feel free to ask any of the Leaders or High Council members or check out the <#1175140451951587398>.\n\n" +
                            "If you want to brush up and sharpen your skills, the <#1174757654493679656> is full of great resources.\n\n" +
                            "Also, be sure to select your intended gameplay discipline here <#1247185540982374453>."
                        )
                        .setColor('#3498db')
                ]
            });
        }

        if (interaction.message.embeds.length > 0) {
            const originalEmbed = interaction.message.embeds[0];
            const applicantName = originalEmbed.author ? originalEmbed.author.name : 'Unknown';

            const reviewEmbed = new EmbedBuilder()
                .setTitle('Membership Application Approved')
                .setDescription(`${applicantName}'s application has been approved by ${interaction.user.tag}.`)
                .addFields(originalEmbed.fields)
                .setColor('#00FF00')
                .setFooter({ text: `${applicantName}'s application is complete` });

            await interaction.message.edit({ embeds: [reviewEmbed], components: [] });
        }

        // Send status notification to user (without transcript)
        try {
            const dmStatus = statusType.includes('APPROVED') ? 'APPROVED' : 'DENIED';
            const dmColor = statusType.includes('APPROVED') ? '#00FF00' : '#FF0000';
            
            const dmEmbed = new EmbedBuilder()
                .setTitle('Application Status Update')
                .setDescription(`Your BlightVeil application has been **${dmStatus}**.`)
                .addFields(
                    { name: 'Status', value: dmStatus, inline: true },
                    { name: 'Processed by', value: interaction.user.tag, inline: true }
                )
                .setColor(dmColor)
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            console.log('Could not send DM to user:', dmError);
        }

        // Close application channel and send transcript to transcript channel only
        if (applicationChannel) {
            await closeApplicationChannelAndSendTranscript(interaction, member, applicationChannel, statusType);
        }

        await interaction.followUp({ content: `Membership ${action === 'acceptMembership' ? 'Legion' : 'AUX'} approved successfully.`, ephemeral: true });

    } catch (error) {
        console.error('Error accepting membership:', error);
        if (error.code === 10062) {
            console.error('Interaction expired. Cannot update.');
        } else {
            await interaction.followUp({ content: 'There was an error accepting the membership. Please try again later.', ephemeral: true });
        }
    } finally {
        processingMemberships.delete(userId);
    }
}

async function handleDenyMembership(interaction) {
    const [_, userId, channelId] = interaction.customId.split('_');
    const guild = interaction.guild;

    try {
        await interaction.deferUpdate();

        const member = await guild.members.fetch(userId).catch(() => null);
        const applicationChannel = guild.channels.cache.get(channelId);

        if (interaction.message.embeds.length > 0) {
            const originalEmbed = interaction.message.embeds[0];
            const applicantName = originalEmbed.author ? originalEmbed.author.name : 'Unknown';

            const reviewEmbed = new EmbedBuilder()
                .setTitle('Membership Application Denied')
                .setDescription(`${applicantName}'s application has been denied by ${interaction.user.tag}.`)
                .addFields(originalEmbed.fields)
                .setColor('#FF0000')
                .setFooter({ text: `${applicantName}'s application is complete` });

            await interaction.message.edit({ embeds: [reviewEmbed], components: [] });
        }

        // Send denial notification to user (without transcript)
        if (member) {
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('Membership Application Status')
                    .setDescription('Your membership application has been **DENIED**.')
                    .setColor('#FF0000')
                    .setTimestamp();

                await member.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                console.log('Could not send DM to user:', dmError);
            }
        }

        // Close application channel and send transcript to transcript channel only
        if (applicationChannel) {
            await closeApplicationChannelAndSendTranscript(interaction, member, applicationChannel, 'DENIED');
        }

        await interaction.followUp({ content: 'Membership denied successfully.', ephemeral: true });

    } catch (error) {
        console.error('Error denying membership:', error);
        await interaction.reply({
            content: 'There was an error denying the membership. Please try again later.',
            ephemeral: true
        });
    }
}

async function closeApplicationChannelAndSendTranscript(interaction, member, channel, status) {
    try {
        // Schedule the channel closure for 24 hours from now
        const closeTime = await scheduleChannelClosure(
            channel,
            interaction.guild,
            member,
            status,
            interaction.user.tag
        );

        // Update the interaction message to show it's scheduled
        await interaction.followUp({ 
            content: `Channel closure scheduled for ${closeTime.toLocaleString()}. The channel will remain open for 24 hours.`,
            ephemeral: true 
        });

    } catch (error) {
        console.error('Error in closeApplicationChannelAndSendTranscript:', error);
        await interaction.followUp({ 
            content: 'Error scheduling channel closure. Please close the channel manually.',
            ephemeral: true 
        });
    }
}

async function handleConfirmCloseChannel(interaction) {
    try {
        const privateChannel = interaction.channel;

        // First, check if this is an application channel (has pending closure)
        const db = await connectToMySQL();
        const [pendingClosures] = await db.query(
            `SELECT * FROM pending_channel_closures WHERE channel_id = ?`,
            [privateChannel.id]
        );

        if (pendingClosures.length > 0) {
            // This is an application channel - close it immediately
            await closeApplicationChannelImmediately(interaction, privateChannel);
        } else {
            // This is a regular private channel - use the old method
            await closePrivateChannelWithTranscript(interaction, privateChannel);
        }

    } catch (error) {
        console.error('Error in handleConfirmCloseChannel:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function scheduleChannelClosure(channel, guild, member, status, processedBy) {
    const db = await connectToMySQL();
    const closeTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    await db.query(
        `INSERT INTO pending_channel_closures 
        (channel_id, guild_id, status, member_id, processed_by, close_time) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [channel.id, guild.id, status, member?.id, processedBy, closeTime]
    );
    
    // Send reminder message
    const reminderEmbed = new EmbedBuilder()
        .setTitle('Application Process Complete')
        .setDescription(`This application has been **${status}**.\n\nThis channel will be automatically archived in **24 hours** (at ${closeTime.toLocaleString()}).\n\nA transcript of this conversation will be saved for record-keeping.`)
        .setColor(status.includes('APPROVED') ? '#00FF00' : '#FF0000')
        .setFooter({ text: `Processed by: ${processedBy}` })
        .setTimestamp();

    await channel.send({ embeds: [reminderEmbed] });
    
    return closeTime;
}

async function checkPendingChannelClosures(client) {
    try {
        const db = await connectToMySQL();
        const now = new Date();
        
        // Get all pending closures that are due
        const [pendingClosures] = await db.query(
            `SELECT * FROM pending_channel_closures 
             WHERE close_time <= ?`,
            [now]
        );

        for (const closure of pendingClosures) {
            try {
                const guild = client.guilds.cache.get(closure.guild_id);
                if (!guild) {
                    console.log(`Guild ${closure.guild_id} not found for closure ${closure.id}`);
                    continue;
                }

                const channel = guild.channels.cache.get(closure.channel_id);
                if (!channel) {
                    console.log(`Channel ${closure.channel_id} not found for closure ${closure.id}`);
                    // Remove from database since channel doesn't exist
                    await db.query(`DELETE FROM pending_channel_closures WHERE id = ?`, [closure.id]);
                    continue;
                }

                // Fetch messages and create transcript
                let messages;
                try {
                    messages = await channel.messages.fetch({ limit: 100 });
                } catch (fetchError) {
                    console.error('Error fetching messages:', fetchError);
                    continue;
                }

                // Create transcript
                const transcript = Array.from(messages.values())
                    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                    .map(msg => {
                        const timestamp = new Date(msg.createdTimestamp).toLocaleString();
                        const attachments = msg.attachments.size > 0 
                            ? ` [${msg.attachments.size} attachment(s)]` 
                            : '';
                        const embeds = msg.embeds.length > 0 
                            ? ` [${msg.embeds.length} embed(s)]` 
                            : '';
                        return `[${timestamp}] ${msg.author.tag}: ${msg.content || ''}${attachments}${embeds}`;
                    })
                    .join('\n');

                // Send transcript to transcript channel
                const transcriptChannel = guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);
                if (transcriptChannel) {
                    const member = closure.member_id ? await guild.members.fetch(closure.member_id).catch(() => null) : null;
                    const transcriptTitle = `${member?.displayName || 'Unknown User'}'s Application Transcript - ${closure.status}`;
                    
                    if (transcript.length > 4096) {
                        const attachment = Buffer.from(transcript, 'utf-8');
                        await transcriptChannel.send({
                            content: transcriptTitle,
                            files: [{ attachment, name: `transcript-${closure.member_id || 'unknown'}.txt` }],
                        });
                    } else {
                        const transcriptEmbed = new EmbedBuilder()
                            .setTitle(transcriptTitle)
                            .setDescription(`**Applicant:** ${member?.user?.tag || 'Unknown'}\n**Status:** ${closure.status}\n**Channel:** ${channel.name}\n**Processed by:** ${closure.processed_by}\n**Closed at:** ${new Date().toLocaleString()}\n\n**Transcript:**\n\`\`\`\n${transcript.substring(0, 3900)}\n\`\`\``)
                            .setColor(closure.status.includes('APPROVED') ? '#00FF00' : '#FF0000')
                            .setTimestamp();

                        await transcriptChannel.send({ embeds: [transcriptEmbed] });
                    }
                }

                // Delete the channel
                await channel.delete(`Application ${closure.status} - Auto-closed after 24 hours`);

                // Remove from database
                await db.query(`DELETE FROM pending_channel_closures WHERE id = ?`, [closure.id]);
                
                console.log(`Channel ${channel.name} auto-closed after 24 hours`);

            } catch (error) {
                console.error(`Error processing closure ${closure.id}:`, error);
                // Optionally, you could update the record with error information
            }
        }
    } catch (error) {
        console.error('Error in checkPendingChannelClosures:', error);
    }
}

function setupChannelClosureChecker(client) {
    // Check every 5 minutes
    setInterval(() => checkPendingChannelClosures(client), 5 * 60 * 1000);
    
    // Also check on startup
    checkPendingChannelClosures(client);
}

async function closeApplicationChannelImmediately(interaction, channel) {
    try {
        const db = await connectToMySQL();
        
        // Get the pending closure record
        const [closures] = await db.query(
            `SELECT * FROM pending_channel_closures WHERE channel_id = ?`,
            [channel.id]
        );

        if (closures.length === 0) {
            await interaction.reply({
                content: 'No pending closure found for this channel.',
                ephemeral: true,
            });
            return;
        }

        const closure = closures[0];

        // Fetch messages from the channel
        const messages = await channel.messages.fetch({ limit: 100 });

        // Create transcript
        const transcript = Array.from(messages.values())
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
            .map(msg => {
                const timestamp = new Date(msg.createdTimestamp).toLocaleString();
                const attachments = msg.attachments.size > 0 
                    ? ` [${msg.attachments.size} attachment(s)]` 
                    : '';
                const embeds = msg.embeds.length > 0 
                    ? ` [${msg.embeds.length} embed(s)]` 
                    : '';
                return `[${timestamp}] ${msg.author.tag}: ${msg.content || ''}${attachments}${embeds}`;
            })
            .join('\n');

        // Send transcript to transcript channel
        const transcriptChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);
        if (transcriptChannel) {
            const member = closure.member_id ? await interaction.guild.members.fetch(closure.member_id).catch(() => null) : null;
            const transcriptTitle = `${member?.displayName || 'Unknown User'}'s Application Transcript - ${closure.status}`;
            
            if (transcript.length > 4096) {
                const attachment = Buffer.from(transcript, 'utf-8');
                await transcriptChannel.send({
                    content: transcriptTitle,
                    files: [{ attachment, name: `transcript-${closure.member_id || 'unknown'}.txt` }],
                });
            } else {
                const transcriptEmbed = new EmbedBuilder()
                    .setTitle(transcriptTitle)
                    .setDescription(`**Applicant:** ${member?.user?.tag || 'Unknown'}\n**Status:** ${closure.status}\n**Channel:** ${channel.name}\n**Processed by:** ${closure.processed_by}\n**Manually closed by:** ${interaction.user.tag}\n\n**Transcript:**\n\`\`\`\n${transcript.substring(0, 3900)}\n\`\`\``)
                    .setColor(closure.status.includes('APPROVED') ? '#00FF00' : '#FF0000')
                    .setTimestamp();

                await transcriptChannel.send({ embeds: [transcriptEmbed] });
            }
        }

        // Send final message
        const finalEmbed = new EmbedBuilder()
            .setTitle('Channel Closing Now')
            .setDescription(`This channel is now being closed manually by ${interaction.user.tag}.`)
            .setColor('#FF0000')
            .setTimestamp();

        await channel.send({ embeds: [finalEmbed] });

        // Remove from pending closures
        await db.query(`DELETE FROM pending_channel_closures WHERE channel_id = ?`, [channel.id]);

        // Wait a moment before deleting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Delete the channel
        await channel.delete(`Manually closed by ${interaction.user.tag}`);

        await interaction.reply({
            content: 'Application channel closed immediately and transcript saved.',
            ephemeral: true,
        });

    } catch (error) {
        console.error('Error closing application channel:', error);
        throw error;
    }
}

async function closePrivateChannelWithTranscript(interaction, privateChannel) {
    try {
        // Fetch the last 100 messages
        const messages = await privateChannel.messages.fetch({ limit: 100 });

        // Get the transcription log channel
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (!logChannel) {
            return interaction.reply({
                content: 'Transcription log channel not found. Please check the setup.',
                ephemeral: true,
            });
        }

        // Extract the creator ID from the channel topic
        const creatorIdMatch = privateChannel.topic?.match(/Created by: (\d+)/);
        const creatorId = creatorIdMatch ? creatorIdMatch[1] : null;
        const creator = creatorId ? interaction.guild.members.cache.get(creatorId) : null;

        const memberForTitle = creator || interaction.member;

        const transcription = messages
            .map(msg => `${msg.author.tag}: ${msg.content}`)
            .reverse()
            .join('\n');

        // Check if the transcription exceeds Discord's 4096-character limit for embeds
        if (transcription.length > 4096) {
            const attachment = Buffer.from(transcription, 'utf-8');
            await logChannel.send({
                content: `${memberForTitle.displayName}'s Legion Interview Transcript exceeds embed limit.`,
                files: [{ attachment, name: 'transcript.txt' }],
            });
        } else {
            const transcriptionEmbed = new EmbedBuilder()
                .setTitle(`${memberForTitle.displayName}'s Legion Interview Transcript`)
                .setDescription(transcription)
                .setColor('#3498db');

            await logChannel.send({ embeds: [transcriptionEmbed] });
        }

        // Delete the channel after sending the transcript
        await interaction.reply({
            content: 'Channel closed and transcribed successfully.',
            ephemeral: true,
        });

        await privateChannel.delete();
    } catch (error) {
        console.error('Error closing private channel:', error);
        throw error;
    }
}

// Optional: Add a command to view pending closures
async function handleCheckPendingClosures(interaction) {
    try {
        const db = await connectToMySQL();
        const [pendingClosures] = await db.query(
            `SELECT * FROM pending_channel_closures 
             ORDER BY close_time ASC`
        );

        if (pendingClosures.length === 0) {
            await interaction.reply({ 
                content: 'No pending channel closures.', 
                ephemeral: true 
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('Pending Channel Closures')
            .setDescription(`Total: ${pendingClosures.length}`)
            .setColor('#FFA500')
            .setTimestamp();

        for (const closure of pendingClosures.slice(0, 10)) { // Show first 10
            const timeLeft = new Date(closure.close_time).getTime() - Date.now();
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            
            embed.addFields({
                name: `Channel: ${closure.channel_id}`,
                value: `Status: ${closure.status}\nMember: ${closure.member_id || 'Unknown'}\nCloses in: ${hoursLeft}h ${minutesLeft}m`,
                inline: true
            });
        }

        if (pendingClosures.length > 10) {
            embed.setFooter({ text: `... and ${pendingClosures.length - 10} more` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error checking pending closures:', error);
        await interaction.reply({ 
            content: 'Error checking pending closures.', 
            ephemeral: true 
        });
    }
}

// Optional: Add a command to manually close a channel immediately
async function handleForceCloseChannel(interaction, channelId) {
    try {
        const db = await connectToMySQL();
        
        // Check if it's in the pending closures
        const [closures] = await db.query(
            `SELECT * FROM pending_channel_closures WHERE channel_id = ?`,
            [channelId]
        );

        if (closures.length > 0) {
            // Remove from pending closures
            await db.query(
                `DELETE FROM pending_channel_closures WHERE channel_id = ?`,
                [channelId]
            );
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) {
            await interaction.reply({ 
                content: 'Channel not found.', 
                ephemeral: true 
            });
            return;
        }

        // Close the channel immediately
        await closeApplicationChannelImmediately(interaction, channel);
        
    } catch (error) {
        console.error('Error force-closing channel:', error);
        await interaction.reply({ 
            content: 'Error closing channel.', 
            ephemeral: true 
        });
    }
}

async function handleCloseChannel(interaction) {
    const confirmCloseButton = new ButtonBuilder()
        .setCustomId('confirmCloseChannel')
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(confirmCloseButton);

    await interaction.update({ content: 'This will delete this temporary channel.', components: [row] });
}

async function handleOnboardingRoleSelection(interaction) {
    const selectedRole = interaction.values[0];
    const member = interaction.member;
    let roleName;
    const rolesToRemove = ['1172216651601694750', '1180258600132821102', '1168925938692669554'];

    try {
        if (selectedRole === 'conscript_aspirant') {
            await member.roles.remove(rolesToRemove);
            await member.roles.add('1172216651601694750');
            roleName = 'Conscript Aspirant';
        } else if (selectedRole === 'external_citizen') {
            await member.roles.remove(rolesToRemove);
            await member.roles.add('1180258600132821102');
            roleName = 'External Citizen';

            const modal = new ModalBuilder()
                .setCustomId('org-tag-modal')
                .setTitle('Enter Your Org Tag')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('org-tag-input')
                            .setLabel('Org Tag')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Enter your org abbreviation')
                            .setRequired(true)
                    )
                );

            await interaction.showModal(modal);
            return;
        } else if (selectedRole === 'visitor') {
            await member.roles.remove(rolesToRemove);
            await member.roles.add('1168925938692669554');
            roleName = 'Visitor';
        }

        await interaction.deferUpdate();
        await generateVerifyButton(interaction);
    } catch (error) {
        console.error('Error handling role selection:', error);
        if (!interaction.replied) {
            await interaction.followUp({ content: 'There was an error handling your role selection. Please try again later.', ephemeral: true });
        }
    }
}

async function handleOrgTagModal(interaction) {
    try {
        const orgTagInput = interaction.fields.getTextInputValue('org-tag-input').trim();

        const formattedOrgTag = orgTagInput.startsWith('[') && orgTagInput.endsWith(']')
            ? orgTagInput
            : `[${orgTagInput.replace(/[\[\]]/g, '')}]`;

        const currentDisplayName = interaction.member.displayName;
        const newDisplayName = `${formattedOrgTag} ${currentDisplayName}`;

        await interaction.member.setNickname(newDisplayName);

        await interaction.reply({
            content: `Your Org Tag has been set as **${formattedOrgTag}** and added to your display name.`,
            ephemeral: true,
        });

        await generateVerifyButton(interaction);
    } catch (error) {
        console.error('Error handling Org Tag modal:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'There was an error processing your Org Tag. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function generateVerifyButton(interaction) {
    const verificationEmbed = new EmbedBuilder()
        .setTitle('Verification')
        .setDescription(
            `Once you have selected one of the options above, <@${interaction.user.id}>, click the Verify button below to complete your entry into the public area of the BlightVeil discord.`
        );

    const verifyButton = new ButtonBuilder()
        .setCustomId('verify')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success);

    const verifyRow = new ActionRowBuilder().addComponents(verifyButton);

    await interaction.followUp({
        content: `<@${interaction.user.id}>`,
        embeds: [verificationEmbed],
        components: [verifyRow],
        ephemeral: true,
    });
}

async function handleVerifyButton(interaction) {
    try {
        await interaction.member.roles.add('1217854620064419852');
        await interaction.update({
            content: 'You have been verified and you now have access to the public areas of BlightVeil.',
            components: [],
            embeds: [],
        });
    } catch (error) {
        console.error('Error handling verify button:', error);
        await interaction.followUp({ content: 'There was an error handling your verification. Please try again later.', ephemeral: true });
    }
}

async function handleNicknameChangeRequest(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('nickname_change_form')
        .setTitle('Nickname Change Request')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('desired_nickname')
                    .setLabel('Desired Nickname')
                    .setPlaceholder('SC in-game name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleNicknameChangeForm(interaction) {
    const desiredNickname = interaction.fields.getTextInputValue('desired_nickname');
    const currentDisplayName = interaction.member.displayName;
    const submissionEmbed = new EmbedBuilder()
        .setTitle('Nickname Change Request')
        .setDescription(`**Requested by:** ${currentDisplayName}`)
        .addFields({ name: 'Desired Nickname', value: desiredNickname });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approveNickname_${interaction.user.id}`)
            .setLabel('Approve Nickname Request')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`editNickname_${interaction.user.id}`)
            .setLabel('Edit Nickname Request')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`denyNickname_${interaction.user.id}`)
            .setLabel('Deny Nickname Request')
            .setStyle(ButtonStyle.Danger)
    );

    const reviewChannel = interaction.guild.channels.cache.get('1257379412408799332');
    if (reviewChannel) {
        await reviewChannel.send({ embeds: [submissionEmbed], components: [row] });
    }

    await interaction.reply({ content: 'Your nickname change request has been submitted.', ephemeral: true });
}

async function handleApproveNicknameRequest(interaction) {
    const userId = interaction.customId.split('_')[1];
    const embed = interaction.message.embeds[0];
    const desiredNickname = embed?.fields.find(field => field.name === 'Desired Nickname')?.value;

    if (!desiredNickname) {
        return interaction.reply({ content: 'Invalid data in the embed. Please try again later.', ephemeral: true });
    }

    try {
        const member = await interaction.guild.members.fetch(userId);
        await member.setNickname(desiredNickname);

        const confirmationEmbed = new EmbedBuilder()
            .setTitle('Nickname Changed')
            .setDescription(`**User:** ${member.user.tag}\n**New Display Name:** ${desiredNickname}`)
            .setColor('#00FF00');

        await interaction.update({ embeds: [confirmationEmbed], components: [] });
    } catch (error) {
        console.error('Error changing nickname:', error);
        await interaction.followUp({ content: 'There was an error changing the nickname. Please try again later.', ephemeral: true });
    }
}

async function handleEditNicknameRequest(interaction) {
    const userId = interaction.customId.split('_')[1];
    const modal = new ModalBuilder()
        .setCustomId(`edit_nickname_form_${userId}`)
        .setTitle('Edit Nickname Request')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('new_nickname')
                    .setLabel('New Nickname')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleEditNicknameForm(interaction) {
    const userId = interaction.customId.split('_')[3];
    const newNickname = interaction.fields.getTextInputValue('new_nickname');

    try {
        const member = await interaction.guild.members.fetch(userId);
        await member.setNickname(newNickname);

        const confirmationEmbed = new EmbedBuilder()
            .setTitle('Nickname Changed')
            .setDescription(`**User:** ${member.user.tag}\n**New Display Name:** ${newNickname}`)
            .setColor('#00FF00');

        await interaction.update({ embeds: [confirmationEmbed], components: [] });
    } catch (error) {
        console.error('Error changing nickname:', error);
        await interaction.followUp({ content: 'There was an error changing the nickname. Please try again later.', ephemeral: true });
    }
}

async function handleDenyNicknameRequest(interaction) {
    const userId = interaction.customId.split('_')[1];

    const confirmButton = new ButtonBuilder()
        .setCustomId(`confirmDenyNickname_${userId}`)
        .setLabel('Confirm Deny')
        .setStyle(ButtonStyle.Danger);

    const backButton = new ButtonBuilder()
        .setCustomId(`nicknameDenyBack_${userId}`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, backButton);

    await interaction.update({ content: 'This will deny the nickname request.', components: [row] });
}

async function handleConfirmDenyNicknameRequest(interaction) {
    const oldEmbed = interaction.message.embeds[0];

    if (!oldEmbed) {
        return interaction.reply({ content: 'Original embed not found. Cannot deny nickname request.', ephemeral: true });
    }

    const embed = EmbedBuilder.from(oldEmbed).setColor(Colors.Red);

    await interaction.update({ content: 'Nickname request has been denied.', components: [], embeds: [embed] });
}

async function handleDenyBackNicknameRequest(interaction) {
    const userId = interaction.customId.split('_')[1];
    const originalEmbed = interaction.message.embeds[0];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approveNickname_${userId}`)
            .setLabel('Approve Nickname Request')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`editNickname_${userId}`)
            .setLabel('Edit Nickname Request')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`denyNickname_${userId}`)
            .setLabel('Deny Nickname Request')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ content: null, components: [row], embeds: [originalEmbed] });
}

async function handleNickOverrideButton(interaction, client) {
    try {
        console.log('Handling button interaction with customId:', interaction.customId);

        if (interaction.customId.startsWith('setnick_button_')) {
            const memberId = interaction.customId.replace('setnick_button_', '');

            const modal = new ModalBuilder()
                .setCustomId(`setnick_modal_${memberId}`)
                .setTitle('Change Nickname')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('new_nickname')
                            .setLabel('Enter new display name')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Include [rank] or [org] if applicable')
                            .setRequired(true)
                    )
                );

            await interaction.showModal(modal);
        } else {
            console.log('Unhandled button interaction:', interaction.customId);
            await interaction.reply({ content: 'This interaction is not handled.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error in handleNickOverrideButton:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleModalNickOverride(interaction, client) {
    const customId = interaction.customId;

    if (customId.startsWith('setnick_modal_')) {
        const memberId = customId.replace('setnick_modal_', '');
        const newNickname = interaction.fields.getTextInputValue('new_nickname');

        const member = interaction.guild.members.cache.get(memberId);
        if (!member) {
            return interaction.reply({ content: 'Member not found.', ephemeral: true });
        }

        const oldNickname = member.displayName;

        try {
            await member.setNickname(newNickname);

            // Delete the original message with the button
            await interaction.message.delete();

            // Send a confirmation embed
            const embed = new EmbedBuilder()
                .setTitle('Nickname Changed')
                .setDescription(`Nickname changed to "${newNickname}" for ${member.user.tag}`)
                .setColor('#00FF00');

            await interaction.reply({ embeds: [embed], ephemeral: false });

            // Log the change
            const logEmbed = new EmbedBuilder()
                .setTitle('Nickname Change')
                .setDescription(`${member.user.username}\nBefore: ${oldNickname}\nAfter: ${newNickname}`)
                .setColor(Colors.Blue);

            const logChannel = interaction.guild.channels.cache.get('1172764982132359258'); // Replace with your log channel ID
            if (logChannel) {
                await logChannel.send({ embeds: [logEmbed] });
            }

        } catch (error) {
            console.error('Error changing nickname:', error);
            await interaction.reply({ content: 'There was an error changing the nickname. Please try again later.', ephemeral: true });
        }
    }
}

async function handleDisciplineSelection(interaction) {
    const selectedDiscipline = interaction.values[0];
    const userId = interaction.user.id;
    const member = await interaction.guild.members.fetch(userId);

    const roles = {
        pilot: '1414290453213479124',
        infantry: '1424960611351138354',
        crewman: '1168287118582349944',
        tradesman: '1168285383012925501'
    };

    const disciplineNames = {
        pilot: 'Pilot Candidate',
        infantry: 'Infantry Candidate',
        crewman: 'Crewman',
        tradesman: 'Support'
    };

    const logChannelId = '1285597159466729494';
    const infantryInfoChannelId = '1199178670858846209';
    const pilotInfoChannelId = '1199178724063576154';
    const crewmanInfoChannelId = '1199178782087581840';
    const tradesmanInfoChannelId = '1199178837653737552';
    const logChannel = await interaction.guild.channels.fetch(logChannelId);
    const infantryInfoChannel = await interaction.guild.channels.fetch(infantryInfoChannelId);
    const pilotInfoChannel = await interaction.guild.channels.fetch(pilotInfoChannelId);
    const crewmanInfoChannel = await interaction.guild.channels.fetch(crewmanInfoChannelId);
    const tradesmanInfoChannel = await interaction.guild.channels.fetch(tradesmanInfoChannelId);

    // Acknowledge interaction immediately
    await interaction.deferReply({ ephemeral: true });

    // Track the current main discipline role - IMPORTANT: store the role key, not the display name
    let previousDisciplineKey = null;
    for (const role in roles) {
        if (member.roles.cache.has(roles[role])) {
            previousDisciplineKey = role; // Store the key ('pilot', 'infantry', etc.)
            await member.roles.remove(roles[role]);
        }
    }

    // Add the selected main discipline role
    await member.roles.add(roles[selectedDiscipline]);

    // CALL THE MAIN DISCIPLINE CHANGE FUNCTION HERE
    if (previousDisciplineKey) {
        await handleMainDisciplineChange(member, previousDisciplineKey, selectedDiscipline, interaction);
    }

    // Log the change or new selection in the specified channel
    const embed = new EmbedBuilder()
        .setTitle(`${member.displayName}'s Main Discipline Change`)
        .setColor('#3498db');

    if (previousDisciplineKey) {
        embed.setDescription(`${member} has changed their **main discipline**.\n\n**Previous Discipline**: ${disciplineNames[previousDisciplineKey]}\n**New Discipline**: ${disciplineNames[selectedDiscipline]}`);
    } else {
        embed.setDescription(`${member} has chosen **${disciplineNames[selectedDiscipline]}** as their main discipline.`);
    }

    await logChannel.send({ embeds: [embed] });

    // Helper function to send message with DM fallback
    async function sendDisciplineMessage(user, disciplineType, embed, fallbackChannel) {
        try {
            // Try to send DM
            await user.send({ embeds: [embed] });
            return true; // DM successful
        } catch (error) {
            // If DM fails, send to fallback channel with notice
            const fallbackEmbed = new EmbedBuilder()
                .setDescription(`${user}, ${embed.data.description}\n\n*📫 Your DMs are disabled, so this information has been posted here instead.*`)
                .setColor('#FFA500');
            
            await fallbackChannel.send({ content: `${user}`, embeds: [fallbackEmbed] });
            return false; // DM failed
        }
    }

    // Send special Infantry selection message
    if (selectedDiscipline === 'infantry') {
        const infantryEmbed = new EmbedBuilder()
            .setDescription(
                `You have selected Infantry as your main discipline and have been Granted the Infantry Candidate Tag. Please familiarize yourself with all the information in ⁠<#1345074295604514867>. You can find additional information about FPS combat in ⁠<#1174757654493679656>. You can also ⁠<#1263870486891462882> from a BlightVeil <@&1168327592269598760> to help hone your FPS skills.`
            )
            .setColor('#00FF00');

        await sendDisciplineMessage(interaction.user, 'Infantry', infantryEmbed, infantryInfoChannel);
    }

    // Send special Pilot selection message
    if (selectedDiscipline === 'pilot') {
        const pilotEmbed = new EmbedBuilder()
            .setDescription(
                `You have selected Pilot as your main discipline and have been Granted the Pilot Candidate Tag. Please familiarize yourself with all the information in ⁠<#1345110640230010980>. You can find additional information about Piloting in the ⁠<#1174757654493679656>. You can also ⁠<#1263870486891462882> from a BlightVeil <@&1168327555917557780> to help hone your Pilot skills.`
            )
            .setColor('#00FF00');

        await sendDisciplineMessage(interaction.user, 'Pilot', pilotEmbed, pilotInfoChannel);
    }

    // Send special Crewman selection message
    if (selectedDiscipline === 'crewman') {
        const crewmanEmbed = new EmbedBuilder()
            .setDescription(
                `${member}, you have selected Crewman as your main discipline. Please familiarize yourself with all the information in ⁠<#1347417517987074170>. You can find additional information about being a Crewman in the ⁠<#1174757654493679656>. You can also ⁠<#1263870486891462882> from a BlightVeil <@&1168327699203375114> to help hone your Crewman skills.`
            )
            .setColor('#00FF00');

        await crewmanInfoChannel.send({ content: `${member}`, embeds: [crewmanEmbed] });
    }

    // Send special Tradesman selection message
    if (selectedDiscipline === 'tradesman') {
        const tradesmanEmbed = new EmbedBuilder()
            .setDescription(
                `${member}, you have selected Support as your main discipline. Please familiarize yourself with all the information in ⁠<#1343808358247039017>. You can find additional information about being a Crewman in the ⁠<#1174757654493679656>. You can also ⁠<#1263870486891462882> from a BlightVeil <@&1168327804874661931> to help hone your Support skills.`
            )
            .setColor('#00FF00');

        await tradesmanInfoChannel.send({ content: `${member}`, embeds: [tradesmanEmbed] });
    }
    
    // Final confirmation message for the user
    await interaction.editReply({
        content: `You have selected **${disciplineNames[selectedDiscipline]}** as your main discipline and have been assigned the role.`,
    });
}

async function handleSecondaryDisciplineSelection(reaction, user, addRole = true) {
    const specificChannelId = '1247185540982374453'; // Channel ID to allow reactions
    if (reaction.message.channel.id !== specificChannelId) return; // Exit if not the specific channel

    const member = await reaction.message.guild.members.fetch(user.id);

    const secondaryRoles = {
        '1189226746382401647': '1414290453213479124',
        '1189235332932194344': '1424960611351138354', // Custom Infantry emoji ID
        '1189240044142202921': '1285585929884667925', // Custom Crewman emoji ID
        '1189240348501872681': '1285585927170822185',  // Custom Tradesman emoji ID
    };

    const disciplineNames = {
        '1189226746382401647': 'Pilot',
        '1189235332932194344': 'Infantry',
        '1189240044142202921': 'Crewman',
        '1189240348501872681': 'Tradesman'
    };

    // Map primary discipline roles to their corresponding secondary emoji IDs
    const primaryToSecondaryMapping = {
        '1168285299416248422': '1189235332932194344', // Infantry primary to Infantry secondary
        '1168287118582349944': '1189240044142202921', // Crewman primary to Crewman secondary
        '1168285383012925501': '1189240348501872681'  // Tradesman primary to Tradesman secondary
    };

    const logChannelId = '1285597159466729494'; // Channel to send the log message
    const infantryInfoChannelId = '1199178670858846209'; // Channel for Infantry information
    const pilotInfoChannelId = '1199178724063576154'; // Channel for pilot information
    const crewmanInfoChannelId = '1199178782087581840'; // Channel for Crewman information
    const tradesmanInfoChannelId = '1199178837653737552'; // Channel for Crewman information
    const logChannel = await reaction.message.guild.channels.fetch(logChannelId);
    const infantryInfoChannel = await reaction.message.guild.channels.fetch(infantryInfoChannelId);
    const pilotInfoChannel = await reaction.message.guild.channels.fetch(pilotInfoChannelId);
    const crewmanInfoChannel = await reaction.message.guild.channels.fetch(crewmanInfoChannelId);
    const tradesmanInfoChannel = await reaction.message.guild.channels.fetch(tradesmanInfoChannelId);

    // Track the current secondary discipline roles
    const emojiId = reaction.emoji.id;
    const roleId = secondaryRoles[emojiId];
    const disciplineName = disciplineNames[emojiId];

    if (!roleId) return; // Ignore if the emoji doesn't match any discipline

    // Check if user is trying to select a secondary that matches their primary
    if (addRole) {
        // Get user's primary discipline role
        let userPrimaryDiscipline = null;
        for (const [primaryRoleId, secondaryEmojiId] of Object.entries(primaryToSecondaryMapping)) {
            if (member.roles.cache.has(primaryRoleId)) {
                userPrimaryDiscipline = secondaryEmojiId;
                break;
            }
        }

        // If the selected secondary matches the user's primary, prevent it
        if (userPrimaryDiscipline === emojiId) {
            // Send ephemeral message to the user
            try {
                const dmChannel = await user.createDM();
                await dmChannel.send({
                    content: `You cannot select **${disciplineName}** as a secondary interest because it is already your primary discipline. Please choose a different secondary interest.`
                });
            } catch (error) {
                console.error('Could not send DM to user:', error);
            }
            
            // Remove the reaction since it's not allowed
            await reaction.users.remove(user.id);
            return;
        }

        // Add the role if it doesn't exist
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);

            // Log the role addition
            const embed = new EmbedBuilder()
                .setTitle(`${member.displayName}'s Secondary Interest Added`)
                .setDescription(`${member} has selected **${disciplineName}** as a secondary interest.`)
                .setColor('#00FF00');

            await logChannel.send({ embeds: [embed] });

            // Send special Infantry secondary selection message
            if (emojiId === '1189235332932194344') { // Infantry emoji ID
                const infantryEmbed = new EmbedBuilder()
                    .setDescription(
                        `${member}, you have selected Infantry as a secondary interest. Please familiarize yourself with all the information in ⁠<#1345074295604514867>. You can find additional information about FPS combat in ⁠<#1174757654493679656>. You can also ⁠<#1171504237449060462> from a BlightVeil <@&1168327592269598760> to help hone your FPS skills.`
                    )
                    .setColor('#FFFF00');

                await infantryInfoChannel.send({ content: `${member}`, embeds: [infantryEmbed] });
            }

            // Send special pilot secondary selection message
            if (emojiId === '1189226746382401647') { // Pilot emoji ID
                const pilotEmbed = new EmbedBuilder()
                    .setDescription(
                        `${member}, you have selected Pilot as a secondary interest. Please familiarize yourself with all the information in ⁠<#1345110640230010980>. You can find additional information about Piloting in the ⁠<#1174757654493679656>. You can also ⁠<#1171504237449060462> from a BlightVeil <@&1168327555917557780> to help hone your Pilot skills.`
                    )
                    .setColor('#FFFF00');

                await pilotInfoChannel.send({ content: `${member}`, embeds: [pilotEmbed] });
            }

            // Send special crewman secondary selection message
            if (emojiId === '1189240044142202921') { // Crewman emoji ID
                const crewmanEmbed = new EmbedBuilder()
                    .setDescription(
                        `${member}, you have selected Crewman as a secondary interest. Please familiarize yourself with all the information in ⁠<#1347417517987074170>. You can find additional information about being a Crewman in the ⁠<#1174757654493679656>. You can also ⁠<#1171504237449060462> from a BlightVeil <@&1168327699203375114> to help hone your Crewman skills.`
            )
                    .setColor('#FFFF00');

                await crewmanInfoChannel.send({ content: `${member}`, embeds: [crewmanEmbed] });
            }

            if (emojiId === '1189240348501872681') { // Tradesman emoji ID
                const crewmanEmbed = new EmbedBuilder()
                    .setDescription(
                        `${member}, you have selected Support as a secondary interest. Please familiarize yourself with all the information in ⁠<#1343808358247039017>. You can find additional information about being a Crewman in the ⁠<#1174757654493679656>. You can also ⁠<#1171504237449060462> from a BlightVeil <@&1168327804874661931> to help hone your Support skills.`
            )
                    .setColor('#FFFF00');

                await tradesmanInfoChannel.send({ content: `${member}`, embeds: [crewmanEmbed] });
            }
        }

    } else {
        // Remove the role if it exists
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);

            // Log the role removal
            const embed = new EmbedBuilder()
                .setTitle(`${member.displayName}'s Secondary Interest Removed`)
                .setDescription(`${member} has removed **${disciplineName}** as a secondary interest.`)
                .setColor('#FF0000'); // Red as a number

            await logChannel.send({ embeds: [embed] });
        }
    }
}

async function handleMainDisciplineChange(member, previousDiscipline, newDiscipline, interaction) {
    const RANK_CONTROL_CHANNEL_ID = '1168237930091913267';
    const PILOT_OVERSEER_ROLE = '1308081615083278378';
    const INFANTRY_OVERSEER_ROLE = '1308081895266844712';
    
    // Role IDs for identification
    const PILOT_MAIN_ROLE = '1168285269926101103';
    const PILOT_SECONDARY_ROLE = '1285585726536159302';
    const INFANTRY_MAIN_ROLE = '1168285299416248422';
    const INFANTRY_SECONDARY_ROLE = '1285585932417761320';
    
    const disciplineNames = {
        pilot: 'Pilot',
        infantry: 'Infantry',
        crewman: 'Crewman',
        tradesman: 'Tradesman'
    };

    // Check if user WAS Infantry or Pilot (using role IDs)
    const wasInfantry = member.roles.cache.has(INFANTRY_MAIN_ROLE) || member.roles.cache.has(INFANTRY_SECONDARY_ROLE);
    const wasPilot = member.roles.cache.has(PILOT_MAIN_ROLE) || member.roles.cache.has(PILOT_SECONDARY_ROLE);
    const wasInfantryOrPilot = wasInfantry || wasPilot;
    
    // Check if user IS NOW Infantry or Pilot (using the new discipline)
    const isNowInfantryOrPilot = newDiscipline === 'infantry' || newDiscipline === 'pilot';
    
    // Get current rank from nickname
    const currentRankMatch = member.nickname?.match(/\[(\w+)(\d)\]/);
    
    if (wasInfantryOrPilot && (!isNowInfantryOrPilot || (wasInfantry && newDiscipline === 'pilot') || (wasPilot && newDiscipline === 'infantry'))) {
        // User is switching away from Infantry/Pilot OR switching between them
        
        if (currentRankMatch) {
            const currentRank = currentRankMatch[0]; // Full rank like [LM9], [KM5], etc.
            const rankPrefix = currentRankMatch[1]; // LM, KM, LL, KL, LO, KO, etc.
            
            // KEEP THE EXISTING PREFIX and add "?" for evaluation
            const newRankWithQuestion = `${rankPrefix}?`;
            
            try {
                // Use the rank command module
                const rankCommand = require('../commands/rank.js');
                
                // Get the rank control channel for error messages
                const rankControlChannel = await member.guild.channels.fetch(RANK_CONTROL_CHANNEL_ID);
                
                // Create a proper context object for the rank command (updated for slash command compatibility)
                const context = {
                    guild: member.guild,
                    channel: rankControlChannel,
                    client: interaction?.client || member.client,
                    user: interaction?.user || member.user,
                    // Add interaction object if available for proper deferral handling
                    interaction: interaction || null
                };
                
                // Call the internal rank assignment function
                await rankCommand.assignRankInternal(member, newRankWithQuestion, context);
                
                // Send notification to rank control channel
                if (rankControlChannel) {
                    const previousDisciplineName = wasInfantry ? 'Infantry' : 'Pilot';
                    const newDisciplineName = disciplineNames[newDiscipline];
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔄 Main Discipline Change - Rank Reset')
                        .setDescription(
                            `**Member:** ${member} (${member.user.tag})\n` +
                            `**Previous Discipline:** ${previousDisciplineName}\n` +
                            `**New Discipline:** ${newDisciplineName}\n` +
                            `**Previous Rank:** ${currentRank}\n` +
                            `**New Rank:** ${newRankWithQuestion}\n\n` +
                            `*User has been automatically reset to evaluation rank due to main discipline change and requires re-evaluation.*`
                        )
                        .setColor(0xFFA500) // Orange for warning
                        .setTimestamp();
                    
                    // Ping both Overseer roles
                    await rankControlChannel.send({ 
                        content: `<@&${PILOT_OVERSEER_ROLE}> <@&${INFANTRY_OVERSEER_ROLE}>`,
                        embeds: [embed] 
                    });
                }
                
                // Also notify the user
                try {
                    await member.send({
                        content: `Your rank has been reset to **${newRankWithQuestion}** because you changed your main discipline from **${disciplineNames[previousDiscipline]}** to **${disciplineNames[newDiscipline]}**. Please contact your Overseer for re-evaluation.`
                    });
                } catch (dmError) {
                    console.log(`Could not send DM to ${member.user.tag}`);
                    // Try to reply in the interaction as fallback if available
                    if (interaction && !interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: `Your rank has been reset to **${newRankWithQuestion}** due to discipline change. Please check your DMs for details.`,
                            ephemeral: true
                        });
                    } else if (interaction && (interaction.replied || interaction.deferred)) {
                        await interaction.followUp({
                            content: `Your rank has been reset to **${newRankWithQuestion}** due to discipline change. Please check your DMs for details.`,
                            ephemeral: true
                        });
                    }
                }
                
            } catch (error) {
                console.error('Error resetting user rank after discipline change:', error);
                
                // Send fallback notification to rank control channel
                const rankControlChannel = await member.guild.channels.fetch(RANK_CONTROL_CHANNEL_ID);
                if (rankControlChannel) {
                    const previousDisciplineName = wasInfantry ? 'Infantry' : 'Pilot';
                    const newDisciplineName = disciplineNames[newDiscipline];
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔄 Main Discipline Change - Rank Reset (Error)')
                        .setDescription(
                            `**Member:** ${member} (${member.user.tag})\n` +
                            `**Previous Discipline:** ${previousDisciplineName}\n` +
                            `**New Discipline:** ${newDisciplineName}\n` +
                            `**Previous Rank:** ${currentRank}\n` +
                            `**New Rank:** ${newRankWithQuestion}\n\n` +
                            `*Error resetting rank automatically. Manual intervention required.*\n\n` +
                            `Error: ${error.message}`
                        )
                        .setColor(0xFF0000) // Red for error
                        .setTimestamp();
                    
                    // Ping both Overseer roles for errors too
                    await rankControlChannel.send({ 
                        content: `<@&${PILOT_OVERSEER_ROLE}> <@&${INFANTRY_OVERSEER_ROLE}>`,
                        embeds: [embed] 
                    });
                }
                
                // Notify the user about the error if interaction is available
                if (interaction && !interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `There was an error resetting your rank after discipline change. Please contact an administrator.`,
                        ephemeral: true
                    });
                } else if (interaction && (interaction.replied || interaction.deferred)) {
                    await interaction.followUp({
                        content: `There was an error resetting your rank after discipline change. Please contact an administrator.`,
                        ephemeral: true
                    });
                }
            }
        }
    }
}

async function handleVerifyForm(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('verify_form_modal')
        .setTitle('Ambassadorship Verification')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('org_name')
                    .setLabel('Organization Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('org_position')
                    .setLabel('Position/Rank/Title')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('org_authorization')
                    .setLabel('Authorization (Yes/No)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('org_discord')
                    .setLabel('Discord Link')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleVerifyFormModal(interaction) {
    const orgName = interaction.fields.getTextInputValue('org_name');
    const orgPosition = interaction.fields.getTextInputValue('org_position');
    const orgAuthorization = interaction.fields.getTextInputValue('org_authorization');
    const orgDiscord = interaction.fields.getTextInputValue('org_discord');

    const submissionEmbed = new EmbedBuilder()
        .setTitle('Ambassadorship Verification Submission')
        .setDescription(`**Submitted by:** ${interaction.user.tag}`)
        .addFields(
            { name: 'Organization', value: orgName },
            { name: 'Position/Rank/Title', value: orgPosition },
            { name: 'Authorization', value: orgAuthorization },
            { name: 'Discord Link', value: orgDiscord }
        )
        .setColor(Colors.Yellow);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`grantAmbassadorship_${interaction.user.id}`)
                .setLabel('Grant Ambassadorship')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`denyAmbassadorship_${interaction.user.id}`)
                .setLabel('Deny Ambassadorship')
                .setStyle(ButtonStyle.Danger)
        );

    const verificationChannel = interaction.guild.channels.cache.get('1257547338444968017');
    if (verificationChannel) {
        await verificationChannel.send({ embeds: [submissionEmbed], components: [row] });
    }

    await interaction.reply({ content: 'Your verification form has been submitted.', ephemeral: true });
}

async function handleGrantAmbassadorship(interaction) {
    const userId = interaction.customId.split('_')[1];
    const modal = new ModalBuilder()
        .setCustomId(`grantAmbassadorshipModal_${userId}`)
        .setTitle('Ambassadorship Org Tag/Abv')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('org_tag')
                    .setLabel('Enter the ambassador\'s org tag/abv.')
                    .setPlaceholder('Enter only the tag/abv., do not include [ ].')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleGrantAmbassadorshipModal(interaction) {
    const userId = interaction.customId.split('_')[1];
    const guild = interaction.guild;

    try {
        const member = await guild.members.fetch(userId);
        const orgTag = interaction.fields.getTextInputValue('org_tag');
        const ambassadorshipRole = guild.roles.cache.get('1168254522980843602');
        
        if (ambassadorshipRole) {
            await member.roles.add(ambassadorshipRole);

            const rolesToRemove = [
                '1168925938692669554',
                '1180258600132821102',
                '1172216651601694750'
            ];

            for (const roleId of rolesToRemove) {
                const role = guild.roles.cache.get(roleId);
                if (role && member.roles.cache.has(roleId)) {
                    await member.roles.remove(role);
                }
            }
        }

        await member.setNickname(`[${orgTag}] ${member.displayName.replace(/\[.*?\]\s*/g, '')}`);

        const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#00FF00') // Use case-sensitive color names or hex values.
            .setFooter({ text: 'Ambassadorship granted' });

        await interaction.update({ embeds: [updateEmbed], components: [] });
    } catch (error) {
        console.error('Error granting ambassadorship:', error);
        await interaction.reply({ content: 'There was an error granting ambassadorship. Please try again later.', ephemeral: true });
    }
}

async function handleDenyAmbassadorship(interaction) {
    const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('Red') // Use case-sensitive color names or hex values.
        .setFooter({ text: 'Ambassadorship denied' });

    await interaction.update({ embeds: [updateEmbed], components: [] });
}

async function handleStaffApplicationSelect(interaction) {
    console.log('Staff application select handler called');
    const value = interaction.values[0];

    const formDetails = {
        event_coordinator: {
            title: 'Event Coordinator Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Host casual events for members' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Good at creating fun events, etc.' },
            ],
        },
        chamberlain: {
            title: 'Chamberlain (Human Resources) Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Process and help new members' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Organized, Personable, etc.' },
            ],
        },
        envoy: {
            title: 'Envoy (Diplomacy) Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Coordinate events with orgs' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Know a lot of the SC community' },
            ],
        },
        herald: {
            title: 'Herald (Media & Marketing) Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Make graphics, etc.' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Video editing experience, etc.' },
            ],
        },
        scholar: {
            title: 'Scholar (Research & Development) Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Find best/meta builds' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Enjoy testing ship specs, etc.' },
            ],
        },
        scribe: {
            title: 'Scribe (Records & Info) Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Make info docs, etc.' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Organized, etc.' },
            ],
        },
        treasure: {
            title: 'Treasure (In-Game Finance) Application',
            questions: [
                { customId: 'position_understanding', label: 'Understanding of this position?', placeholder: 'Hold and disburse org aUEC' },
                { customId: 'membership_duration', label: 'Duration of BV membership', placeholder: '6 months, etc.' },
                { customId: 'role_skills', label: 'Skills relating to this role?', placeholder: 'Able to keep a ledger, etc.' },
            ],
        },
    };

    const form = formDetails[value];
    const modal = new ModalBuilder()
        .setCustomId(`staff_application_${value}`)
        .setTitle(form.title)
        .addComponents(
            form.questions.map(question =>
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(question.customId)
                        .setLabel(question.label)
                        .setPlaceholder(question.placeholder)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            )
        );

    await interaction.showModal(modal);

    const emptyDropdown = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('staff_application_select')
                .setPlaceholder('Select a staff application type')
                .addOptions(Object.keys(formDetails).map(key => ({
                    label: formDetails[key].title,
                    value: key
                })))
        );

    await interaction.message.edit({ components: [emptyDropdown] });
}

async function handleStaffApplicationForm(interaction) {
    const customIdParts = interaction.customId.split('_');
    const role = customIdParts.slice(2).join('_');
    console.log(`Handling staff application for role: ${role}`);

    const formDetails = {
        event_coordinator: { title: 'Event Coordinator Application', roleId: '1185813396667514891' },
        chamberlain: { title: 'Chamberlain (Human Resources) Application', roleId: '1174715276126859274' },
        envoy: { title: 'Envoy (Diplomacy) Application', roleId: '1171484082048340028' },
        herald: { title: 'Herald (Media & Marketing) Application', roleId: '1172312195690934363' },
        scholar: { title: 'Scholar (Research & Development) Application', roleId: '1178207198602608680' },
        scribe: { title: 'Scribe (Records & Info) Application', roleId: '1174730223636451479' },
        treasure: { title: 'Treasure (In-Game Finance) Application', roleId: '1176594286469464164' },
    };

    const form = formDetails[role];
    if (!form) {
        console.error(`Form details not found for role: ${role}`);
        return interaction.reply({ content: 'Error processing your application.', ephemeral: true });
    }

    const answers = [
        { name: 'Understanding of this position?', value: interaction.fields.getTextInputValue('position_understanding') },
        { name: 'Duration of BV membership', value: interaction.fields.getTextInputValue('membership_duration') },
        { name: 'Skills relating to this role?', value: interaction.fields.getTextInputValue('role_skills') },
    ];

    const submissionEmbed = new EmbedBuilder()
        .setTitle(form.title)
        .setDescription(`**Submitted by:** ${interaction.user.tag}`)
        .addFields(answers)
        .setColor('#FFFF00');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approveStaffApp_${role}_${interaction.user.id}`)
                .setLabel('Approve Application')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`denyStaffApp_${role}_${interaction.user.id}`)
                .setLabel('Deny Application')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`createInterviewChannel_${role}_${interaction.user.id}`)
                .setLabel('Create Interview Channel')
                .setStyle(ButtonStyle.Primary)
        );

    const verificationChannel = interaction.guild.channels.cache.get('1257696992650334218');
    if (verificationChannel) {
        await verificationChannel.send({ 
            content: '<@&1168253795818549319> <@&1168234521301356715>',
            embeds: [submissionEmbed],
            components: [row] 
        });
    }

    await interaction.reply({ content: 'Your application has been submitted.', ephemeral: true });
}

async function handleCreateInterviewChannel(interaction) {
    const customIdParts = interaction.customId.split('_');
    const role = customIdParts.slice(1, -1).join('_');
    const userId = customIdParts[customIdParts.length - 1];
    const member = await interaction.guild.members.fetch(userId);

    if (!member) {
        console.error(`Member not found for ID: ${userId}`);
        return interaction.reply({
            content: 'There was an error processing your request. Please try again later.',
            ephemeral: true
        });
    }

    const categoryID = '1169005736358064269'; // Category ID for the new interview channel
    const channelName = `${member.displayName.toLowerCase()}-interview`;

    try {
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryID,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                },
                ...interaction.guild.channels.cache
                    .get(categoryID)
                    .permissionOverwrites.cache.map(perm => ({
                        id: perm.id,
                        allow: perm.allow.toArray(),
                        deny: perm.deny.toArray(),
                    })),
            ],
        });

        const formDetails = {
            event_coordinator: {
                title: 'Event Coordinator Application',
                roleId: '1185813396667514891',
            },
            chamberlain: {
                title: 'Chamberlain (Human Resources) Application',
                roleId: '1174715276126859274',
            },
            envoy: {
                title: 'Envoy (Diplomacy) Application',
                roleId: '1171484082048340028',
            },
            herald: {
                title: 'Herald (Media & Marketing) Application',
                roleId: '1172312195690934363',
            },
            scholar: {
                title: 'Scholar (Research & Development) Application',
                roleId: '1178207198602608680',
            },
            scribe: {
                title: 'Scribe (Records & Info) Application',
                roleId: '1174730223636451479',
            },
            treasure: {
                title: 'Treasure (In-Game Finance) Application',
                roleId: '1176594286469464164',
            },
        };

        const form = formDetails[role];
        if (!form) {
            console.error(`Form details not found for role: ${role}`);
            return interaction.reply({
                content: 'There was an error processing your request. Please try again later.',
                ephemeral: true
            });
        }

        const answers = [
            { name: 'Understanding of this position?', value: interaction.message.embeds[0].fields[0].value },
            { name: 'Duration of BV membership', value: interaction.message.embeds[0].fields[1].value },
            { name: 'Skills relating to this role?', value: interaction.message.embeds[0].fields[2].value },
        ];

        const submissionEmbed = new EmbedBuilder()
            .setTitle(form.title)
            .setDescription(`**Submitted by:** ${interaction.message.embeds[0].description.split('**Submitted by:** ')[1]}`)
            .addFields(answers)
            .setColor('#FFFF00');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`closeInterview_${channel.id}`)
                    .setLabel('Close Interview')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({ content: `${member}`, embeds: [submissionEmbed], components: [row] });

        await interaction.reply({ content: 'The interview channel has been created.', ephemeral: true });
    } catch (error) {
        console.error('Error handling createInterviewChannel interaction:', error);
        await interaction.reply({
            content: 'There was an error while processing your request. Please try again later.',
            ephemeral: true
        });
    }
}

async function handleCloseInterview(interaction) {
    const channelId = interaction.channelId;
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirmCloseInterview_${channelId}`)
                .setLabel('Confirm Close Interview')
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({
        content: 'Are you sure you want to close this interview?',
        components: [row],
        ephemeral: true
    });
}

async function handleConfirmCloseInterview(interaction) {
    try {
        // Extract channel ID from custom ID
        const channelId = interaction.customId.split('_')[1];
        const channel = interaction.guild.channels.cache.get(channelId);

        // Ensure the channel exists
        if (!channel) {
            console.error(`Channel with ID ${channelId} not found or already deleted.`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `The interview channel could not be found. It may have already been deleted.`, ephemeral: true });
            }
            return;
        }

        // Fetch messages and prepare transcript
        const messages = await channel.messages.fetch({ limit: 100 });
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (logChannel) {
            const transcription = messages
                .map(msg => `${msg.author.tag}: ${msg.content}`)
                .reverse()
                .join('\n');

            if (transcription.length > 4096) {
                // Send as a file if too long for an embed
                await logChannel.send({
                    content: `Staff interview transcript:`,
                    files: [{ attachment: Buffer.from(transcription, 'utf-8'), name: 'interview_transcript.txt' }],
                });
            } else {
                // Send as an embed
                const transcriptionEmbed = new EmbedBuilder()
                    .setTitle(`Staff Interview Transcript`)
                    .setDescription(transcription)
                    .setColor('#3498db');

                await logChannel.send({ embeds: [transcriptionEmbed] });
            }
        }

        // Respond to the interaction before deleting the channel
        await interaction.reply({ content: `Interview channel closed and transcribed.`, ephemeral: true });

        // Add a short delay before deleting the channel
        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (deleteError) {
                console.error(`Error deleting channel ${channelId}:`, deleteError);
            }
        }, 1000); // 1-second delay
    } catch (error) {
        // Log and respond to the interaction for any other issues
        console.error(`Error in handleConfirmCloseInterview:`, error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `An error occurred while closing the interview channel. Please try again later.`,
                ephemeral: true,
            });
        }
    }
}

async function handleApproveStaffApp(interaction) {
    const customIdParts = interaction.customId.split('_');
    const role = customIdParts.slice(1, -1).join('_'); // Join parts except the last one to get the role
    const userId = customIdParts[customIdParts.length - 1]; // Last part is the userId
    console.log(`Approving application for role: ${role}, user ID: ${userId}`);

    const formDetails = {
        event_coordinator: '1185813396667514891',
        chamberlain: '1174715276126859274',
        envoy: '1171484082048340028',
        herald: '1172312195690934363',
        scholar: '1178207198602608680',
        scribe: '1174730223636451479',
        treasure: '1176594286469464164',
    };

    try {
        const member = await interaction.guild.members.fetch(userId);
        const roleId = formDetails[role];
        const roleToAdd = interaction.guild.roles.cache.get(roleId);

        if (roleToAdd) {
            await member.roles.add(roleToAdd);
        }

        const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#00FF00')
            .setFooter({ text: 'Application approved' });

        await interaction.update({ embeds: [updateEmbed], components: [] });
    } catch (error) {
        console.error('Error approving application:', error);
        await interaction.reply({ content: 'There was an error approving the application. Please try again later.', ephemeral: true });
    }
}

async function handleDenyStaffApp(interaction) {
    const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('Red')
        .setFooter({ text: 'Application denied' });

    await interaction.update({ embeds: [updateEmbed], components: [] });
}

async function handleInstructorApplicationSelect(interaction) {
    console.log('Instructor application select handler called');
    const value = interaction.values[0];

    const formDetails = {
        pilot_instructor: {
            title: 'Pilot Instructor Application',
            questions: [
                { customId: 'pilot_skill', label: 'Rate your Pilot skill?', placeholder: '1-5, 5 being the best' },
                { customId: 'instructor_quality', label: 'What makes you a good instructor?', placeholder: 'Good with people, Like helping, etc.' },
                { customId: 'one_on_one_availability', label: 'Availability to hold 1 on 1 trainings?', placeholder: 'Yes / No' },
                { customId: 'event_intention', label: 'Intention to host events?', placeholder: 'No / Yes, Biweekly' },
            ],
        },
        infantry_instructor: {
            title: 'Infantry Instructor Application',
            questions: [
                { customId: 'infantry_skill', label: 'Rate your Infantry skill?', placeholder: '1-5, 5 being the best' },
                { customId: 'instructor_quality', label: 'What makes you a good instructor?', placeholder: 'Good with people, Like helping, etc.' },
                { customId: 'one_on_one_availability', label: 'Availability to hold 1 on 1 trainings?', placeholder: 'Yes / No' },
                { customId: 'event_intention', label: 'Intention to host events?', placeholder: 'No / Yes, Biweekly' },
            ],
        },
        crewman_instructor: {
            title: 'Crewman Instructor Application',
            questions: [
                { customId: 'crewman_skill', label: 'Rate your Crewman skill?', placeholder: '1-5, 5 being the best' },
                { customId: 'instructor_quality', label: 'What makes you a good instructor?', placeholder: 'Good with people, Like helping, etc.' },
                { customId: 'one_on_one_availability', label: 'Availability to hold 1 on 1 trainings?', placeholder: 'Yes / No' },
                { customId: 'event_intention', label: 'Intention to host events?', placeholder: 'No / Yes, Biweekly' },
            ],
        },
        tradesman_instructor: {
            title: 'Support Instructor Application',
            questions: [
                { customId: 'tradesman_skill', label: 'Rate your Support skill?', placeholder: '1-5, 5 being the best' },
                { customId: 'instructor_quality', label: 'What makes you a good instructor?', placeholder: 'Good with people, Like helping, etc.' },
                { customId: 'one_on_one_availability', label: 'Availability to hold 1 on 1 trainings?', placeholder: 'Yes / No' },
                { customId: 'event_intention', label: 'Intention to host events?', placeholder: 'No / Yes, Biweekly' },
            ],
        },
    };

    const form = formDetails[value];
    const modal = new ModalBuilder()
        .setCustomId(`instructor_application_${value}`)
        .setTitle(form.title)
        .addComponents(
            form.questions.map(question =>
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(question.customId)
                        .setLabel(question.label)
                        .setPlaceholder(question.placeholder)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            )
        );

    await interaction.showModal(modal);

    const emptyDropdown = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('instructor_application_select')
                .setPlaceholder('Select an instructor application type')
                .addOptions(Object.keys(formDetails).map(key => ({
                    label: formDetails[key].title,
                    value: key
                })))
        );

    await interaction.message.edit({ components: [emptyDropdown] });
}

async function handleInstructorApplicationForm(interaction) {
    const customIdParts = interaction.customId.split('_');
    const role = customIdParts.slice(2).join('_'); // Join the parts after 'instructor_application' to get the role
    console.log(`Custom ID parts: ${customIdParts}`);
    console.log(`Handling instructor application for role: ${role}`);

    const formDetails = {
        pilot_instructor: {
            title: 'Pilot Instructor Application',
            roleId: '1168327555917557780',
        },
        infantry_instructor: {
            title: 'Infantry Instructor Application',
            roleId: '1168327592269598760',
        },
        crewman_instructor: {
            title: 'Crewman Instructor Application',
            roleId: '1168327699203375114',
        },
        tradesman_instructor: {
            title: 'Support Instructor Application',
            roleId: '1168327804874661931',
        },
    };

    const form = formDetails[role];
    if (!form) {
        console.error(`Form details not found for role: ${role}`);
        return interaction.reply({ content: 'There was an error processing your application. Please try again later.', ephemeral: true });
    }

    const answers = [
        { name: 'Rate your skill 1-5?', value: interaction.fields.getTextInputValue(`${role.split('_')[0]}_skill`) },
        { name: 'What makes you a good instructor?', value: interaction.fields.getTextInputValue('instructor_quality') },
        { name: 'Availability to hold 1 on 1 trainings?', value: interaction.fields.getTextInputValue('one_on_one_availability') },
        { name: 'Intention to host events?', value: interaction.fields.getTextInputValue('event_intention') },
    ];

    const submissionEmbed = new EmbedBuilder()
        .setTitle(form.title)
        .setDescription(`**Submitted by:** ${interaction.user.tag}`)
        .addFields(answers)
        .setColor('#FFFF00'); // Yellow color

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approveInstructorApp_${role}_${interaction.user.id}`)
                .setLabel('Approve Application')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`denyInstructorApp_${role}_${interaction.user.id}`)
                .setLabel('Deny Application')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`createInstructorInterviewChannel_${role}_${interaction.user.id}`)
                .setLabel('Create Interview Channel')
                .setStyle(ButtonStyle.Primary)
        );

    const verificationChannel = interaction.guild.channels.cache.get('1257696992650334218'); // Updated channel ID
    if (verificationChannel) {
        await verificationChannel.send({
            content: '<@&1168253795818549319> <@&1168234521301356715>', // Pinging the roles
            embeds: [submissionEmbed],
            components: [row]
        });
    }

    await interaction.reply({ content: 'Your application has been submitted.', ephemeral: true });
}

async function handleCreateInstructorInterviewChannel(interaction) {
    const customIdParts = interaction.customId.split('_');
    const role = customIdParts.slice(1, -1).join('_');
    const userId = customIdParts[customIdParts.length - 1];
    const member = await interaction.guild.members.fetch(userId);

    if (!member) {
        console.error(`Member not found for ID: ${userId}`);
        return interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
    }

    const categoryID = '1169005736358064269'; // Category ID for the new interview channel
    const channelName = `${member.displayName.toLowerCase()}-interview`;

    try {
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryID,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                },
                ...interaction.guild.channels.cache
                    .get(categoryID)
                    .permissionOverwrites.cache.map(perm => ({
                        id: perm.id,
                        allow: perm.allow.toArray(),
                        deny: perm.deny.toArray(),
                    })),
            ],
        });

        const formDetails = {
            pilot_instructor: {
                title: 'Pilot Instructor Application',
                roleId: '1168327555917557780',
            },
            infantry_instructor: {
                title: 'Infantry Instructor Application',
                roleId: '1168327592269598760',
            },
            crewman_instructor: {
                title: 'Crewman Instructor Application',
                roleId: '1168327699203375114',
            },
            tradesman_instructor: {
                title: 'Support Instructor Application',
                roleId: '1168327804874661931',
            },
        };

        const form = formDetails[role];
        if (!form) {
            console.error(`Form details not found for role: ${role}`);
            return interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
        }

        const answers = [
            { name: 'Rate your skill 1-5?', value: interaction.message.embeds[0].fields[0].value },
            { name: 'What makes you a good instructor?', value: interaction.message.embeds[0].fields[1].value },
            { name: 'Availability to hold 1 on 1 trainings?', value: interaction.message.embeds[0].fields[2].value },
            { name: 'Intention to host events?', value: interaction.message.embeds[0].fields[3].value },
        ];

        const submissionEmbed = new EmbedBuilder()
            .setTitle(form.title)
            .setDescription(`**Submitted by:** ${interaction.message.embeds[0].description.split('**Submitted by:** ')[1]}`)
            .addFields(answers)
            .setColor('#FFFF00'); // Yellow color

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`closeInstructorInterview_${channel.id}`)
                    .setLabel('Close Interview')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({ content: `${member}`, embeds: [submissionEmbed], components: [row] });

        await interaction.reply({ content: 'The interview channel has been created.', ephemeral: true });
    } catch (error) {
        console.error('Error handling createInstructorInterviewChannel interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleCloseInstructorInterview(interaction) {
    const channelId = interaction.channelId;
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirmCloseInstructorInterview_${channelId}`)
                .setLabel('Confirm Close Interview')
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({ content: 'Are you sure you want to close this instructor interview?', components: [row], ephemeral: true });
}

async function handleConfirmCloseInstructorInterview(interaction) {
    try {
        const channelId = interaction.customId.split('_')[1];
        const channel = interaction.guild.channels.cache.get(channelId);
        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!channel) {
            return interaction.reply({
                content: 'Channel not found. It might have already been deleted.',
                ephemeral: true,
            });
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (!logChannel) {
            return interaction.reply({
                content: 'Transcription log channel not found. Please check the setup.',
                ephemeral: true,
            });
        }

        const transcription = messages
            .map(msg => `${msg.author.tag}: ${msg.content}`)
            .reverse()
            .join('\n');

        // Handle long transcriptions
        if (transcription.length > 4096) {
            const attachment = Buffer.from(transcription, 'utf-8');
            await logChannel.send({
                content: `${member.displayName}'s instructor interview transcript (too large for embed):`,
                files: [{ attachment, name: 'transcript.txt' }],
            });
        } else {
            const transcriptionEmbed = new EmbedBuilder()
                .setTitle(`${member.displayName}'s Instructor Interview Transcript`)
                .setDescription(transcription)
                .setColor('#3498db');
            await logChannel.send({ embeds: [transcriptionEmbed] });
        }

        // Respond to the interaction before deleting the channel
        await interaction.reply({
            content: 'Instructor interview channel closed and transcribed successfully.',
            ephemeral: true,
        });

        await channel.delete();
    } catch (error) {
        console.error('Error in handleConfirmCloseInstructorInterview:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing the instructor interview. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleApproveInstructorApp(interaction) {
    const customIdParts = interaction.customId.split('_');
    const role = customIdParts.slice(1, -1).join('_'); // Join parts except the last one to get the role
    const userId = customIdParts[customIdParts.length - 1]; // Last part is the userId
    console.log(`Approving application for role: ${role}, user ID: ${userId}`);

    const formDetails = {
        pilot_instructor: '1168327555917557780',
        infantry_instructor: '1168327592269598760',
        crewman_instructor: '1168327699203375114',
        tradesman_instructor: '1168327804874661931',
    };

    try {
        const member = await interaction.guild.members.fetch(userId);
        const roleId = formDetails[role];
        const roleToAdd = interaction.guild.roles.cache.get(roleId);

        if (roleToAdd) {
            await member.roles.add(roleToAdd);
        }

        const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#00FF00')
            .setFooter({ text: 'Application approved' });

        await interaction.update({ embeds: [updateEmbed], components: [] });
    } catch (error) {
        console.error('Error approving application:', error);
        await interaction.reply({ content: 'There was an error approving the application. Please try again later.', ephemeral: true });
    }
}

async function handleDenyInstructorApp(interaction) {
    const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('Red')
        .setFooter({ text: 'Application denied' });

    await interaction.update({ embeds: [updateEmbed], components: [] });
}

async function handleTrainingRequestSelect(interaction) {
    console.log('Training request select handler called');
    const value = interaction.values[0];

    const formDetails = {
        pilot_training: {
            title: 'Pilot Training Request',
            questions: [
                { customId: 'ship_type', label: 'Ship type you would like to train with?', placeholder: 'Light Fighter, Multi Crew, etc.' },
                { customId: 'pilot_skills', label: 'Pilot skills you would like trained on?', placeholder: 'Merging, General Training, etc.' },
                { customId: 'time_zone', label: 'Time zone you are usually available?', placeholder: 'PT, ET, GMT+2, etc.' }
            ]
        },
        infantry_training: {
            title: 'Infantry Training Request',
            questions: [
                { customId: 'environment', label: 'Environment you would like to train for?', placeholder: 'EVA, Open Ground, Confined Space' },
                { customId: 'infantry_skills', label: 'Infantry skills you would like trained on?', placeholder: 'LRS, CQB, etc.' },
                { customId: 'time_zone', label: 'Time zone you are usually available?', placeholder: 'PT, ET, GMT+2, etc.' }
            ]
        },
        crewman_training: {
            title: 'Crewman Training Request',
            questions: [
                { customId: 'crewman_skills', label: 'Crewman skills you would like trained on?', placeholder: 'Turret Gunning, Engineering, etc.' },
                { customId: 'time_zone', label: 'Time zone you are usually available?', placeholder: 'PT, ET, GMT+2, etc.' }
            ]
        },
        tradesman_training: {
            title: 'Support Training Request',
            questions: [
                { customId: 'tradesman_skills', label: 'Support skills you would like trained on?', placeholder: 'Trade Routes, Cargo Management, etc.' },
                { customId: 'time_zone', label: 'Time zone you are usually available?', placeholder: 'PT, ET, GMT+2, etc.' }
            ]
        }
    };

    const form = formDetails[value];
    const modal = new ModalBuilder()
        .setCustomId(`training_request_${value}`)
        .setTitle(form.title)
        .addComponents(
            form.questions.map(question =>
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(question.customId)
                        .setLabel(question.label)
                        .setPlaceholder(question.placeholder)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            )
        );

    await interaction.showModal(modal);

    // Reset the select menu
    const message = await interaction.message.fetch();
    const updatedComponents = message.components.map(row => 
        new ActionRowBuilder().addComponents(
            row.components.map(component => {
                if (component.data.type === 'SELECT_MENU') {
                    return component.setOptions(component.options.map(option => ({
                        ...option,
                        default: false
                    })));
                }
                return component;
            })
        )
    );

    await interaction.message.edit({ components: updatedComponents });
}

async function handleTrainingRequestForm(interaction) {
    const customIdParts = interaction.customId.split('_');
    const type = customIdParts.slice(2).join('_'); // Join the parts after 'training_request' to get the type

    const formDetails = {
        pilot_training: {
            title: 'Pilot Training Request',
            roles: ['1168234521301356715', '1168327555917557780'],
            message: (user) => `${user} a <@&1168327555917557780> will be in contact soon to discuss the pilot training you have requested.`,
            questions: [
                { customId: 'ship_type', label: 'Ship type you would like to train with?' },
                { customId: 'pilot_skills', label: 'Pilot skills you would like trained on?' },
                { customId: 'time_zone', label: 'Time zone you are usually available?' },
            ],
        },
        infantry_training: {
            title: 'Infantry Training Request',
            roles: ['1168234521301356715', '1168327592269598760'],
            message: (user) => `${user} a <@&1168327592269598760> will be in contact soon to discuss the Infantry training you have requested.`,
            questions: [
                { customId: 'environment', label: 'Environment you would like to train for?' },
                { customId: 'infantry_skills', label: 'Infantry skills you would like trained on?' },
                { customId: 'time_zone', label: 'Time zone you are usually available?' },
            ],
        },
        crewman_training: {
            title: 'Crewman Training Request',
            roles: ['1168234521301356715', '1168327699203375114'],
            message: (user) => `${user} a <@&1168327699203375114> will be in contact soon to discuss the Crewman training you have requested.`,
            questions: [
                { customId: 'crewman_skills', label: 'Crewman skills you would like trained on?' },
                { customId: 'time_zone', label: 'Time zone you are usually available?' },
            ],
        },
        tradesman_training: {
            title: 'Support Training Request',
            roles: ['1168234521301356715', '1168327804874661931'],
            message: (user) => `${user} a <@&1168327804874661931> will be in contact soon to discuss the Support training you have requested.`,
            questions: [
                { customId: 'tradesman_skills', label: 'Support skills you would like trained on?' },
                { customId: 'time_zone', label: 'Time zone you are usually available?' },
            ],
        },
    };

    const form = formDetails[type];

    if (!form) {
        console.error(`Form details not found for type: ${type}`);
        return interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
    }

    const answers = form.questions.map(question => ({
        name: question.label,
        value: interaction.fields.getTextInputValue(question.customId),
    }));

    const submissionEmbed = new EmbedBuilder()
        .setTitle(form.title)
        .setDescription(`**Submitted by:** ${interaction.user.tag}`)
        .addFields(answers)
        .setColor('#FFFF00');

    const categoryID = '1169377898529030215'; // Category ID for the new channel
    const channelName = `${interaction.member.displayName.toLowerCase()}-training`;

    const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryID,
        topic: `Training request by ${interaction.user.id}`,
        permissionOverwrites: [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ],
            },
            ...form.roles.map(roleId => ({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ],
            })),
        ],
    });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`closeTrainingRequest_${channel.id}`)
                .setLabel('Close Training Request')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`scheduleTraining_${channel.id}`)
                .setLabel('Schedule Training')
                .setStyle(ButtonStyle.Primary)
        );

    await channel.send({
        content: form.message(interaction.user),
        embeds: [submissionEmbed],
        components: [row],
    });

    await interaction.reply({ content: 'Your training request has been submitted and a private channel has been created.', ephemeral: true });
}

async function handleCloseTrainingRequest(interaction) {
    const channelId = interaction.customId.split('_')[1];
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirmCloseTrainingRequest_${channelId}`)
                .setLabel('Confirm Close')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`backCloseTrainingRequest_${channelId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.update({ content: 'This will delete this training request.', components: [row] });
}

async function handleConfirmCloseTrainingRequest(interaction) {
    try {
        const channelId = interaction.customId.split('_')[1];
        const channel = interaction.guild.channels.cache.get(channelId);
        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!channel) {
            return interaction.reply({
                content: 'Channel not found. It might have already been deleted.',
                ephemeral: true,
            });
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (!logChannel) {
            return interaction.reply({
                content: 'Transcription log channel not found. Please check the setup.',
                ephemeral: true,
            });
        }

        const transcription = messages
            .map(msg => `${msg.author.tag}: ${msg.content}`)
            .reverse()
            .join('\n');

        // Handle long transcriptions
        if (transcription.length > 4096) {
            const attachment = Buffer.from(transcription, 'utf-8');
            await logChannel.send({
                content: `${member.displayName}'s training request transcript (too large for embed):`,
                files: [{ attachment, name: 'transcript.txt' }],
            });
        } else {
            const transcriptionEmbed = new EmbedBuilder()
                .setTitle(`${member.displayName}'s Training Request Transcript`)
                .setDescription(transcription)
                .setColor('#3498db');
            await logChannel.send({ embeds: [transcriptionEmbed] });
        }

        // Respond to the interaction before deleting the channel
        await interaction.reply({
            content: 'Training request channel closed and transcribed successfully.',
            ephemeral: true,
        });

        await channel.delete();
    } catch (error) {
        console.error('Error in handleConfirmCloseTrainingRequest:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing the training request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleBackCloseTrainingRequest(interaction) {
    const channelId = interaction.customId.split('_')[1];
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`closeTrainingRequest_${channelId}`)
                .setLabel('Close Training Request')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`scheduleTraining_${channelId}`)
                .setLabel('Schedule Training')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.update({ content: 'Close request cancelled.', components: [row] });
}

async function handleScheduleTraining(interaction) {
    const channelId = interaction.customId.split('_')[1];

    const authorizedRoles = [
        '1173822659071578182',
        '1173822697956982794',
        '1173822842442367026',
        '1168327555917557780',
        '1168327592269598760',
        '1168327699203375114',
        '1168327804874661931',
    ];

    if (!interaction.member.roles.cache.some(role => authorizedRoles.includes(role.id))) {
        return interaction.reply({ content: 'You do not have permission to use this button.', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId(`schedule_training_${channelId}`)
        .setTitle('Schedule Training')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('training_date_time')
                    .setLabel('Training Date and Time')
                    .setPlaceholder('YYYY-MM-DDTHH:mm (24hr)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('time_zone')
                    .setLabel('Your Time Zone')
                    .setPlaceholder('e.g., America/New_York')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('training_channel')
                    .setLabel('Voice Channel ID')
                    .setPlaceholder('Enter the voice channel ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleScheduleTrainingForm(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const trainingDateTime = interaction.fields.getTextInputValue('training_date_time');
    const timeZone = interaction.fields.getTextInputValue('time_zone');
    const voiceChannelId = interaction.fields.getTextInputValue('training_channel');

    // ✅ Validate the date input
    const parsedDate = new Date(trainingDateTime);
    if (isNaN(parsedDate)) {
        return interaction.reply({ content: 'Invalid date format. Please double-check your input. Use something like MM/DD/YY hh:mm AM/PM.', ephemeral: true });
    }
    
    try {
        const trainingChannel = interaction.guild.channels.cache.get(channelId);

        // Get the user ID from the channel's topic
        const userId = trainingChannel.topic.split(' ')[3];
        const user = await interaction.guild.members.fetch(userId);

        const embed = new EmbedBuilder()
            .setTitle('Training Scheduled')
            .setDescription(`**Training for:** ${user}\n**Scheduled Time:** ${trainingDateTime}\n**Time Zone:** ${timeZone}`)
            .setColor('#00FF00'); // Green

        await trainingChannel.send({ embeds: [embed] });

        // Create a Discord event
        const guildScheduledEvent = await interaction.guild.scheduledEvents.create({
            name: `${user.displayName}'s training`,
            scheduledStartTime: parsedDate,
            privacyLevel: 2,
            entityType: 2,
            channel: voiceChannelId,
        });

        await interaction.reply({ content: `Training session scheduled and event created: ${guildScheduledEvent.url}`, ephemeral: true });
    } catch (error) {
        console.error('Error scheduling training:', error);
        await interaction.reply({ content: 'There was an error scheduling the training session. Please try again later.', ephemeral: true });
    }
}

async function handleJoinCrackheads(interaction) {
    const roleId = '1383461565793177610';

    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(roleId)) {
            await interaction.reply({ content: 'You are already a member of Crackheads.', ephemeral: true });
        } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: 'You have joined the Crackheads mining crew!', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling joinCrackheads interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleRequestCrackheads(interaction) {
    const channelName = `${interaction.member.displayName.toLowerCase()}-crackheads`;
    const categoryID = '1169001073017630780';

    try {
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryID,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                },
                {
                    id: '1383461565793177610', // Crackhead role
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }
            ],
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`crackheads_responding_${channel.id}`)
                    .setLabel('Mining')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`crackheads_resolved_${channel.id}`)
                    .setLabel('Rock Cracked')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({
            content: `${interaction.user} is needing additional miners to crack difficult rocks. Calling in <@&1383461565793177610>!`,
            embeds: [
                new EmbedBuilder()
                    .setTitle('Rock Cracking Coordination')
                    .setDescription(`If you're a miner ready to help, click **Mining** below to join ${interaction.user}. Let's bust these rocks!`)
                    .setColor('#FFA500'), // Orange for mining theme
            ],
            components: [row],
        });

        await interaction.reply({ content: 'A private mining ops channel has been created for your request.', ephemeral: true });
    } catch (error) {
        console.error('Error handling requestCrackheads interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleCrackheadsResponding(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({ content: 'Channel not found.', ephemeral: true });
    }

    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const requestMessage = messages.find(msg => msg.content.includes('needing additional miners'));
        const requester = requestMessage?.mentions.users.first();

        if (!requester) {
            return interaction.reply({ content: 'Requester not found.', ephemeral: true });
        }

        await channel.send(`${requester} ${interaction.user} is on their way with a pickaxe!`);
        await interaction.reply({ content: 'Your response has been noted.', ephemeral: true });
    } catch (error) {
        console.error('Error handling Crackheads responding interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your response. Please try again later.', ephemeral: true });
    }
}

async function handleCrackheadsResolved(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({ content: 'Channel not found.', ephemeral: true });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirmCloseCrackheads_${channelId}`)
                .setLabel('Confirm Close')
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({ content: 'This will close this channel and log the mining operation.', components: [row], ephemeral: true });
}

async function handleConfirmCloseCrackheads(interaction) {
    try {
        const channelId = interaction.customId.split('_')[1];
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
            return interaction.reply({
                content: 'Channel not found. It might have already been deleted.',
                ephemeral: true,
            });
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (!logChannel) {
            return interaction.reply({
                content: 'Transcription log channel not found. Please check the setup.',
                ephemeral: true,
            });
        }

        const transcript = messages
            .map(msg => `${msg.author.tag}: ${msg.content}`)
            .reverse()
            .join('\n');

        if (transcript.length > 4096) {
            const attachment = Buffer.from(transcript, 'utf-8');
            await logChannel.send({
                content: 'Crackhead mining transcript (too large for embed):',
                files: [{ attachment, name: 'mining_transcript.txt' }],
            });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('Crackheads Mining Transcript')
                .setDescription(transcript)
                .setColor('#3498db');
            await logChannel.send({ embeds: [embed] });
        }

        await interaction.reply({
            content: 'The channel has been closed and the mining effort transcribed successfully.',
            ephemeral: true,
        });

        await channel.delete();
    } catch (error) {
        console.error('Error in handleConfirmCloseCrackheads:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while closing the mining operation.',
                ephemeral: true,
            });
        }
    }
}

async function handleJoinDeathwatch(interaction) {
    const roleId = '1235058557863460954';

    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(roleId)) {
            await interaction.reply({ content: 'You are already a member of Deathwatch.', ephemeral: true });
        } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: 'You have joined Deathwatch!', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling joinDeathwatch interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleRequestDeathwatch(interaction) {
    const channelName = `${interaction.member.displayName.toLowerCase()}-deathwatch`;
    const categoryID = '1169001073017630780';

    try {
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryID,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                },
                ...['1173822659071578182', '1173822697956982794', '1173822842442367026', '1235058557863460954'].map(roleId => ({
                    id: roleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                })),
            ],
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`deathwatch_responding_${channel.id}`)
                    .setLabel('Responding')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`deathwatch_resolved_${channel.id}`)
                    .setLabel('Resolved')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({
            content: `${interaction.user} has requested the assistance of <@&1235058557863460954>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle('Deathwatch Request Coordination Channel')
                    .setDescription(`Deathwatch members, if you intend on responding please select the **Responding** button below to let ${interaction.user} know you will be joining the fight.`)
                    .setColor('#FF0000'), // Red
            ],
            components: [row],
        });

        await interaction.reply({ content: 'A private channel has been created for your request.', ephemeral: true });
    } catch (error) {
        console.error('Error handling requestDeathwatch interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleDeathwatchResponding(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({ content: 'Channel not found.', ephemeral: true });
    }

    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const requestMessage = messages.find(msg => msg.content.includes('has requested the assistance of'));
        const requester = requestMessage?.mentions.users.first();

        if (!requester) {
            return interaction.reply({ content: 'Requester not found.', ephemeral: true });
        }

        await channel.send(`${requester} ${interaction.user} is coming to join the fight.`);
        await interaction.reply({ content: 'Your response has been noted.', ephemeral: true });
    } catch (error) {
        console.error('Error handling Deathwatch responding interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleDeathwatchResolved(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({ content: 'Channel not found.', ephemeral: true });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirmCloseDeathwatch_${channelId}`)
                .setLabel('Confirm Close')
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({ content: 'This will close this channel.', components: [row], ephemeral: true });
}

async function handleConfirmCloseDeathwatch(interaction) {
    try {
        const channelId = interaction.customId.split('_')[1];
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
            return interaction.reply({
                content: 'Channel not found. It might have already been deleted.',
                ephemeral: true,
            });
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (!logChannel) {
            return interaction.reply({
                content: 'Transcription log channel not found. Please check the setup.',
                ephemeral: true,
            });
        }

        const transcription = messages
            .map(msg => `${msg.author.tag}: ${msg.content}`)
            .reverse()
            .join('\n');

        // Handle long transcriptions
        if (transcription.length > 4096) {
            const attachment = Buffer.from(transcription, 'utf-8');
            await logChannel.send({
                content: 'Deathwatch request transcript (too large for embed):',
                files: [{ attachment, name: 'transcript.txt' }],
            });
        } else {
            const transcriptionEmbed = new EmbedBuilder()
                .setTitle('Deathwatch Request Transcript')
                .setDescription(transcription)
                .setColor('#3498db');
            await logChannel.send({ embeds: [transcriptionEmbed] });
        }

        // Respond to the interaction before deleting the channel
        await interaction.reply({
            content: 'The channel has been closed and transcribed successfully.',
            ephemeral: true,
        });

        await channel.delete();
    } catch (error) {
        console.error('Error in handleConfirmCloseDeathwatch:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing the Deathwatch request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleAwardMedalButton(interaction) {
    const roleId = interaction.customId.split('_')[1];

    const modal = new ModalBuilder()
        .setCustomId(`awardmedal_${roleId}`)
        .setTitle('Award Medal/Commendation')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('recipient')
                    .setLabel('Recipient?')
                    .setPlaceholder('Who is this being awarded to?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleAwardMedalModal(interaction) {
    const roleId = interaction.customId.split('_')[1];
    const recipient = interaction.fields.getTextInputValue('recipient');

    try {
        const member = interaction.guild.members.cache.find(
            m => m.displayName.toLowerCase() === recipient.toLowerCase() || m.user.tag.toLowerCase() === recipient.toLowerCase()
        ) || await interaction.guild.members.fetch();

        if (!member) {
            return interaction.reply({ content: 'Recipient not found. Please make sure the name is correct.', ephemeral: true });
        }

        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
            await member.roles.add(role);

            const awardedEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Medal Awarded')
                .setDescription(`${member} has been awarded the ${role.name}!`);

            await interaction.reply({ embeds: [awardedEmbed], ephemeral: true });
        } else {
            await interaction.reply({ content: 'Role not found. Please check the role ID.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error awarding medal:', error);
        await interaction.reply({ content: 'There was an error awarding the medal. Please try again later.', ephemeral: true });
    }
}

async function handleFireStaffButton(interaction) {
    const [_, roleId, userId] = interaction.customId.split('_');
    const guild = interaction.guild;

    try {
        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.get(roleId);

        if (role && member.roles.cache.has(roleId)) {
            await member.roles.remove(role);
        }

        const roleRemovedEmbed = new EmbedBuilder()
            .setColor('#00FF00') // Green
            .setTitle('Position Removed')
            .setDescription(`${member.displayName} has been removed from the ${role.name} position.`);

        await interaction.update({ embeds: [roleRemovedEmbed], components: [] });

    } catch (error) {
        console.error('Error removing staff position:', error);
        await interaction.reply({ content: 'There was an error removing the staff position. Please try again later.', ephemeral: true });
    }
}

async function handleSelectHrForm(interaction) {
    const selectedForm = interaction.values[0];

    if (selectedForm === 'punitive_action_form') {
        const modal = new ModalBuilder()
            .setCustomId('punitive_action_form')
            .setTitle('Punitive Action Form')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('offending_member')
                        .setLabel('Offending Member')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter the offending member\'s name')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('description_of_offense')
                        .setLabel('Description of Offense')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Describe the offense')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('establishing_pattern')
                        .setLabel('Establishing a Pattern')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Detail any pattern of behavior')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('punitive_action')
                        .setLabel('Punitive Action to be Taken')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Describe the punitive action to be taken')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('offending_member_notified')
                        .setLabel('Offending Member Notified')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Yes or No')
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);

        const embed = new EmbedBuilder()
            .setTitle('Chamberlain Forms')
            .setDescription('Select which form you need from the dropdown menu below.');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_hr_form')
                    .setPlaceholder('Select a form...')
                    .addOptions([
                        {
                            label: 'Punitive Action Form',
                            value: 'punitive_action_form',
                        },
                    ])
            );

        await interaction.message.edit({ embeds: [embed], components: [row] });
    } else {
        await interaction.reply({ content: 'Selected form is not handled yet.', ephemeral: true });
    }
}

async function handlePunitiveActionForm(interaction) {
    try {
        const offendingMember = interaction.fields.getTextInputValue('offending_member');
        const descriptionOfOffense = interaction.fields.getTextInputValue('description_of_offense');
        const establishingPattern = interaction.fields.getTextInputValue('establishing_pattern');
        const punitiveAction = interaction.fields.getTextInputValue('punitive_action');
        const offendingMemberNotified = interaction.fields.getTextInputValue('offending_member_notified');

        const formEmbed = new EmbedBuilder()
            .setTitle('Punitive Action Form Submission')
            .addFields(
                { name: 'Offending member', value: offendingMember, inline: true },
                { name: 'Description of offense', value: descriptionOfOffense, inline: true },
                { name: 'Establishing a pattern', value: establishingPattern, inline: true },
                { name: 'Punitive action to be taken', value: punitiveAction, inline: true },
                { name: 'Offending member notified of punitive action', value: offendingMemberNotified, inline: true }
            )
            .setFooter({ text: `Submitted by ${interaction.user.username}` })
            .setColor('#FF0000'); // Red

        const hrChannel = interaction.client.channels.cache.get('1175300045046820884');
        if (hrChannel) {
            await hrChannel.send({ embeds: [formEmbed] });
        }

        await interaction.reply({ content: 'Form submitted successfully.', ephemeral: true });
    } catch (error) {
        console.error('Error handling HR form submission:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'There was an error submitting the form. Please try again later.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error submitting the form. Please try again later.', ephemeral: true });
        }
    }
}

async function handleJoinLootGoblins(interaction) {
    const roleId = '1262768748876660806';

    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(roleId)) {
            await interaction.reply({ content: 'You are already a Loot Goblin.', ephemeral: true });
        } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: 'You are now a Loot Goblin!', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling joinLootGoblin interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleRequestLootGoblins(interaction) {
    const channelName = `${interaction.member.displayName.toLowerCase()}-lootgoblin`;
    const categoryID = '1169001073017630780';

    try {
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryID,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                },
                ...['1173822659071578182', '1173822697956982794', '1173822842442367026', '1262768748876660806'].map(roleId => ({
                    id: roleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                })),
            ],
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`lootgoblin_responding_${channel.id}`)
                    .setLabel('Responding')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`lootgoblin_resolved_${channel.id}`)
                    .setLabel('Resolved')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({
            content: `${interaction.user} has requested the help of the <@&1262768748876660806>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle('Loot Goblin Request Coordination Channel')
                    .setDescription(`Loot Goblins, if you intend on responding please select the **Responding** button below to let ${interaction.user} know you will be coming to loot.`)
                    .setColor('#00FF00') // Green
            ],
            components: [row],
        });

        await interaction.reply({ content: 'A private channel has been created for your request.', ephemeral: true });
    } catch (error) {
        console.error('Error handling requestLootGoblins interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleLootGoblinsResponding(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({ content: 'Channel not found.', ephemeral: true });
    }

    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const requestMessage = messages.find(msg => msg.content.includes('has requested the help of the'));

        const requester = requestMessage?.mentions.users.first();

        if (!requester) {
            return interaction.reply({ content: 'Requester not found.', ephemeral: true });
        }

        await channel.send(`${requester} ${interaction.user} is coming to loot.`);
        await interaction.reply({ content: 'Your response has been noted.', ephemeral: true });
    } catch (error) {
        console.error('Error handling responding interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleLootGoblinsResolved(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
        return interaction.reply({ content: 'Channel not found.', ephemeral: true });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`lootgoblin_confirmCloseLootGoblins_${channelId}`)
                .setLabel('Confirm Close')
                .setStyle(ButtonStyle.Danger)
        );

    try {
        await interaction.reply({ content: 'This will close this channel.', components: [row], ephemeral: true });
    } catch (error) {
        console.error('Error handling resolved interaction:', error);
        await interaction.reply({ content: 'There was an error while processing your request. Please try again later.', ephemeral: true });
    }
}

async function handleConfirmCloseLootGoblins(interaction) {
    try {
        const channelId = interaction.customId.split('_')[2];
        const channel = interaction.guild.channels.cache.get(channelId);
        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!channel) {
            return interaction.reply({
                content: 'Channel not found. It might have already been deleted.',
                ephemeral: true,
            });
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const logChannel = interaction.guild.channels.cache.get(TRANSCRIPTION_CHANNEL_ID);

        if (!logChannel) {
            return interaction.reply({
                content: 'Transcription log channel not found. Please check the setup.',
                ephemeral: true,
            });
        }

        const transcription = messages
            .map(msg => `${msg.author.tag}: ${msg.content}`)
            .reverse()
            .join('\n');

        // Handle long transcriptions
        if (transcription.length > 4096) {
            const attachment = Buffer.from(transcription, 'utf-8');
            await logChannel.send({
                content: `${member.displayName}'s Loot Goblin request transcript (too large for embed):`,
                files: [{ attachment, name: 'transcript.txt' }],
            });
        } else {
            const transcriptionEmbed = new EmbedBuilder()
                .setTitle(`${member.displayName}'s Loot Goblin Request Transcript`)
                .setDescription(transcription)
                .setColor('#3498db');
            await logChannel.send({ embeds: [transcriptionEmbed] });
        }

        // Reply to the interaction before deleting the channel
        await interaction.reply({
            content: 'The channel has been closed and transcribed successfully.',
            ephemeral: true,
        });

        await channel.delete();
    } catch (error) {
        console.error('Error in handleConfirmCloseLootGoblins:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing the Loot Goblin request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleGiveawayControl(interaction) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('giveaway_entry_embed_modal_submit')
            .setTitle('Giveaway Entry Channel');

        const channelField = new TextInputBuilder()
            .setCustomId('giveaway_entry_embed_channel')
            .setLabel('Channel ID or Mention')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the channel ID for the giveaway embed')
            .setRequired(true);

        const plainTextField = new TextInputBuilder()
            .setCustomId('giveaway_entry_embed_plain_text')
            .setLabel('Plain Text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter pings or other plain text here')
            .setRequired(false);

        const descriptionField = new TextInputBuilder()
            .setCustomId('giveaway_entry_embed_description')
            .setLabel('Giveaway Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter giveaway information; prize, terms, etc.')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(channelField),
            new ActionRowBuilder().addComponents(plainTextField),
            new ActionRowBuilder().addComponents(descriptionField)
        );

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error in handleGiveawayControl:', error);
        await interaction.reply({ content: 'An error occurred while trying to display the modal. Please try again.', ephemeral: true });
    }
}

async function handleGiveawayEntryEmbedModal(interaction) {
    try {
        const channelId = interaction.fields.getTextInputValue('giveaway_entry_embed_channel');
        const plainText = interaction.fields.getTextInputValue('giveaway_entry_embed_plain_text');
        const giveawayDescription = interaction.fields.getTextInputValue('giveaway_entry_embed_description');

        const targetChannel = interaction.guild.channels.cache.get(channelId) ||
            await interaction.guild.channels.fetch(channelId).catch(() => null);

        if (!targetChannel) {
            return interaction.reply({ content: 'Invalid channel ID. Please try again.', ephemeral: true });
        }

        if (plainText) {
            await targetChannel.send({ content: plainText });
        }

        const giveawayEmbed = new EmbedBuilder()
            .setTitle('**BlightVeil Giveaway Entry!**')
            .setDescription(giveawayDescription)
            .setColor('#00FF00');

        const giveawayButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('giveaway_entry_embed_enter')
                .setLabel('Enter Giveaway')
                .setStyle(ButtonStyle.Success)
        );

        await targetChannel.send({ embeds: [giveawayEmbed], components: [giveawayButton] });
        await interaction.reply({ content: `The giveaway entry has been sent to <#${channelId}>.`, ephemeral: true });
    } catch (error) {
        console.error('Error in handleGiveawayEntryEmbedModal:', error);
        await interaction.reply({ content: 'An error occurred while processing the giveaway entry. Please try again later.', ephemeral: true });
    }
}

async function handleGiveawayEntryEmbedButton(interaction) {
    const giveawayRoleId = '1285780626082893927';
    const restrictedRoleIds = [
        '1180258600132821102',
        '1172216651601694750',
        '1168925938692669554',
        '1168254522980843602',
        '1168221758126567559',
    ];

    const member = interaction.member;

    if (restrictedRoleIds.some(roleId => member.roles.cache.has(roleId))) {
        return interaction.reply({ content: 'You are not eligible to enter the giveaway due to your current role.', ephemeral: true });
    }

    if (member.roles.cache.has(giveawayRoleId)) {
        return interaction.reply({ content: 'You have already entered the giveaway!', ephemeral: true });
    }

    await member.roles.add(giveawayRoleId);
    await interaction.reply({ content: 'You have successfully entered the giveaway!', ephemeral: true });
}

async function handleSelectWinnerButton(interaction) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('winner_modal')
            .setTitle('Select # of Winners & Channel');

        const numberInput = new TextInputBuilder()
            .setCustomId('number_of_winners')
            .setLabel('How many winners should be selected? (1-50)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter a number between 1 and 50')
            .setRequired(true);

        const channelInput = new TextInputBuilder()
            .setCustomId('announcement_channel_id')
            .setLabel('Winner Announcement Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the channel ID where the winners will be announced')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(numberInput),
            new ActionRowBuilder().addComponents(channelInput)
        );

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error in handleSelectWinnerButton:', error);
        await interaction.reply({
            content: 'An error occurred while displaying the modal. Please try again later.',
            ephemeral: true,
        }).catch(console.error); // Catch for expired interactions
    }
}

async function handleWinnerModalSubmit(interaction) {
    if (interaction.customId === 'winner_modal') {
        try {
            const numberOfWinners = parseInt(interaction.fields.getTextInputValue('number_of_winners'));
            const announcementChannelId = interaction.fields.getTextInputValue('announcement_channel_id');

            if (isNaN(numberOfWinners) || numberOfWinners < 1 || numberOfWinners > 50) {
                return await interaction.reply({
                    content: 'Please enter a valid number between 1 and 50 for the number of winners.',
                    ephemeral: true,
                });
            }

            if (!announcementChannelId) {
                return await interaction.reply({
                    content: 'Please enter a valid channel ID for the winner announcement.',
                    ephemeral: true,
                });
            }

            await handleGiveawayWinnerSelection(interaction, numberOfWinners, announcementChannelId);
        } catch (error) {
            console.error('Error in handleWinnerModalSubmit:', error);
            await interaction.reply({
                content: 'An error occurred while processing your submission. Please try again later.',
                ephemeral: true,
            }).catch(console.error); // Catch for expired interactions
        }
    }
}

async function handleGiveawayWinnerSelection(interaction, numberOfWinners, announcementChannelId) {
    const giveawayRoleId = '1285780626082893927'; // ID for the giveaway role

    try {
        await interaction.deferReply({ ephemeral: true }); // Defer the interaction to prevent expiration

        const membersWithGiveawayRole = interaction.guild.members.cache.filter(member =>
            member.roles.cache.has(giveawayRoleId)
        );

        if (membersWithGiveawayRole.size === 0) {
            return await interaction.editReply({
                content: 'No members have entered the giveaway.',
            });
        }

        if (membersWithGiveawayRole.size < numberOfWinners) {
            return await interaction.editReply({
                content: `Not enough members have entered the giveaway to select ${numberOfWinners} winners.`,
            });
        }

        const winners = membersWithGiveawayRole.random(numberOfWinners);
        const announcementChannel = interaction.guild.channels.cache.get(announcementChannelId) || 
            await interaction.guild.channels.fetch(announcementChannelId).catch(() => null);

        if (!announcementChannel || announcementChannel.type !== ChannelType.GuildText) {
            return await interaction.editReply({
                content: 'The giveaway announcement channel is invalid or not a text-based channel.',
            });
        }

        const winnerMentions = winners.map(member => `<@${member.id}>`).join(', ');
        await announcementChannel.send(
            `<@&1168215961757810779> <@&1168214951446454352>\n\nCongratulations ${winnerMentions}, you have won the BlightVeil giveaway!`
        );

        // Remove the giveaway role from all members
        for (const member of membersWithGiveawayRole.values()) {
            await member.roles.remove(giveawayRoleId).catch(console.error); // Catch errors to avoid interruptions
        }

        await interaction.editReply({
            content: `The winners have been announced in <#${announcementChannelId}>.`,
        });

    } catch (error) {
        console.error('Error in handleGiveawayWinnerSelection:', error);
        await interaction.editReply({
            content: 'An error occurred while selecting the winners. Please try again later.',
        }).catch(console.error); // Catch for expired interactions
    }
}

async function handleCancelGiveawayButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('cancel_giveaway_modal')
        .setTitle('Cancel Giveaway');

    const messageIdInput = new TextInputBuilder()
        .setCustomId('giveaway_message_id')
        .setLabel('Giveaway Embed ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter the "Entry" message ID')
        .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(messageIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

async function handleCancelGiveawayModalSubmit(interaction) {
    if (interaction.customId !== 'cancel_giveaway_modal') return;

    const messageId = interaction.fields.getTextInputValue('giveaway_message_id');

    if (!messageId) {
        return interaction.reply({
            content: 'Please provide a valid giveaway embed message ID.',
            ephemeral: true,
        });
    }

    await handleCancelGiveawayConfirmation(interaction, messageId);
}

async function handleCancelGiveawayConfirmation(interaction, messageId) {
    if (!messageId) {
        console.error('No valid Message ID provided to handleCancelGiveawayConfirmation.');
        return interaction.reply({
            content: 'An error occurred: no valid Message ID was provided.',
            ephemeral: true,
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_cancel_giveaway:${messageId}`)
            .setLabel('Confirm Cancelation')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
        content: 'Are you sure you want to cancel the giveaway?',
        components: [row],
        ephemeral: true,
    });
}

async function handleCancelGiveaway(interaction, messageId) {
    const giveawayRoleId = '1285780626082893927';

    try {
        const giveawayChannel = interaction.channel;
        const giveawayMessage = await giveawayChannel.messages.fetch(messageId).catch(() => null);

        if (!giveawayMessage) {
            return interaction.reply({
                content: 'No giveaway entry found with the provided message ID.',
                ephemeral: true,
            });
        }

        await giveawayMessage.delete();

        const membersWithGiveawayRole = interaction.guild.members.cache.filter(member => member.roles.cache.has(giveawayRoleId));
        for (const member of membersWithGiveawayRole.values()) {
            await member.roles.remove(giveawayRoleId);
        }

        await interaction.reply({
            content: 'The giveaway has been canceled, and the entry message has been deleted.',
            ephemeral: true,
        });

    } catch (error) {
        console.error('Error in handleCancelGiveaway:', error);
        await interaction.reply({
            content: 'An error occurred while canceling the giveaway. Please try again later.',
            ephemeral: true,
        });
    }
}
//VC Handlers Start
async function handleTempVCOptionsMenu(interaction, client) {  // Add client parameter
    try {
        const selectedAction = interaction.values[0];
        console.log('Selected VC Option:', selectedAction);

        if (selectedAction === 'rename_vc') {
            const modal = new ModalBuilder()
                .setCustomId('rename-vc-modal')
                .setTitle('Rename Voice Channel')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('new-name')
                            .setLabel('New Voice Channel Name')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            return await interaction.showModal(modal);
        }

        if (selectedAction === 'set_limit') {
            const modal = new ModalBuilder()
                .setCustomId('set-limit-modal')
                .setTitle('Set Occupancy Limit')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('limit')
                            .setLabel('Max Users (0 for no limit)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            return await interaction.showModal(modal);
        }

        if (selectedAction === 'set_region') {
            const regionMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('set-region-menu-main')
                    .setPlaceholder('Choose a voice region...')
                    .addOptions([
                        {
                            label: '🌐 Recommend Best Region',
                            value: 'recommend',
                            description: 'Select a good region for performance',
                        },
                        {
                            label: 'Automatic',
                            value: 'automatic',
                            description: 'Let Discord auto-select',
                        },
                    ])
            );

            return await interaction.reply({
                content: 'Select a region for your voice channel:',
                components: [regionMenu],
                ephemeral: true,
            });
        }

        if (selectedAction === 'set_bitrate') {
            const modal = new ModalBuilder()
                .setCustomId('set-bitrate-modal')
                .setTitle('Set Voice Bitrate')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('bitrate')
                            .setLabel('Bitrate in kbps (8–384)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            return await interaction.showModal(modal);
        }

        if (selectedAction === 'claim_streamer') {
            const requiredRoleId = '1378852093120614430'; // Streamer role ID

            if (!interaction.member.roles.cache.has(requiredRoleId)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use Streamer controls.',
                    ephemeral: true,
                });
            }

            const streamerMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('streamer-control-menu')
                    .setPlaceholder('Select Streamer Control Option')
                    .addOptions([
                        {
                            label: 'Claim Channel',
                            value: 'claim_streamer',
                            description: 'Take control of the voice channel',
                        },
                        {
                            label: 'Release VC',
                            value: 'release_streamer',
                            description: 'Unlock the VC and remove waiting room',
                        },
                    ])
            );

            return await interaction.reply({
                content: '🎛️ Streamer Controls:',
                components: [streamerMenu],
                ephemeral: true,
            });
        }

        if (selectedAction === 'attendance_control') {
            const attendanceRoleId = '1185813396667514891'; // Replace with actual role ID

            if (!interaction.member.roles.cache.has(attendanceRoleId)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use Attendance controls.',
                    ephemeral: true,
                });
            }

            const attendanceMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('attendance-control-menu')
                    .setPlaceholder('Select Attendance Control Option')
                    .addOptions([
                        {
                            label: 'Start Tracking Attendance',
                            value: 'start_attendance',
                            description: 'Begin tracking attendance in this VC',
                        },
                        {
                            label: 'Create Teams',
                            value: 'create_teams',
                            description: 'Shuffle attendees into teams',
                        },
                        {
                            label: 'Manage Teams',
                            value: 'manage_teams',
                            description: 'Remove users from teams',
                        },
                        {
                            label: 'Stop Tracking',
                            value: 'stop_attendance',
                            description: 'Stop attendance tracking',
                        },
                    ])
            );

            return await interaction.reply({
                content: '📊 Attendance Controls:',
                components: [attendanceMenu],
                ephemeral: true,
            });
        }

        // Add the pause VC deletion handler
        if (selectedAction === 'pause_vc_deletion') {
            return await handlePauseVCDeletion(interaction, client);
        }

        // Default fallback
        await interaction.reply({
            content: '⚠️ This action is not yet supported.',
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error handling temp VC options menu interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true,
            });
        }
    }
}

async function handleClaimChannel(interaction) {
  const client = interaction.client; // get client here

  const member = interaction.member;
  const guild = interaction.guild;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: '❌ You must be in a voice channel to claim it.', ephemeral: true });
  }

  if (voiceChannel.members.size !== 1 || !voiceChannel.members.has(member.id)) {
    return interaction.reply({
      content: '❌ You must be the only person in the voice channel to claim it.',
      ephemeral: true,
    });
  }

  try {
    // 🔐 Lock the main channel for @everyone and blocked roles
    await voiceChannel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });

    for (const roleId of blockedRoleIds) {
      await voiceChannel.permissionOverwrites.edit(roleId, { Connect: false });
    }

    // ✅ Give streamer full control
    await voiceChannel.permissionOverwrites.edit(member.id, {
      MuteMembers: true,
      DeafenMembers: true,
      MoveMembers: true,
      Connect: true,
      ViewChannel: true,
      ManageChannels: true,
    });

    // 📋 Setup waiting room permissions
    let overwrites = voiceChannel.permissionOverwrites.cache.map(perm => ({
      id: perm.id,
      allow: perm.allow.bitfield,
      deny: perm.deny.bitfield,
    }));

    // Clean up existing @everyone entry
    overwrites = overwrites.filter(perm => perm.id !== guild.roles.everyone.id);

    overwrites.push({
      id: guild.roles.everyone.id,
      deny: PermissionsBitField.Flags.Connect,
    });

    for (const roleId of blockedRoleIds) {
      let existing = overwrites.find(o => o.id === roleId);
      if (existing) {
        existing.allow |= PermissionsBitField.Flags.Connect | PermissionsBitField.Flags.ViewChannel;
        existing.deny &= ~PermissionsBitField.Flags.Connect;
      } else {
        overwrites.push({
          id: roleId,
          allow: PermissionsBitField.Flags.Connect | PermissionsBitField.Flags.ViewChannel,
        });
      }
    }

    // Add streamer to waiting room
    overwrites.push({
    id: member.id,
    allow:
        PermissionsBitField.Flags.Connect |
        PermissionsBitField.Flags.ViewChannel |
        PermissionsBitField.Flags.ManageChannels |
        PermissionsBitField.Flags.MoveMembers,
    });

    // 🛠 Create waiting room
    const waitingRoomName = `${member.user.username}-waiting-room`;

    const waitingRoom = await guild.channels.create({
      name: waitingRoomName,
      type: ChannelType.GuildVoice,
      parent: voiceChannel.parent,
      permissionOverwrites: overwrites,
    });

    // 🧠 Save claim in client's map
    client.claimedChannels = client.claimedChannels || new Map();
    client.claimedChannels.set(voiceChannel.id, {
      streamerId: member.id,
      waitingRoomId: waitingRoom.id,
      mainChannelId: voiceChannel.id,
    });

    console.log(`🎙️ ${member.user.tag} claimed ${voiceChannel.name}. Waiting Room: ${waitingRoomName}`);

    return interaction.reply({
      content: `✅ You have claimed the voice channel.\n🔒 Waiting room **${waitingRoomName}** created.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('❌ Error in handleClaimChannel:', error);
    return interaction.reply({
      content: 'An error occurred while claiming the channel.',
      ephemeral: true,
    });
  }
}

async function handleReleaseChannel(interaction) {
  const vc = interaction.member.voice.channel;

  if (!vc) {
    return interaction.reply({ content: 'You must be in a voice channel to release it.', ephemeral: true });
  }

  const claim = interaction.client.claimedChannels?.get(vc.id);
  if (!claim || claim.streamerId !== interaction.user.id) {
    return interaction.reply({ content: 'You are not the streamer of this VC or it is not claimed.', ephemeral: true });
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    // Reset @everyone permission overwrite to allow Connect
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      Connect: true,
    });

    // Reset blocked roles if you have a list (optional, include if declared elsewhere)
    if (typeof blockedRoleIds !== 'undefined') {
      for (const roleId of blockedRoleIds) {
        await vc.permissionOverwrites.edit(roleId, {
          Connect: true,
        });
      }
    }

    // Remove streamer's special permissions
    await vc.permissionOverwrites.edit(interaction.user.id, {
      MuteMembers: null,
      DeafenMembers: null,
      MoveMembers: null,
      Connect: null,
      ViewChannel: null,
      ManageChannels: null,
    });

    // Delete the waiting room
    const waitingRoom = interaction.guild.channels.cache.get(claim.waitingRoomId);
    if (waitingRoom && waitingRoom.deletable) {
      await waitingRoom.delete();
    }

    interaction.client.claimedChannels.delete(vc.id);

    await interaction.editReply({
      content: '✅ VC released and waiting room removed. Connect permissions restored.',
    });
  } catch (err) {
    console.error('Error releasing VC:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: '⚠️ Failed to release VC. Please try again or contact staff.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '⚠️ Failed to release VC. Please try again or contact staff.',
        ephemeral: true,
      });
    }
  }
}

async function handleRenameVCModal(interaction) {
    try {
        const newName = interaction.fields.getTextInputValue('new-name').trim();
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply({
                content: 'You are not in a voice channel.',
                ephemeral: true,
            });
            return;
        }

        const emojiMap = {
            '1168239130539458591': '🔵', // BV VC Category
            '1168241121797877954': '🔴', // BVK VC Category
            '1406768598789259388': '🟣', // BV Veiled
        };

        // Determine correct emoji by category ID
        const emoji = emojiMap[voiceChannel.parentId] || '';
        const prefixedName = `${emoji} ${newName}`.trim();

        await voiceChannel.setName(prefixedName);

        await interaction.reply({
            content: `Channel renamed to: **${prefixedName}**.`,
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error during rename operation:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while renaming the channel. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleSetRegionMenu(interaction, type = 'main') {
  try {
    const selected = interaction.values[0];
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel || typeof voiceChannel.setRTCRegion !== 'function') {
      await interaction.reply({
        content: 'You are not in a valid voice channel where region can be set.',
        flags: 64,
      });
      return;
    }

    if (type === 'main') {
      if (selected === 'recommend') {
        // Static recommended regions
        const recommendedRegions = [
          { label: 'US West', value: 'us-west', description: 'Good for west coast US' },
          { label: 'US East', value: 'us-east', description: 'Good for east coast US' },
          { label: 'Europe', value: 'europe', description: 'Europe region' },
          { label: 'Singapore', value: 'singapore', description: 'Asia Pacific' },
          { label: 'Brazil', value: 'brazil', description: 'South America' },
        ];

        const recommendedMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('set-region-menu-recommended')
            .setPlaceholder('Select a recommended region')
            .addOptions(recommendedRegions)
        );

        await interaction.update({
          content: 'Recommended voice regions:',
          components: [recommendedMenu],
        });
        return;
      }

      // Automatic
      await voiceChannel.setRTCRegion(null);
      await interaction.reply({
        content: `Voice channel region set to: **Automatic**.`,
        flags: 64,
      });
      return;
    }

    // Handle selection from recommended list
    if (type === 'recommended') {
      await voiceChannel.setRTCRegion(selected);
      await interaction.reply({
        content: `Voice channel region set to: **${selected}**.`,
        flags: 64,
      });
    }
  } catch (err) {
    console.error('Error setting VC region:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong while setting the region.',
        flags: 64,
      });
    }
  }
}

async function handleSetLimitModal(interaction) {
    try {
        const limitInput = interaction.fields.getTextInputValue('limit');
        const limit = parseInt(limitInput, 10);
        const member = interaction.member;

        if (isNaN(limit) || limit < 0 || limit > 99) {
            await interaction.reply({
                content: 'Invalid limit. Please provide a number between 0 and 99.',
                ephemeral: true,
            });
            return;
        }

        const voiceChannel = member.voice.channel;
        if (voiceChannel) {
            await voiceChannel.setUserLimit(limit);
            await interaction.reply({
                content: `User limit set to: **${limit === 0 ? 'No limit' : limit}**.`,
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content: 'You are not in a voice channel.',
                ephemeral: true,
            });
        }
    } catch (error) {
        console.error('Error handling set limit modal submission:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while setting the occupancy limit. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function loadActiveAttendanceSessions(client) {
    return new Promise(async (resolve, reject) => {
        try {
            const pool = await connectToMySQL();
            const [rows] = await pool.execute(`SELECT * FROM attendance_sessions WHERE active = 1`);
            
            client.attendanceTracking = client.attendanceTracking || new Map();

            for (const session of rows) {
                try {
                    const channel = await client.channels.fetch(session.channel_id);
                    if (channel) {
                        const records = await getAttendanceRecords(session.channel_id);
                        const attendees = new Set(records.map(record => record.user_id));
                        
                        client.attendanceTracking.set(session.channel_id, {
                            active: true,
                            attendees: attendees,
                            messageId: session.message_id,
                            channelId: session.channel_id,
                            startTime: session.start_time,
                            createdBy: session.created_by
                        });
                        
                        console.log(`✅ Reloaded attendance session for channel: ${channel.name}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to reload attendance session for channel ${session.channel_id}:`, error);
                    // Mark session as inactive if channel no longer exists
                    await endAttendanceSession(session.channel_id);
                }
            }
            
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

async function handleAttendanceControlMenu(interaction, client) {
    try {
        const selectedOption = interaction.values[0];
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return await interaction.reply({
                content: '❌ You must be in a voice channel to use attendance controls.',
                ephemeral: true,
            });
        }

        // Check for existing session in database
        const dbSession = await getAttendanceSession(voiceChannel.id);
        
        // Safely initialize attendance tracking
        if (!client.attendanceTracking) {
            client.attendanceTracking = new Map();
        }

        let channelTracking = client.attendanceTracking.get(voiceChannel.id);
        
        // If database session exists but memory doesn't, restore it
        if (dbSession && !channelTracking) {
            const records = await getAttendanceRecords(voiceChannel.id);
            const attendees = new Set(records.map(record => record.user_id));
            
            channelTracking = {
                active: true,
                attendees: attendees,
                messageId: dbSession.message_id,
                channelId: voiceChannel.id,
                startTime: dbSession.start_time,
                createdBy: dbSession.created_by
            };
            client.attendanceTracking.set(voiceChannel.id, channelTracking);
        }

        if (selectedOption === 'start_attendance') {
            if (channelTracking && channelTracking.active) {
                return await interaction.reply({
                    content: '❌ Attendance tracking is already active in this channel.',
                    ephemeral: true,
                });
            }

            // Create attendance check-in message
            const checkInButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`attendance_checkin_${voiceChannel.id}`)
                    .setLabel('✅ Check In')
                    .setStyle(ButtonStyle.Success)
            );

            const attendanceEmbed = new EmbedBuilder()
                .setTitle('📊 Attendance Tracking')
                .setDescription('Click the button below to check in for attendance tracking.')
                .addFields(
                    { 
                        name: 'Current Attendees', 
                        value: 'No attendees yet', 
                        inline: false 
                    },
                    { 
                        name: 'Attendee Count', 
                        value: '0 users', 
                        inline: true 
                    },
                    { 
                        name: 'Status', 
                        value: '🟢 Active', 
                        inline: true 
                    }
                )
                .setColor('#00FF00')
                .setFooter({ text: 'You must be in this voice channel to check in' });

            const message = await voiceChannel.send({
                embeds: [attendanceEmbed],
                components: [checkInButton]
            });

            // Start tracking in memory and database
            channelTracking = {
                active: true,
                attendees: new Set(),
                messageId: message.id,
                channelId: voiceChannel.id,
                startTime: Date.now(),
                createdBy: member.id
            };
            client.attendanceTracking.set(voiceChannel.id, channelTracking);

            // Save to database
            await saveAttendanceSession(voiceChannel.id, message.id, member.id);

            await interaction.reply({
                content: '✅ Attendance tracking started! A check-in message has been sent to the voice channel.',
                ephemeral: true,
            });

        } else if (selectedOption === 'stop_attendance') {
            if (!channelTracking || !channelTracking.active) {
                return await interaction.reply({
                    content: '❌ Attendance tracking is not active in this channel.',
                    ephemeral: true,
                });
            }

            // Verify user is the session creator
            if (channelTracking.createdBy !== member.id) {
                return await interaction.reply({
                    content: '❌ Only the user who started attendance tracking can stop it.',
                    ephemeral: true,
                });
            }

            // Get attendance records from database
            const records = await getAttendanceRecords(voiceChannel.id);
            const attendeeMembers = await Promise.all(
                records.map(async record => {
                    try {
                        return await interaction.guild.members.fetch(record.user_id);
                    } catch (error) {
                        console.error(`Error fetching member ${record.user_id}:`, error);
                        return { displayName: record.display_name || 'Unknown User' };
                    }
                })
            );

            // Calculate session duration
            const durationMs = Date.now() - channelTracking.startTime;
            const durationMinutes = Math.floor(durationMs / (1000 * 60));
            const durationSeconds = Math.floor((durationMs % (1000 * 60)) / 1000);

            // Create final attendance log embed
            const logEmbed = new EmbedBuilder()
                .setTitle('📊 Attendance Log - Session Ended')
                .setDescription(`Attendance tracking completed for voice channel: **${voiceChannel.name}**`)
                .addFields(
                    { 
                        name: 'Session Duration', 
                        value: `${durationMinutes}m ${durationSeconds}s`,
                        inline: true 
                    },
                    { 
                        name: 'Total Attendees', 
                        value: `${records.length} users`, 
                        inline: true 
                    },
                    { 
                        name: 'Tracked by', 
                        value: `${member.displayName}`, 
                        inline: true 
                    },
                    { 
                        name: 'Voice Channel', 
                        value: `${voiceChannel.name}`, 
                        inline: true 
                    },
                    { 
                        name: 'Attendee List', 
                        value: records.length > 0 
                            ? records.map(record => `• ${record.display_name}`).join('\n')
                            : 'No attendees checked in',
                        inline: false 
                    }
                )
                .setColor('#FFA500')
                .setTimestamp()
                .setFooter({ text: 'Attendance Tracking System' });

            // Send to log channel
            const logChannelId = '1420555126258663535'; // Replace with actual channel ID
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            
            if (logChannel) {
                await logChannel.send({ embeds: [logEmbed] });
            } else {
                console.error('Log channel not found. Attendance log not saved.');
            }

            // Stop tracking and clean up
            await endAttendanceSession(voiceChannel.id);
            
            // Try to delete the check-in message
            try {
                const message = await voiceChannel.messages.fetch(channelTracking.messageId);
                await message.delete();
            } catch (error) {
                console.error('Error deleting attendance message:', error);
            }

            client.attendanceTracking.delete(voiceChannel.id);

            await interaction.reply({
                content: '✅ Attendance tracking stopped and data logged.',
                ephemeral: true,
            });

        } else if (selectedOption === 'create_teams') {
            if (!channelTracking || !channelTracking.active || channelTracking.attendees.size === 0) {
                return await interaction.reply({
                    content: '❌ No active attendance tracking with attendees to create teams from.',
                    ephemeral: true,
                });
            }

            // Get member objects for all attendees from database
            const records = await getAttendanceRecords(voiceChannel.id);
            const attendeeMembers = await Promise.all(
                records.map(async record => {
                    try {
                        return await interaction.guild.members.fetch(record.user_id);
                    } catch (error) {
                        console.error(`Error fetching member ${record.user_id}:`, error);
                        return { id: record.user_id, displayName: record.display_name || 'Unknown User' };
                    }
                })
            );
            
            // Shuffle attendees and create teams
            const shuffled = [...attendeeMembers].sort(() => Math.random() - 0.5);
            
            // Create 2 teams (adjust as needed)
            const teamSize = Math.ceil(shuffled.length / 2);
            const team1 = shuffled.slice(0, teamSize);
            const team2 = shuffled.slice(teamSize);

            const teamsEmbed = new EmbedBuilder()
                .setTitle('🏆 Teams Assignment')
                .setDescription(`Shuffled ${shuffled.length} attendees into teams`)
                .addFields(
                    { 
                        name: `🔴 Team 1 (${team1.length} players)`, 
                        value: team1.length > 0 
                            ? team1.map(member => `• ${member.displayName}`).join('\n')
                            : 'No members',
                        inline: true 
                    },
                    { 
                        name: `🔵 Team 2 (${team2.length} players)`, 
                        value: team2.length > 0 
                            ? team2.map(member => `• ${member.displayName}`).join('\n')
                            : 'No members',
                        inline: true 
                    }
                )
                .setColor('#0099FF')
                .setFooter({ text: 'Use "Manage Teams" to remove users from teams' });

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`attendance_reshuffle_${voiceChannel.id}`)
                    .setLabel('🔄 Reshuffle Teams')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`attendance_manage_${voiceChannel.id}`)
                    .setLabel('👥 Manage Teams')
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                embeds: [teamsEmbed],
                components: [actionRow],
                ephemeral: false,
            });

        } else if (selectedOption === 'manage_teams') {
            if (!channelTracking || !channelTracking.active || channelTracking.attendees.size === 0) {
                return await interaction.reply({
                    content: '❌ No active attendance tracking with attendees to manage.',
                    ephemeral: true,
                });
            }

            // Verify user is the session creator
            if (channelTracking.createdBy !== member.id) {
                return await interaction.reply({
                    content: '❌ Only the user who started attendance tracking can manage teams.',
                    ephemeral: true,
                });
            }

            // Get current attendees for removal selection
            const records = await getAttendanceRecords(voiceChannel.id);
            
            if (records.length === 0) {
                return await interaction.reply({
                    content: '❌ No attendees to manage.',
                    ephemeral: true,
                });
            }

            const attendeeOptions = records.map(record => ({
                label: record.display_name.substring(0, 25),
                value: record.user_id,
                description: `Remove ${record.display_name} from teams`
            }));

            const removeMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`attendance_remove_${voiceChannel.id}`)
                    .setPlaceholder('Select users to remove from teams...')
                    .setMinValues(1)
                    .setMaxValues(attendeeOptions.length)
                    .addOptions(attendeeOptions)
            );

            await interaction.reply({
                content: '**👥 Manage Teams**\nSelect users to remove from attendance tracking:',
                components: [removeMenu],
                ephemeral: true,
            });
        }

    } catch (error) {
        console.error('Error handling attendance control:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing attendance controls.',
            ephemeral: true,
        });
    }
}

async function handleAttendanceCheckIn(interaction, client) {
    try {
        // Safely initialize if needed
        if (!client.attendanceTracking) {
            client.attendanceTracking = new Map();
        }
        
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
            return await interaction.reply({
                content: '❌ You must be in the voice channel to check in.',
                ephemeral: true,
            });
        }
        
        // Extract channel ID from customId (attendance_checkin_CHANNELID)
        const channelId = interaction.customId.replace('attendance_checkin_', '');
        
        // Check database first, then memory
        let channelTracking = client.attendanceTracking.get(channelId);
        if (!channelTracking) {
            const dbSession = await getAttendanceSession(channelId);
            if (dbSession) {
                const records = await getAttendanceRecords(channelId);
                const attendees = new Set(records.map(record => record.user_id));
                
                channelTracking = {
                    active: true,
                    attendees: attendees,
                    messageId: dbSession.message_id,
                    channelId: channelId,
                    startTime: dbSession.start_time,
                    createdBy: dbSession.created_by
                };
                client.attendanceTracking.set(channelId, channelTracking);
            }
        }
        
        if (!channelTracking || !channelTracking.active) {
            return await interaction.reply({
                content: '❌ Attendance tracking is not active in this channel.',
                ephemeral: true,
            });
        }
        
        // Verify user is in the correct voice channel
        if (voiceChannel.id !== channelId) {
            return await interaction.reply({
                content: '❌ You must be in the correct voice channel to check in.',
                ephemeral: true,
            });
        }
        
        // Add user to attendees if not already there
        if (!channelTracking.attendees.has(member.id)) {
            channelTracking.attendees.add(member.id);
            
            // Save to database
            await saveAttendanceRecord(channelId, member.id, member.displayName);
            
            // Update the attendance message
            try {
                const message = await voiceChannel.messages.fetch(channelTracking.messageId);
                const embed = message.embeds[0];
                
                // Get current records from database for accurate count
                const records = await getAttendanceRecords(channelId);
                
                // Create updated embed
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(embed.title)
                    .setDescription(embed.description)
                    .setColor(embed.color)
                    .setFooter(embed.footer);
                
                const attendeeList = records.length > 0 
                    ? records.map(record => `• ${record.display_name}`).join('\n')
                    : 'No attendees yet';
                
                updatedEmbed.addFields(
                    { 
                        name: 'Current Attendees', 
                        value: attendeeList, 
                        inline: false 
                    },
                    { 
                        name: 'Attendee Count', 
                        value: `${records.length} users`, 
                        inline: true 
                    },
                    { 
                        name: 'Status', 
                        value: '🟢 Active', 
                        inline: true 
                    }
                );
                
                await message.edit({ embeds: [updatedEmbed] });
                
            } catch (error) {
                console.error('Error updating attendance message:', error);
            }
            
            await interaction.reply({
                content: '✅ You have been checked in for attendance tracking!',
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content: '✅ You are already checked in!',
                ephemeral: true,
            });
        }
        
    } catch (error) {
        console.error('Error handling attendance check-in:', error);
        await interaction.reply({
            content: '❌ An error occurred while checking in.',
            ephemeral: true,
        });
    }
}

async function handleAttendanceReshuffle(interaction, client) {
    try {
        const channelId = interaction.customId.replace('attendance_reshuffle_', '');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel || voiceChannel.id !== channelId) {
            return await interaction.reply({
                content: '❌ You must be in the voice channel to reshuffle teams.',
                ephemeral: true,
            });
        }
        
        const channelTracking = client.attendanceTracking.get(channelId);
        
        if (!channelTracking || !channelTracking.active || channelTracking.attendees.size === 0) {
            return await interaction.reply({
                content: '❌ No active attendance tracking with attendees to reshuffle.',
                ephemeral: true,
            });
        }
        
        // Get member objects for all attendees from database
        const records = await getAttendanceRecords(channelId);
        const attendeeMembers = await Promise.all(
            records.map(async record => {
                try {
                    return await interaction.guild.members.fetch(record.user_id);
                } catch (error) {
                    console.error(`Error fetching member ${record.user_id}:`, error);
                    return { id: record.user_id, displayName: record.display_name || 'Unknown User' };
                }
            })
        );
        
        // Filter out any failed fetches
        const validAttendees = attendeeMembers.filter(member => member !== null);
        
        // Shuffle attendees and create teams
        const shuffled = [...validAttendees].sort(() => Math.random() - 0.5);
        
        // Create 2 teams (adjust as needed)
        const teamSize = Math.ceil(shuffled.length / 2);
        const team1 = shuffled.slice(0, teamSize);
        const team2 = shuffled.slice(teamSize);
        
        const teamsEmbed = new EmbedBuilder()
            .setTitle('🏆 Teams Assignment (Reshuffled)')
            .setDescription(`Reshuffled ${shuffled.length} attendees into teams`)
            .addFields(
                { 
                    name: `🔴 Team 1 (${team1.length} players)`, 
                    value: team1.length > 0 
                        ? team1.map(member => `• ${member.displayName}`).join('\n')
                        : 'No members',
                    inline: true 
                },
                { 
                    name: `🔵 Team 2 (${team2.length} players)`, 
                    value: team2.length > 0 
                        ? team2.map(member => `• ${member.displayName}`).join('\n')
                        : 'No members',
                    inline: true 
                }
            )
            .setColor('#0099FF')
            .setFooter({ text: 'Use "Manage Teams" to remove users from teams' });
        
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`attendance_reshuffle_${channelId}`)
                .setLabel('🔄 Reshuffle Teams')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`attendance_manage_${channelId}`)
                .setLabel('👥 Manage Teams')
                .setStyle(ButtonStyle.Secondary)
        );
        
        await interaction.update({
            embeds: [teamsEmbed],
            components: [actionRow],
        });
        
    } catch (error) {
        console.error('Error handling attendance reshuffle:', error);
        await interaction.reply({
            content: '❌ An error occurred while reshuffling teams.',
            ephemeral: true,
        });
    }
}

async function handleAttendanceRemoveUsers(interaction, client) {
    try {
        const channelId = interaction.customId.replace('attendance_remove_', '');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel || voiceChannel.id !== channelId) {
            return await interaction.reply({
                content: '❌ You must be in the voice channel to manage teams.',
                ephemeral: true,
            });
        }
        
        const channelTracking = client.attendanceTracking.get(channelId);
        
        if (!channelTracking || !channelTracking.active) {
            return await interaction.reply({
                content: '❌ No active attendance tracking session.',
                ephemeral: true,
            });
        }
        
        // Verify user is the session creator
        if (channelTracking.createdBy !== member.id) {
            return await interaction.reply({
                content: '❌ Only the user who started attendance tracking can manage teams.',
                ephemeral: true,
            });
        }
        
        const selectedUserIds = interaction.values;
        
        // Remove selected users from database and memory
        for (const userId of selectedUserIds) {
            await removeAttendanceRecord(channelId, userId);
            channelTracking.attendees.delete(userId);
        }
        
        // Get updated records
        const remainingRecords = await getAttendanceRecords(channelId);
        
        await interaction.reply({
            content: `✅ Removed ${selectedUserIds.length} user(s) from attendance tracking. ${remainingRecords.length} users remaining.`,
            ephemeral: true,
        });
        
        // Update the attendance message if it exists
        try {
            const message = await voiceChannel.messages.fetch(channelTracking.messageId);
            const embed = message.embeds[0];
            
            const updatedEmbed = new EmbedBuilder()
                .setTitle(embed.title)
                .setDescription(embed.description)
                .setColor(embed.color)
                .setFooter(embed.footer);
            
            const attendeeList = remainingRecords.length > 0 
                ? remainingRecords.map(record => `• ${record.display_name}`).join('\n')
                : 'No attendees yet';
            
            updatedEmbed.addFields(
                { 
                    name: 'Current Attendees', 
                    value: attendeeList, 
                    inline: false 
                },
                { 
                    name: 'Attendee Count', 
                    value: `${remainingRecords.length} users`, 
                    inline: true 
                },
                { 
                    name: 'Status', 
                    value: '🟢 Active', 
                    inline: true 
                }
            );
            
            await message.edit({ embeds: [updatedEmbed] });
            
        } catch (error) {
            console.error('Error updating attendance message:', error);
        }
        
    } catch (error) {
        console.error('Error handling attendance user removal:', error);
        await interaction.reply({
            content: '❌ An error occurred while removing users.',
            ephemeral: true,
        });
    }
}

async function handleAttendanceManage(interaction, client) {
    try {
        const channelId = interaction.customId.replace('attendance_manage_', '');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel || voiceChannel.id !== channelId) {
            return await interaction.reply({
                content: '❌ You must be in the voice channel to manage teams.',
                ephemeral: true,
            });
        }
        
        const channelTracking = client.attendanceTracking.get(channelId);
        
        if (!channelTracking || !channelTracking.active || channelTracking.attendees.size === 0) {
            return await interaction.reply({
                content: '❌ No active attendance tracking with attendees to manage.',
                ephemeral: true,
            });
        }
        
        // Verify user is the session creator
        if (channelTracking.createdBy !== member.id) {
            return await interaction.reply({
                content: '❌ Only the user who started attendance tracking can manage teams.',
                ephemeral: true,
            });
        }
        
        // Get current attendees for removal selection
        const records = await getAttendanceRecords(channelId);
        
        if (records.length === 0) {
            return await interaction.reply({
                content: '❌ No attendees to manage.',
                ephemeral: true,
            });
        }
        
        const attendeeOptions = records.map(record => ({
            label: record.display_name.substring(0, 25),
            value: record.user_id,
            description: `Remove ${record.display_name} from attendance`
        }));
        
        const removeMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`attendance_remove_${channelId}`)
                .setPlaceholder('Select users to remove from attendance...')
                .setMinValues(1)
                .setMaxValues(attendeeOptions.length)
                .addOptions(attendeeOptions)
        );
        
        await interaction.reply({
            content: '**👥 Manage Attendance**\nSelect users to remove from attendance tracking:',
            components: [removeMenu],
            ephemeral: true,
        });
        
    } catch (error) {
        console.error('Error handling attendance manage:', error);
        await interaction.reply({
            content: '❌ An error occurred while managing attendance.',
            ephemeral: true,
        });
    }
}
//VC Handlers End




async function handleSpecialtySelection(interaction) {
    const selectedSpecialty = interaction.values[0];
    const userId = interaction.user.id;
    const member = await interaction.guild.members.fetch(userId);

    const allowedRoles = [
        '1173822659071578182', '1173822697956982794', '1173822842442367026',
        '1168327555917557780', '1168327592269598760', '1168327699203375114',
        '1168327804874661931',
    ];

    if (!allowedRoles.some(roleId => member.roles.cache.has(roleId))) {
        return interaction.reply({
            content: 'You do not have permission to use this menu.',
            ephemeral: true,
        });
    }

    await interaction.deferUpdate();

    const specialtyData = {
        pilot_specialties: {
            title: 'Select a Pilot Specialty',
            buttons: [
                { label: 'Brawler', customId: 'pilot_brawler' },
                { label: 'Striker', customId: 'pilot_striker' },
                { label: 'Scout', customId: 'pilot_scout' },
            ],
        },
        infantry_specialties: {
            title: 'Select an Infantry Specialty',
            buttons: [
                { label: 'LRS', customId: 'infantry_lrs' },
                { label: 'CQB', customId: 'infantry_cqb' },
                { label: 'Cracked Infantry', customId: 'infantry_cracked' },
                { label: 'Advanced Infantry', customId: 'infantry_advanced' },
                { label: 'Main Infantry', customId: 'infantry_main' },
                { label: 'Secondary Infantry', customId: 'infantry_secondary' },
            ],
        },
        crewman_specialties: {
            title: 'Select a Crewman Specialty',
            buttons: [
                { label: 'ATG', customId: 'crewman_atg' },
                { label: 'Helmsman', customId: 'crewman_hm'},
                { label: 'Engineer', customId: 'crewman_engineer' },
                { label: 'Bombardier', customId: 'crewman_bombardier' },
            ],
        },
        tradesman_specialties: {
            title: 'Select a Support Specialty',
            buttons: [
                //{ label: 'Steelrite', customId: 'tradesman_architect' },
                { label: 'Salvager', customId: 'tradesman_salvager' },
                { label: 'Interdictor', customId: 'tradesman_interdictor' },
                { label: 'Acquisitor', customId: 'tradesman_acquisitor' },
                { label: 'Miner', customId: 'tradesman_miner' },
            ],
        },
    };

    const specialty = specialtyData[selectedSpecialty];
    if (!specialty) {
        return interaction.editReply({
            content: 'Invalid selection. Please try again.',
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(specialty.title)
        .setColor(Colors.Blurple);

    // Split buttons into chunks of maximum 5 per row
    const buttonChunks = [];
    for (let i = 0; i < specialty.buttons.length; i += 5) {
        buttonChunks.push(specialty.buttons.slice(i, i + 5));
    }

    // Create action rows for each chunk
    const buttonRows = buttonChunks.map(chunk =>
        new ActionRowBuilder().addComponents(
            chunk.map(button =>
                new ButtonBuilder()
                    .setLabel(button.label)
                    .setCustomId(button.customId)
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    );

    const updatedDropdownRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('grant_specialty_select')
            .setPlaceholder('Make a selection')
            .addOptions([
                { label: 'Pilot Specialties', value: 'pilot_specialties' },
                { label: 'Infantry Specialties', value: 'infantry_specialties' },
                { label: 'Crewman Specialties', value: 'crewman_specialties' },
                { label: 'Support Specialties', value: 'tradesman_specialties' },
            ])
    );

    await interaction.message.edit({
        components: [updatedDropdownRow],
    });

    await interaction.followUp({
        embeds: [embed],
        components: buttonRows, // Use the array of button rows
        ephemeral: true,
    });
}

async function handleSpecialtyButton(interaction) {
    const buttonId = interaction.customId;
    const roleMappings = {
        pilot_brawler: { roles: ['1314624882746593371', '1314636682120925295'], label: 'Brawler' },
        pilot_striker: { roles: ['1314624882746593371', '1314636684918526033'], label: 'Striker' },
        infantry_lrs: { roles: ['1314624886647427184', '1314636695383179354'], label: 'LRS' },
        infantry_cqb: { roles: ['1314624886647427184', '1314636698176585778'], label: 'CQB' },
        infantry_advanced: { roles: ['1314624886647427184', '1426132300298584115'], label: 'Advanced Infantry' },
        infantry_cracked: { roles: ['1314624886647427184', '1317200975097761833'], label: 'Cracked Infantry' },
        infantry_main: { roles: ['1314624886647427184', '1168285299416248422'], label: 'Main Infantry' },
        infantry_secondary: { roles: ['1314624886647427184', '1285585932417761320'], label: 'Secondary Infantry' },
        crewman_atg: { roles: ['1314624890648657996', '1314636710235340880'], label: 'ATG' },
        crewman_hm:  { roles: ['1314624890648657996', '1314636662151843952'], label: 'Helmsman'},
        crewman_engineer: { roles: ['1314624890648657996', '1314636712819032155'], label: 'Engineer' },
        crewman_bombardier: { roles: ['1314624890648657996', '1314636715683745822'], label: 'Bombardier' },
        tradesman_architect: { roles: ['1314624893731602544', '1314636725687160926'], label: 'Steelrite' },
        tradesman_salvager: { roles: ['1314624893731602544', '1314636728660787340'], label: 'Salvager' },
        tradesman_interdictor: { roles: ['1314624882746593371', '1314636690589220925'], label: 'Interdictor' },
        tradesman_acquisitor: { roles: ['1314624882746593371', '1314636690589220925'], label: 'Acquisitor' },
        tradesman_miner: { roles: ['1314624893731602544', '1314636723052875917'], label: 'Miner' },
    };

    const selectedRole = roleMappings[buttonId];
    if (!selectedRole) {
        return interaction.reply({ content: 'Invalid button selection.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(`userSelect_${buttonId}`)
            .setPlaceholder(`Select members for ${selectedRole.label}`)
            .setMinValues(1) // Minimum number of members to select
            .setMaxValues(25) // Adjust this value based on your needs
    );

    await interaction.reply({
        content: `Please select members to grant the "${selectedRole.label}" specialty.`,
        components: [row],
        ephemeral: true,
    });
}

async function handleSpecialtyMenu(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const buttonId = interaction.customId.replace('userSelect_', '');

        const roleMappings = {
            pilot_brawler: { roles: ['1314624882746593371', '1314636682120925295'], label: 'Brawler' },
            pilot_striker: { roles: ['1314624882746593371', '1314636684918526033'], label: 'Striker' },
            pilot_scout: { roles: ['1314624882746593371', '1314636688038826075'], label: 'Scout' },
            pilot_main: { roles: ['1314624882746593371', '1168285269926101103'], label: 'Main Pilot' },
            infantry_lrs: { roles: ['1314624886647427184', '1314636695383179354'], label: 'LRS' },
            infantry_cqb: { roles: ['1314624886647427184', '1314636698176585778'], label: 'CQB' },
            infantry_advanced: { roles: ['1314624886647427184', '1426132300298584115'], label: 'Advanced Infantry' },
            infantry_cracked: { roles: ['1314624886647427184', '1317200975097761833'], label: 'Cracked Infantry' },
            infantry_main: { roles: ['1314624886647427184', '1168285299416248422'], label: 'Main Infantry' },
            infantry_secondary: { roles: ['1314624886647427184', '1285585932417761320'], label: 'Secondary Infantry' },
            crewman_atg: { roles: ['1314624890648657996', '1314636710235340880'], label: 'ATG' },
            crewman_hm:  { roles: ['1314624890648657996', '1314636662151843952'], label: 'Helmsman'},
            crewman_engineer: { roles: ['1314624890648657996', '1314636712819032155'], label: 'Engineer' },
            crewman_bombardier: { roles: ['1314624890648657996', '1314636715683745822'], label: 'Bombardier' },
            tradesman_architect: { roles: ['1314624893731602544', '1314636725687160926'], label: 'Steelrite' },
            tradesman_salvager: { roles: ['1314624893731602544', '1314636728660787340'], label: 'Salvager' },
            tradesman_interdictor: { roles: ['1314624882746593371', '1314636690589220925'], label: 'Interdictor' },
            tradesman_acquisitor: { roles: ['1314624882746593371', '1314636690589220925'], label: 'Acquisitor' },
            tradesman_miner: { roles: ['1314624893731602544', '1314636723052875917'], label: 'Miner' },
        };

        const combinationMappings = [
           //{
           //     requiredRoles: ['1314636682120925295', '1314636710235340880'],
           //     resultingRole: '1314636662151843952',
           //     label: 'Helmsman',
           // },
            {
                requiredRoles: ['1314636690589220925', '1314636720498675782'],
                resultingRole: '1314636665179869276',
                label: 'Pirate',
            },
        ];

        const selectedSpecialty = roleMappings[buttonId];
        if (!selectedSpecialty) {
            return interaction.reply({ content: 'Invalid specialty selection.', ephemeral: true });
        }

        const selectedMembers = interaction.values; // Array of selected user IDs
        const guild = interaction.guild;

        const approvalChannelId = '1314966969791021096'; // Approval channel
        const approvalChannel = await guild.channels.fetch(approvalChannelId);

        const requestingUser = interaction.user; // User who submitted the interaction
        const invalidMembers = []; // Collect invalid users

        for (const memberId of selectedMembers) {
            const member = await guild.members.fetch(memberId).catch(() => null);
            if (!member) {
                invalidMembers.push(memberId);
                continue;
            }

            const grantedCombinationRoles = [];
            for (const combination of combinationMappings) {
                const hasRequiredRoles = combination.requiredRoles.every(roleId => member.roles.cache.has(roleId));
                const alreadyHasCombination = member.roles.cache.has(combination.resultingRole);

                if (hasRequiredRoles && !alreadyHasCombination) {
                    grantedCombinationRoles.push(combination.label);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('Specialty Grant Request')
                .setDescription(
                    `**Member:** ${member}\n**Specialty:** ${selectedSpecialty.label}\n` +
                    (grantedCombinationRoles.length > 0
                        ? `**Combination Specialties (New):** ${grantedCombinationRoles.join(', ')}\n`
                        : '') +
                    `**Requested By:** ${requestingUser}`
                )
                .setColor(Colors.Blue);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approveSpecialtyGrant_${member.id}_${buttonId}`)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`denySpecialtyGrant_${member.id}_${buttonId}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
            );

            await approvalChannel.send({ embeds: [embed], components: [row] });
        }

        if (invalidMembers.length > 0) {
            const invalidList = invalidMembers.join(', ');
            await interaction.editReply({
                content: `Some members could not be processed: ${invalidList}. Valid requests have been submitted.`,
                ephemeral: true,
            });
        } else {
            await interaction.editReply({ content: 'Specialty grant requests submitted for approval.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error in handleSpecialtyMenu:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing the specialty grant.', ephemeral: true });
        }
    }
}

async function handleSpecialtyApproval(interaction) {
    try {
        const [action, memberId, ...specialtyParts] = interaction.customId.split('_');
        const specialtyKey = specialtyParts.join('_');

        console.log(`Action: ${action}`);
        console.log(`Member ID: ${memberId}`);
        console.log(`Specialty Key: ${specialtyKey}`);

        const member = await interaction.guild.members.fetch(memberId);
        if (!member) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Member not found.', ephemeral: true });
            }
            return;
        }

        const roleMappings = {
            pilot_brawler: { roles: ['1314624882746593371', '1314636682120925295'], specificRoles: ['1314636682120925295'], label: 'Brawler' },
            pilot_striker: { roles: ['1314624882746593371', '1314636684918526033'], specificRoles: ['1314636684918526033'], label: 'Striker' },
            pilot_scout: { roles: ['1314624882746593371', '1314636688038826075'], specificRoles: ['1314636688038826075'], label: 'Scout' },
            pilot_main: { roles: ['1314624882746593371', '1168285269926101103'], specificRoles: ['1168285269926101103'], label: 'Main Pilot' },
            infantry_lrs: { roles: ['1314624886647427184', '1314636695383179354'], specificRoles: ['1314636695383179354'], label: 'LRS', trainingLink: '1250636644797907015' },
            infantry_cqb: { roles: ['1314624886647427184', '1314636698176585778'], specificRoles: ['1314636698176585778'], label: 'CQB', trainingLink: '1314841392035397682' },
            infantry_advanced: { roles: ['1314624886647427184', '1426132300298584115'], specificRoles: ['1426132300298584115'], label: 'Advanced Infantry' },
            infantry_main: { roles: ['1314624886647427184', '1168285299416248422'], specificRoles: ['1168285299416248422'], label: 'Main Infantry' },
            infantry_cracked: { roles: ['1314624886647427184', '1317200975097761833'], specificRoles: ['1317200975097761833'], label: 'Cracked Infantry' },
            infantry_secondary: { roles: ['1314624886647427184', '1285585932417761320'], specificRoles: ['1285585932417761320'], label: 'Secondary Infantry' },
            crewman_atg: { roles: ['1314624890648657996', '1314636710235340880'], specificRoles: ['1314636710235340880'], label: 'ATG' },
            crewman_hm: { roles: ['1314624890648657996', '1314636662151843952'], specificRoles: ['1314636662151843952'], label: 'HM' },
            crewman_engineer: { roles: ['1314624890648657996', '1314636712819032155'], specificRoles: ['1314636712819032155'], label: 'Engineer' },
            crewman_bombardier: { roles: ['1314624890648657996', '1314636715683745822'], specificRoles: ['1314636715683745822'], label: 'Bombardier' },
            tradesman_architect: { roles: ['1314624893731602544', '1314636725687160926'], specificRoles: ['1314636725687160926'], label: 'Steelrite' },
            tradesman_salvager: { roles: ['1314624893731602544', '1314636728660787340'], specificRoles: ['1314636728660787340'], label: 'Salvager' },
            tradesman_interdictor: { roles: ['1314624882746593371', '1314636690589220925'], specificRoles: ['1314636690589220925'], label: 'Interdictor' },
            tradesman_miner: { roles: ['1314624893731602544', '1314636723052875917'], specificRoles: ['1314636723052875917'], label: 'Miner' },
            tradesman_acquisitor: { roles: ['1314624882746593371', '1314636690589220925'], specificRoles: ['1314636690589220925'], label: 'Acquisitor' },
        };

        const combinationMappings = [
            {
                requiredRoles: ['1314636690589220925', '1314636720498675782'],
                resultingRole: '1314636665179869276',
                label: 'Pirate',
            },
        ];

        const categoryParentRoles = [
            '1314624882746593371', // Pilot Parent Role
            '1314624886647427184', // Infantry Parent Role
            '1314624890648657996', // Crewman Parent Role
            '1314624893731602544', // Tradesman Parent Role
        ];
        const multiSpecialistRole = '1314625098078097428';

        const selectedSpecialty = roleMappings[specialtyKey];
        if (!selectedSpecialty) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Invalid specialty.', ephemeral: true });
            }
            return;
        }

        // Ensure specificRoles exists, default to empty array if not defined
        if (!selectedSpecialty.specificRoles) {
            selectedSpecialty.specificRoles = [];
        }

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        if (!embed) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Embed not found.', ephemeral: true });
            }
            return;
        }

        const approver = interaction.user;

        if (action === 'approveSpecialtyGrant') {
            if (!interaction.deferred) await interaction.deferUpdate();

            // Check if member already has the specialty (only check if specificRoles is defined)
            if (selectedSpecialty.specificRoles && selectedSpecialty.specificRoles.length > 0) {
                const alreadyHasSpecialty = selectedSpecialty.specificRoles.some(roleId => member.roles.cache.has(roleId));
                if (alreadyHasSpecialty) {
                    embed.setColor(Colors.Orange);
                    embed.addFields([{ name: 'Status', value: `Member already has the specialty.` }]);
                    await interaction.editReply({ embeds: [embed], components: [] });
                    return;
                }
            }

            // Add all roles in the specialty
            for (const roleId of selectedSpecialty.roles) {
                await member.roles.add(roleId);
            }

            const achievementsChannelId = '1303837974521315449';
            const achievementsChannel = await interaction.guild.channels.fetch(achievementsChannelId);

            const newlyGrantedCombinationRoles = [];
            for (const combination of combinationMappings) {
                const hasRequiredRoles = combination.requiredRoles.every(roleId => member.roles.cache.has(roleId));
                const alreadyHasCombination = member.roles.cache.has(combination.resultingRole);

                if (hasRequiredRoles && !alreadyHasCombination) {
                    await member.roles.add(combination.resultingRole);
                    newlyGrantedCombinationRoles.push(combination.label);

                    const comboEmbed = new EmbedBuilder()
                        .setTitle(`${combination.label} Specialty Achieved`)
                        .setDescription(`${member} has successfully acquired the ${combination.label} specialty.`)
                        .setColor('#04909c');

                    await achievementsChannel.send({ content: `${member}`, embeds: [comboEmbed] });
                }
            }

            const hasMultiSpecialistRole = member.roles.cache.has(multiSpecialistRole);

            if (hasMultiSpecialistRole) {
                const existingParentRoles = member.roles.cache.filter(role => categoryParentRoles.includes(role.id));
                for (const role of existingParentRoles.values()) {
                    await member.roles.remove(role.id);
                }
            } else {
                const existingParentRoles = member.roles.cache.filter(role => categoryParentRoles.includes(role.id));
                const hasMultipleParentRoles =
                    existingParentRoles.size > 1 ||
                    (existingParentRoles.size === 1 && !selectedSpecialty.roles.includes(existingParentRoles.first().id));

                if (hasMultipleParentRoles) {
                    for (const role of existingParentRoles.values()) {
                        await member.roles.remove(role.id);
                    }
                    await member.roles.add(multiSpecialistRole);
                } else {
                    const parentRole = selectedSpecialty.roles.find(roleId => categoryParentRoles.includes(roleId));
                    if (parentRole && !member.roles.cache.has(parentRole)) {
                        await member.roles.add(parentRole);
                    }
                }
            }

            const trainingLink = selectedSpecialty.trainingLink
                ? `\n\n**Training Material:** <#${selectedSpecialty.trainingLink}>`
                : '';

            embed.setColor('#00FF00');
            embed.addFields([{
                name: 'Status',
                value: `Approved by ${approver}`
            },
            ...(newlyGrantedCombinationRoles.length > 0
                ? [{ name: 'New Combination Specialties Granted', value: newlyGrantedCombinationRoles.join(', '), inline: false }]
                : []),
            ]);

            const announcementEmbed = new EmbedBuilder()
                .setTitle(`${selectedSpecialty.label} Specialty Achieved`)
                .setDescription(
                    `${member} has successfully acquired the ${selectedSpecialty.label} specialty.${trainingLink}` +
                    (newlyGrantedCombinationRoles.length > 0
                        ? `\n\n**Combination Specialties:** ${newlyGrantedCombinationRoles.join(', ')}` : '')
                )
                .setColor('#04909c');

            await achievementsChannel.send({ content: `${member}`, embeds: [announcementEmbed] });

            await interaction.editReply({ embeds: [embed], components: [] });
        } else if (action === 'denySpecialtyGrant') {
            if (!interaction.deferred) await interaction.deferUpdate();

            embed.setColor(Colors.Red);
            embed.addFields([{ name: 'Status', value: `Denied by ${approver}` }]);

            await interaction.editReply({ embeds: [embed], components: [] });
        }
    } catch (error) {
        console.error('Error in handleSpecialtyApproval:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing this action.', ephemeral: true });
        }
    }
}

async function handleCrackedRoleSelection(interaction) {
    try {
        console.log('Handling cracked role selection with customId:', interaction.customId);

        const roleMapping = {
            cracked_pilot: {
                roleId: '1317200936854355968', // Cracked Pilot role ID
                label: 'Cracked Pilot',
            },
            cracked_infantry: {
                roleId: '1317200975097761833', // Cracked Infantry role ID
                label: 'Cracked Infantry',
            },
        };

        const selectedOption = interaction.values[0]; // Get the selected value from the select menu
        const roleData = roleMapping[selectedOption];

        if (!roleData) {
            console.error(`No role mapping found for selected option: ${selectedOption}`);
            await interaction.reply({
                content: 'Invalid selection. Please try again.',
                ephemeral: true,
            });
            return;
        }

        // Create the user-select menu
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`assign_cracked_role_${roleData.roleId}`)
                .setPlaceholder(`Select member(s) to grant ${roleData.label}`)
                .setMinValues(1)
                .setMaxValues(25) // Allow multiple selections
        );

        // Reset the original dropdown menu to its placeholder state
        const resetDropdownRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('grant_cracked_roles_select')
                .setPlaceholder('Select a role to grant')
                .addOptions([
                    { label: 'Cracked Pilot', value: 'cracked_pilot' },
                    { label: 'Cracked Infantry', value: 'cracked_infantry' },
                ])
        );

        // Update the original message to reset the dropdown menu
        await interaction.message.edit({
            components: [resetDropdownRow],
        });

        // Send the ephemeral menu to the user
        await interaction.reply({
            content: `Please select the member(s) to grant the ${roleData.label} role.`,
            components: [row],
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error in handleCrackedRoleSelection:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleCrackedRoleAssignment(interaction) {
    try {
        console.log('Handling cracked role assignment with customId:', interaction.customId);

        const roleId = interaction.customId.split('_')[3]; // Extract role ID from the customId
        const selectedMembers = interaction.values; // Selected user IDs

        if (!roleId || selectedMembers.length === 0) {
            console.error('Invalid role ID or no users selected.');
            await interaction.reply({
                content: 'Failed to process your request. Ensure you selected valid members.',
                ephemeral: true,
            });
            return;
        }

        const guild = interaction.guild;
        const role = await guild.roles.fetch(roleId);

        if (!role) {
            console.error(`Role with ID ${roleId} not found.`);
            await interaction.reply({
                content: 'The selected role could not be found. Please contact an administrator.',
                ephemeral: true,
            });
            return;
        }

        const approvalChannelId = '1314966969791021096'; // Approval channel ID
        const approvalChannel = await guild.channels.fetch(approvalChannelId);

        const requestingUser = interaction.user; // User who initiated the action
        const invalidMembers = []; // Track invalid members

        const specialties = [
            {
                roles: ['1314636698176585778', '1314636695383179354'],
                message: 'specialty requirements met: CQB, LRS.',
            },
            {
                roles: ['1314636684918526033', '1314636682120925295'],
                message: 'specialty requirements met: Striker, Brawler.',
            },
        ];

        for (const memberId of selectedMembers) {
            const member = await guild.members.fetch(memberId).catch(() => null);
            if (!member) {
                invalidMembers.push(memberId);
                continue;
            }

            // Check which specialties the member meets
            let specialtiesMessage = null;
            for (const specialty of specialties) {
                const hasRoles = specialty.roles.every((roleId) => member.roles.cache.has(roleId));
                if (hasRoles) {
                    specialtiesMessage = specialty.message;
                    break;
                }
            }

            // Fallback message if no requirements are met
            if (!specialtiesMessage) {
                specialtiesMessage = 'specialty requirements not met.';
            }

            // Build the embed for the approval request
            const embed = new EmbedBuilder()
                .setTitle('Cracked Role Grant Request')
                .setDescription(
                    `**Member:** ${member}\n**Role:** ${role.name}\n**Requested By:** ${requestingUser}\n**Status:** ${specialtiesMessage}`
                )
                .setColor('#3498db');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approveCrackedGrant_${member.id}_${roleId}`)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`denyCrackedGrant_${member.id}_${roleId}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger),
            );

            await approvalChannel.send({ embeds: [embed], components: [row] });
        }

        if (invalidMembers.length > 0) {
            const invalidList = invalidMembers.join(', ');
            await interaction.reply({
                content: `Some members could not be processed: ${invalidList}. Valid requests have been submitted.`,
                ephemeral: true,
            });
        } else {
            await interaction.reply({ content: 'Role grant requests submitted for approval.', ephemeral: true });
        }
    } catch (error) {
        console.error('Error in handleCrackedRoleAssignment:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your request. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

async function handleCrackedApproval(interaction) {
    try {
        const [action, memberId, roleId] = interaction.customId.split('_'); // Split and parse the customId
        console.log(`Action: ${action}, Member ID: ${memberId}, Role ID: ${roleId}`);

        if (!action || !memberId || !roleId) {
            console.error('Invalid customId format. Action, memberId, or roleId is missing.');
            await interaction.reply({
                content: 'Invalid interaction. Please try again or contact an administrator.',
                ephemeral: true,
            });
            return;
        }

        const member = await interaction.guild.members.fetch(memberId).catch(() => null);
        if (!member) {
            await interaction.reply({
                content: 'The member could not be found in this server.',
                ephemeral: true,
            });
            return;
        }

        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
            await interaction.reply({
                content: 'The role could not be found. Please contact an administrator.',
                ephemeral: true,
            });
            return;
        }

        const approver = interaction.user;

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        if (!embed) {
            await interaction.reply({
                content: 'The approval embed could not be found. Please try again later.',
                ephemeral: true,
            });
            return;
        }

        if (action === 'approveCrackedGrant') {
            if (!interaction.deferred) await interaction.deferUpdate();

            // Assign the role to the member
            await member.roles.add(role);

            embed.setColor('#00FF00'); // Green for success
            embed.addFields([{ name: 'Status', value: `Approved by ${approver.tag}` }]);

            await interaction.editReply({ embeds: [embed], components: [] });

            // Determine role type for announcement
            const roleName = role.name;
            const gameplayType = roleName.includes('Pilot') ? 'piloting' : 'infantry';
            const crackedRoleType = roleName.includes('Pilot') ? 'Cracked Pilot' : 'Cracked Infantry';

            // Announcement Embed
            const announcementEmbed = new EmbedBuilder()
                .setTitle(`${crackedRoleType} Confirmed!`)
                .setDescription(
                    `${member} has shown exceptional skill, knowledge, and prowess in **${gameplayType}** gameplay ` +
                    `and has been granted the status of **${crackedRoleType}**!`
                )
                .setColor('#660000'); // Dark red color

            // Announcement Channel
            const announcementChannelId = '1303837974521315449'; // Channel ID
            const announcementChannel = await interaction.guild.channels.fetch(announcementChannelId);

            if (announcementChannel) {
                await announcementChannel.send({
                    content: `${member}`, // Pings the member
                    embeds: [announcementEmbed],
                });
            } else {
                console.error(`Announcement channel with ID ${announcementChannelId} not found.`);
            }

            console.log(`Assigned role ${role.name} to ${member.user.tag} and announced.`);
        } else if (action === 'denyCrackedGrant') {
            if (!interaction.deferred) await interaction.deferUpdate();

            embed.setColor('#FF0000'); // Red for denied
            embed.addFields([{ name: 'Status', value: `Denied by ${approver.tag}` }]);

            await interaction.editReply({ embeds: [embed], components: [] });

            console.log(`Denied role ${role.name} for ${member.user.tag}`);
        }
    } catch (error) {
        console.error('Error in handleCrackedApproval:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing this action. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

//Knights Start

async function handleSponsorSquireButton(interaction) {
    const restrictedRoleIds = [
        '1318329035268427796', 
        '1173823132260384899', 
        '1173823130742050907', 
        '1173823129810911254'
    ];
    const targetRoleId = '1318329035268427796';

    try {
        // Check if the user already has any restricted roles
        const member = interaction.member;

        if (restrictedRoleIds.some(roleId => member.roles.cache.has(roleId))) {
            return interaction.reply({
                content: 'You already have a role that prevents you from sponsoring a Squire.',
                ephemeral: true
            });
        }

        // Assign the role to the member
        await member.roles.add(targetRoleId);

        // Create a user-select menu for selecting the Squire
        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId('select_squire')
            .setPlaceholder('Select a Squire to Sponsor')
            .setMaxValues(1); // Allow only one user to be selected

        const row = new ActionRowBuilder().addComponents(userSelectMenu);

        await interaction.reply({
            content: 'You have been assigned the role. Please select a member to sponsor:',
            components: [row],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error handling sponsor button:', error);
        await interaction.reply({
            content: 'There was an error processing your sponsorship. Please try again later.',
            ephemeral: true
        });
    }
}

async function handleSelectSquireMenu(interaction, client) {
    const selectedUser = interaction.users.first();
    const sponsor = interaction.member; // The member who clicked the button to sponsor
    const categoryId = '1168241121797877954'; // Category ID for the private channel
    const roleId = '1168234521301356715'; // Role ID to be added to the channel

    if (!selectedUser) {
        return interaction.reply({
            content: 'No user was selected.',
            ephemeral: true
        });
    }

    try {
        // Get the member object for the selected user
        const squire = interaction.guild.members.cache.get(selectedUser.id);

        if (!squire) {
            return interaction.reply({
                content: 'Error: Could not find the selected Squire in the server.',
                ephemeral: true
            });
        }

        // Strip the rank abbreviation (e.g., [LM7]) from the display name
        const cleanedName = squire.displayName.replace(/\[.*?\]\s*/g, "").toLowerCase().replace(/\s+/g, "-");

        // Create a private channel with the cleaned name
        const channelName = `${cleanedName}-squire-trial`;

        // Create the private channel in the specified category
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: 0, // Guild Text Channel
            parent: categoryId,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel], // Deny access for everyone
                },
                {
                    id: squire.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
                {
                    id: sponsor.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
                {
                    id: roleId, // Add the role to the channel permissions
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
            ],
        });

        // Send the initial embed without the rank abbreviation
        const embed = new EmbedBuilder()
            .setTitle(`${squire.displayName.replace(/\[.*?\]\s*/g, "")}, you have been selected to become a BlightVeil Knight Squire`)
            .setDescription(
                `${squire.displayName.replace(/\[.*?\]\s*/g, "")}, if you accept, please select the "Accept Squire Trial" button below.\n\n` +
                `Your Squire Trial will last for **30 days**, during your Squire Trial the standing Knights will vote on if your performance is to the standards of the BlightVeil Knights\n` +
                `After your 30 day Squire Trial, you will either be elevated to Knighthood and granted the rank of **KM7**, or you will be reverted to your presquire rank within the Legion.\n\n` +
                `If you are no longer interested in becoming a BlightVeil Knight, you may select "Decline Squire Trial" at any time during your Squireship.\n\n` +
                `This private channel between you and the Knight sponsoring you will stay active for the duration of your squire trial.`
            );

        const acceptButton = new ButtonBuilder()
            .setCustomId('accept_squire_trial')
            .setLabel('Accept Squire Trial')
            .setStyle(ButtonStyle.Success);

        const declineButton = new ButtonBuilder()
            .setCustomId('decline_squire_trial')
            .setLabel('Decline/End Squire Trial')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);

        await channel.send({
            content: `<@${squire.id}> <@${sponsor.id}>`,
            embeds: [embed],
            components: [row]
        });

        // Notify the sponsor that the channel was created
        await interaction.reply({
            content: `A private channel has been created for <@${squire.id}>.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error creating private channel:', error);
        await interaction.reply({
            content: 'An error occurred while creating the private channel.',
            ephemeral: true
        });
    }
}

async function handleAcceptSquireTrial(interaction) {
    const guild = interaction.guild;

    try {
        // Defer the interaction to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const channelName = interaction.channel.name; 
        console.log(`Channel Name: ${channelName}`);

        // Extract the Squire's normalized name by removing "-squire-trial"
        const extractedName = channelName.replace(/-squire-trial/i, "").trim();

        // Ensure the guild's member cache is updated
        await guild.members.fetch();

        // Find the Squire using display name normalization
        const squire = guild.members.cache.find(member => {
            const normalizedDisplayName = member.displayName.replace(/\[.*?\]\s*/g, "").toLowerCase().replace(/\s+/g, "-");
            return normalizedDisplayName === extractedName;
        });

        if (!squire) {
            console.log(`Failed to find member with extracted name: ${extractedName}`);
            return interaction.editReply({
                content: 'Error: Could not find the Squire associated with this trial.'
            });
        }

        // Ensure only the Squire can click the button
        if (interaction.member.id !== squire.id) {
            return interaction.editReply({
                content: 'You are not authorized to accept this Squire Trial.'
            });
        }

        // Identify the sponsor by looking at the channel's permission overwrites
        const sponsorId = interaction.channel.permissionOverwrites.cache
            .find(perm => perm.type === 1 && perm.id !== squire.id && perm.id !== guild.id)?.id;

        if (!sponsorId) {
            return interaction.editReply({
                content: 'Error: Could not identify the sponsor of this trial.'
            });
        }

        const sponsor = await guild.members.fetch(sponsorId);

        // Extract the Squire's current rank from their display name
        const rankMatch = squire.displayName.match(/\[(.*?)\]/);
        const preSquireRank = rankMatch ? rankMatch[1] : null; // Extract text inside brackets or null if none

        console.log(`Pre-squire rank for ${squire.displayName}: ${preSquireRank}`);

        // Check if the Squire meets the role requirements
        const requiredRolesGroup1 = [
            '1168234521301356715',
            '1168214951446454352',
            '1168215961757810779' 
        ];
        const requiredRolesGroup2 = [
            '1317200936854355968', //Cracked Pilot
            '1426132300298584115' //Advanced Infantry
        ];

        const hasRequiredRoleGroup1 = requiredRolesGroup1.some(roleId => squire.roles.cache.has(roleId));
        const hasRequiredRoleGroup2 = requiredRolesGroup2.some(roleId => squire.roles.cache.has(roleId));

        if (!hasRequiredRoleGroup1 || !hasRequiredRoleGroup2) {
            return interaction.editReply({
                content: 'You do not meet the role requirements to accept this Squire Trial.'
            });
        }

        // Clean display names (remove rank abbreviations like [XX])
        const cleanSquireName = squire.displayName.replace(/\[.*?\]\s*/g, "").trim();
        const cleanSponsorName = sponsor.displayName.replace(/\[.*?\]\s*/g, "").trim();

        // Simulate the "!rank KM8" command for the Squire
        await rankCommand.execute(
            {
                guild,
                author: sponsor.user,
                channel: interaction.channel
            },
            ['KM8', `${squire.user.tag}`]
        );

        // Generate a unique poll ID
        const pollId = crypto.randomUUID();
        const channelId = interaction.channel.id;

        // Create a new thread for the poll
        const parentChannelId = '1168288242613899284'; // Parent channel ID for threads
        const parentChannel = await guild.channels.fetch(parentChannelId);

        if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
            console.error(`Parent channel with ID ${parentChannelId} not found or is not a text channel.`);
            throw new Error('Parent channel for threads is not available.');
        }

        const pollThread = await parentChannel.threads.create({
            name: `Ballot: ${cleanSquireName}`, // Dynamic thread name
            autoArchiveDuration: 10080, // Archive after 1 week of inactivity
            type: ChannelType.PrivateThread, // Create a private thread
            reason: `Poll thread for ${cleanSquireName}'s Squire Trial`,
        });

        // Array of role IDs allowed to vote
        const knightRoleIds = [
            '1168233497467551784', 
            '1168233555596415087', 
            '1168234361708089454',
            '1168234521301356715'
        ];

        // Add the sponsor to the thread
        await pollThread.members.add(sponsor.id).catch(error => {
            console.error(`Failed to add sponsor to thread: ${error}`);
        });

        // Add all members with the specified roles
        for (const roleId of knightRoleIds) {
           const role = await guild.roles.fetch(roleId).catch(error => {
                console.error(`Failed to fetch role with ID ${roleId}: ${error}`);
               return null;
            });

            if (role) {
                for (const [memberId] of role.members) {
                    await pollThread.members.add(memberId).catch(error => {
                        console.error(`Failed to add member with ID ${memberId} to thread: ${error}`);
                   });
                }
            } else {
                console.error(`Role with ID ${roleId} not found.`);
            }
         }

        console.log(`Poll thread created: ${pollThread.name} (ID: ${pollThread.id})`);

        // Create the poll embed
        const pollEmbed = new EmbedBuilder()
            .setTitle(`Ballot for ${cleanSquireName}'s Squire Trial.`)
            .setDescription(`Shall **${cleanSquireName}**, sponsored by **${sponsor.displayName}**, be elevated to **KM7** and granted Knighthood?\n\n` +
                `This ballot will close at the end of the squire trial period.\nAny full Knight may vote.` +
                `The Squire Trial will last for **30 days**. After the 30 day initial Squire Trial the votes will be tallied and the squires will be detirmined\n\n` +
                `If the vote passes, the squire will be elevated to Knighthood and granted the rank of **KM7**.\n` +
                `If the vote fails, the squire will be reverted to their pre-squire rank and returned to the Legion.\n\n` +
                `**You may change your vote at any time the ballot is active, but only your most recent cast of Yay or Nay will be counted.\n**` 
            )
            .setColor("#3498db");

        // Add buttons for voting
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`vote_yay_${pollId}`)
                .setLabel('Yay')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`vote_nay_${pollId}`)
                .setLabel('Nay')
                .setStyle(ButtonStyle.Danger)
        );

        // FIX: Capture the poll message object when sending it
        const pollMessage = await pollThread.send({
            embeds: [pollEmbed],
            components: [row]
        });

        console.log(`Poll posted in thread: ${pollThread.name} (ID: ${pollThread.id})`);

        // Log the Squire Trial in the database
        const trialStatus = "ongoing"; // Default status for a new trial
        const startTime = new Date().toISOString(); // Always store as UTC
        const trialDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds (for production)
        const failureCount = 0; // Default to 0 for a new trial
        const passFail = null; // Default to null for a new trial

        await storeSquireTrial(
            squire.id,         // squire_id
            cleanSquireName,   // squire_name
            sponsor.id,        // sponsor_id
            cleanSponsorName,  // sponsor_name
            null,              // yay_votes
            null,              // nay_votes
            preSquireRank,     // pre_squire_rank
            pollId,            // poll_id
            channelId,         // channel_id
            pollThread.id,     // poll_thread_id
            startTime,         // started_at
            trialDuration,     // trial_duration
            trialStatus,       // trial_status
            failureCount,      // failure_count
            passFail,          // pass_fail
            pollMessage.id     // poll_message_id - NOW PROPERLY DEFINED
        );

        // Schedule the trial evaluation
        console.log(`Scheduling Squire Trial evaluation based on database-driven start time.`);
        evaluateSquireTrial(guild, interaction.channel.id, pollThread.id, trialDuration);

        // Remove only the "Accept Squire Trial" button
        const updatedComponents = interaction.message.components.map(row => {
            const actionRow = new ActionRowBuilder();
            actionRow.addComponents(
                row.components.filter(component => component.customId !== 'accept_squire_trial') // Remove the "Accept" button
            );
            return actionRow;
        });

        // Update the message to remove the "Accept" button
        await interaction.message.edit({
            components: updatedComponents
        });

        // Send confirmation
        await interaction.editReply({
            content: `<@${squire.id}> has successfully accepted the Squire Trial and been assigned rank KM8!`
        });

        console.log(`Squire Trial logged: Squire ${cleanSquireName} (${squire.id}), Sponsor ${cleanSponsorName} (${sponsor.id}), Channel ${channelId}`);

    } catch (error) {
        console.error('Error handling accept button:', error);
        await interaction.editReply({
            content: 'An error occurred while accepting the trial. Please try again later.'
        });
    }
}

async function handleDeclineSquireTrial(interaction) {
    const guild = interaction.guild;

    try {
        // Check if interaction has already been replied or deferred
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }

        // Identify the channel and permission overwrites
        const channel = interaction.channel;

        // Attempt to retrieve Squire and Sponsor IDs from channel permissions
        const squireId = channel.permissionOverwrites.cache
            .find(perm => perm.type === 1 && perm.id !== guild.id)?.id;

        const sponsorId = channel.permissionOverwrites.cache
            .find(perm => perm.type === 1 && perm.id !== squireId && perm.id !== guild.id)?.id;

        // Fetch Squire and Sponsor members
        const squire = squireId ? await guild.members.fetch(squireId).catch(() => null) : null;
        const sponsor = sponsorId ? await guild.members.fetch(sponsorId).catch(() => null) : null;

        if (!squire || !sponsor) {
            return interaction.editReply({
                content: 'Error: Could not identify the Squire or Sponsor in this trial.'
            });
        }

        // Role allowed to confirm trial end
        const allowedRoleId = '1168234521301356715';

        // Check if the user has permission to decline the trial
        if (
            interaction.member.id !== squire.id &&
            interaction.member.id !== sponsor.id &&
            !interaction.member.roles.cache.has(allowedRoleId)
        ) {
            return interaction.editReply({
                content: 'You do not have permission to end this Squire Trial.'
            });
        }

        // Send the "Confirm End Squire Trial" button as an ephemeral message
        const confirmButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_end_squire_trial')
                .setLabel('Confirm End Squire Trial')
                .setStyle(ButtonStyle.Danger)
        );

        // Send confirmation button as a reply
        if (!interaction.replied) {
            await interaction.editReply({
                content: 'Are you sure you want to end this Squire Trial? Click below to confirm.',
                components: [confirmButton]
            });
        }

        // Provide feedback to the console for logging purposes
        console.log(`User ${interaction.user.tag} triggered the "Decline/End Squire Trial" button in channel ${channel.name}.`);

    } catch (error) {
        console.error('Error handling decline button:', error);

        // Ensure an error message is only sent if the interaction hasn't been replied to
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred. Please try again.',
                ephemeral: true
            });
        }
    }
}

async function handleConfirmEndSquireTrial(interaction) {
    const guild = interaction.guild;

    try {
        // Defer reply to prevent timeouts
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }

        const channel = interaction.channel;

        // Fetch trial data from database (if it exists)
        const trialData = await getSquireTrial(channel.id).catch(() => null);
        const isAcceptedTrial = !!trialData;

        // Identify the Squire and Sponsor if trial data is unavailable
        const squireId = channel.permissionOverwrites.cache
            .find(perm => perm.type === 1 && perm.id !== guild.id)?.id;

        const sponsorId = channel.permissionOverwrites.cache
            .find(perm => perm.type === 1 && perm.id !== squireId && perm.id !== guild.id)?.id;

        const squire = squireId ? await guild.members.fetch(squireId).catch(() => null) : null;
        const sponsor = sponsorId ? await guild.members.fetch(sponsorId).catch(() => null) : null;

        const cleanSquireName = trialData?.squire_name || squire?.displayName || 'Unknown Squire';
        const cleanSponsorName = trialData?.sponsor_name || sponsor?.displayName || 'Unknown Sponsor';
        const preSquireRank = trialData?.pre_squire_rank || 'Unknown Rank';

        // Update poll if the trial was accepted
        if (isAcceptedTrial && trialData.poll_id) {
            const threadId = trialData.poll_thread_id; // Use poll_thread_id from database
            const threadChannel = await guild.channels.fetch(threadId).catch(() => null);

            if (threadChannel) {
                const pollMessages = await threadChannel.messages.fetch();

                const pollMessage = pollMessages.find(msg =>
                    msg.components.some(row =>
                        row.components.some(button => button.customId.includes(trialData.poll_id))
                    )
                );

                if (pollMessage) {
                    const updatedEmbed = EmbedBuilder.from(pollMessage.embeds[0])
                        .setTitle(`${cleanSquireName}'s Squire Trial Ballot Closed`)
                        .setDescription(
                            `The Squire Trial for **${cleanSquireName}**, sponsored by **${cleanSponsorName}**, has been ended by **${interaction.member.displayName}**.\n\n` +
                            `**${cleanSquireName}**'s rank has been reverted to **[${preSquireRank}]** and they have been returned to the legion for further service to BlightVeil.`
                        );

                    await pollMessage.edit({
                        embeds: [updatedEmbed],
                        components: []
                    });
                }
            }
        }

        // Revert the Squire's rank if trial data exists
        if (isAcceptedTrial && squire) {
            await rankCommand.execute(
                {
                    guild,
                    author: interaction.user,
                    channel: interaction.channel
                },
                [`${preSquireRank}`, `${squire.user.tag}`]
            );
        }

        // Remove sponsor role
        const sponsorRoleId = '1318329035268427796';
        if (sponsor && sponsor.roles.cache.has(sponsorRoleId)) {
            await sponsor.roles.remove(sponsorRoleId);
        }

        // Handle accepted trial case
        if (isAcceptedTrial) {
            const db = await connectToMySQL();
            await db.query(
                `UPDATE squire_trials 
                SET pass_fail = 'fail', trial_status = 'concluded', evaluated_at = NOW() 
                WHERE channel_id = ?`,
                [channel.id]
            );
            console.log(`Squire Trial for ${cleanSquireName} marked as failed.`);

            // Delete the poll thread
            if (trialData.poll_thread_id) {
                const pollThread = await guild.channels.fetch(trialData.poll_thread_id).catch(() => null);
                if (pollThread) {
                    // Fetch all messages in the thread
                    const messages = await pollThread.messages.fetch({ limit: 100 });

                    // Filter out bot messages
                    const transcriptMessages = messages.filter(
                        (msg) => msg.author.id !== '1253811933639872634'
                    );

                    // Sort messages by timestamp (ascending)
                    const sortedMessages = Array.from(transcriptMessages.values()).sort(
                        (a, b) => a.createdTimestamp - b.createdTimestamp
                    );

                    // Create transcript text
                    const transcriptText = sortedMessages.map(
                        (msg) => `**${msg.author.tag}**: ${msg.content}`
                    ).join('\n');

                    // Create embed with transcript
                    const transcriptEmbed = new EmbedBuilder()
                        .setTitle(`Failed Ballot: ${pollThread.name} Transcript`)
                        .setDescription(transcriptText || 'No messages to display.')
                        .setColor('#FF0000');

                    // Send embed to the designated channel
                    const logChannel = await guild.channels.fetch('1169011365466349649').catch(() => null);
                    if (logChannel && logChannel.isTextBased()) {
                        await logChannel.send({ embeds: [transcriptEmbed] });
                        console.log(`Transcript sent to log channel: ${logChannel.id}`);
                    } else {
                        console.error('Failed to fetch or send to log channel.');
                    }

                    // Delete the poll thread
                    await pollThread.delete();
                    console.log(`Deleted poll thread for ${cleanSquireName}: ${trialData.poll_thread_id}`);
                } else {
                    console.error(`Failed to fetch poll thread with ID ${trialData.poll_thread_id}.`);
                }
            }
        }

        // Delete the private channel
        await channel.delete();

        console.log(`Squire Trial ended: ${cleanSquireName} (${squireId}) reverted to ${preSquireRank}`);
    } catch (error) {
        console.error('Error handling confirm end button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while ending the Squire Trial.',
                ephemeral: true
            });
        }
    }
}

async function handleSquireVoteButton(interaction) {
    try {
        const [_, voteType, pollId] = interaction.customId.split('_');
        const userId = interaction.user.id;

        // Check for valid pollId
        if (!pollId) {
            return interaction.reply({
                content: "Invalid poll ID.",
                ephemeral: true
            });
        }

        console.log(`Handling vote: User ${userId} - Vote ${voteType} - Poll ${pollId}`);

        // Process the vote and store in the database
        const validVote = voteType === 'yay' ? 'Yay' : voteType === 'nay' ? 'Nay' : null;

        if (!validVote) {
            return interaction.reply({
                content: 'Invalid vote type.',
                ephemeral: true
            });
        }

        // Store the vote FIRST before showing the modal
        await storeSquireVote(pollId, userId, validVote);
        console.log(`Vote stored: User ${userId} voted ${validVote} in poll ${pollId}`);

        // Create the voting form modal
        const modal = new ModalBuilder()
            .setCustomId(`vote_form_${pollId}_${userId}_${validVote}`) // Include voteType in customId
            .setTitle('Squire Evaluation Form');

        // Skill Rating
        const skillInput = new TextInputBuilder()
            .setCustomId('skill_rating')
            .setLabel('Skill Rating (1-10)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Rate their combat skill from 1-10')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2);

        // Communication Rating
        const commsInput = new TextInputBuilder()
            .setCustomId('comms_rating')
            .setLabel('Communication (1-10)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Rate their communication from 1-10')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2);

        // Teamplay Rating
        const teamplayInput = new TextInputBuilder()
            .setCustomId('teamplay_rating')
            .setLabel('Teamplay (1-10)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Rate their teamplay from 1-10')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2);

        // Attitude Rating
        const attitudeInput = new TextInputBuilder()
            .setCustomId('attitude_rating')
            .setLabel('Attitude (1-10)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Rate their attitude from 1-10')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2);

        // Comments/Feedback
        const commentsInput = new TextInputBuilder()
            .setCustomId('comments')
            .setLabel('Additional Comments')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Provide detailed feedback, strengths, areas for improvement...')
            .setRequired(true)
            .setMinLength(50)
            .setMaxLength(1000);

        // Add all components to modal (THIS WAS MISSING!)
        modal.addComponents(
            new ActionRowBuilder().addComponents(skillInput),
            new ActionRowBuilder().addComponents(commsInput),
            new ActionRowBuilder().addComponents(teamplayInput),
            new ActionRowBuilder().addComponents(attitudeInput),
            new ActionRowBuilder().addComponents(commentsInput)
        );

        // Show the modal to the user
        await interaction.showModal(modal);

        console.log(`Vote form shown to user ${userId} for poll ${pollId}, Vote: ${validVote}`);

    } catch (error) {
        console.error('Error handling vote button interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while processing your vote. Please try again later.',
                ephemeral: true
            });
        }
    }
}

async function handleVoteFormSubmit(interaction) {
    try {
        // Extract pollId, userId, AND voteType from the customId
        const [_, __, pollId, userId, voteType] = interaction.customId.split('_');
        
        // If voteType isn't in customId, try to get it from the database as fallback
        let finalVoteType = voteType;
        
        if (!finalVoteType || finalVoteType === 'undefined') {
            const db = await connectToMySQL();
            const [voteRows] = await db.query(
                'SELECT vote_type FROM squire_votes WHERE poll_id = ? AND user_id = ?',
                [pollId, userId]
            );
            finalVoteType = voteRows.length > 0 ? voteRows[0].vote_type : 'Unknown';
        }
        
        console.log(`Form submission - Poll: ${pollId}, User: ${userId}, Vote: ${finalVoteType}`);

        // Extract form data
        const skillRating = interaction.fields.getTextInputValue('skill_rating');
        const commsRating = interaction.fields.getTextInputValue('comms_rating');
        const teamplayRating = interaction.fields.getTextInputValue('teamplay_rating');
        const attitudeRating = interaction.fields.getTextInputValue('attitude_rating');
        const comments = interaction.fields.getTextInputValue('comments') || 'No additional comments';

        // Validate ratings
        const ratings = [skillRating, commsRating, teamplayRating, attitudeRating];
        for (const rating of ratings) {
            const num = parseInt(rating);
            if (isNaN(num) || num < 1 || num > 10) {
                return interaction.reply({
                    content: 'Please provide valid ratings between 1-10 for all categories.',
                    ephemeral: true
                });
            }
        }

        // Store form data in database
        await storeVoteFormData(pollId, userId, finalVoteType, {
            skill: parseInt(skillRating),
            comms: parseInt(commsRating),
            teamplay: parseInt(teamplayRating),
            attitude: parseInt(attitudeRating),
            comments: comments
        });

        // Get squire trial data for the report
        const trialData = await getSquireTrialByPollId(pollId);
        
        if (trialData) {
            // Calculate average score
            const averageScore = calculateAverage([skillRating, commsRating, teamplayRating, attitudeRating]);
            
            // Send the form results to the BALLOT THREAD
            const pollThread = interaction.guild.channels.cache.get(trialData.poll_thread_id);
            if (pollThread) {
                const formEmbed = new EmbedBuilder()
                    .setTitle('Squire Evaluation Report')
                    .setDescription(`Evaluation submitted by ${interaction.user.displayName} - Vote: **${finalVoteType}**`)
                    .addFields(
                        { name: '🗡️ Skill Rating', value: `${skillRating}/10`, inline: true },
                        { name: '📞 Communication', value: `${commsRating}/10`, inline: true },
                        { name: '👥 Teamplay', value: `${teamplayRating}/10`, inline: true },
                        { name: '💪 Attitude', value: `${attitudeRating}/10`, inline: true },
                        { name: 'Average Score', value: `${averageScore}/10`, inline: true },
                        { name: '📝 Comments', value: comments.length > 1024 ? comments.substring(0, 1020) + '...' : comments }
                    )
                    .setColor(finalVoteType === 'Yay' ? '#00FF00' : '#FF0000')
                    .setTimestamp();

                await pollThread.send({
                    content: `New evaluation submitted for ${trialData.squire_name}`,
                    embeds: [formEmbed]
                });
                
                console.log(`Evaluation report sent to poll thread for ${trialData.squire_name}, Vote: ${finalVoteType}`);
            }

            // Optional notification to private channel
            const privateChannel = interaction.guild.channels.cache.get(trialData.channel_id);
            if (privateChannel) {
                const notificationEmbed = new EmbedBuilder()
                    .setTitle('Evaluation Submitted')
                    .setDescription(`${interaction.user.displayName} has submitted their evaluation.`)
                    .setColor('#0099FF')
                    .setTimestamp();

                await privateChannel.send({ embeds: [notificationEmbed] });
            }
        }

        // Confirm to the user
        await interaction.reply({
            content: `✅ Thank you! Your **${finalVoteType}** vote and evaluation have been recorded for ${trialData?.squire_name || 'the squire'}.`,
            ephemeral: true
        });

        console.log(`Vote form completed by user ${userId} for poll ${pollId}, Vote: ${finalVoteType}`);

    } catch (error) {
        console.error('Error handling vote form submission:', error);
        await interaction.reply({
            content: 'An error occurred while submitting your evaluation. Please try again.',
            ephemeral: true
        });
    }
}

function calculateAverage(ratings) {
    const sum = ratings.reduce((a, b) => parseInt(a) + parseInt(b), 0);
    return (sum / ratings.length).toFixed(1);
}

async function storeVoteFormData(pollId, userId, voteType, formData) {
    const db = await connectToMySQL();
    try {
        // Ensure voteType is valid length for database
        const storedVoteType = voteType && voteType.length <= 10 ? voteType : 'Unknown';
        
        await db.query(
            `INSERT INTO squire_vote_forms 
            (poll_id, user_id, vote_type, skill_rating, comms_rating, teamplay_rating, attitude_rating, comments, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                pollId,
                userId,
                storedVoteType,
                formData.skill,
                formData.comms,
                formData.teamplay,
                formData.attitude,
                formData.comments
            ]
        );
        console.log('Vote form data stored successfully.');
    } catch (error) {
        console.error('Error storing vote form data:', error);
        throw error;
    }
}

async function getSquireTrialByPollId(pollId) {
    const db = await connectToMySQL();
    try {
        const [rows] = await db.query(
            `SELECT * FROM squire_trials WHERE poll_id = ?`,
            [pollId]
        );
        return rows[0] || null;
    } catch (error) {
        console.error('Error fetching squire trial by poll ID:', error);
        throw error;
    }
}

async function handleEntombKnightButton2(interaction) {
    try {
        // Check if user has permission to initiate entombment
        const allowedRoleIds = [
            '1168233497467551784', // Knight roles that can initiate entombment
            '1168233555596415087', 
            '1168234361708089454',
            '1168234521301356715'
        ];

        const hasPermission = allowedRoleIds.some(roleId => 
            interaction.member.roles.cache.has(roleId)
        );

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have permission to initiate knight entombment.',
                ephemeral: true
            });
        }

        // Create a user select menu for choosing which knight to entomb
        const knightSelectMenu = new UserSelectMenuBuilder()
            .setCustomId('select_knight_to_entomb')
            .setPlaceholder('Select a Knight to entomb...')
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(knightSelectMenu);

        await interaction.reply({
            content: 'Select a Knight to begin the entombment process:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling entomb knight button:', error);
        await interaction.reply({
            content: 'An error occurred while initiating the entombment process.',
            ephemeral: true
        });
    }
}

async function handleEntombmentVote(interaction) {
    try {
        const [_, __, voteType, pollId] = interaction.customId.split('_');
        const userId = interaction.user.id;

        const validVote = voteType === 'yes' ? 'Yes' : voteType === 'no' ? 'No' : null;

        if (!validVote) {
            return interaction.reply({
                content: 'Invalid vote type.',
                ephemeral: true
            });
        }

        // Store the vote
        await storeEntombmentVote(pollId, userId, validVote);

        // Create the entombment reasoning form
        const modal = new ModalBuilder()
            .setCustomId(`entomb_reason_${pollId}_${userId}_${validVote}`)
            .setTitle('Entombment Reasoning');

        const reasonInput = new TextInputBuilder()
            .setCustomId('entomb_reason')
            .setLabel('Reason for your vote')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explain your reasoning for voting Yes (entomb) or No (retain)...')
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

        await interaction.showModal(modal);

        console.log(`Entombment vote form shown to user ${userId}, Vote: ${validVote}`);

    } catch (error) {
        console.error('Error handling entombment vote:', error);
        await interaction.reply({
            content: 'An error occurred while processing your vote.',
            ephemeral: true
        });
    }
}

async function handleEntombmentReasonSubmit(interaction) {
    try {
        const [_, __, pollId, userId, voteType] = interaction.customId.split('_');
        const reason = interaction.fields.getTextInputValue('entomb_reason');

        // Store the reasoning
        await storeEntombmentReason(pollId, userId, voteType, reason);

        // Get entombment data
        const entombmentData = await getEntombmentProceeding(pollId);
        
        if (entombmentData) {
            // Send the reasoning to the entombment thread
            const entombThread = interaction.guild.channels.cache.get(entombmentData.thread_id);
            if (entombThread) {
                const reasonEmbed = new EmbedBuilder()
                    .setTitle(`${interaction.user.displayName} voted ${voteType === 'Yes' ? '✅ Yes - Entomb' : '❌ No - Retain'}`)
                    .setDescription(reason)
                    .setColor(voteType === 'Yes' ? '#FF6B6B' : '#51CF66')
                    .setTimestamp();

                await entombThread.send({ embeds: [reasonEmbed] });
            }
        }

        await interaction.reply({
            content: `Thank you! Your **${voteType}** vote and reasoning have been recorded.`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling entombment reason submission:', error);
        await interaction.reply({
            content: 'An error occurred while submitting your reasoning.',
            ephemeral: true
        });
    }
}

async function handleSelectKnightToEntomb(interaction) {
    const selectedUser = interaction.users.first();
    
    if (!selectedUser) {
        return interaction.reply({
            content: 'No knight was selected.',
            ephemeral: true
        });
    }

    try {
        const knight = interaction.guild.members.cache.get(selectedUser.id);
        
        if (!knight) {
            return interaction.reply({
                content: 'Error: Could not find the selected knight in the server.',
                ephemeral: true
            });
        }

        // Verify the selected user is actually a knight
        const knightRoleIds = [
            '1168233497467551784', 
            '1168233555596415087', 
            '1168234361708089454',
            '1168234521301356715'
        ];

        const isKnight = knightRoleIds.some(roleId => knight.roles.cache.has(roleId));
        
        if (!isKnight) {
            return interaction.reply({
                content: 'The selected user is not a knight and cannot be entombed.',
                ephemeral: true
            });
        }

        // Generate unique poll ID
        const pollId = crypto.randomUUID();
        
        // Create private thread for the entombment vote
        const parentChannelId = '1168288242613899284'; // Same parent as squire trials
        const parentChannel = await interaction.guild.channels.fetch(parentChannelId);

        if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
            throw new Error('Parent channel for threads is not available.');
        }

        const entombThread = await parentChannel.threads.create({
            name: `Entombment: ${knight.displayName}`,
            autoArchiveDuration: 10080, // 1 week
            type: ChannelType.PrivateThread,
            reason: `Entombment proceedings for ${knight.displayName}`,
        });

        // Add the initiator and knight to the thread
        await entombThread.members.add(interaction.user.id);
        await entombThread.members.add(knight.id);

        console.log(`Entombment thread created: ${entombThread.name} (ID: ${entombThread.id})`);

        // Create the entombment poll embed
        const pollEmbed = new EmbedBuilder()
            .setTitle(`⚰️ Entombment Proceedings: ${knight.displayName}`)
            .setDescription(
                `A motion has been brought forth to entomb **${knight.displayName}**.\n\n` +
                `**What does entombment mean?**\n` +
                `- The knight will be removed from active knight duties\n` +
                `- Their knight rank will be revoked\n` +
                `- They will retain legacy status and respect\n` +
                `- This is typically for knights who can no longer fulfill their duties\n\n` +
                `This ballot will be open for **10 days**. A majority vote is required for entombment to proceed.\n\n` +
                `**Voting Rules:**\n` +
                `- Only full knights may vote\n` +
                `- Majority vote decides the outcome\n` +
                `- You may change your vote while the ballot is active\n` +
                `- Detailed reasoning is required for your vote`
            )
            .setColor('#8B4513') // Brown color for entombment
            .setTimestamp();

        // Add voting buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`entomb_vote_yes_${pollId}`)
                .setLabel('Vote Yes - Entomb')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`entomb_vote_no_${pollId}`)
                .setLabel('Vote No - Retain')
                .setStyle(ButtonStyle.Success)
        );

        // Send the poll message
        const pollMessage = await entombThread.send({
            content: `<@${knight.id}> <@&1168233497467551784> <@&1168233555596415087> <@&1168234361708089454> <@&1168234521301356715>`,
            embeds: [pollEmbed],
            components: [row]
        });

        // Store entombment data in database
        await storeEntombmentProceeding(
            pollId,
            knight.id,
            knight.displayName,
            interaction.user.id,
            interaction.user.displayName,
            entombThread.id,
            pollMessage.id
        );

        // Schedule the entombment evaluation for 10 days
        scheduleEntombmentEvaluation(interaction.guild, pollId, 10 * 24 * 60 * 60 * 1000); // 10 days in milliseconds

        await interaction.reply({
            content: `Entombment proceedings have been initiated for ${knight.displayName}. A private thread has been created for voting.`,
            ephemeral: true
        });

        console.log(`Entombment proceedings started for ${knight.displayName} by ${interaction.user.displayName}`);

    } catch (error) {
        console.error('Error handling knight selection for entombment:', error);
        await interaction.reply({
            content: 'An error occurred while starting the entombment proceedings.',
            ephemeral: true
        });
    }
}

//Knights End

async function exportInventoryXML(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const data = await fetchInventoryTotals();
    const now = new Date().toISOString();

    let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n<inventoryExport date="' + now + '">\n';

    // Export regular locations and items except UEC
    for (const loc of LOCATIONS) {
      xmlContent += `  <location name="${loc.label}">\n`;
      for (const item of ITEMS) {
        if (item.value === 'uec_request') continue;  // Skip UEC here
        const qty = data[loc.value]?.[item.value] ?? 0;
        xmlContent += `    <item key="${item.value}" label="${item.label}" quantity="${qty}" />\n`;
      }
      xmlContent += `  </location>\n`;
    }

    // Now add UEC quantity separately under "Universal" location
    const uecQty = data['universal']?.['uec_request'] ?? 0;
    xmlContent += `  <location name="Universal">\n`;
    xmlContent += `    <item key="uec_request" label="UEC" quantity="${uecQty}" />\n`;
    xmlContent += `  </location>\n`;

    xmlContent += '</inventoryExport>';

    const filePath = path.join(__dirname, '../exports/inventory_export.xml');
    writeFileSync(filePath, xmlContent);

    const attachment = new AttachmentBuilder(filePath, { name: 'inventory_export.xml' });
    await interaction.editReply({ content: '✅ Inventory exported as XML.', files: [attachment] });
  } catch (err) {
    console.error('Error exporting XML:', err);
    await interaction.editReply({ content: '❌ Failed to export XML.' });
  }
}

async function exportInventoryCSV(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const data = await fetchInventoryTotals();

    const headers = ['Location', 'Item Key', 'Item Label', 'Quantity'];
    const rows = [headers.join(',')];

    // Export regular locations/items except UEC
    for (const loc of LOCATIONS) {
      for (const item of ITEMS) {
        if (item.value === 'uec_request') continue;  // Skip UEC here
        const qty = data[loc.value]?.[item.value] ?? 0;
        rows.push(`"${loc.label}","${item.value}","${item.label}",${qty}`);
      }
    }

    // Add UEC row under universal
    const uecQty = data['universal']?.['uec_request'] ?? 0;
    rows.push(`"Universal","uec_request","UEC",${uecQty}`);

    const csvContent = rows.join('\n');
    const filePath = path.join(__dirname, '../exports/inventory_export.csv');
    writeFileSync(filePath, csvContent);

    const attachment = new AttachmentBuilder(filePath, { name: 'inventory_export.csv' });
    await interaction.editReply({ content: '✅ Inventory exported as CSV.', files: [attachment] });
  } catch (err) {
    console.error('Error exporting CSV:', err);
    await interaction.editReply({ content: '❌ Failed to export CSV.' });
  }
}

async function handleKTRestrict(interaction) {
    const userId = interaction.user.id;
    const connection = await connectToMySQL();
    try {
        // Update the database to blacklist the user
        await connection.execute('UPDATE killtracker_keys SET blacklist = 1 WHERE discord_id = ?', [userId]);
        await interaction.reply({ content: `User **${interaction.user.username}** has been restricted from Kill Tracker access.`, ephemeral: true });
    } catch (error) {
        console.error('Error handling KTRestrict:', error);
        await interaction.reply({ content: 'Failed to restrict user.', ephemeral: true });
    } finally {
        connection.end();
    }
}

async function handleKTAllow(interaction) {
    const userId = interaction.user.id;
    const connection = await connectToMySQL();
    try {
        // Update the database to allow the user
        await connection.execute('UPDATE killtracker_keys SET blacklist = 0 WHERE discord_id = ?', [userId]);
        await interaction.reply({ content: `User **${interaction.user.username}** has been granted access to Kill Tracker.`, ephemeral: true });
    } catch (error) {
        console.error('Error handling KTAllow:', error);
        await interaction.reply({ content: 'Failed to allow user.', ephemeral: true });
    } finally {
        connection.end();
    }
}

async function findUserThread(channel, username, threadType) {
    // Fetch all active threads in the channel (returns { threads: [Thread, ...] })
    const activeThreads = await channel.threads.fetchActive();
    // Compose the expected thread name
    const expectedName = `${username} ${threadType}`;
    // Find a thread with matching name (case sensitive) and is private
    return activeThreads.threads.find(
        t => t.name === expectedName && t.type === 12 // ChannelType.PrivateThread === 12
    ) || null;
}

function generateYouTubeLinksEmbed(username, submissionType, userId, discipline, videoUrls) {
    const embed = new EmbedBuilder()
        .setTitle(`${username}'s ${submissionType} Submission`)
        .setDescription(
            (discipline ? `Discipline: **${discipline}**\n` : "") +
            `Submitted by: <@${userId}>`
        )
        .addFields({
            name: 'YouTube Links',
            value: videoUrls.map((u, i) => `[Video ${i + 1}](${u})`).join('\n')
        });
    return embed;
}

async function showCQBCertForm(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('cqb_cert_modal')
        .setTitle('CQB Certification Submission');

    const videoUrlInput = new TextInputBuilder()
        .setCustomId('video_url_input')
        .setLabel('YouTube Video URL(s)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Paste one or more YouTube links, each on its own line or anywhere in the box.')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(videoUrlInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

async function processCQBCertSubmission(interaction) {
    const videoUrlInput = interaction.fields.getTextInputValue('video_url_input');
    const YT_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/gi;
    const videoUrls = videoUrlInput.match(YT_REGEX) || [];
    if (!videoUrls.length) {
        await interaction.reply({
            content: 'No valid YouTube URLs found in your submission. Please paste one or more full YouTube links (youtube.com/watch?v=... or youtu.be/...).',
            ephemeral: true
        });
        return;
    }

    const channelId = '1199178670858846209';
    const overseerRoleId = '1308081895266844712';
    const instructorRoleId = '1168327592269598760';
    const infantryRequiredRoles = ['1168285299416248422', '1285585932417761320','1168285383012925501'];
    const hasRole = infantryRequiredRoles.some(roleId => interaction.member.roles.cache.has(roleId));
    if (!hasRole) {
        await interaction.reply({ content: 'You must have an Infantry role to submit a CQB certification.', ephemeral: true });
        return;
    }

    const targetChannel = await interaction.client.channels.fetch(channelId);

    const submissionType = "CQB Certification";
    const existingThread = await findUserThread(targetChannel, interaction.user.username, submissionType);

    const embed = generateYouTubeLinksEmbed(
        interaction.user.username,
        submissionType,
        interaction.user.id,
        null,
        videoUrls
    );

    if (existingThread) {
        // Post just the embed (no tagging) in the existing thread
        await existingThread.send({ embeds: [embed] });
        await interaction.reply({
            content: `Your submission has been added to your existing CQB Certification thread in <#${channelId}>!`,
            ephemeral: true
        });
    } else {
        // Create a private thread
        const thread = await targetChannel.threads.create({
            name: `${interaction.user.username} ${submissionType}`,
            autoArchiveDuration: 60,
            reason: 'CQB Certification Submission',
            type: 12, // ChannelType.PrivateThread
        });

        try {
            await thread.permissionOverwrites.edit(overseerRoleId,     { VIEW_CHANNEL: true, SEND_MESSAGES: true });
            await thread.permissionOverwrites.edit(instructorRoleId,   { VIEW_CHANNEL: true, SEND_MESSAGES: true });
        } catch (err) {
            console.error("Error setting permissions for roles:", err);
        }

        await thread.send({
            content: `<@${interaction.user.id}> <@&${overseerRoleId}> <@&${instructorRoleId}>`,
            embeds: [embed],
        });

        await interaction.reply({
            content: `Your submission has been posted in <#${channelId}> as a private thread!`,
            ephemeral: true
        });
    }
}

async function showCrackedVideoForm(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('cracked_video_modal')
        .setTitle('Cracked Video Submission');

    const videoUrlInput = new TextInputBuilder()
        .setCustomId('video_url_input')
        .setLabel('YouTube Video URL(s)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Paste one or more YouTube links, each on its own line or anywhere in the box.')
        .setRequired(true);

    const disciplineInput = new TextInputBuilder()
        .setCustomId('discipline_input')
        .setLabel('Discipline (infantry or pilot)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('infantry or pilot')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(videoUrlInput);
    const secondActionRow = new ActionRowBuilder().addComponents(disciplineInput);

    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);
}

async function processCrackedVideoSubmission(interaction) {
    const videoUrlInput = interaction.fields.getTextInputValue('video_url_input');
    const discipline = interaction.fields.getTextInputValue('discipline_input').toLowerCase();
    const YT_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/gi;
    const videoUrls = videoUrlInput.match(YT_REGEX) || [];
    if (!videoUrls.length) {
        await interaction.reply({
            content: 'No valid YouTube URLs found in your submission. Please paste one or more full YouTube links (youtube.com/watch?v=... or youtu.be/...).',
            ephemeral: true
        });
        return;
    }

    // Channel IDs for each discipline
    const channelId = discipline === 'infantry' ? '1199178670858846209' :
                      discipline === 'pilot'   ? '1199178724063576154' : null;
    if (!channelId) {
        await interaction.reply({ content: 'Invalid discipline. Must be "infantry" or "pilot".', ephemeral: true });
        return;
    }

    const infantryRequiredRole = '1314636698176585778'; // CQB Cert
    if (discipline === 'infantry' && !interaction.member.roles.cache.has(infantryRequiredRole)) {
        await interaction.reply({ content: 'You must have the CQB Cert to submit a cracked infantry video.', ephemeral: true });
        return;
    }

    const targetChannel = await interaction.client.channels.fetch(channelId);

    // Role IDs for permissions and tagging
    const overseerRoleId        = discipline === 'infantry' ? '1308081895266844712' : '1308081615083278378';
    const instructorRoleId      = discipline === 'infantry' ? '1168327592269598760' : '1168327555917557780';
    const crackedPilotRoleId    = '1317200936854355968';
    const crackedInfantryRoleId = '1317200975097761833';

    const submissionType = "Cracked Submission";
    const existingThread = await findUserThread(targetChannel, interaction.user.username, submissionType);

    const embed = generateYouTubeLinksEmbed(
        interaction.user.username,
        submissionType,
        interaction.user.id,
        discipline,
        videoUrls
    );

    if (existingThread) {
        // Post just the embed (no tagging) in the existing thread
        await existingThread.send({ embeds: [embed] });
        await interaction.reply({
            content: `Your submission has been added to your existing thread in <#${channelId}>!`,
            ephemeral: true
        });
    } else {
        // Create new thread
        const thread = await targetChannel.threads.create({
            name: `${interaction.user.username} ${submissionType}`,
            autoArchiveDuration: 60,
            reason: 'Cracked Video Submission',
            type: 12, // ChannelType.PrivateThread
        });

        try {
            await thread.permissionOverwrites.edit(overseerRoleId, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
            await thread.permissionOverwrites.edit(instructorRoleId, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
            if (discipline === 'infantry') {
                await thread.permissionOverwrites.edit(crackedInfantryRoleId, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
            } else if (discipline === 'pilot') {
                await thread.permissionOverwrites.edit(crackedPilotRoleId, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
            }
        } catch (err) {
            console.error("Error setting permissions for roles:", err);
        }

        await thread.send({
            content: `<@${interaction.user.id}> <@&${overseerRoleId}> <@&${instructorRoleId}> <@&${discipline === 'infantry' ? crackedInfantryRoleId : crackedPilotRoleId}>`,
            embeds: [embed],
        });

        await interaction.reply({
            content: `Your submission has been posted in <#${channelId}> as a private thread!`,
            ephemeral: true
        });
    }
}

async function handleGenerateKTKeyButton(interaction) {
    try {
        const userId = interaction.user.id;

        // Defer reply immediately (ephemeral so only user sees it)
        await interaction.deferReply({ ephemeral: true });

        // Connect to DB and check blacklist table
        const db = await connectToMySQL();
        const [rows] = await db.execute(
            'SELECT blacklisted FROM kt_blacklist WHERE user_id = ?',
            [userId]
        );

        // If the user is blacklisted, stop here
        if (rows.length > 0 && rows[0].blacklisted === 1) {
            await interaction.editReply({
                content: '🚫 You have been blacklisted from using the Kill Tracker. Please contact an admin if you believe this is a mistake.',
                ephemeral: true,
            });
            return;
        }

        // Generate and store the API key
        const apiKey = await generateAndStoreApiKey(userId);

        // Send the key privately to the user
        await interaction.editReply({
            content: `✅ Your API key has been generated:\n\`\`\`${apiKey}\`\`\`\nUse this key in your kill tracker client to post your kills in the <#1324936826225426503> and/or <#1324936929929859122>.`,
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error generating API key:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error generating your API key. Please try again later.',
                ephemeral: true,
            });
        } else {
            await interaction.editReply({
                content: '❌ There was an error generating your API key. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

const fightSessions = new Map();

function sessionKey(userId, opponentId) {
    return `${userId}:${opponentId}`;
}

async function setFightSession(userId, opponentId, result) {
    fightSessions.set(sessionKey(userId, opponentId), { userId, opponentId, result });
}

async function getFightSession(userId, opponentId) {
    return fightSessions.get(sessionKey(userId, opponentId)) || null;
}

async function clearFightSession(userId, opponentId) {
    fightSessions.delete(sessionKey(userId, opponentId));
    fightSessions.delete(sessionKey(opponentId, userId));
}

function clearFightLock(client, userId, opponentId) {
    client.fightSessions.delete(userId);
    client.fightSessions.delete(opponentId);
}

async function handleFightDispute(interaction, client, { userId, opponentId, userResult, opponentResult }) {
    const guild = interaction.guild;
    let user, opponent;

    try { user = await guild.members.fetch(userId); } catch { user = null; }
    try { opponent = await guild.members.fetch(opponentId); } catch { opponent = null; }

    // Prefer parent channel if it's a GUILD_TEXT
    let parentChannel = interaction.channel;
    if (!parentChannel || parentChannel.type !== 0) { // 0 = GUILD_TEXT
        // Fallback to log channel
        try {
            parentChannel = await guild.channels.fetch(FLIGHT_LOG_CHANNEL);
        } catch (err) {
            parentChannel = null;
            console.error('Dispute: failed to fetch fallback log channel', err);
        }
    }

    // Final check: is this a threadable text channel?
    if (!parentChannel || parentChannel.type !== 0 || !parentChannel.threads) {
        console.error('Dispute: No valid parent channel for thread creation.');
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Could not find a suitable channel to create a dispute thread.', ephemeral: true });
        }
        return;
    }

    const threadName = `Dispute: ${user?.displayName || userId} vs ${opponent?.displayName || opponentId}`.substring(0, 98);
    let thread = null;
    try {
        thread = await parentChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 60,
            type: ChannelType.PrivateThread,
            reason: 'Fight result disputed',
            invitable: false,
        });
    } catch (err) {
        console.error('Dispute: Error creating thread:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Failed to create dispute thread (invalid channel type or permissions).', ephemeral: true });
        }
        return;
    }

    try {
        if (user) await thread.members.add(user.id).catch(() => null);
        if (opponent) await thread.members.add(opponent.id).catch(() => null);

        const overseers = guild.roles.cache.get(FLIGHT_OVERSEER_ROLE)?.members;
        if (overseers) {
            for (const member of overseers.values()) {
                await thread.members.add(member.id).catch(() => null);
            }
        }
    } catch (err) {
        console.error('Dispute: Failed to add members to thread:', err);
    }

    const embed = new EmbedBuilder()
        .setTitle('🚩 Fight Dispute: Review Required')
        .setDescription(
            `A fight between <@${userId}> and <@${opponentId}> has conflicting results.\n\n`
            + `<@${userId}> reported: **${userResult}**\n`
            + `<@${opponentId}> reported: **${opponentResult}**\n\n`
            + `A Flight Overseer must resolve this.`
        )
        .setColor(Colors.Red)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dispute_approve_${userId}_${opponentId}`)
            .setLabel('Approve Result')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`dispute_deny_${userId}_${opponentId}`)
            .setLabel('Deny Result')
            .setStyle(ButtonStyle.Danger)
    );

    try {
        await thread.send({
            content: `<@&${FLIGHT_OVERSEER_ROLE}> <@${userId}> <@${opponentId}>`,
            embeds: [embed],
            components: [row],
        });
    } catch (err) {
        console.error('Dispute: Failed to send to thread:', err);
    }

    // === REMOVED: logChannel message block ===

    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
            content: 'A dispute has been detected. A thread has been created for resolution.',
            ephemeral: true,
        });
    }
}

async function handleAddBountyButton(interaction, username) {
    const modal = new ModalBuilder()
        .setCustomId(`add_bounty_modal_${username}_${interaction.user.id}`)
        .setTitle('Add Bounty');

    const amountInput = new TextInputBuilder()
        .setCustomId('bounty_amount')
        .setLabel('Enter Bounty Amount')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 50000');

    const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

async function handleOpenFightForm(interaction, client) {
    const userId = interaction.user.id;

    // This should always exist from server.js
    if (!client.fightSessions) {
        throw new Error("client.fightSessions is not initialized! Initialize it globally at bot startup.");
    }

    // Check for unresolved session
    const session = client.fightSessions.get(userId);
    if (session && session.locked) {
        return interaction.reply({
            content: "⚠️ You already have a pending fight request. Please finish or resolve it before starting another.",
            flags: 64, // Use flags instead of ephemeral
        });
    }

    // Lock immediately
    client.fightSessions.set(userId, { locked: true });

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId(`fight_select_opponent_${userId}`)
        .setPlaceholder('Select your opponent')
        .setMinValues(1)
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await interaction.reply({
        content: 'Who did you fight? Select your opponent below.',
        components: [row],
        flags: 64,
    });
}

function createDropdownsForCategory(categoryKey) {
  const dropdowns = [];
  const categoryData = ITEM_GROUPS[categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)];

  // If categoryData is an array, create dropdown(s) normally:
  if (Array.isArray(categoryData)) {
    for (let i = 0; i < categoryData.length; i += 25) {
      const chunk = categoryData.slice(i, i + 25);
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`item_select_${categoryKey}_${i / 25}`)
        .setPlaceholder(`${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)} Items`)
        .setMinValues(0)
        .setMaxValues(chunk.length)
        .addOptions(chunk);

      dropdowns.push(new ActionRowBuilder().addComponents(selectMenu));
    }
  } 
  // If categoryData is an object (like 'Pilot'), treat each subcategory as a dropdown:
  else if (typeof categoryData === 'object' && categoryData !== null) {
    for (const [subKey, items] of Object.entries(categoryData)) {
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`item_select_${categoryKey}_${subKey}_${i / 25}`)
          .setPlaceholder(`${subKey} Items`)
          .setMinValues(0)
          .setMaxValues(chunk.length)
          .addOptions(chunk);

        dropdowns.push(new ActionRowBuilder().addComponents(selectMenu));
      }
    }
  }

  return dropdowns;
}

//EntombedKnights Start

async function handleEntombKnightButton(interaction, client) {
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply({ flags: 64 });
    
    const member = interaction.member;
    const currentRoles = member.roles.cache;
    
    // Check if already a knight
    const isKnight = currentRoles.has('1168214951446454352');
    if (!isKnight) {
        return interaction.editReply({ 
            content: 'Only Knights can use the entombment system.'
        });
    }

    // Extract current rank from nickname
    const currentRankMatch = member.nickname?.match(/\[(\w+\d)\]/);
    const currentRank = currentRankMatch ? currentRankMatch[1] : 'KM1';

    // Save to database
    const saved = await saveEntombedKnight(member.id, member.user.tag, currentRank);
    if (!saved) {
        return interaction.editReply({ 
            content: 'Error saving entombment data. Please contact an administrator.'
        });
    }

    // Use the existing rank command logic to entomb
    try {
        // Fix the path - adjust based on your structure
        let rankCommand;
        try {
            rankCommand = require('../commands/rank');
        } catch (e) {
            // If that fails, try a different path
            rankCommand = require('../../commands/rank');
        }
        
        // Create a mock message object for the rank command
        const mockMessage = {
            channel: interaction.channel,
            guild: interaction.guild,
            client: client,
            channel: {
                send: async (content) => {
                    // This will handle the rank command's response
                    console.log('Rank command response:', content);
                }
            }
        };
        
        await rankCommand.execute(mockMessage, ['ENTOMBED', member.user.tag]);
        
        await interaction.editReply({ 
            content: 'You have been successfully entombed. Take your rest, Knight.'
        });
    } catch (error) {
        console.error('Error during entombment:', error);
        await interaction.editReply({ 
            content: 'Error during entombment process. Please contact an administrator.'
        });
    }
}

async function handleRiseKnightButton(interaction, client) {
    await interaction.deferReply({ flags: 64 });
    
    const member = interaction.member;
    const RISE_REQUEST_CHANNEL_ID = '1168237930091913267';
    
    // Check if currently entombed
    const entombedData = await getEntombedKnight(member.id);
    if (!entombedData) {
        return interaction.editReply({ 
            content: 'You are not currently entombed or your data could not be found.'
        });
    }

    const riseChannel = interaction.guild.channels.cache.get(RISE_REQUEST_CHANNEL_ID);
    if (!riseChannel) {
        return interaction.editReply({ 
            content: 'Rise request channel not found. Please contact an administrator.'
        });
    }

    // Use the actual timestamp from the database
    let unixTimestamp;
    if (entombedData.entombed_unix) {
        // Use the pre-calculated Unix timestamp from MySQL
        unixTimestamp = entombedData.entombed_unix;
        console.log('Using database Unix timestamp:', unixTimestamp);
    } else {
        // Fallback: calculate from the raw datetime
        const entombedDate = new Date(entombedData.entombed_at);
        unixTimestamp = Math.floor(entombedDate.getTime() / 1000);
        console.log('Using calculated timestamp:', unixTimestamp);
    }

    console.log('Current time:', Math.floor(Date.now() / 1000));
    console.log('Time difference (seconds):', Math.floor(Date.now() / 1000) - unixTimestamp);
    console.log('Time difference (hours):', (Math.floor(Date.now() / 1000) - unixTimestamp) / 3600);

    // Create rise request embed
    const riseEmbed = new EmbedBuilder()
        .setTitle('⚔️ Knight Rise Request')
        .setDescription(
            `**Knight:** ${member.displayName}\n` +
            `**User Tag:** ${member.user.tag}\n` +
            `**Previous Rank:** ${entombedData.old_rank}\n` +
            `**Entombed Since:** <t:${unixTimestamp}:R>\n\n` +
            '*A former guardian seeks to return to the ranks...*'
        )
        .setColor('#FFA500')
        .setTimestamp()
        .setFooter({ text: 'Rise Request - Overseer Action Required' });

    const riseButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`grant_rise_${member.id}`)
                .setLabel('Grant Rise')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`deny_rise_${member.id}`)
                .setLabel('Deny Rise')
                .setStyle(ButtonStyle.Danger)
        );

    // Ping Overseer roles
    const overseerMentions = OVERSEER_ROLES.map(roleId => `<@&${roleId}>`).join(' ');
    
    await riseChannel.send({ 
        content: `${overseerMentions} - Knight Rise Request`, 
        embeds: [riseEmbed], 
        components: [riseButtons] 
    });

    await interaction.editReply({ 
        content: 'Your rise request has been submitted to the Overseers. Await their decision.'
    });
}

async function handleGrantRiseButton(interaction, client) {
    await interaction.deferReply();
    
    const userId = interaction.customId.replace('grant_rise_', '');
    const ENTOMBED_CHANNEL_ID = '1168288242613899284';
    
    // Check if user has permission (Overseer roles)
    const hasPermission = interaction.member.roles.cache.some(role => 
        OVERSEER_ROLES.includes(role.id)
    );
    if (!hasPermission) {
        return interaction.editReply({ 
            content: 'Only Overseers can grant rise requests.'
        });
    }

    const entombedData = await getEntombedKnight(userId);
    if (!entombedData) {
        return interaction.editReply({ 
            content: 'Knight data not found or already restored.'
        });
    }

    try {
        // Restore the knight using the rank command
        let rankCommand;
        try {
            rankCommand = require('../commands/rank');
        } catch (e) {
            rankCommand = require('../../commands/rank');
        }
        
        const mockMessage = {
            channel: interaction.channel,
            guild: interaction.guild,
            client: client,
            channel: {
                send: async (content) => {
                    console.log('Rank command response:', content);
                }
            }
        };
        
        await rankCommand.execute(mockMessage, [entombedData.old_rank, entombedData.user_tag]);
        
        // Mark as restored in database
        await restoreEntombedKnight(userId, interaction.user.tag);
        
        // Update the original message
        const grantedEmbed = new EmbedBuilder()
            .setTitle('⚔️ Rise Request - GRANTED ✅')
            .setDescription(
                `**Knight:** <@${userId}>\n` +
                `**Restored Rank:** ${entombedData.old_rank}\n` +
                `**Granted By:** ${interaction.user.tag} (Overseer)\n\n` +
                '*The Knight has been restored to their former glory!*'
            )
            .setColor('#00FF00')
            .setTimestamp();

        await interaction.message.edit({ 
            embeds: [grantedEmbed], 
            components: [] 
        });

        // Send announcement to entombed channel
        const entombedChannel = interaction.guild.channels.cache.get(ENTOMBED_CHANNEL_ID);
        if (entombedChannel) {
            const ariseEmbed = new EmbedBuilder()
                .setTitle('⚔️ A Knight Has Arisen! ⚔️')
                .setDescription(
                    `**A former Entombed Knight has regained their rank and title!**\n\n` +
                    `The valiant **<@${userId}>** has emerged from their slumber and reclaimed their place among the living!\n\n` +
                    `Welcome back to the ranks of BlightVeil Knights!`
                )
                .setColor('#00FF00')
                .setTimestamp();
            
            await entombedChannel.send({ embeds: [ariseEmbed] });
        }

        await interaction.editReply({ 
            content: 'Rise request granted successfully.'
        });

    } catch (error) {
        console.error('Error granting rise:', error);
        await interaction.editReply({ 
            content: 'Error granting rise request. Please contact an administrator.'
        });
    }
}

async function handleDenyRiseButton(interaction, client) {
    await interaction.deferReply();
    
    const userId = interaction.customId.replace('deny_rise_', '');
    
    // Check if user has permission (Overseer roles)
    const hasPermission = interaction.member.roles.cache.some(role => 
        OVERSEER_ROLES.includes(role.id)
    );
    if (!hasPermission) {
        return interaction.editReply({ 
            content: 'Only Overseers can deny rise requests.'
        });
    }

    try {
        const member = await interaction.guild.members.fetch(userId);
        
        // DM the knight about denial
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('🧊 Rise Request Denied')
                .setDescription(
                    `Your request to rise from entombment has been denied.\n\n` +
                    `**Reason:** Please contact an Overseer for further details about your denial.\n\n`
                )
                .setColor('#FF0000')
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            console.error('Could not DM user:', dmError);
        }

        // Update the original message
        const deniedEmbed = new EmbedBuilder()
            .setTitle('⚔️ Rise Request - DENIED ❌')
            .setDescription(
                `**Knight:** <@${userId}>\n` +
                `**Denied By:** ${interaction.user.tag} (Overseer)\n\n` +
                '*The Knight must remain in stasis...*'
            )
            .setColor('#FF0000')
            .setTimestamp();

        await interaction.message.edit({ 
            embeds: [deniedEmbed], 
            components: [] 
        });

        await interaction.editReply({ 
            content: 'Rise request denied successfully.'
        });

    } catch (error) {
        console.error('Error denying rise:', error);
        await interaction.editReply({ 
            content: 'Error denying rise request.'
        });
    }
}
`
//EntombedKnights End`

// Show scorecard creation modal (Part 1)
async function showScorecardCreationModal(interaction, targetUserId, targetUsername) {
    try {
        console.log('=== SCORECARD MODAL PART 1 ===');
        console.log('User opening modal:', interaction.user.tag);
        console.log('Target user ID:', targetUserId);
        console.log('Target username:', targetUsername);
        
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        
        // Use the actual username but truncate if necessary to fit 45 characters
        const displayName = targetUsername || 'Unknown User';
        
        // Create a shorter title that fits within Discord's 45 character limit
        const baseTitle = 'Blightveil Scorecard - Part 1';
        const maxUsernameLength = 45 - baseTitle.length - 3; // -3 for " for "
        
        let finalDisplayName = displayName;
        if (displayName.length > maxUsernameLength) {
            finalDisplayName = displayName.substring(0, maxUsernameLength - 3) + '...';
        }
        
        let modalTitle = `${baseTitle} for ${finalDisplayName}`;
        
        // Double-check the length to be safe
        if (modalTitle.length > 45) {
            // Fallback to a generic title if still too long
            modalTitle = 'Blightveil Scorecard - Part 1';
        }
        
        const modal = new ModalBuilder()
            .setCustomId(`scorecard_modal_1_${targetUserId}_${targetUsername}`)
            .setTitle(modalTitle);

        // First modal: Aim categories and basic skills
        const categoriesPart1 = [
            'Aim - Snap', 
            'Aim - Tracking', 
            'Aim - Accuracy',
            'Teamplay',
            'Comms'
        ];

        // Add categories to modal (5 rows)
        categoriesPart1.forEach(category => {
            const input = new TextInputBuilder()
                .setCustomId(category.toLowerCase().replace(/ - /g, '_').replace(/ /g, '_'))
                .setLabel(category)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('0-10 (0 = N/A)')
                .setRequired(true)
                .setMaxLength(2);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
        });

        await interaction.showModal(modal);
        console.log('Part 1 modal shown successfully');

    } catch (error) {
        console.error('Error in showScorecardCreationModal:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while opening the scorecard form.', 
            flags: 64 // MessageFlags.Ephemeral
        });
    }
}

// Handle scorecard modal part 2 submission
async function handleScorecardModalPart2(interaction) {
    try {
        console.log('=== HANDLING PART 2 SUBMISSION ===');
        console.log('Modal customId:', interaction.customId);
        
        const targetUserId = interaction.customId.split('_')[3];
        console.log('Target user ID from modal:', targetUserId);
        
        // Retrieve session data from storage
        const sessionKey = `${interaction.user.id}_${targetUserId}`;
        console.log('Looking for session with key:', sessionKey);
        
        const sessionData = interaction.client.scorecardSessions?.get(sessionKey);
        
        if (!sessionData) {
            console.error('No session data found!');
            return await interaction.reply({ 
                content: '❌ Session expired. Please start over.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        console.log('Found session data:', sessionData);
        
        const { scores: part1Scores, username: targetUsername } = sessionData;
        const scores = { ...part1Scores };
        
        // Extract scores from part 2 modal
        const categoriesPart2 = [
            'strategy', 
            'resource_management', 
            'game_knowledge',
            'leadership', 
            'mindset_growth'
        ];

        console.log('Looking for fields:', categoriesPart2);
        console.log('Available fields:', interaction.fields.fields.map(f => f.customId));

        for (const category of categoriesPart2) {
            try {
                const value = interaction.fields.getTextInputValue(category);
                console.log(`Field ${category} value: ${value}`);
                
                const score = parseInt(value, 10);
                
                if (isNaN(score) || score < 0 || score > 10) {
                    return await interaction.reply({ 
                        content: `❌ Invalid score for ${category.replace(/_/g, ' ')}. Please enter a number between 0-10 (0 = N/A).`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                scores[category] = score;
            } catch (fieldError) {
                console.error(`Error getting field ${category}:`, fieldError.message);
                return await interaction.reply({ 
                    content: `❌ Missing field: ${category.replace(/_/g, ' ')}. Please make sure all fields are filled.`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }

        console.log('All scores collected:', scores);

        // Update session with all scores
        sessionData.scores = scores;
        interaction.client.scorecardSessions.set(sessionKey, sessionData);

        // Create display text for scores
        const createScoreDisplay = (score) => score === 0 ? '⭐ N/A' : `⭐ ${score}/10`;

        const embed = new EmbedBuilder()
            .setTitle('🎯 Scorecard - Part 2 Complete')
            .setDescription('✅ Part 2 scores saved!\n\n**Click the button below to continue to Part 3 (Tag Selection)**')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Strategy', value: createScoreDisplay(scores.strategy), inline: true },
                { name: 'Resource Management', value: createScoreDisplay(scores.resource_management), inline: true },
                { name: 'Game Knowledge', value: createScoreDisplay(scores.game_knowledge), inline: true },
                { name: 'Leadership', value: createScoreDisplay(scores.leadership), inline: true },
                { name: 'Mindset & Growth', value: createScoreDisplay(scores.mindset_growth), inline: true }
            )
            .setFooter({ text: 'Continue to Part 3 for tag selection' });

        const button = new ButtonBuilder()
            .setCustomId(`scorecard_continue_3_${targetUserId}`)
            .setLabel('Continue to Part 3')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏁');

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ 
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral 
        });

    } catch (error) {
        console.error('Error handling scorecard modal part 2:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while processing the second part of the form.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

// Show scorecard creation modal (Part 3) - For tag only
async function showScorecardModalPart3(interaction, targetUserId) {
    try {
        console.log('=== SCORECARD MODAL PART 3 ===');
        console.log('User opening modal part 3:', interaction.user.tag);
        
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        
        const modal = new ModalBuilder()
            .setCustomId(`scorecard_modal_3_${targetUserId}`)
            .setTitle('Scorecard - Specialty Tag');

        // Tag selection only
        const tagInput = new TextInputBuilder()
            .setCustomId('tag')
            .setLabel('Specialty Tag')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Pilot, Infantry, Support, Crewman')
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(new ActionRowBuilder().addComponents(tagInput));

        await interaction.showModal(modal);
        console.log('Part 3 modal shown successfully');

    } catch (error) {
        console.error('Error in showScorecardModalPart3:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while opening the final part of the form.', 
            flags: 64
        });
    }
}

// Show scorecard creation modal (Part 2)
async function showScorecardModalPart2(interaction, targetUserId) {
    try {
        console.log('=== SCORECARD MODAL PART 2 ===');
        console.log('User opening modal part 2:', interaction.user.tag);
        console.log('Target user ID:', targetUserId);
        
        // Get the username from session data
        const sessionKey = `${interaction.user.id}_${targetUserId}`;
        const sessionData = interaction.client.scorecardSessions?.get(sessionKey);
        const targetUsername = sessionData?.username || 'Unknown';
        
        console.log('Target username from session:', targetUsername);
        
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        
        const modalTitle = 'Blightveil Scorecard - Part 2';
        
        const modal = new ModalBuilder()
            .setCustomId(`scorecard_modal_2_${targetUserId}`)
            .setTitle(modalTitle);

        // Second modal: Strategy, knowledge, leadership, and mindset
        // Define categories with their exact custom IDs
        const categoriesPart2 = [
            { label: 'Strategy', id: 'strategy' },
            { label: 'Resource Management', id: 'resource_management' }, 
            { label: 'Game Knowledge', id: 'game_knowledge' },
            { label: 'Leadership', id: 'leadership' },
            { label: 'Mindset & Growth', id: 'mindset_growth' }  // Explicitly set the ID
        ];

        // Add ALL remaining categories to modal (5 rows)
        categoriesPart2.forEach(category => {
            console.log(`Adding field: "${category.label}" with ID: "${category.id}"`);
            
            const input = new TextInputBuilder()
                .setCustomId(category.id)  // Use the explicit ID
                .setLabel(category.label)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('0-10 (0 = N/A)')
                .setRequired(true)
                .setMaxLength(2);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
        });

        await interaction.showModal(modal);
        console.log('Part 2 modal shown successfully with all fields');

    } catch (error) {
        console.error('Error in showScorecardModalPart2:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while opening the second part of the form.', 
            flags: 64
        });
    }
}

// Handle scorecard modal submission
async function handleScorecardModalSubmit(interaction) {
    try {
        // Add the required constants
        const SCORECARD_TAGS = {
            'Pilot': '🛩️',
            'Infantry': '🎯', 
            'Support': '🛠️',
            'Crewman': '👨‍🔧'
        };

        const targetUserId = interaction.customId.split('_')[2];
        const scores = {};
        
        // Extract scores from modal
        const categories = [
            'aim_snap', 'aim_tracking', 'aim_accuracy', 
            'teamplay', 'comms', 'strategy', 
            'resource_management', 'game_knowledge'
        ];

        for (const category of categories) {
            const value = interaction.fields.getTextInputValue(category);
            const score = parseInt(value, 10);
            
            // UPDATED: Allow 0 for N/A, otherwise 1-10
            if (isNaN(score) || score < 0 || score > 10) {
                return await interaction.reply({ 
                    content: `❌ Invalid score for ${category.replace(/_/g, ' ')}. Please enter a number between 0-10 (0 = N/A).`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
            
            scores[category] = score;
        }

        // Calculate average aim score (only calculate if all aim scores are > 0)
        const aimScores = [scores.aim_snap, scores.aim_tracking, scores.aim_accuracy];
        const validAimScores = aimScores.filter(score => score > 0);
        const aimAvg = validAimScores.length > 0 ? Math.round(validAimScores.reduce((a, b) => a + b, 0) / validAimScores.length) : 0;
        scores.aim_avg = aimAvg;

        // Get tag
        const tagInput = interaction.fields.getTextInputValue('tag');
        const tag = Object.keys(SCORECARD_TAGS).find(t => t.toLowerCase() === tagInput.toLowerCase());
        
        if (!tag) {
            return await interaction.reply({ 
                content: '❌ Invalid tag. Please use: Pilot, Infantry, Support, or Crewman', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Save to database
        await saveScorecardToDB(targetUserId, scores, tag, interaction.user.id);

        // Generate and send scorecard image
        try {
            const scorecardImageGenerator = require('../utils/scorecardImageGenerator');
            const targetUser = await interaction.client.users.fetch(targetUserId);
            
            // Create scorecard object for image generator
            const scorecardData = {
                aim_snap: scores.aim_snap,
                aim_tracking: scores.aim_tracking,
                aim_accuracy: scores.aim_accuracy,
                aim_avg: scores.aim_avg,
                teamplay: scores.teamplay,
                comms: scores.comms,
                strategy: scores.strategy,
                resource_management: scores.resource_management,
                game_knowledge: scores.game_knowledge,
                updated_at: new Date()
            };

            // FIX: Pass User object and guild for nickname lookup
            const canvas = await scorecardImageGenerator.generateScorecardImage(targetUser, scorecardData, tag, interaction.guild);
            const attachment = await scorecardImageGenerator.createImageAttachment(canvas, `scorecard_${targetUser.username}.png`);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Scorecard Created')
                .setDescription(`${SCORECARD_TAGS[tag]} ${tag} Scorecard for ${targetUser.tag}`)
                .setColor(0x00FF00)
                .setImage(`attachment://scorecard_${targetUser.username}.png`)
                .setFooter({ text: `Created by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [embed],
                files: [attachment],
                flags: MessageFlags.Ephemeral 
            });

        } catch (imageError) {
            console.error('Error generating scorecard image:', imageError);
            await interaction.reply({ 
                content: `✅ Scorecard created for <@${targetUserId}>! (Image generation failed)`,
                flags: MessageFlags.Ephemeral 
            });
        }

    } catch (error) {
        console.error('Error handling scorecard modal:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while saving the scorecard.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

// Save scorecard to database - UPDATED to update if user exists
async function saveScorecardToDB(userId, scores, tag, createdBy) {
    const pool = await connectToMySQL();
    
    // Check if scorecard already exists
    const [existingRows] = await pool.execute(
        'SELECT id FROM scorecards WHERE user_id = ? AND tag = ?',
        [userId, tag]
    );

    if (existingRows.length > 0) {
        // Update existing scorecard
        await pool.execute(`
            UPDATE scorecards SET
                aim_snap = ?, aim_tracking = ?, aim_accuracy = ?, aim_avg = ?,
                teamplay = ?, comms = ?, strategy = ?, resource_management = ?,
                game_knowledge = ?, leadership = ?, mindset_growth = ?,
                created_by = ?, updated_at = NOW()
            WHERE user_id = ? AND tag = ?
        `, [
            scores.aim_snap, scores.aim_tracking, scores.aim_accuracy, scores.aim_avg,
            scores.teamplay, scores.comms, scores.strategy, scores.resource_management,
            scores.game_knowledge, scores.leadership, scores.mindset_growth,
            createdBy,
            userId, tag
        ]);
    } else {
        // Create new scorecard
        await pool.execute(`
            INSERT INTO scorecards (
                user_id, aim_snap, aim_tracking, aim_accuracy, aim_avg,
                teamplay, comms, strategy, resource_management, game_knowledge,
                leadership, mindset_growth, tag, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            userId,
            scores.aim_snap, scores.aim_tracking, scores.aim_accuracy, scores.aim_avg,
            scores.teamplay, scores.comms, scores.strategy, scores.resource_management,
            scores.game_knowledge, scores.leadership, scores.mindset_growth,
            tag, createdBy
        ]);
    }
}

// Handle scorecard modal part 1 submission
async function handleScorecardModalPart1(interaction) {
    try {
        const parts = interaction.customId.split('_');
        const targetUserId = parts[3];
        const targetUsername = parts.slice(4).join('_'); // FIX: Join all parts after index 4
        
        console.log('Part 1 submission - Target user ID:', targetUserId);
        console.log('Part 1 submission - Target username:', targetUsername);
        
        const part1Scores = {};
        
        // Extract scores from part 1 modal
        const categoriesPart1 = [
            'aim_snap', 'aim_tracking', 'aim_accuracy', 
            'teamplay', 'comms'
        ];

        for (const category of categoriesPart1) {
            const value = interaction.fields.getTextInputValue(category);
            const score = parseInt(value, 10);
            
            if (isNaN(score) || score < 0 || score > 10) {
                return await interaction.reply({ 
                    content: `❌ Invalid score for ${category.replace(/_/g, ' ')}. Please enter a number between 0-10 (0 = N/A).`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
            
            part1Scores[category] = score;
        }

        // Store part1 scores in the client for later use
        if (!interaction.client.scorecardSessions) {
            interaction.client.scorecardSessions = new Map();
        }
        const sessionKey = `${interaction.user.id}_${targetUserId}`;
        interaction.client.scorecardSessions.set(sessionKey, {
            scores: part1Scores,
            username: targetUsername
        });

        console.log('Session stored with key:', sessionKey);
        console.log('Session data:', {
            scores: part1Scores,
            username: targetUsername
        });

        // Create display text for scores (show N/A for 0)
        const createScoreDisplay = (score) => score === 0 ? '⭐ N/A' : `⭐ ${score}/10`;

        // Send a message with a button to continue to part 2
        const embed = new EmbedBuilder()
            .setTitle('🎯 Scorecard - Part 1 Complete')
            .setDescription('✅ Part 1 scores saved!\n\n**Click the button below to continue to Part 2**')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Aim - Snap', value: createScoreDisplay(part1Scores.aim_snap), inline: true },
                { name: 'Aim - Tracking', value: createScoreDisplay(part1Scores.aim_tracking), inline: true },
                { name: 'Aim - Accuracy', value: createScoreDisplay(part1Scores.aim_accuracy), inline: true },
                { name: 'Teamplay', value: createScoreDisplay(part1Scores.teamplay), inline: true },
                { name: 'Comms', value: createScoreDisplay(part1Scores.comms), inline: true }
            )
            .setFooter({ text: 'Continue to Part 2 for remaining categories' });

        const button = new ButtonBuilder()
            .setCustomId(`scorecard_continue_2_${targetUserId}`)
            .setLabel('Continue to Part 2')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️');

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ 
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral 
        });

    } catch (error) {
        console.error('Error handling scorecard modal part 1:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while processing the first part of the form.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

// Handle scorecard modal part 2 submission
async function handleScorecardModalPart2(interaction) {
    try {
        console.log('=== HANDLING PART 2 SUBMISSION ===');
        console.log('Modal customId:', interaction.customId);
        
        const targetUserId = interaction.customId.split('_')[3];
        console.log('Target user ID from modal:', targetUserId);
        
        // Retrieve session data from storage
        const sessionKey = `${interaction.user.id}_${targetUserId}`;
        console.log('Looking for session with key:', sessionKey);
        
        const sessionData = interaction.client.scorecardSessions?.get(sessionKey);
        
        if (!sessionData) {
            console.error('No session data found!');
            return await interaction.reply({ 
                content: '❌ Session expired. Please start over.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        console.log('Found session data:', sessionData);
        
        const { scores: part1Scores, username: targetUsername } = sessionData;
        const scores = { ...part1Scores };
        
        // First, let's debug what fields are actually available
        console.log('=== AVAILABLE FIELDS DEBUG ===');
        const availableFields = [];
        interaction.fields.fields.forEach((field, id) => {
            console.log(`Field found - ID: "${id}", Type: ${field.type}, Label: ${field.label || 'N/A'}`);
            availableFields.push(id);
        });
        
        console.log('Available field IDs:', availableFields);
        console.log('Number of fields:', availableFields.length);
        
        // Extract scores from part 2 modal
        const categoriesPart2 = [
            'strategy', 
            'resource_management', 
            'game_knowledge',
            'leadership', 
            'mindset_growth'
        ];

        console.log('Looking for these specific fields:', categoriesPart2);

        for (const category of categoriesPart2) {
            console.log(`\n--- Processing field: "${category}" ---`);
            
            // Check if field exists in available fields
            if (!availableFields.includes(category)) {
                console.error(`Field "${category}" NOT FOUND in available fields!`);
                console.error(`Available fields: ${availableFields.join(', ')}`);
                
                // Try to find a field that might have a similar ID
                const similarField = availableFields.find(f => f.includes(category));
                if (similarField) {
                    console.log(`Found similar field: "${similarField}"`);
                }
                
                return await interaction.reply({ 
                    content: `❌ Missing field: ${category.replace(/_/g, ' ')}. The form may not have loaded correctly. Please try again.`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
            
            try {
                const value = interaction.fields.getTextInputValue(category);
                console.log(`Field "${category}" value: "${value}"`);
                
                const score = parseInt(value, 10);
                
                if (isNaN(score) || score < 0 || score > 10) {
                    return await interaction.reply({ 
                        content: `❌ Invalid score for ${category.replace(/_/g, ' ')}. Please enter a number between 0-10 (0 = N/A).`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                scores[category] = score;
                console.log(`✓ Successfully saved score for "${category}": ${score}`);
                
            } catch (fieldError) {
                console.error(`Error getting field "${category}":`, fieldError.message);
                console.error('Field error stack:', fieldError.stack);
                return await interaction.reply({ 
                    content: `❌ Error with field: ${category.replace(/_/g, ' ')}. ${fieldError.message}`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }

        console.log('✓ All scores collected successfully:', scores);

        // Update session with all scores
        sessionData.scores = scores;
        interaction.client.scorecardSessions.set(sessionKey, sessionData);

        // Create display text for scores
        const createScoreDisplay = (score) => score === 0 ? '⭐ N/A' : `⭐ ${score}/10`;

        const embed = new EmbedBuilder()
            .setTitle('🎯 Scorecard - Part 2 Complete')
            .setDescription('✅ Part 2 scores saved!\n\n**Click the button below to continue to Part 3 (Tag Selection)**')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Strategy', value: createScoreDisplay(scores.strategy), inline: true },
                { name: 'Resource Management', value: createScoreDisplay(scores.resource_management), inline: true },
                { name: 'Game Knowledge', value: createScoreDisplay(scores.game_knowledge), inline: true },
                { name: 'Leadership', value: createScoreDisplay(scores.leadership), inline: true },
                { name: 'Mindset & Growth', value: createScoreDisplay(scores.mindset_growth), inline: true }
            )
            .setFooter({ text: 'Continue to Part 3 for tag selection' });

        const button = new ButtonBuilder()
            .setCustomId(`scorecard_continue_3_${targetUserId}`)
            .setLabel('Continue to Part 3')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏁');

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ 
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral 
        });

    } catch (error) {
        console.error('Error handling scorecard modal part 2:', error);
        console.error('Error details:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while processing the second part of the form.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

// Handle scorecard modal part 3 submission (final submission)
async function handleScorecardModalPart3(interaction) {
    try {
        const SCORECARD_TAGS = {
            'Pilot': '🛩️',
            'Infantry': '🎯', 
            'Support': '🛠️',
            'Crewman': '👨‍🔧'
        };

        const targetUserId = interaction.customId.split('_')[3];
        
        // Retrieve session data
        const sessionKey = `${interaction.user.id}_${targetUserId}`;
        const sessionData = interaction.client.scorecardSessions?.get(sessionKey);
        
        if (!sessionData) {
            return await interaction.reply({ 
                content: '❌ Session expired. Please start over.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const { scores, username: targetUsername } = sessionData;
        
        // Get tag
        const tagInput = interaction.fields.getTextInputValue('tag');
        const tag = Object.keys(SCORECARD_TAGS).find(t => t.toLowerCase() === tagInput.toLowerCase());
        
        if (!tag) {
            return await interaction.reply({ 
                content: '❌ Invalid tag. Please use: Pilot, Infantry, Support, or Crewman', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Calculate average aim score
        const aimScores = [scores.aim_snap, scores.aim_tracking, scores.aim_accuracy];
        const validAimScores = aimScores.filter(score => score > 0);
        const aimAvg = validAimScores.length > 0 ? Math.round(validAimScores.reduce((a, b) => a + b, 0) / validAimScores.length) : 0;
        scores.aim_avg = aimAvg;

        // Clean up the session
        interaction.client.scorecardSessions?.delete(sessionKey);

        // Save or update to database - always update if user exists
        const pool = await connectToMySQL();
        
        // Check if scorecard already exists for this user and tag
        const [existingRows] = await pool.execute(
            'SELECT id FROM scorecards WHERE user_id = ? AND tag = ?',
            [targetUsername, tag]
        );

        let action = 'created';
        
        if (existingRows.length > 0) {
            // Update existing scorecard
            action = 'updated';
            await pool.execute(`
                UPDATE scorecards SET
                    aim_snap = ?, aim_tracking = ?, aim_accuracy = ?, aim_avg = ?,
                    teamplay = ?, comms = ?, strategy = ?, resource_management = ?,
                    game_knowledge = ?, leadership = ?, mindset_growth = ?,
                    created_by = ?, updated_at = NOW()
                WHERE user_id = ? AND tag = ?
            `, [
                scores.aim_snap, scores.aim_tracking, scores.aim_accuracy, scores.aim_avg,
                scores.teamplay, scores.comms, scores.strategy, scores.resource_management,
                scores.game_knowledge, scores.leadership, scores.mindset_growth,
                interaction.user.id,
                targetUsername, tag
            ]);
        } else {
            // Create new scorecard
            await pool.execute(`
                INSERT INTO scorecards (
                    user_id, aim_snap, aim_tracking, aim_accuracy, aim_avg,
                    teamplay, comms, strategy, resource_management, game_knowledge,
                    leadership, mindset_growth, tag, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                targetUsername,
                scores.aim_snap, scores.aim_tracking, scores.aim_accuracy, scores.aim_avg,
                scores.teamplay, scores.comms, scores.strategy, scores.resource_management,
                scores.game_knowledge, scores.leadership, scores.mindset_growth,
                tag, interaction.user.id
            ]);
        }

        // Generate and send scorecard image
        try {
            const scorecardImageGenerator = require('../utils/scorecardImageGenerator');
            
            // Create scorecard object with ALL categories
            const scorecardData = {
                aim_snap: scores.aim_snap,
                aim_tracking: scores.aim_tracking,
                aim_accuracy: scores.aim_accuracy,
                aim_avg: scores.aim_avg,
                teamplay: scores.teamplay,
                comms: scores.comms,
                strategy: scores.strategy,
                resource_management: scores.resource_management,
                game_knowledge: scores.game_knowledge,
                leadership: scores.leadership,
                mindset_growth: scores.mindset_growth,
                updated_at: new Date()
            };

            // Get the target user
            let targetUser;
            try {
                targetUser = await interaction.client.users.fetch(targetUserId);
            } catch (error) {
                targetUser = interaction.user;
            }

            const canvas = await scorecardImageGenerator.generateScorecardImage(targetUser, scorecardData, tag, interaction.guild);
            const safeFilename = `scorecard_${targetUsername.replace(/[^a-zA-Z0-9]/g, '_')}_${tag}.png`;
            const attachment = await scorecardImageGenerator.createImageAttachment(canvas, safeFilename);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Scorecard ' + (action === 'created' ? 'Created' : 'Updated'))
                .setDescription(`${SCORECARD_TAGS[tag]} ${tag} Scorecard for ${targetUsername} has been ${action}!`)
                .setColor(action === 'created' ? 0x00FF00 : 0xFFA500) // Green for created, Orange for updated
                .setImage(`attachment://${safeFilename}`)
                .setFooter({ text: `${action.charAt(0).toUpperCase() + action.slice(1)} by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [embed],
                files: [attachment],
                flags: MessageFlags.Ephemeral 
            });

        } catch (imageError) {
            console.error('Error generating scorecard image:', imageError);
            await interaction.reply({ 
                content: `✅ Scorecard ${action} for ${targetUsername}! (Image generation failed: ${imageError.message})`,
                flags: MessageFlags.Ephemeral 
            });
        }

    } catch (error) {
        console.error('Error handling scorecard modal part 3:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while saving the scorecard.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

// Handle scorecard selection from menu
async function handleScorecardSelection(interaction, username, tag) {
    try {
        const pool = await connectToMySQL();
        const [rows] = await pool.execute(
            'SELECT * FROM scorecards WHERE user_id = ? AND tag = ? ORDER BY updated_at DESC LIMIT 1',
            [username, tag]
        );

        if (rows.length === 0) {
            return await interaction.reply({ 
                content: '❌ Scorecard not found.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const scorecard = rows[0];

        try {
            // FIX: Convert username to User object for nickname lookup
            let targetUser;
            try {
                // Try to find the user by username in the guild
                const members = await interaction.guild.members.fetch();
                const member = members.find(m => 
                    m.user.username === username || 
                    m.displayName === username ||
                    m.nickname === username
                );
                
                if (member) {
                    targetUser = member.user;
                    console.log(`[DEBUG] Found user in guild: ${targetUser.username} (Nickname: ${member.nickname})`);
                } else {
                    // Fallback to using the interaction user (creator)
                    targetUser = interaction.user;
                    console.log(`[DEBUG] User ${username} not found in guild, using creator: ${targetUser.username}`);
                }
            } catch (memberError) {
                console.log(`[DEBUG] Error fetching members, using creator: ${memberError.message}`);
                targetUser = interaction.user;
            }

            // Generate scorecard image with User object
            const canvas = await scorecardImageGenerator.generateScorecardImage(targetUser, scorecard, scorecard.tag, interaction.guild);
            const safeFilename = `scorecard_${username.replace(/[^a-zA-Z0-9]/g, '_')}_${scorecard.tag}.png`;
            const attachment = await scorecardImageGenerator.createImageAttachment(canvas, safeFilename);

            const embed = new EmbedBuilder()
                .setTitle('🎯 Blightveil Infantry Scorecard')
                .setDescription(`${SCORECARD_TAGS[scorecard.tag]} ${scorecard.tag} Scorecard for ${username}`)
                .setColor(0x0099FF)
                .setImage(`attachment://${safeFilename}`)
                .setFooter({ text: `Last updated • ${new Date(scorecard.updated_at).toLocaleDateString()}` })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [embed],
                files: [attachment],
                flags: MessageFlags.Ephemeral 
            });
        } catch (imageError) {
            console.error('Error generating scorecard image:', imageError);
            // Fallback to embed without image
            const embed = new EmbedBuilder()
                .setTitle('🎯 Blightveil Infantry Scorecard')
                .setDescription(`${SCORECARD_TAGS[scorecard.tag]} ${scorecard.tag} Scorecard for ${username}`)
                .setColor(0x0099FF)
                .addFields(
                    { name: 'Aim - Snap', value: `${scorecard.aim_snap}/10`, inline: true },
                    { name: 'Aim - Tracking', value: `${scorecard.aim_tracking}/10`, inline: true },
                    { name: 'Aim - Accuracy', value: `${scorecard.aim_accuracy}/10`, inline: true },
                    { name: 'Aim - Average', value: `${scorecard.aim_avg}/10`, inline: true },
                    { name: 'Teamplay', value: `${scorecard.teamplay}/10`, inline: true },
                    { name: 'Comms', value: `${scorecard.comms}/10`, inline: true },
                    { name: 'Strategy', value: `${scorecard.strategy}/10`, inline: true },
                    { name: 'Resource Management', value: `${scorecard.resource_management}/10`, inline: true },
                    { name: 'Game Knowledge', value: `${scorecard.game_knowledge}/10`, inline: true }
                )
                .setFooter({ text: `Last updated • ${new Date(scorecard.updated_at).toLocaleDateString()}` })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [embed],
                flags: MessageFlags.Ephemeral 
            });
        }

    } catch (error) {
        console.error('Error handling scorecard selection:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while loading the scorecard.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

// === RED CHANNEL DM BUTTON HANDLERS ===
async function handleRedChannelAcknowledge(interaction) {
    try {
        await interaction.update({
            content: '✅ **You acknowledged the Red Channel warning.**\n\nYou may now continue in the voice channel. Remember: feedback will be direct and instant.',
            embeds: [],
            components: []
        });
        console.log(`✅ ${interaction.user.tag} acknowledged red channel warning`);
    } catch (error) {
        console.error('Error handling red channel acknowledge:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your response.',
                ephemeral: true
            });
        }
    }
}

async function handleRedChannelLeave(interaction) {
    try {
        console.log(`🔄 Handling red channel leave for ${interaction.user.tag}`);
        
        // Update the interaction first to acknowledge it
        await interaction.update({
            content: '👋 Disconnecting you from the voice channel...',
            embeds: [],
            components: []
        });
        
        // Find the user's voice channel and disconnect them
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        
        if (member?.voice.channel) {
            console.log(`🔴 Disconnecting ${interaction.user.tag} from ${member.voice.channel.name}`);
            
            try {
                await member.voice.disconnect();
                console.log(`✅ Successfully disconnected ${interaction.user.tag}`);
                
                // Send success follow-up
                await interaction.followUp({
                    content: '👋 **You made the responsible choice.**\n\nThank you for being self-aware. No hard feelings!',
                    ephemeral: true
                });
                
            } catch (disconnectError) {
                console.error(`❌ Failed to disconnect ${interaction.user.tag}:`, disconnectError);
                
                // Send error follow-up
                await interaction.followUp({
                    content: '❌ I was unable to disconnect you. Please leave the voice channel manually.',
                    ephemeral: true
                });
            }
        } else {
            console.log(`ℹ️ ${interaction.user.tag} is not in a voice channel`);
            await interaction.followUp({
                content: '👋 **You made the responsible choice.**\n\nThank you for being self-aware. No hard feelings!',
                ephemeral: true
            });
        }
        
    } catch (error) {
        console.error('Error handling red channel leave:', error);
        
        // Final fallback
        try {
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        } catch {
            // If all else fails, just log the error
            console.error('Complete failure in handleRedChannelLeave:', error);
        }
    }
}

/**
 * Handle Star Citizen Status Subscribe button
 */
async function handleSCStatusSubscribe(interaction, client) {
    try {
        // Get the status monitor instance from the client
        if (!client.starCitizenMonitor) {
            return await interaction.reply({
                content: 'Status monitor is not available at the moment. Please try again later.',
                ephemeral: true
            });
        }
        
        await client.starCitizenMonitor.subscribeUser(interaction);
    } catch (error) {
        console.error('Error handling SC status subscribe:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your subscription request.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle Star Citizen Status Unsubscribe button
 */
async function handleSCStatusUnsubscribe(interaction, client) {
    try {
        // Get the status monitor instance from the client
        if (!client.starCitizenMonitor) {
            return await interaction.reply({
                content: 'Status monitor is not available at the moment. Please try again later.',
                ephemeral: true
            });
        }
        
        await client.starCitizenMonitor.unsubscribeUser(interaction);
    } catch (error) {
        console.error('Error handling SC status unsubscribe:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'An error occurred while processing your unsubscribe request.',
                ephemeral: true
            });
        }
    }
}

// ========== COMPLEX EMBED HANDLERS ==========

const EMBED_PERMISSIONS = {
    // Users must have ONE of these roles to edit (unless they're the original author)
    REQUIRED_ROLES_ANY: [
        '1304192471806246953', // Knight Leader
        '1304192533533819002' // Legion leader
    ],
    
    // Roles that can manage permissions (original author + these roles)
    ADMIN_ROLES: [
        '1168253795818549319', // SOV
        '1168644418484588694', // STEWARD 
        '1168234521301356715' // HC
    ]
};

// ========== PERMISSION CHECK FUNCTION ==========
async function canUserEditEmbed(userId, messageId, guild) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return false;
        
        const embedRecord = await getEmbedFromDatabase(messageId);
        if (!embedRecord) return false;
        
        // Always allow the original author
        if (embedRecord.discord_author_id === userId) {
            return true;
        }
        
        // Check if user has ANY required role
        const hasRequiredRole = EMBED_PERMISSIONS.REQUIRED_ROLES_ANY.some(roleId => 
            member.roles.cache.has(roleId)
        );
        
        return hasRequiredRole;
        
    } catch (error) {
        console.error('Error in canUserEditEmbed:', error);
        return false;
    }
}

// ========== DATABASE HELPER FUNCTIONS ==========

async function saveEmbedToDatabase(messageId, channelId, authorId, embedData) {
    try {
        const pool = await connectToMySQL();
        
        await pool.query(
            `INSERT INTO saved_embeds 
            (discord_message_id, discord_channel_id, discord_author_id, embed_data) 
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            embed_data = VALUES(embed_data),
            updated_at = CURRENT_TIMESTAMP`,
            [
                messageId,
                channelId,
                authorId,
                JSON.stringify(embedData)
            ]
        );
        
        return true;
    } catch (error) {
        console.error('Error saving embed to database:', error);
        return false;
    }
}

async function getEmbedFromDatabase(messageId) {
    try {
        const pool = await connectToMySQL();
        
        const [rows] = await pool.query(
            `SELECT * FROM saved_embeds WHERE discord_message_id = ?`,
            [messageId]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        const embedData = rows[0];
        embedData.embed_data = JSON.parse(embedData.embed_data);
        
        return embedData;
    } catch (error) {
        console.error('Error getting embed from database:', error);
        return null;
    }
}

async function updateEmbedInDatabase(messageId, newEmbedData) {
    try {
        const pool = await connectToMySQL();
        
        await pool.query(
            `UPDATE saved_embeds 
            SET embed_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE discord_message_id = ?`,
            [
                JSON.stringify(newEmbedData),
                messageId
            ]
        );
        
        return true;
    } catch (error) {
        console.error('Error updating embed in database:', error);
        return false;
    }
}

// ========== MAKE EMBED BUTTON HANDLER ==========
async function handleMakeEmbedButton(interaction, client) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('embed_basic_info_modal')
        .setTitle('Create an Embed - Basic Info');

    const plainTextInput = new TextInputBuilder()
        .setCustomId('plain_text')
        .setLabel('Plain Text (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter any pings or other plain text to send with embed')
        .setRequired(false)
        .setMaxLength(1000);

    const embedTitleInput = new TextInputBuilder()
        .setCustomId('embed_title')
        .setLabel('Embed Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter the main title for your embed')
        .setRequired(true)
        .setMaxLength(256);

    const embedDescriptionInput = new TextInputBuilder()
        .setCustomId('embed_description')
        .setLabel('Embed Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the main description/content for your embed')
        .setRequired(true)
        .setMaxLength(4000); // Discord.js limit

    const embedColorInput = new TextInputBuilder()
        .setCustomId('embed_color')
        .setLabel('Embed Color (Hex Code)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#3498db (leave empty for random)')
        .setRequired(false)
        .setMaxLength(7);

    const postChannelInput = new TextInputBuilder()
        .setCustomId('post_channel')
        .setLabel('Channel ID to Post In')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter the channel ID (right-click channel > Copy ID)')
        .setRequired(true)
        .setMaxLength(30);

    modal.addComponents(
        new ActionRowBuilder().addComponents(plainTextInput),
        new ActionRowBuilder().addComponents(embedTitleInput),
        new ActionRowBuilder().addComponents(embedDescriptionInput),
        new ActionRowBuilder().addComponents(embedColorInput),
        new ActionRowBuilder().addComponents(postChannelInput)
    );

    await interaction.showModal(modal);
}

// ========== BASIC INFO MODAL HANDLER ==========
async function handleEmbedBasicInfoModal(interaction, client) {
    try {
        const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
        
        // Store the basic info in the interaction's client for later use
        const embedData = {
            plainText: interaction.fields.getTextInputValue('plain_text'),
            title: interaction.fields.getTextInputValue('embed_title'),
            description: interaction.fields.getTextInputValue('embed_description'),
            color: interaction.fields.getTextInputValue('embed_color') || '#3498db',
            channelId: interaction.fields.getTextInputValue('post_channel'),
            fields: [],
            author: null,
            footer: null,
            image: null,
            thumbnail: null,
            timestamp: false,
            buttons: [] // Add buttons array
        };

        // Store data temporarily
        client.tempEmbedData = client.tempEmbedData || {};
        client.tempEmbedData[interaction.user.id] = embedData;

        // Create a select menu for additional options (add buttons option)
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('embed_options_menu')
            .setPlaceholder('Select additional embed options (optional)')
            .setMinValues(0)
            .setMaxValues(7) // Updated to 7 for new button option
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Add Fields')
                    .setDescription('Add multiple fields to your embed')
                    .setValue('add_fields')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Set Author')
                    .setDescription('Add author name and icon')
                    .setValue('set_author')
                    .setEmoji('👤'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Set Footer')
                    .setDescription('Add footer text and icon')
                    .setValue('set_footer')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Add Image')
                    .setDescription('Add a large image to embed')
                    .setValue('add_image')
                    .setEmoji('🖼️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Add Thumbnail')
                    .setDescription('Add a thumbnail image')
                    .setValue('add_thumbnail')
                    .setEmoji('🖼️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Add Timestamp')
                    .setDescription('Add current timestamp')
                    .setValue('add_timestamp')
                    .setEmoji('⏰'),
                // NEW: Add buttons option
                new StringSelectMenuOptionBuilder()
                    .setLabel('Add Buttons')
                    .setDescription('Add interactive buttons to your embed')
                    .setValue('add_buttons')
                    .setEmoji('🔘')
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '✅ Basic info saved! Now select any additional options you want to add to your embed:',
            components: [actionRow],
            ephemeral: true
        });

        const finishRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('finish_embed')
                .setLabel('Finish & Send Embed')
                .setStyle(3) // SUCCESS style
                .setEmoji('✅')
        );

        await interaction.followUp({
            content: 'When you\'re done adding options, click the button below to send your embed:',
            components: [finishRow],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleEmbedBasicInfoModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== EMBED OPTIONS MENU HANDLER ==========
async function handleEmbedOptionsMenu(interaction, client) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const selectedOptions = interaction.values;
    const embedData = client.tempEmbedData?.[interaction.user.id];

    if (!embedData) {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: '❌ Embed data not found. Please start over.', 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: '❌ Embed data not found. Please start over.', 
                ephemeral: true 
            });
        }
        return;
    }

    // Handle timestamp option first since it doesn't need a modal
    if (selectedOptions.includes('add_timestamp')) {
        embedData.timestamp = true;
        client.tempEmbedData[interaction.user.id] = embedData;
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: '✅ Timestamp will be added to your embed.', 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: '✅ Timestamp will be added to your embed.', 
                ephemeral: true 
            });
        }
        
        return;
    }

    // Handle other options
    for (const option of selectedOptions) {
        if (option === 'add_timestamp') continue;
        
        switch (option) {
            case 'add_fields':
                await showAddFieldModal(interaction, embedData);
                break;
            case 'set_author':
                await showAuthorModal(interaction, embedData);
                break;
            case 'set_footer':
                await showFooterModal(interaction, embedData);
                break;
            case 'add_image':
                await showImageModal(interaction, embedData, 'image');
                break;
            case 'add_thumbnail':
                await showImageModal(interaction, embedData, 'thumbnail');
                break;
            case 'add_buttons': // NEW: Handle buttons
                await showAddButtonsModal(interaction, embedData);
                break;
        }
    }

    client.tempEmbedData[interaction.user.id] = embedData;
}

// ========== BUTTON MANAGEMENT FUNCTIONS ==========

async function showAddButtonsModal(interaction, embedData) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('add_buttons_modal')
        .setTitle('Add Buttons to Embed');

    const buttonLabelInput = new TextInputBuilder()
        .setCustomId('button_label')
        .setLabel('Button Label')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter button text (max 80 chars)')
        .setRequired(true)
        .setMaxLength(80);

    const buttonCustomIdInput = new TextInputBuilder()
        .setCustomId('button_custom_id')
        .setLabel('Button Custom ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('unique_id_for_this_button')
        .setRequired(true)
        .setMaxLength(100);

    const buttonStyleInput = new TextInputBuilder()
        .setCustomId('button_style')
        .setLabel('Button Style (1-4)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1=Primary, 2=Secondary, 3=Success, 4=Danger')
        .setRequired(true)
        .setMaxLength(1);

    const buttonEmojiInput = new TextInputBuilder()
        .setCustomId('button_emoji')
        .setLabel('Button Emoji (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('🔘 or :emoji_name:')
        .setRequired(false)
        .setMaxLength(50);

    const buttonURLInput = new TextInputBuilder()
        .setCustomId('button_url')
        .setLabel('Button URL (Optional for link buttons)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(buttonLabelInput),
        new ActionRowBuilder().addComponents(buttonCustomIdInput),
        new ActionRowBuilder().addComponents(buttonStyleInput),
        new ActionRowBuilder().addComponents(buttonEmojiInput),
        new ActionRowBuilder().addComponents(buttonURLInput)
    );

    await interaction.showModal(modal);
}

async function handleAddButtonsModal(interaction, client) {
    try {
        // Check both possible locations for embed data
        let embedData = client.tempEmbedData?.[interaction.user.id]; // Creation flow
        let isEditMode = false;
        
        // If not found, check edit flow
        if (!embedData) {
            embedData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
            isEditMode = true;
        }
        
        if (!embedData) {
            throw new Error('Embed data not found. Please start over.');
        }

        const buttonLabel = interaction.fields.getTextInputValue('button_label');
        const buttonCustomId = interaction.fields.getTextInputValue('button_custom_id');
        const buttonStyle = parseInt(interaction.fields.getTextInputValue('button_style'));
        const buttonEmoji = interaction.fields.getTextInputValue('button_emoji') || null;
        const buttonURL = interaction.fields.getTextInputValue('button_url') || null;

        // Validate style
        if (isNaN(buttonStyle) || buttonStyle < 1 || buttonStyle > 5) {
            throw new Error('Button style must be a number between 1 and 5');
        }

        const newButton = {
            label: buttonLabel,
            customId: buttonCustomId,
            style: buttonStyle,
            emoji: buttonEmoji,
            url: buttonURL
        };

        // Initialize buttons array if it doesn't exist
        if (!embedData.buttons) {
            embedData.buttons = [];
        }

        // Check max buttons (Discord allows up to 5 buttons per row, 5 rows max)
        if (embedData.buttons.length >= 25) {
            throw new Error('Maximum number of buttons (25) reached.');
        }

        embedData.buttons.push(newButton);
        
        // Store back in the correct location
        if (isEditMode) {
            client.tempEmbedData[`edit_${interaction.user.id}`] = embedData;
        } else {
            client.tempEmbedData[interaction.user.id] = embedData;
        }

        // Show button management options
        const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('button_management_menu')
            .setPlaceholder('Button management options')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Add Another Button')
                    .setValue('add_another_button')
                    .setEmoji('➕'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('View Current Buttons')
                    .setValue('view_buttons')
                    .setEmoji('👁️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Remove a Button')
                    .setValue('remove_button')
                    .setEmoji('❌'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Clear All Buttons')
                    .setValue('clear_buttons')
                    .setEmoji('🗑️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Done with Buttons')
                    .setValue('done_buttons')
                    .setEmoji('✅')
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `✅ Button "${buttonLabel}" added successfully! Current buttons: ${embedData.buttons.length}/25\n\nWhat would you like to do next?`,
            components: [actionRow],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleAddButtonsModal:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: `❌ Error: ${error.message}`, 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: `❌ Error: ${error.message}`, 
                ephemeral: true 
            });
        }
    }
}

// Handle button management menu
async function handleButtonManagementMenu(interaction, client) {
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
    
    const action = interaction.values[0];
    const embedData = client.tempEmbedData?.[interaction.user.id];
    
    if (!embedData) {
        return interaction.reply({ 
            content: '❌ Embed data not found.', 
            ephemeral: true 
        });
    }

    if (!embedData.buttons) {
        embedData.buttons = [];
    }

    switch (action) {
        case 'add_another_button':
            await showAddButtonsModal(interaction, embedData);
            break;
            
        case 'view_buttons':
            let buttonList = '**Current Buttons:**\n';
            if (embedData.buttons.length === 0) {
                buttonList += 'No buttons added yet.';
            } else {
                embedData.buttons.forEach((btn, index) => {
                    buttonList += `${index + 1}. "${btn.label}" (ID: ${btn.customId})\n`;
                });
            }
            
            // Show management menu again
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('button_management_menu')
                .setPlaceholder('Button management options')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Add Another Button')
                        .setValue('add_another_button')
                        .setEmoji('➕'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Remove a Button')
                        .setValue('remove_button')
                        .setEmoji('❌'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Clear All Buttons')
                        .setValue('clear_buttons')
                        .setEmoji('🗑️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Done with Buttons')
                        .setValue('done_buttons')
                        .setEmoji('✅')
                );

            const actionRow = new ActionRowBuilder().addComponents(selectMenu);
            
            await interaction.reply({
                content: buttonList,
                components: [actionRow],
                ephemeral: true
            });
            break;
            
        case 'remove_button':
            if (embedData.buttons.length === 0) {
                return interaction.reply({ 
                    content: 'No buttons to remove.', 
                    ephemeral: true 
                });
            }
            
            const removeMenu = new StringSelectMenuBuilder()
                .setCustomId('remove_button_select')
                .setPlaceholder('Select button to remove')
                .setMinValues(1)
                .setMaxValues(1);
            
            embedData.buttons.forEach((btn, index) => {
                removeMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${index + 1}. ${btn.label}`)
                        .setValue(`button_${index}`)
                        .setDescription(`ID: ${btn.customId}`)
                );
            });
            
            const removeRow = new ActionRowBuilder().addComponents(removeMenu);
            
            await interaction.reply({
                content: 'Select which button to remove:',
                components: [removeRow],
                ephemeral: true
            });
            break;
            
        case 'clear_buttons':
            embedData.buttons = [];
            client.tempEmbedData[interaction.user.id] = embedData;
            
            await interaction.reply({ 
                content: '✅ All buttons cleared!', 
                ephemeral: true 
            });
            break;
            
        case 'done_buttons':
            await interaction.reply({ 
                content: '✅ Button setup complete! You can add more options or click "Finish & Send Embed".', 
                ephemeral: true 
            });
            break;
    }
}

// Handle remove button selection
async function handleRemoveButtonSelect(interaction, client) {
    const embedData = client.tempEmbedData?.[interaction.user.id];
    
    if (!embedData) {
        return interaction.reply({ 
            content: '❌ Embed data not found.', 
            ephemeral: true 
        });
    }
    
    const buttonIndex = parseInt(interaction.values[0].replace('button_', ''));
    
    if (buttonIndex >= embedData.buttons.length || buttonIndex < 0) {
        return interaction.reply({ 
            content: '❌ Button not found.', 
            ephemeral: true 
        });
    }
    
    const removedButton = embedData.buttons.splice(buttonIndex, 1)[0];
    client.tempEmbedData[interaction.user.id] = embedData;
    
    await interaction.reply({ 
        content: `✅ Button "${removedButton.label}" removed!`, 
        ephemeral: true 
    });
}

// ========== EDIT OPTIONS HANDLER ==========
async function handleEditEmbedOptions(interaction, client) {
    try {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
        
        const option = interaction.values[0];
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired. Please start over.', 
                ephemeral: true 
            });
        }
        
        switch (option) {
            case 'edit_title': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_title_modal')
                    .setTitle('Edit Embed Title');
                
                const titleInput = new TextInputBuilder()
                    .setCustomId('title')
                    .setLabel('New Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter new title')
                    .setValue(editData.title || '')
                    .setRequired(true)
                    .setMaxLength(256);
                
                modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_description': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_description_modal')
                    .setTitle('Edit Embed Description');
                
                const descInput = new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('New Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter new description')
                    .setValue(editData.description || '')
                    .setRequired(true)
                    .setMaxLength(4000);
                
                modal.addComponents(new ActionRowBuilder().addComponents(descInput));
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_color': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_color_modal')
                    .setTitle('Edit Embed Color');
                
                const colorInput = new TextInputBuilder()
                    .setCustomId('color')
                    .setLabel('New Color (Hex)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#3498db')
                    .setValue(editData.color || '#3498db')
                    .setRequired(false)
                    .setMaxLength(7);
                
                modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_plain_text': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_plain_text_modal')
                    .setTitle('Edit Plain Text');
                
                const plainTextInput = new TextInputBuilder()
                    .setCustomId('plain_text')
                    .setLabel('New Plain Text')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter new plain text (pings, etc.)')
                    .setValue(editData.plainText || '')
                    .setRequired(false)
                    .setMaxLength(1000);
                
                modal.addComponents(new ActionRowBuilder().addComponents(plainTextInput));
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_fields': {
                await showEditFieldsMenu(interaction, client, editData);
                break;
            }
            
            case 'edit_author': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_author_modal')
                    .setTitle('Edit Author');
                
                const authorNameInput = new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Author Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter author name')
                    .setValue(editData.author?.name || '')
                    .setRequired(true)
                    .setMaxLength(256);
                
                const authorIconInput = new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('Author Icon URL (Optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://example.com/icon.png')
                    .setValue(editData.author?.iconURL || '')
                    .setRequired(false);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(authorNameInput),
                    new ActionRowBuilder().addComponents(authorIconInput)
                );
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_footer': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_footer_modal')
                    .setTitle('Edit Footer');
                
                const footerTextInput = new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Footer Text')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter footer text')
                    .setValue(editData.footer?.text || '')
                    .setRequired(true)
                    .setMaxLength(2048);
                
                const footerIconInput = new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('Footer Icon URL (Optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://example.com/icon.png')
                    .setValue(editData.footer?.iconURL || '')
                    .setRequired(false);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(footerTextInput),
                    new ActionRowBuilder().addComponents(footerIconInput)
                );
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_image': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_image_modal')
                    .setTitle('Edit Main Image');
                
                const imageInput = new TextInputBuilder()
                    .setCustomId('image_url')
                    .setLabel('Image URL (Leave empty to remove)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://example.com/image.png')
                    .setValue(editData.image || '')
                    .setRequired(false);
                
                modal.addComponents(new ActionRowBuilder().addComponents(imageInput));
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_thumbnail': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_thumbnail_modal')
                    .setTitle('Edit Thumbnail');
                
                const thumbnailInput = new TextInputBuilder()
                    .setCustomId('thumbnail_url')
                    .setLabel('Thumbnail URL (Leave empty to remove)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://example.com/thumbnail.png')
                    .setValue(editData.thumbnail || '')
                    .setRequired(false);
                
                modal.addComponents(new ActionRowBuilder().addComponents(thumbnailInput));
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_timestamp': {
                // Toggle timestamp
                editData.timestamp = !editData.timestamp;
                client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
                
                await interaction.reply({ 
                    content: `✅ Timestamp ${editData.timestamp ? 'added' : 'removed'}! Select another option or choose "Preview & Save".`, 
                    ephemeral: true 
                });
                break;
            }
            
            case 'edit_buttons': {
                await showEditButtonsMenu(interaction, client, editData);
                break;
            }
            
            case 'edit_preview': {
                await showEditPreview(interaction, client, editData);
                break;
            }
            
            case 'edit_reset': {
                // Reset to original data
                const embedRecord = await getEmbedFromDatabase(editData.originalMessageId);
                if (embedRecord) {
                    client.tempEmbedData[`edit_${interaction.user.id}`] = {
                        ...embedRecord.embed_data,
                        originalMessageId: editData.originalMessageId,
                        isEditMode: true
                    };
                }
                
                await interaction.reply({ 
                    content: '✅ All changes reset to original! Select what you want to edit.', 
                    ephemeral: true 
                });
                break;
            }
            
            default:
                await interaction.reply({ 
                    content: '❌ This edit option is not yet implemented.', 
                    ephemeral: true 
                });
        }
        
    } catch (error) {
        console.error('Error in handleEditEmbedOptions:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== EDIT FIELDS MENU ==========
async function showEditFieldsMenu(interaction, client, editData) {
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('edit_fields_action')
        .setPlaceholder('Select field action')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Add New Field')
                .setValue('add_field')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Existing Field')
                .setValue('edit_field')
                .setEmoji('✏️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Field')
                .setValue('remove_field')
                .setEmoji('❌'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Clear All Fields')
                .setValue('clear_fields')
                .setEmoji('🗑️')
        );

    const actionRow = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({
        content: `**Edit Fields**\nCurrent fields: ${editData.fields.length}\nSelect an action:`,
        components: [actionRow],
        ephemeral: true
    });
}

// ========== EDIT BUTTONS MENU ==========
async function showEditButtonsMenu(interaction, client, editData) {
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('edit_buttons_action')
        .setPlaceholder('Select button action')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Add New Button')
                .setValue('add_button')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Existing Button')
                .setValue('edit_button')
                .setEmoji('✏️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Button')
                .setValue('remove_button')
                .setEmoji('❌'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Clear All Buttons')
                .setValue('clear_buttons')
                .setEmoji('🗑️')
        );

    const actionRow = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({
        content: `**Edit Buttons**\nCurrent buttons: ${editData.buttons?.length || 0}\nSelect an action:`,
        components: [actionRow],
        ephemeral: true
    });
}

// ========== SHOW EDIT PREVIEW ==========
async function showEditPreview(interaction, client, editData) {
    try {
        const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require('discord.js');
        
        // Build preview embed
        const previewEmbed = new EmbedBuilder()
            .setTitle(`📝 Preview: ${editData.title}`)
            .setDescription(editData.description)
            .setColor(editData.color);

        if (editData.fields.length > 0) {
            previewEmbed.addFields(...editData.fields);
        }

        if (editData.author) {
            previewEmbed.setAuthor(editData.author);
        }

        if (editData.footer) {
            previewEmbed.setFooter(editData.footer);
        }

        if (editData.image) {
            previewEmbed.setImage(editData.image);
        }

        if (editData.thumbnail) {
            previewEmbed.setThumbnail(editData.thumbnail);
        }

        if (editData.timestamp) {
            previewEmbed.setTimestamp();
        }
        
        // Create action buttons
        const saveButton = new ButtonBuilder()
            .setCustomId('save_embed_edit')
            .setLabel('Save Changes')
            .setStyle(3) // SUCCESS
            .setEmoji('💾');
            
        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_embed_edit')
            .setLabel('Cancel')
            .setStyle(2) // SECONDARY
            .setEmoji('❌');
            
        const continueButton = new ButtonBuilder()
            .setCustomId('continue_editing')
            .setLabel('Continue Editing')
            .setStyle(1) // PRIMARY
            .setEmoji('✏️');
            
        const row = new ActionRowBuilder().addComponents(saveButton, cancelButton, continueButton);
        
        let previewText = '**Embed Preview**\n';
        previewText += editData.plainText ? `Plain text will also be updated.\n\n` : '\n';
        previewText += 'Review your changes above, then:';
        
        await interaction.reply({
            content: previewText,
            embeds: [previewEmbed],
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in showEditPreview:', error);
        await interaction.reply({ 
            content: `❌ Error showing preview: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== MODAL DISPLAY FUNCTIONS ==========
async function showAddFieldModal(interaction, embedData) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('add_field_modal')
        .setTitle('Add Embed Field');

    const fieldNameInput = new TextInputBuilder()
        .setCustomId('field_name')
        .setLabel('Field Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter field name/title')
        .setRequired(true)
        .setMaxLength(256);

    const fieldValueInput = new TextInputBuilder()
        .setCustomId('field_value')
        .setLabel('Field Value')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter field content/value')
        .setRequired(true)
        .setMaxLength(1024);

    modal.addComponents(
        new ActionRowBuilder().addComponents(fieldNameInput),
        new ActionRowBuilder().addComponents(fieldValueInput)
    );

    await interaction.showModal(modal);
}

async function showAuthorModal(interaction, embedData) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('set_author_modal')
        .setTitle('Set Embed Author');

    const authorNameInput = new TextInputBuilder()
        .setCustomId('author_name')
        .setLabel('Author Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter author name')
        .setRequired(true)
        .setMaxLength(256);

    const authorIconInput = new TextInputBuilder()
        .setCustomId('author_icon')
        .setLabel('Author Icon URL (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/icon.png')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(authorNameInput),
        new ActionRowBuilder().addComponents(authorIconInput)
    );

    await interaction.showModal(modal);
}

async function showFooterModal(interaction, embedData) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('set_footer_modal')
        .setTitle('Set Embed Footer');

    const footerTextInput = new TextInputBuilder()
        .setCustomId('footer_text')
        .setLabel('Footer Text')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter footer text')
        .setRequired(true)
        .setMaxLength(2048);

    const footerIconInput = new TextInputBuilder()
        .setCustomId('footer_icon')
        .setLabel('Footer Icon URL (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/icon.png')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(footerTextInput),
        new ActionRowBuilder().addComponents(footerIconInput)
    );

    await interaction.showModal(modal);
}

async function showImageModal(interaction, embedData, type) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId(`${type}_modal`)
        .setTitle(`Set Embed ${type.charAt(0).toUpperCase() + type.slice(1)}`);

    const imageUrlInput = new TextInputBuilder()
        .setCustomId('image_url')
        .setLabel('Image URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/image.png')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(imageUrlInput));
    await interaction.showModal(modal);
}

// Handle field addition modal
async function handleAddFieldModal(interaction, client) {
    try {
        const embedData = client.tempEmbedData?.[interaction.user.id];
        if (!embedData) {
            throw new Error('Embed data not found.');
        }

        const fieldName = interaction.fields.getTextInputValue('field_name');
        const fieldValue = interaction.fields.getTextInputValue('field_value');

        embedData.fields.push({
            name: fieldName,
            value: fieldValue,
            inline: false
        });

        client.tempEmbedData[interaction.user.id] = embedData;

        // Check interaction state
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: `✅ Field "${fieldName}" added successfully! You can add more fields or click **Finish & Send Embed**.`, 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: `✅ Field "${fieldName}" added successfully! You can add more fields or click **Finish & Send Embed**.`, 
                ephemeral: true 
            });
        }

    } catch (error) {
        console.error('Error in handleAddFieldModal:', error);
        // Check interaction state for error response
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: `❌ Error: ${error.message}`, 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: `❌ Error: ${error.message}`, 
                ephemeral: true 
            });
        }
    }
}

// Handle author modal
async function handleAuthorModal(interaction, client) {
    try {
        const embedData = client.tempEmbedData?.[interaction.user.id];
        if (!embedData) {
            throw new Error('Embed data not found.');
        }

        embedData.author = {
            name: interaction.fields.getTextInputValue('author_name'),
            iconURL: interaction.fields.getTextInputValue('author_icon') || null
        };

        client.tempEmbedData[interaction.user.id] = embedData;

        await interaction.reply({ 
            content: '✅ Author set successfully! You can set more options or click **Finish & Send Embed**.', 
            ephemeral: true 
        });

    } catch (error) {
        console.error('Error in handleAuthorModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// Handle footer modal
async function handleFooterModal(interaction, client) {
    try {
        const embedData = client.tempEmbedData?.[interaction.user.id];
        if (!embedData) {
            throw new Error('Embed data not found.');
        }

        embedData.footer = {
            text: interaction.fields.getTextInputValue('footer_text'),
            iconURL: interaction.fields.getTextInputValue('footer_icon') || null
        };

        client.tempEmbedData[interaction.user.id] = embedData;

        await interaction.reply({ 
            content: '✅ Footer set successfully! You can set more options or click **Finish & Send Embed**.', 
            ephemeral: true 
        });

    } catch (error) {
        console.error('Error in handleFooterModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// Handle image modal
async function handleImageModal(interaction, type, client) {
    try {
        const embedData = client.tempEmbedData?.[interaction.user.id];
        if (!embedData) {
            throw new Error('Embed data not found.');
        }

        const imageUrl = interaction.fields.getTextInputValue('image_url');
        
        if (type === 'image') {
            embedData.image = imageUrl;
        } else if (type === 'thumbnail') {
            embedData.thumbnail = imageUrl;
        }

        client.tempEmbedData[interaction.user.id] = embedData;

        await interaction.reply({ 
            content: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} set successfully! You can set more options or click **Finish & Send Embed**.`, 
            ephemeral: true 
        });

    } catch (error) {
        console.error(`Error in handleImageModal (${type}):`, error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== EDIT MODAL HANDLERS ==========
async function handleEditTitleModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const newTitle = interaction.fields.getTextInputValue('title');
        editData.title = newTitle;
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Title updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditTitleModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditFieldsAction(interaction, client) {
    try {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
        
        const action = interaction.values[0];
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        switch (action) {
            case 'add_field': {
                const modal = new ModalBuilder()
                    .setCustomId('edit_add_field_modal')
                    .setTitle('Add New Field');
                
                const fieldNameInput = new TextInputBuilder()
                    .setCustomId('field_name')
                    .setLabel('Field Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter field name/title')
                    .setRequired(true)
                    .setMaxLength(256);
                
                const fieldValueInput = new TextInputBuilder()
                    .setCustomId('field_value')
                    .setLabel('Field Value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter field content/value')
                    .setRequired(true)
                    .setMaxLength(1024);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(fieldNameInput),
                    new ActionRowBuilder().addComponents(fieldValueInput)
                );
                
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_field': {
                if (editData.fields.length === 0) {
                    return interaction.reply({ 
                        content: '❌ No fields to edit. Add a field first.', 
                        ephemeral: true 
                    });
                }
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('edit_select_field')
                    .setPlaceholder('Select field to edit')
                    .setMinValues(1)
                    .setMaxValues(1);
                
                editData.fields.forEach((field, index) => {
                    const truncatedValue = field.value.length > 50 
                        ? field.value.substring(0, 47) + '...' 
                        : field.value;
                    
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${index + 1}. ${field.name}`)
                            .setValue(`field_${index}`)
                            .setDescription(truncatedValue)
                    );
                });
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                
                await interaction.reply({
                    content: 'Select which field to edit:',
                    components: [row],
                    ephemeral: true
                });
                break;
            }
            
            case 'remove_field': {
                if (editData.fields.length === 0) {
                    return interaction.reply({ 
                        content: '❌ No fields to remove.', 
                        ephemeral: true 
                    });
                }
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('edit_remove_field')
                    .setPlaceholder('Select field to remove')
                    .setMinValues(1)
                    .setMaxValues(1);
                
                editData.fields.forEach((field, index) => {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${index + 1}. ${field.name}`)
                            .setValue(`field_${index}`)
                    );
                });
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                
                await interaction.reply({
                    content: '⚠️ Select which field to remove:',
                    components: [row],
                    ephemeral: true
                });
                break;
            }
            
            case 'clear_fields': {
                editData.fields = [];
                client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
                
                await interaction.reply({ 
                    content: '✅ All fields cleared! Select another option or choose "Preview & Save".', 
                    ephemeral: true 
                });
                break;
            }
        }
        
    } catch (error) {
        console.error('Error in handleEditFieldsAction:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditDescriptionModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const newDescription = interaction.fields.getTextInputValue('description');
        editData.description = newDescription;
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Description updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditDescriptionModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditSelectField(interaction, client) {
    try {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        
        const fieldIndex = parseInt(interaction.values[0].replace('field_', ''));
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        if (fieldIndex >= editData.fields.length || fieldIndex < 0) {
            return interaction.reply({ 
                content: '❌ Field not found.', 
                ephemeral: true 
            });
        }
        
        const field = editData.fields[fieldIndex];
        
        const modal = new ModalBuilder()
            .setCustomId(`edit_field_${fieldIndex}`)
            .setTitle('Edit Field');
        
        const fieldNameInput = new TextInputBuilder()
            .setCustomId('field_name')
            .setLabel('Field Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter field name/title')
            .setValue(field.name || '')
            .setRequired(true)
            .setMaxLength(256);
        
        const fieldValueInput = new TextInputBuilder()
            .setCustomId('field_value')
            .setLabel('Field Value')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter field content/value')
            .setValue(field.value || '')
            .setRequired(true)
            .setMaxLength(1024);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(fieldNameInput),
            new ActionRowBuilder().addComponents(fieldValueInput)
        );
        
        await interaction.showModal(modal);
        
    } catch (error) {
        console.error('Error in handleEditSelectField:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditRemoveField(interaction, client) {
    try {
        const fieldIndex = parseInt(interaction.values[0].replace('field_', ''));
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        if (fieldIndex >= editData.fields.length || fieldIndex < 0) {
            return interaction.reply({ 
                content: '❌ Field not found.', 
                ephemeral: true 
            });
        }
        
        const removedField = editData.fields.splice(fieldIndex, 1)[0];
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: `✅ Field "${removedField.name}" removed! Select another option or choose "Preview & Save".`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditRemoveField:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditColorModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const newColor = interaction.fields.getTextInputValue('color') || '#3498db';
        editData.color = newColor;
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Color updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditColorModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditAddFieldModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const fieldName = interaction.fields.getTextInputValue('field_name');
        const fieldValue = interaction.fields.getTextInputValue('field_value');
        
        editData.fields.push({
            name: fieldName,
            value: fieldValue,
            inline: false
        });
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: `✅ Field "${fieldName}" added! Select another option or choose "Preview & Save".`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditAddFieldModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditFieldModal(interaction, client) {
    try {
        const fieldIndex = parseInt(interaction.customId.split('_')[2]);
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData || fieldIndex >= editData.fields.length) {
            return interaction.reply({ 
                content: '❌ Field not found.', 
                ephemeral: true 
            });
        }
        
        const fieldName = interaction.fields.getTextInputValue('field_name');
        const fieldValue = interaction.fields.getTextInputValue('field_value');
        
        editData.fields[fieldIndex] = {
            name: fieldName,
            value: fieldValue,
            inline: false
        };
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: `✅ Field "${fieldName}" updated! Select another option or choose "Preview & Save".`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditFieldModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== BUTTON EDIT HANDLERS ==========

async function handleEditButtonsAction(interaction, client) {
    try {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
        
        const action = interaction.values[0];
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        if (!editData.buttons) {
            editData.buttons = [];
        }
        
        switch (action) {
            case 'add_button': {
                const modal = new ModalBuilder()
                    .setCustomId('add_buttons_modal')
                    .setTitle('Add New Button');
                
                const buttonLabelInput = new TextInputBuilder()
                    .setCustomId('button_label')
                    .setLabel('Button Label')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter button text (max 80 chars)')
                    .setRequired(true)
                    .setMaxLength(80);
                
                const buttonCustomIdInput = new TextInputBuilder()
                    .setCustomId('button_custom_id')
                    .setLabel('Button Custom ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('unique_id_for_this_button')
                    .setRequired(true)
                    .setMaxLength(100);
                
                const buttonStyleInput = new TextInputBuilder()
                    .setCustomId('button_style')
                    .setLabel('Button Style (1-4)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('1=Primary, 2=Secondary, 3=Success, 4=Danger')
                    .setRequired(true)
                    .setMaxLength(1);
                
                const buttonEmojiInput = new TextInputBuilder()
                    .setCustomId('button_emoji')
                    .setLabel('Button Emoji (Optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('🔘 or :emoji_name:')
                    .setRequired(false)
                    .setMaxLength(50);
                
                const buttonURLInput = new TextInputBuilder()
                    .setCustomId('button_url')
                    .setLabel('Button URL (Optional for link buttons)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://example.com')
                    .setRequired(false);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(buttonLabelInput),
                    new ActionRowBuilder().addComponents(buttonCustomIdInput),
                    new ActionRowBuilder().addComponents(buttonStyleInput),
                    new ActionRowBuilder().addComponents(buttonEmojiInput),
                    new ActionRowBuilder().addComponents(buttonURLInput)
                );
                
                await interaction.showModal(modal);
                break;
            }
            
            case 'edit_button': {
                if (editData.buttons.length === 0) {
                    return interaction.reply({ 
                        content: '❌ No buttons to edit.', 
                        ephemeral: true 
                    });
                }
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('edit_select_button')
                    .setPlaceholder('Select button to edit')
                    .setMinValues(1)
                    .setMaxValues(1);
                
                editData.buttons.forEach((btn, index) => {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${index + 1}. ${btn.label}`)
                            .setValue(`button_${index}`)
                            .setDescription(`ID: ${btn.customId}`)
                    );
                });
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                
                await interaction.reply({
                    content: 'Select which button to edit:',
                    components: [row],
                    ephemeral: true
                });
                break;
            }
            
            case 'remove_button': {
                if (editData.buttons.length === 0) {
                    return interaction.reply({ 
                        content: '❌ No buttons to remove.', 
                        ephemeral: true 
                    });
                }
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('edit_remove_button')
                    .setPlaceholder('Select button to remove')
                    .setMinValues(1)
                    .setMaxValues(1);
                
                editData.buttons.forEach((btn, index) => {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${index + 1}. ${btn.label}`)
                            .setValue(`button_${index}`)
                    );
                });
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                
                await interaction.reply({
                    content: '⚠️ Select which button to remove:',
                    components: [row],
                    ephemeral: true
                });
                break;
            }
            
            case 'clear_buttons': {
                editData.buttons = [];
                client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
                
                await interaction.reply({ 
                    content: '✅ All buttons cleared! Select another option or choose "Preview & Save".', 
                    ephemeral: true 
                });
                break;
            }
        }
        
    } catch (error) {
        console.error('Error in handleEditButtonsAction:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditSelectButton(interaction, client) {
    try {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        
        const buttonIndex = parseInt(interaction.values[0].replace('button_', ''));
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        if (!editData.buttons || buttonIndex >= editData.buttons.length || buttonIndex < 0) {
            return interaction.reply({ 
                content: '❌ Button not found.', 
                ephemeral: true 
            });
        }
        
        const button = editData.buttons[buttonIndex];
        
        const modal = new ModalBuilder()
            .setCustomId(`edit_button_${buttonIndex}`)
            .setTitle('Edit Button');
        
        const buttonLabelInput = new TextInputBuilder()
            .setCustomId('button_label')
            .setLabel('Button Label')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter button text (max 80 chars)')
            .setValue(button.label || '')
            .setRequired(true)
            .setMaxLength(80);
        
        const buttonCustomIdInput = new TextInputBuilder()
            .setCustomId('button_custom_id')
            .setLabel('Button Custom ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('unique_id_for_this_button')
            .setValue(button.customId || '')
            .setRequired(true)
            .setMaxLength(100);
        
        const buttonStyleInput = new TextInputBuilder()
            .setCustomId('button_style')
            .setLabel('Button Style (1-4)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1=Primary, 2=Secondary, 3=Success, 4=Danger')
            .setValue(button.style?.toString() || '1')
            .setRequired(true)
            .setMaxLength(1);
        
        const buttonEmojiInput = new TextInputBuilder()
            .setCustomId('button_emoji')
            .setLabel('Button Emoji (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('🔘 or :emoji_name:')
            .setValue(button.emoji || '')
            .setRequired(false)
            .setMaxLength(50);
        
        const buttonURLInput = new TextInputBuilder()
            .setCustomId('button_url')
            .setLabel('Button URL (Optional for link buttons)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://example.com')
            .setValue(button.url || '')
            .setRequired(false);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(buttonLabelInput),
            new ActionRowBuilder().addComponents(buttonCustomIdInput),
            new ActionRowBuilder().addComponents(buttonStyleInput),
            new ActionRowBuilder().addComponents(buttonEmojiInput),
            new ActionRowBuilder().addComponents(buttonURLInput)
        );
        
        await interaction.showModal(modal);
        
    } catch (error) {
        console.error('Error in handleEditSelectButton:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditButtonModal(interaction, client) {
    try {
        const buttonIndex = parseInt(interaction.customId.split('_')[2]);
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData || !editData.buttons || buttonIndex >= editData.buttons.length) {
            return interaction.reply({ 
                content: '❌ Button not found.', 
                ephemeral: true 
            });
        }
        
        const buttonLabel = interaction.fields.getTextInputValue('button_label');
        const buttonCustomId = interaction.fields.getTextInputValue('button_custom_id');
        const buttonStyle = parseInt(interaction.fields.getTextInputValue('button_style'));
        const buttonEmoji = interaction.fields.getTextInputValue('button_emoji') || null;
        const buttonURL = interaction.fields.getTextInputValue('button_url') || null;

        // Validate style
        if (isNaN(buttonStyle) || buttonStyle < 1 || buttonStyle > 5) {
            throw new Error('Button style must be a number between 1 and 5');
        }

        editData.buttons[buttonIndex] = {
            label: buttonLabel,
            customId: buttonCustomId,
            style: buttonStyle,
            emoji: buttonEmoji,
            url: buttonURL
        };
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: `✅ Button "${buttonLabel}" updated! Select another option or choose "Preview & Save".`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditButtonModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditRemoveButton(interaction, client) {
    try {
        const buttonIndex = parseInt(interaction.values[0].replace('button_', ''));
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        if (!editData.buttons || buttonIndex >= editData.buttons.length || buttonIndex < 0) {
            return interaction.reply({ 
                content: '❌ Button not found.', 
                ephemeral: true 
            });
        }
        
        const removedButton = editData.buttons.splice(buttonIndex, 1)[0];
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: `✅ Button "${removedButton.label}" removed! Select another option or choose "Preview & Save".`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditRemoveButton:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleCancelEmbedEdit(interaction, client) {
    try {
        // Clean up temp data
        delete client.tempEmbedData[`edit_${interaction.user.id}`];
        
        await interaction.update({
            content: '❌ Edit cancelled. All changes discarded.',
            embeds: [],
            components: []
        });
        
    } catch (error) {
        console.error('Error in handleCancelEmbedEdit:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleContinueEditing(interaction, client) {
    try {
        // Just show the edit menu again
        await handleEditEmbedButton(interaction, client);
        
    } catch (error) {
        console.error('Error in handleContinueEditing:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== SAVE EDIT HANDLER ==========
async function handleSaveEmbedEdit(interaction, client) {
    try {
        const { EmbedBuilder } = require('discord.js');
        
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired. Please start over.', 
                ephemeral: true 
            });
        }
        
        // Get the original message
        const channel = interaction.guild.channels.cache.get(editData.channelId);
        const originalMessage = await channel.messages.fetch(editData.originalMessageId);
        
        // Build updated embed
        const embed = new EmbedBuilder()
            .setTitle(editData.title)
            .setDescription(editData.description)
            .setColor(editData.color);

        if (editData.fields.length > 0) {
            embed.addFields(...editData.fields);
        }

        if (editData.author) {
            embed.setAuthor(editData.author);
        }

        if (editData.footer) {
            embed.setFooter(editData.footer);
        }

        if (editData.image) {
            embed.setImage(editData.image);
        }

        if (editData.thumbnail) {
            embed.setThumbnail(editData.thumbnail);
        }

        if (editData.timestamp) {
            embed.setTimestamp();
        }
        
        // Create components array for buttons
        const components = [];
        
        // Add buttons if any
        if (editData.buttons && editData.buttons.length > 0) {
            // Group buttons into rows of 5 (Discord limit)
            for (let i = 0; i < editData.buttons.length; i += 5) {
                const buttonRow = editData.buttons.slice(i, i + 5);
                const actionRow = new ActionRowBuilder();
                
                buttonRow.forEach(buttonData => {
                    const button = new ButtonBuilder()
                        .setLabel(buttonData.label)
                        .setStyle(buttonData.style);
                    
                    if (buttonData.customId) {
                        button.setCustomId(buttonData.customId);
                    }
                    
                    if (buttonData.url) {
                        button.setURL(buttonData.url);
                    }
                    
                    if (buttonData.emoji) {
                        // Check if emoji is a unicode emoji or custom emoji
                        if (buttonData.emoji.startsWith('<:') || buttonData.emoji.startsWith('<a:')) {
                            // Custom emoji format: <:name:id> or <a:name:id>
                            const emojiParts = buttonData.emoji.match(/<a?:(\w+):(\d+)>/);
                            if (emojiParts) {
                                button.setEmoji({
                                    name: emojiParts[1],
                                    id: emojiParts[2],
                                    animated: buttonData.emoji.startsWith('<a:')
                                });
                            }
                        } else {
                            // Unicode emoji
                            button.setEmoji(buttonData.emoji);
                        }
                    }
                    
                    actionRow.addComponents(button);
                });
                
                components.push(actionRow);
            }
        }
        
        // Always add the edit button as the last row
        const editButton = new ButtonBuilder()
            .setCustomId(`edit_embed_${Date.now()}`)
            .setLabel('Edit Embed')
            .setStyle(2) // SECONDARY style
            .setEmoji('✏️');
            
        const editRow = new ActionRowBuilder().addComponents(editButton);
        components.push(editRow);
        
        // Update the message
        await originalMessage.edit({ 
            embeds: [embed], 
            components: components 
        });
        
        // Update database
        await updateEmbedInDatabase(editData.originalMessageId, editData);
        
        // Clean up temp data
        delete client.tempEmbedData[`edit_${interaction.user.id}`];
        
        await interaction.reply({ 
            content: '✅ Embed updated successfully!', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleSaveEmbedEdit:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== FINISH EMBED BUTTON HANDLER ==========
async function handleFinishEmbedButton(interaction, client) {
    try {
        const { EmbedBuilder, ChannelType, ButtonBuilder, ActionRowBuilder } = require('discord.js');
        
        const embedData = client.tempEmbedData?.[interaction.user.id];
        if (!embedData) {
            throw new Error('No embed data found. Please start over.');
        }

        // Get the channel - support both text channels and threads
        const channel = interaction.guild.channels.cache.get(embedData.channelId);
        
        if (!channel) {
            throw new Error('Channel not found. Please provide a valid channel ID.');
        }
        
        // Check if it's a valid channel type for sending messages
        const validChannelTypes = [
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread
        ];
        
        if (!validChannelTypes.includes(channel.type)) {
            throw new Error('Invalid channel type. Please provide a text channel or thread ID.');
        }

        // Check if we can send messages to this channel
        if (!channel.viewable || !channel.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
            throw new Error('I don\'t have permission to send messages in that channel.');
        }

        const embed = new EmbedBuilder()
            .setTitle(embedData.title)
            .setDescription(embedData.description)
            .setColor(embedData.color);

        if (embedData.fields.length > 0) {
            embed.addFields(...embedData.fields);
        }

        if (embedData.author) {
            embed.setAuthor(embedData.author);
        }

        if (embedData.footer) {
            embed.setFooter(embedData.footer);
        }

        if (embedData.image) {
            embed.setImage(embedData.image);
        }

        if (embedData.thumbnail) {
            embed.setThumbnail(embedData.thumbnail);
        }

        if (embedData.timestamp) {
            embed.setTimestamp();
        }

        // Create components array for buttons
        const components = [];
        
        // Add buttons if any
        if (embedData.buttons && embedData.buttons.length > 0) {
            // Group buttons into rows of 5 (Discord limit)
            for (let i = 0; i < embedData.buttons.length; i += 5) {
                const buttonRow = embedData.buttons.slice(i, i + 5);
                const actionRow = new ActionRowBuilder();
                
                buttonRow.forEach(buttonData => {
                    const button = new ButtonBuilder()
                        .setLabel(buttonData.label)
                        .setStyle(buttonData.style);
                    
                    if (buttonData.customId) {
                        button.setCustomId(buttonData.customId);
                    }
                    
                    if (buttonData.url) {
                        button.setURL(buttonData.url);
                    }
                    
                    if (buttonData.emoji) {
                        // Check if emoji is a unicode emoji or custom emoji
                        if (buttonData.emoji.startsWith('<:') || buttonData.emoji.startsWith('<a:')) {
                            // Custom emoji format: <:name:id> or <a:name:id>
                            const emojiParts = buttonData.emoji.match(/<a?:(\w+):(\d+)>/);
                            if (emojiParts) {
                                button.setEmoji({
                                    name: emojiParts[1],
                                    id: emojiParts[2],
                                    animated: buttonData.emoji.startsWith('<a:')
                                });
                            }
                        } else {
                            // Unicode emoji
                            button.setEmoji(buttonData.emoji);
                        }
                    }
                    
                    actionRow.addComponents(button);
                });
                
                components.push(actionRow);
            }
        }
        
        // Always add the edit button as the last row
        const editButton = new ButtonBuilder()
            .setCustomId(`edit_embed_${Date.now()}`)
            .setLabel('Edit Embed')
            .setStyle(2) // SECONDARY style
            .setEmoji('✏️');
            
        const editRow = new ActionRowBuilder().addComponents(editButton);
        components.push(editRow);

        // Send to channel
        let plainTextMessage = null;
        let embedMessage = null;
        
        if (embedData.plainText) {
            plainTextMessage = await channel.send(embedData.plainText);
        }
        
        // Send embed with components
        embedMessage = await channel.send({ 
            embeds: [embed], 
            components: components 
        });

        // Save embed data to database
        const pool = await connectToMySQL();
        
        const fullEmbedData = {
            ...embedData,
            guildId: interaction.guild.id,
            embedMessageId: embedMessage.id,
            plainTextMessageId: plainTextMessage?.id || null,
            createdAt: new Date().toISOString(),
            allowedRoles: EMBED_PERMISSIONS.REQUIRED_ROLES_ANY // Store allowed roles
        };
        
        await pool.query(
            `INSERT INTO saved_embeds 
            (discord_message_id, discord_channel_id, discord_author_id, embed_data) 
            VALUES (?, ?, ?, ?)`,
            [
                embedMessage.id,
                embedData.channelId,
                interaction.user.id,
                JSON.stringify(fullEmbedData)
            ]
        );

        // Clean up temp data
        delete client.tempEmbedData[interaction.user.id];

        await interaction.reply({ 
            content: `✅ Embed successfully sent to ${channel}! You can edit it using the button below the embed.`, 
            ephemeral: true 
        });

    } catch (error) {
        console.error('Error in handleFinishEmbedButton:', error);
        
        // Check if already replied
        if (interaction.replied) {
            await interaction.followUp({ 
                content: `❌ Error: ${error.message}`, 
                ephemeral: true 
            });
        } else if (interaction.deferred) {
            await interaction.editReply({ 
                content: `❌ Error: ${error.message}` 
            });
        } else {
            await interaction.reply({ 
                content: `❌ Error: ${error.message}`, 
                ephemeral: true 
            });
        }
    }
}

// ========== EDIT EMBED BUTTON HANDLER ==========
async function handleEditEmbedButton(interaction, client) {
    try {
        const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
        
        // Get the message that was interacted with
        const message = interaction.message;
        
        // Check if user has permission to edit
        const hasPermission = await canUserEditEmbed(interaction.user.id, message.id, interaction.guild);
        
        if (!hasPermission) {
            // Get role names for error message
            const roleNames = EMBED_PERMISSIONS.REQUIRED_ROLES_ANY.map(roleId => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? `• ${role.name}` : `• Role ID: ${roleId}`;
            }).join('\n');
            
            return interaction.reply({ 
                content: `❌ You do not have permission to edit this embed.\n\n**Required Roles (any one of):**\n${roleNames}\n\n*or be the original author*`, 
                ephemeral: true 
            });
        }
        
        // Get embed data from database
        const embedRecord = await getEmbedFromDatabase(message.id);
        
        if (!embedRecord) {
            return interaction.reply({ 
                content: '❌ Embed data not found. It may have been deleted.', 
                ephemeral: true 
            });
        }
        
        const embedData = embedRecord.embed_data;
        
        // Store in temp data for editing
        client.tempEmbedData = client.tempEmbedData || {};
        client.tempEmbedData[`edit_${interaction.user.id}`] = {
            ...embedData,
            originalMessageId: message.id,
            isEditMode: true
        };
        
        // Create COMPLETE edit options menu (same as creation)
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('edit_embed_options')
            .setPlaceholder('Select what to edit')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Title')
                    .setValue('edit_title')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Description')
                    .setValue('edit_description')
                    .setEmoji('📄'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Color')
                    .setValue('edit_color')
                    .setEmoji('🎨'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Fields')
                    .setDescription('Add, remove, or modify fields')
                    .setValue('edit_fields')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Author')
                    .setDescription('Change author name and icon')
                    .setValue('edit_author')
                    .setEmoji('👤'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Footer')
                    .setDescription('Change footer text and icon')
                    .setValue('edit_footer')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Image')
                    .setDescription('Change or remove main image')
                    .setValue('edit_image')
                    .setEmoji('🖼️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Thumbnail')
                    .setDescription('Change or remove thumbnail')
                    .setValue('edit_thumbnail')
                    .setEmoji('🖼️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Toggle Timestamp')
                    .setDescription('Add or remove timestamp')
                    .setValue('edit_timestamp')
                    .setEmoji('⏰'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Plain Text')
                    .setDescription('Change accompanying plain text')
                    .setValue('edit_plain_text')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Edit Buttons')
                    .setDescription('Add, remove, or modify buttons')
                    .setValue('edit_buttons')
                    .setEmoji('🔘'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Preview & Save Changes')
                    .setValue('edit_preview')
                    .setEmoji('👁️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Reset All Changes')
                    .setDescription('Discard all edits and reload original')
                    .setValue('edit_reset')
                    .setEmoji('🔄')
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
        
        await interaction.reply({
            content: '**Edit Embed**\nSelect what you want to edit:\n\n*Current settings will be pre-filled in the forms.*',
            components: [actionRow],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleEditEmbedButton:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

// ========== NEW MODAL HANDLERS ==========

async function handleEditPlainTextModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const newPlainText = interaction.fields.getTextInputValue('plain_text');
        editData.plainText = newPlainText;
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Plain text updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditPlainTextModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditAuthorModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const authorName = interaction.fields.getTextInputValue('author_name');
        const authorIcon = interaction.fields.getTextInputValue('author_icon');
        
        if (authorName.trim() === '') {
            editData.author = null; // Remove author
        } else {
            editData.author = {
                name: authorName,
                iconURL: authorIcon || null
            };
        }
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Author updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditAuthorModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditFooterModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const footerText = interaction.fields.getTextInputValue('footer_text');
        const footerIcon = interaction.fields.getTextInputValue('footer_icon');
        
        if (footerText.trim() === '') {
            editData.footer = null; // Remove footer
        } else {
            editData.footer = {
                text: footerText,
                iconURL: footerIcon || null
            };
        }
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Footer updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditFooterModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditImageModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const imageUrl = interaction.fields.getTextInputValue('image_url');
        
        if (imageUrl.trim() === '') {
            editData.image = null; // Remove image
        } else {
            editData.image = imageUrl;
        }
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Main image updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditImageModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function handleEditThumbnailModal(interaction, client) {
    try {
        const editData = client.tempEmbedData?.[`edit_${interaction.user.id}`];
        
        if (!editData) {
            return interaction.reply({ 
                content: '❌ Edit session expired.', 
                ephemeral: true 
            });
        }
        
        const thumbnailUrl = interaction.fields.getTextInputValue('thumbnail_url');
        
        if (thumbnailUrl.trim() === '') {
            editData.thumbnail = null; // Remove thumbnail
        } else {
            editData.thumbnail = thumbnailUrl;
        }
        
        client.tempEmbedData[`edit_${interaction.user.id}`] = editData;
        
        await interaction.reply({ 
            content: '✅ Thumbnail updated! Select another option or choose "Preview & Save".', 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Error in handleEditThumbnailModal:', error);
        await interaction.reply({ 
            content: `❌ Error: ${error.message}`, 
            ephemeral: true 
        });
    }
}