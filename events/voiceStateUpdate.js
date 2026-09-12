const {
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  storeTempVC,
  removeTempVC,
  getActiveTempVCCount,
  checkIfTempVC,
} = require('../db');

// === VC PAUSE MANAGEMENT FUNCTIONS ===
const vcPauseStates = new Map();

function setVCPauseState(channelId, durationHours) {
    const unpauseTime = Date.now() + (durationHours * 60 * 60 * 1000);
    vcPauseStates.set(channelId, {
        pausedUntil: unpauseTime,
        duration: durationHours
    });
    
    // Set timeout to auto-remove pause (optional - for cleanup)
    setTimeout(() => {
        if (vcPauseStates.get(channelId)?.pausedUntil === unpauseTime) {
            vcPauseStates.delete(channelId);
        }
    }, durationHours * 60 * 60 * 1000);
}

function removeVCPauseState(channelId) {
    vcPauseStates.delete(channelId);
}

function isVCPaused(channelId) {
    const pauseState = vcPauseStates.get(channelId);
    if (!pauseState) return false;
    
    if (Date.now() > pauseState.pausedUntil) {
        vcPauseStates.delete(channelId);
        return false;
    }
    
    return true;
}

function getRemainingPauseTime(channelId) {
    const pauseState = vcPauseStates.get(channelId);
    if (!pauseState) return null;
    
    const remaining = pauseState.pausedUntil - Date.now();
    if (remaining <= 0) {
        vcPauseStates.delete(channelId);
        return null;
    }
    
    return Math.ceil(remaining / (1000 * 60)); // Return in minutes
}

// === RED CHANNEL CONFIGURATION ===
// Store active popup messages for cleanup
const activeRedChannelPopups = new Map();
// Track users who have already seen the red channel warning (to prevent spamming)
const usersWhoHaveSeenRedWarning = new Set();

// Add this constant for the role that should NOT get notifications
const NO_RED_WARNING_ROLE_ID = '1179511435471093851'; // CrestOfKnighthood

// === RATE LIMITING ===
// Prevent infinite loops from rapid rejoins
const recentVCJoinAttempts = new Map();

// === CONFIGURATION ===
const PARENT_CONFIGS = {
  '1311347848977055844': { prefix: 'Public VC #' },
  '1398854684977926186': { prefix: '🔵BV VC #' },
  '1398854731073458310': { prefix: '🔴BVK VC #', isRedChannel: true },
  '1310726896476094496': { prefix: 'Leader VC #' },
  '1444646005126463522': { prefix: '🟡 EVE Online #' },
  '1310721271553593385': { prefix: '💫Staff VC #' },
  '1310615640939302922': { prefix: '🧑‍💻Servitor VC #' },
  '1406770454777299006': { prefix: '🟣Veil VC #' },
};

const ROLE_WHITELIST = new Set([
  '1173822659071578182', // Command
  '1173822697956982794', // Officer
  '1173822842442367026', // Leader
]);

const STREAMER_ROLE_ID = '1378852093120614430';
const ATTENDANCE_ROLE_ID = '1185813396667514891';

// === HELPER FUNCTIONS ===

/**
 * Check if user has VC bypass permissions
 */
function hasVCBypassPermission(member) {
    return member?.roles.cache.some(role => ROLE_WHITELIST.has(role.id));
}

/**
 * Check if user should be exempt from red channel warnings
 */
function shouldSkipRedWarning(member) {
    return member?.roles.cache.has(NO_RED_WARNING_ROLE_ID);
}

/**
 * Send red channel warning DM to user
 */
async function sendRedChannelWarning(member, channelId) {
    try {
        // Check if user has the exempt role
        if (shouldSkipRedWarning(member)) {
            console.log(`ℹ️ User ${member.displayName} has CrestOfKnighthood role, skipping red channel warning`);
            usersWhoHaveSeenRedWarning.add(member.id); // Add to set so they don't get spammed
            return null;
        }

        const embed = new EmbedBuilder()
            .setTitle('⚠️ RED CHANNEL WARNING')
            .setDescription('**Hey! This is a Red Channel.**\n\nFeedback is instant and direct. If you don\'t think you can handle it, please leave now.')
            .setColor('#FF0000')
            .addFields(
                { name: 'What to expect:', value: '• Instant feedback\n• Direct communication\n• No sugar-coating', inline: false },
                { name: 'If you can\'t handle:', value: '• Please leave the channel\n• No hard feelings', inline: false }
            )
            .setFooter({ text: 'This message will auto-delete when you leave the channel.' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('red_channel_acknowledge')
                .setLabel('I Understand - I Can Handle It')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚠️'),
            new ButtonBuilder()
                .setCustomId('red_channel_leave')
                .setLabel('No Thanks - I\'ll Leave')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👋')
        );

        const message = await member.send({
            content: '**⚠️ IMPORTANT: Red Channel Notice ⚠️**',
            embeds: [embed],
            components: [row]
        }).catch(err => {
            console.log(`❌ Could not send red channel warning to ${member.displayName}:`, err.message);
            return null;
        });

        if (message) {
            activeRedChannelPopups.set(member.id, {
                messageId: message.id,
                channelId: channelId,
                guildId: member.guild.id, // Store the guild ID
                userDmChannelId: message.channelId,
                sentAt: Date.now()
            });
            usersWhoHaveSeenRedWarning.add(member.id);
            
            console.log(`✅ Red channel DM sent to ${member.displayName} in guild ${member.guild.id}`);
        }

        return message;
    } catch (error) {
        console.error('Error sending red channel warning:', error);
        return null;
    }
}

// === RED CHANNEL BUTTON HANDLER ===
/**
 * Handle red channel button interactions
 */
async function handleRedChannelButton(interaction, client) {
    try {
        // Check if interaction exists
        if (!interaction) {
            console.error('❌ Interaction is null in handleRedChannelButton');
            return;
        }
        
        // Get user from interaction (works in both guild and DM contexts)
        const user = interaction.user;
        if (!user) {
            console.error('❌ User is null in handleRedChannelButton');
            return;
        }
        
        const userId = user.id;
        
        console.log(`🔄 Red channel button interaction for ${user.tag} (${userId}): ${interaction.customId}`);
        
        // Get the popup data
        const popupData = activeRedChannelPopups.get(userId);
        console.log(`ℹ️ Popup data:`, popupData);
        
        // If user clicked "I Understand"
        if (interaction.customId === 'red_channel_acknowledge') {
            try {
                // Just acknowledge and delete the message
                await interaction.update({
                    content: '✅ You have acknowledged the red channel warning. You may stay in the channel.',
                    embeds: [],
                    components: []
                });
                
                console.log(`✅ ${user.tag} acknowledged red channel warning`);
            } catch (updateError) {
                console.error('Error updating acknowledge interaction:', updateError);
                await interaction.reply({
                    content: '✅ You have acknowledged the red channel warning.',
                    flags: 64
                });
            }
            
            // Clean up the popup data
            if (popupData) {
                activeRedChannelPopups.delete(userId);
            }
        }
        
        // If user clicked "No Thanks - I'll Leave"
        else if (interaction.customId === 'red_channel_leave') {
            try {
                // First update the message
                await interaction.update({
                    content: '👋 You chose to leave the red channel. Disconnecting you now...',
                    embeds: [],
                    components: []
                });
            } catch (updateError) {
                console.error('Error updating leave interaction:', updateError);
                await interaction.reply({
                    content: '👋 You chose to leave the red channel. Disconnecting you now...',
                    flags: 64
                });
            }
            
            // Disconnect the user from the voice channel
            try {
                // Use the stored guild ID from the popup data
                if (popupData?.guildId) {
                    console.log(`🔍 Looking for guild ${popupData.guildId} for user ${user.tag}`);
                    const guild = await client.guilds.fetch(popupData.guildId).catch(err => {
                        console.error(`❌ Failed to fetch guild ${popupData.guildId}:`, err.message);
                        return null;
                    });
                    
                    if (guild) {
                        console.log(`✅ Found guild: ${guild.name}`);
                        const member = await guild.members.fetch(userId).catch(err => {
                            console.error(`❌ Failed to fetch member ${userId} in guild ${guild.name}:`, err.message);
                            return null;
                        });
                        
                        if (member?.voice?.channel) {
                            console.log(`🔍 Disconnecting ${user.tag} from channel: ${member.voice.channel.name}`);
                            await member.voice.disconnect();
                            console.log(`✅ Successfully disconnected ${user.tag} from red channel`);
                        } else {
                            console.log(`ℹ️ ${user.tag} was not in a voice channel when clicking leave`);
                            await interaction.followUp({
                                content: 'ℹ️ You are no longer in a voice channel.',
                                flags: 64
                            });
                        }
                    } else {
                        console.error(`❌ Guild ${popupData.guildId} not found`);
                        await interaction.followUp({
                            content: '❌ Could not find the server. Please leave the voice channel manually.',
                            flags: 64
                        });
                    }
                } else {
                    // No stored guild ID
                    console.log(`❌ No guild ID stored for ${user.tag}`);
                    
                    // Try to get guild ID from interaction as fallback
                    if (interaction.guildId) {
                        console.log(`🔍 Using interaction guild ID: ${interaction.guildId}`);
                        const guild = await client.guilds.fetch(interaction.guildId).catch(() => null);
                        if (guild) {
                            const member = await guild.members.fetch(userId).catch(() => null);
                            if (member?.voice?.channel) {
                                await member.voice.disconnect();
                                console.log(`✅ Disconnected ${user.tag} using interaction guild ID`);
                            }
                        }
                    } else {
                        console.log(`ℹ️ No guild ID available for ${user.tag} - can't disconnect`);
                        await interaction.followUp({
                            content: '⚠️ Please leave the voice channel manually from the server.',
                            flags: 64
                        });
                    }
                }
            } catch (disconnectError) {
                console.error(`❌ Failed to disconnect ${user.tag}:`, disconnectError);
                
                // Update message to show error
                await interaction.followUp({
                    content: '❌ Failed to disconnect you automatically. Please leave the voice channel manually.',
                    flags: 64
                });
            }
            
            // Clean up the popup data
            if (popupData) {
                activeRedChannelPopups.delete(userId);
            }
        }
    } catch (error) {
        console.error('Error handling red channel button:', error);
        
        // Try to send an error response
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your choice.',
                    flags: 64
                });
            } else {
                await interaction.followUp({
                    content: '❌ An error occurred while processing your choice.',
                    flags: 64
                });
            }
        } catch (responseError) {
            console.error('Failed to send error response:', responseError);
        }
    }
}

/**
 * Schedule delayed cleanup of red channel warning
 */
function scheduleRedChannelCleanup(userId, client) {
    const userPopup = activeRedChannelPopups.get(userId);
    if (!userPopup) return;

    console.log(`🔄 Scheduling red channel cleanup for ${userId} in 2 minutes`);
    
    setTimeout(async () => {
        try {
            const currentPopup = activeRedChannelPopups.get(userId);
            if (!currentPopup) {
                console.log(`ℹ️ Popup already removed for ${userId} (likely interacted)`);
                return;
            }
            
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                try {
                    const dmChannel = await user.createDM();
                    const message = await dmChannel.messages.fetch(currentPopup.messageId);
                    await message.delete();
                    console.log(`✅ Delayed red channel DM cleaned up for ${userId}`);
                } catch (deleteErr) {
                    console.log(`ℹ️ Red channel DM already deleted or inaccessible for ${userId}`);
                }
            }
            activeRedChannelPopups.delete(userId);
        } catch (error) {
            console.error(`Error in delayed cleanup for ${userId}:`, error);
            activeRedChannelPopups.delete(userId);
        }
    }, 120000); // 2 minute delay
}

/**
 * Clean up streamer join request DMs
 */
async function cleanupRequestDMs(mainChannelId, client) {
    const dmList = client.streamerRequestDMs.get(mainChannelId);
    const claim = client.claimedChannels?.get(mainChannelId);
    if (!dmList || !claim?.streamerId) return;

    try {
        const streamerUser = await client.users.fetch(claim.streamerId);
        const dmChannel = await streamerUser.createDM();

        for (const { dmMessageId } of dmList) {
            try {
                const msg = await dmChannel.messages.fetch(dmMessageId);
                if (msg) await msg.delete();
            } catch {}
        }

        client.streamerRequestDMs.delete(mainChannelId);
    } catch (err) {
        console.error('Failed to cleanup join request DMs:', err);
    }
}

/**
 * Optimized temp VC cleanup function
 */
async function cleanUpTempVC(channelId, client) {
    if (client._tempVCCleanupInProgress?.has(channelId)) return;
    
    client._tempVCCleanupInProgress = client._tempVCCleanupInProgress || new Set();
    client._tempVCCleanupInProgress.add(channelId);

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);

        // Channel doesn't exist - clean up DB
        if (!channel) {
            await removeTempVC(channelId).catch(console.error);
            removeVCPauseState(channelId);
            return;
        }

        // Not a temp VC - clean up DB
        const isTemp = await checkIfTempVC(channelId);
        if (!isTemp) {
            await removeTempVC(channelId).catch(console.error);
            removeVCPauseState(channelId);
            return;
        }

        // Check if deletion is paused
        if (isVCPaused(channelId)) {
            const remainingMinutes = getRemainingPauseTime(channelId);
            console.log(`⏸️ VC deletion paused for ${channel.name}. ${remainingMinutes} minutes remaining.`);
            return;
        }

        // Delete if empty
        if (channel.members.size === 0) {
            try {
                await channel.delete();
                console.log(`✅ Temp VC deleted: ${channel.name}`);
            } catch (err) {
                if (err.code !== 10003) {
                    console.error(`❌ Failed to delete temp VC ${channel.name}:`, err);
                }
            } finally {
                await removeTempVC(channelId).catch(console.error);
                removeVCPauseState(channelId);

                // Clean up streamer claims
                const claim = client.claimedChannels?.get(channelId);
                if (claim) {
                    await cleanupRequestDMs(channelId, client);
                    client.claimedChannels.delete(channelId);
                }
            }
        } else {
            console.log(`Cleanup skipped: ${channel.name} has ${channel.members.size} member(s).`);
        }
    } catch (error) {
        console.error('Error during temp VC cleanup:', error);
    } finally {
        client._tempVCCleanupInProgress.delete(channelId);
    }
}

/**
 * Create temp VC with options
 */
async function createTempVCWithOptions(voiceState, parentConfig, client) {
    const guild = voiceState.guild;
    const parentChannel = guild.channels.cache.get(voiceState.channelId);
    if (!parentChannel) return null;

    const count = (await getActiveTempVCCount(voiceState.channelId)) + 1;
    const tempName = `${parentConfig.prefix} ${count}`;

    try {
        const tempVC = await guild.channels.create({
            name: tempName,
            type: ChannelType.GuildVoice,
            parent: parentChannel.parentId,
            permissionOverwrites: parentChannel.permissionOverwrites.cache.map(perm => ({
                id: perm.id,
                allow: new PermissionsBitField(perm.allow).bitfield,
                deny: new PermissionsBitField(perm.deny).bitfield,
            })),
        });

        await storeTempVC(guild.id, voiceState.channelId, tempVC.id);
        await voiceState.setChannel(tempVC);
        console.log(`✅ Temp VC created: ${tempName}`);

        // Send red channel warning if applicable
        if (parentConfig.isRedChannel && !usersWhoHaveSeenRedWarning.has(voiceState.id)) {
            // Check if user should be exempt
            if (shouldSkipRedWarning(voiceState.member)) {
                console.log(`ℹ️ ${voiceState.member.displayName} has CrestOfKnighthood role, skipping red channel warning`);
                usersWhoHaveSeenRedWarning.add(voiceState.id); // Add to set so they don't get spammed
            } else {
                const message = await sendRedChannelWarning(voiceState.member, tempVC.id);
                console.log(message ? 
                    `✅ Red channel DM sent to ${voiceState.member.displayName}` : 
                    `❌ Could not send red channel warning to ${voiceState.member.displayName}`
                );
            }
        } else if (parentConfig.isRedChannel) {
            console.log(`ℹ️ User ${voiceState.member.displayName} joined red temp VC but has already seen warning`);
        }

        // Create options menu
        const member = await guild.members.fetch(voiceState.id).catch(() => null);
        const options = [
            { label: 'Rename Voice Channel', value: 'rename_vc' },
            { label: 'Set Occupancy Limit', value: 'set_limit' },
            { label: 'Set Region', value: 'set_region' },
            { label: 'Set Bitrate', value: 'set_bitrate' },
            { label: '📊 Attendance Controls', value: 'attendance_control' },
            { label: '⏸️ Pause VC Deletion', value: 'pause_vc_deletion' },
        ];
        
        if (member?.roles.cache.has(STREAMER_ROLE_ID)) {
            options.push({ label: 'Streamer Controls', value: 'claim_streamer' });
        }

        const optionsMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('vc-options-menu')
                .setPlaceholder('Select an action')
                .addOptions(options)
        );

        const embed = new EmbedBuilder()
            .setTitle(`Welcome to ${tempName}!`)
            .setDescription('Use the dropdown menu below to manage this channel.')
            .setColor('#00FF00');

        await tempVC.send({ embeds: [embed], components: [optionsMenu] }).catch(console.error);
        
        return tempVC;
    } catch (err) {
        console.error('Error creating temp VC:', err);
        return null;
    }
}

// === PAUSE VC DELETION HANDLER ===
async function handlePauseVCDeletion(interaction, client) {
    try {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return await interaction.reply({
                content: '❌ You must be in a voice channel to use this feature.',
                flags: 64,
            });
        }

        // Check if this is a temp VC
        const isTemp = await checkIfTempVC(voiceChannel.id);
        if (!isTemp) {
            return await interaction.reply({
                content: '❌ This feature is only available for temporary voice channels.',
                flags: 64,
            });
        }

        // Create pause duration selection menu
        const pauseMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`pause_duration_menu_${voiceChannel.id}`)
                .setPlaceholder('Select pause duration...')
                .addOptions([
                    {
                        label: '1 Hour',
                        value: '1_hour',
                        description: 'Pause deletion for 1 hour',
                        emoji: '⏰'
                    },
                    {
                        label: '4 Hours',
                        value: '4_hours',
                        description: 'Pause deletion for 4 hours',
                        emoji: '🕓'
                    },
                    {
                        label: '6 Hours',
                        value: '6_hours',
                        description: 'Pause deletion for 6 hours',
                        emoji: '🕕'
                    },
                    {
                        label: 'Cancel Pause',
                        value: 'cancel_pause',
                        description: 'Remove any existing pause',
                        emoji: '❌'
                    }
                ])
        );

        await interaction.reply({
            content: '⏸️ **Pause VC Deletion**\nSelect how long you want to prevent this VC from being automatically deleted:',
            components: [pauseMenu],
            flags: 64,
        });

    } catch (error) {
        console.error('Error handling pause VC deletion:', error);
        await interaction.reply({
            content: '❌ An error occurred while setting up pause options.',
            flags: 64,
        });
    }
}

// === PAUSE DURATION MENU HANDLER ===
async function handlePauseDurationMenu(interaction, client) {
    try {
        const selectedValue = interaction.values[0];
        const channelId = interaction.customId.replace('pause_duration_menu_', '');
        const voiceChannel = interaction.guild.channels.cache.get(channelId);

        if (!voiceChannel) {
            return await interaction.update({
                content: '❌ Voice channel no longer exists.',
                components: [],
                flags: 64,
            });
        }

        if (selectedValue === 'cancel_pause') {
            removeVCPauseState(channelId);
            return await interaction.update({
                content: '✅ VC deletion pause has been removed. The channel will now delete normally when empty.',
                components: [],
                flags: 64,
            });
        }

        // Parse duration
        const durationMap = {
            '1_hour': 1,
            '4_hours': 4,
            '6_hours': 6
        };

        const durationHours = durationMap[selectedValue];
        if (!durationHours) {
            return await interaction.update({
                content: '❌ Invalid duration selected.',
                components: [],
                flags: 64,
            });
        }

        // Set pause state
        setVCPauseState(channelId, durationHours);

        const unpauseTime = new Date(Date.now() + (durationHours * 60 * 60 * 1000));
        
        // First, update the original interaction (ephemeral)
        await interaction.update({
            content: "⏳ Setting pause duration...",
            components: [],
            flags: 64,
        });

        // Then send a non-ephemeral follow-up message
        await interaction.followUp({
            content: `✅ **VC Deletion Paused**\n⏰ This VC will not be automatically deleted for **${durationHours} hour(s)**.\n🕐 Pause expires: <t:${Math.floor(unpauseTime.getTime() / 1000)}:R>`,
            flags: 0,
        });

    } catch (error) {
        console.error('Error handling pause duration menu:', error);
        
        // Handle error response
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
                content: '❌ An error occurred while setting the pause duration.',
                flags: 64,
            });
        } else {
            await interaction.reply({
                content: '❌ An error occurred while setting the pause duration.',
                flags: 64,
            });
        }
    }
}

// === TEMP VC OPTIONS MENU HANDLER ===
async function handleTempVCOptionsMenu(interaction, client) {
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
                flags: 64,
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

        if (selectedAction === 'pause_vc_deletion') {
            return await handlePauseVCDeletion(interaction, client);
        }

        if (selectedAction === 'claim_streamer') {
            if (!interaction.member.roles.cache.has(STREAMER_ROLE_ID)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use Streamer controls.',
                    flags: 64,
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
                flags: 64,
            });
        }

        if (selectedAction === 'attendance_control') {
            if (!interaction.member.roles.cache.has(ATTENDANCE_ROLE_ID)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use Attendance controls.',
                    flags: 64,
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
                            label: 'Stop Tracking',
                            value: 'stop_attendance',
                            description: 'Stop attendance tracking',
                        },
                    ])
            );

            return await interaction.reply({
                content: '📊 Attendance Controls:',
                components: [attendanceMenu],
                flags: 64,
            });
        }

        // Default fallback
        await interaction.reply({
            content: '⚠️ This action is not yet supported.',
            flags: 64,
        });
    } catch (error) {
        console.error('Error handling temp VC options menu interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                flags: 64,
            });
        }
    }
}

// === MAIN VOICE STATE UPDATE HANDLER ===
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        // Initialize client properties
        client.streamerRequestDMs ||= new Map();
        client.claimedChannels ||= new Map();
        client.attendanceTracking ||= new Map();

        // Rate limiting: Prevent processing the same user multiple times in quick succession
        const userId = newState.id || oldState.id;
        const now = Date.now();
        
        // Check if we recently processed this user (within last 2 seconds)
        const lastAttempt = recentVCJoinAttempts.get(userId);
        if (lastAttempt && now - lastAttempt < 2000) {
            // Skip processing to prevent loops
            console.log(`⏭️ Skipping rapid rejoin for ${newState.member?.displayName || userId} (rate limited)`);
            return;
        }
        
        // Store current timestamp for this user
        recentVCJoinAttempts.set(userId, now);
        
        // Clean up old entries periodically (optional - 1% chance per execution)
        if (Math.random() < 0.01) {
            for (const [uid, timestamp] of recentVCJoinAttempts) {
                if (now - timestamp > 10000) { // 10 seconds old
                    recentVCJoinAttempts.delete(uid);
                }
            }
        }

        // Get channel IDs for easier comparison
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        // ---- Handle User LEAVING a channel (disconnect or leave) ----
        if (oldChannelId && !newChannelId) {
            console.log(`[LEAVE] [${oldState.member?.displayName}] (${oldState.id}) left VC ${oldChannelId}`);
            await cleanUpTempVC(oldChannelId, client);
            
            // Also cleanup red channel warning when user leaves
            const userId = oldState.id;
            const userPopup = activeRedChannelPopups.get(userId);
            if (userPopup) {
                // User left, delete the warning message
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const dmChannel = await user.createDM();
                        const message = await dmChannel.messages.fetch(userPopup.messageId).catch(() => null);
                        if (message) await message.delete();
                    }
                } catch (err) {
                    // Ignore errors - message might already be deleted
                }
                activeRedChannelPopups.delete(userId);
                usersWhoHaveSeenRedWarning.delete(userId);
            }
            
            return;
        }

        // ---- Handle User JOINING a channel (connect from nowhere) ----
        if (!oldChannelId && newChannelId) {
            console.log(`[JOIN] [${newState.member?.displayName}] (${newState.id}) joined VC ${newChannelId}`);
            
            const channel = newState.channel;
            
            // === VC LIMIT ENFORCEMENT ===
            if (channel?.type === ChannelType.GuildVoice) {
                const userLimit = channel.userLimit || 0;
                
                // Skip if no limit
                if (userLimit > 0) {
                    const currentMemberCount = channel.members.size;
                    const hasBypass = hasVCBypassPermission(newState.member);
                    
                    // Check if adding this user would exceed or reach the limit
                    // IMPORTANT: Use >= not > to catch when at exact limit
                    if (currentMemberCount >= userLimit && !hasBypass) {
                        try {
                            await newState.disconnect();
                            console.log(`⛔ Disconnected ${newState.member?.displayName} — VC at capacity (${currentMemberCount}/${userLimit}) and no override permissions.`);
                        } catch (err) {
                            console.error('Failed to handle user from full VC:', err);
                        }
                        return; // Stop further processing
                    }
                    
                    // Log special permissions usage
                    if (currentMemberCount >= userLimit && hasBypass) {
                        console.log(`🎖️ ${newState.member?.displayName} used override to join full VC (${currentMemberCount}/${userLimit})`);
                    }
                }
            }

            // Create temp VC for parent channels
            const parentConfig = PARENT_CONFIGS[newChannelId];
            if (parentConfig) {
                await createTempVCWithOptions(newState, parentConfig, client);
                return;
            }

            // ---- Streamer Waiting Room Join ----
            const claim = [...(client.claimedChannels?.values() || [])].find(c => c.waitingRoomId === newChannelId);
            if (claim) {
                const mainVC = client.channels.cache.get(claim.mainChannelId);
                if (!mainVC || !claim.streamerId) return;

                try {
                    const embed = new EmbedBuilder()
                        .setTitle('Join Request')
                        .setDescription(`<@${newState.id}> is requesting to join your stream channel.`)
                        .setColor('#faa61a');

                    const row = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`STRM_SELECT_${newState.id}_${newChannelId}_${mainVC.id}`)
                            .setPlaceholder('Approve or Deny')
                            .addOptions([
                                { label: '✅ Approve', value: `STRM_APPROVE_${newState.id}_${newChannelId}_${mainVC.id}` },
                                { label: '❌ Deny', value: `STRM_DENY_${newState.id}_${newChannelId}_${mainVC.id}` },
                            ])
                    );

                    const sentMessage = await mainVC.send({
                        content: `<@${claim.streamerId}> You have a new join request:`,
                        embeds: [embed],
                        components: [row],
                    });

                    client.streamerRequestDMs.set(mainVC.id, client.streamerRequestDMs.get(mainVC.id) || []);
                    client.streamerRequestDMs.get(mainVC.id).push({
                        dmMessageId: sentMessage.id,
                        userId: newState.id,
                    });

                    console.log(`📨 Join request sent for ${newState.member?.displayName}`);
                } catch (err) {
                    console.error('❌ Failed to send join request message:', err);
                }
            }

            // ---- RED CHANNEL DM POPUP for existing temp VCs ----
            // Check if user joined an existing temp VC AND hasn't seen warning
            const isTemp = await checkIfTempVC(newChannelId);
            if (isTemp && !usersWhoHaveSeenRedWarning.has(newState.id)) {
                // Check if this temp VC has "🔴" in its name (red channel indicator)
                const currentChannel = newState.channel;
                if (currentChannel && currentChannel.name.includes('🔴')) {
                    // Check if user should be exempt
                    if (shouldSkipRedWarning(newState.member)) {
                        console.log(`ℹ️ ${newState.member.displayName} has CrestOfKnighthood role, skipping red channel warning`);
                        usersWhoHaveSeenRedWarning.add(newState.id); // Add to set so they don't get spammed
                    } else {
                        const message = await sendRedChannelWarning(newState.member, newChannelId);
                        console.log(message ? 
                            `✅ Red channel DM sent to ${newState.member.displayName} (existing VC)` : 
                            `❌ Could not send red channel warning to ${newState.member.displayName}`
                        );
                    }
                }
            } else if (isTemp && usersWhoHaveSeenRedWarning.has(newState.id)) {
                console.log(`ℹ️ User ${newState.member.displayName} joined existing red temp VC but has already seen warning`);
            }
            
            return;
        }

        // ---- Handle User MOVING between channels ----
        if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
            console.log(`[MOVE] [${newState.member?.displayName}] (${newState.id}) moved from VC ${oldChannelId} to VC ${newChannelId}`);
            
            // Clean up the old channel they left
            await cleanUpTempVC(oldChannelId, client);
            
            // Cleanup red channel warning for old channel
            const userId = oldState.id;
            const userPopup = activeRedChannelPopups.get(userId);
            if (userPopup && userPopup.channelId === oldChannelId) {
                // User left the red channel, delete the warning message
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const dmChannel = await user.createDM();
                        const message = await dmChannel.messages.fetch(userPopup.messageId).catch(() => null);
                        if (message) await message.delete();
                    }
                } catch (err) {
                    // Ignore errors
                }
                activeRedChannelPopups.delete(userId);
                usersWhoHaveSeenRedWarning.delete(userId);
            }
            
            // === VC LIMIT ENFORCEMENT for the new channel ===
            const channel = newState.channel;
            if (channel?.type === ChannelType.GuildVoice) {
                const userLimit = channel.userLimit || 0;
                
                // Skip if no limit
                if (userLimit > 0) {
                    const currentMemberCount = channel.members.size;
                    const hasBypass = hasVCBypassPermission(newState.member);
                    
                    // Check if adding this user would exceed or reach the limit
                    if (currentMemberCount >= userLimit && !hasBypass) {
                        try {
                            // Try to move them back to previous channel
                            await newState.setChannel(oldChannelId);
                            console.log(`↩️ Moved ${newState.member?.displayName} back to previous VC — VC at capacity (${currentMemberCount}/${userLimit})`);
                        } catch (err) {
                            console.error('Failed to move user from full VC:', err);
                            // If can't move back, disconnect
                            try {
                                await newState.disconnect();
                                console.log(`⛔ Disconnected ${newState.member?.displayName} — VC at capacity (${currentMemberCount}/${userLimit})`);
                            } catch (disconnectErr) {
                                console.error('Failed to disconnect user:', disconnectErr);
                            }
                        }
                        return; // Stop further processing
                    }
                    
                    // Log special permissions usage
                    if (currentMemberCount >= userLimit && hasBypass) {
                        console.log(`🎖️ ${newState.member?.displayName} used override to move to full VC (${currentMemberCount}/${userLimit})`);
                    }
                }
            }

            // Create temp VC for parent channels (if moving into a parent channel)
            const parentConfig = PARENT_CONFIGS[newChannelId];
            if (parentConfig) {
                await createTempVCWithOptions(newState, parentConfig, client);
                return;
            }

            // ---- Streamer Waiting Room Join (for moves) ----
            const claim = [...(client.claimedChannels?.values() || [])].find(c => c.waitingRoomId === newChannelId);
            if (claim) {
                const mainVC = client.channels.cache.get(claim.mainChannelId);
                if (!mainVC || !claim.streamerId) return;

                try {
                    const embed = new EmbedBuilder()
                        .setTitle('Join Request')
                        .setDescription(`<@${newState.id}> is requesting to join your stream channel.`)
                        .setColor('#faa61a');

                    const row = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`STRM_SELECT_${newState.id}_${newChannelId}_${mainVC.id}`)
                            .setPlaceholder('Approve or Deny')
                            .addOptions([
                                { label: '✅ Approve', value: `STRM_APPROVE_${newState.id}_${newChannelId}_${mainVC.id}` },
                                { label: '❌ Deny', value: `STRM_DENY_${newState.id}_${newChannelId}_${mainVC.id}` },
                            ])
                    );

                    const sentMessage = await mainVC.send({
                        content: `<@${claim.streamerId}> You have a new join request:`,
                        embeds: [embed],
                        components: [row],
                    });

                    client.streamerRequestDMs.set(mainVC.id, client.streamerRequestDMs.get(mainVC.id) || []);
                    client.streamerRequestDMs.get(mainVC.id).push({
                        dmMessageId: sentMessage.id,
                        userId: newState.id,
                    });

                    console.log(`📨 Join request sent for ${newState.member?.displayName}`);
                } catch (err) {
                    console.error('❌ Failed to send join request message:', err);
                }
            }

            // ---- RED CHANNEL DM POPUP for moves to existing temp VCs ----
            const isTemp = await checkIfTempVC(newChannelId);
            if (isTemp && !usersWhoHaveSeenRedWarning.has(newState.id)) {
                const currentChannel = newState.channel;
                if (currentChannel && currentChannel.name.includes('🔴')) {
                    // Check if user should be exempt
                    if (shouldSkipRedWarning(newState.member)) {
                        console.log(`ℹ️ ${newState.member.displayName} has CrestOfKnighthood role, skipping red channel warning`);
                        usersWhoHaveSeenRedWarning.add(newState.id); // Add to set so they don't get spammed
                    } else {
                        const message = await sendRedChannelWarning(newState.member, newChannelId);
                        console.log(message ? 
                            `✅ Red channel DM sent to ${newState.member.displayName} (moved to existing VC)` : 
                            `❌ Could not send red channel warning to ${newState.member.displayName}`
                        );
                    }
                }
            }
            
            return;
        }

        // ---- Handle STATUS CHANGES (mute, deafen, etc.) ----
        // If we get here, it means oldChannelId === newChannelId (user stayed in same channel)
        // This could be mute, deafen, video status, stream status, etc.
        // We should ignore these events to prevent spam
        if (oldChannelId === newChannelId && oldChannelId) {
            // Optional: Log status changes for debugging (commented out to reduce spam)
            // console.log(`[STATUS] [${newState.member?.displayName}] changed status in VC ${oldChannelId}`);
            return;
        }
    },

    // Export the handlers for use in interactionCreate.js
    handleRedChannelButton, // Add this to exports
    handlePauseVCDeletion,
    handlePauseDurationMenu,
    handleTempVCOptionsMenu,
    isVCPaused,
    getRemainingPauseTime,
    removeVCPauseState,
    setVCPauseState,
    hasVCBypassPermission,
    sendRedChannelWarning,
    scheduleRedChannelCleanup,
    cleanUpTempVC,
    cleanupRequestDMs,
    createTempVCWithOptions,
    shouldSkipRedWarning // Add this to exports
};