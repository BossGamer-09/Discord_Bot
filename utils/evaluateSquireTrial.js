const { connectToMySQL, getSquireTrial, updateSquireTrialStatus } = require('../db');
const rankCommand = require('../commands/rank.js');
const { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

// Overseer role IDs - ONLY these users can use weekly evaluation buttons
const OVERSEER_ROLE_IDS = ['1308081615083278378', '1308081895266844712'];

// Check if user is an Overseer
function isOverseer(member) {
    return OVERSEER_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

async function evaluateDueTrials(guild) {
    const db = await connectToMySQL();
    try {
        const nowUTC = Date.now();

        const [dueTrials] = await db.query(
            `SELECT * 
             FROM squire_trials 
             WHERE pass_fail IS NULL
             AND UNIX_TIMESTAMP(UTC_TIMESTAMP()) * 1000 >= (UNIX_TIMESTAMP(started_at) * 1000 + trial_duration)`
        );

        if (!dueTrials.length) {
            console.log('No due trials to evaluate.');
            return;
        }

        console.log(`Found ${dueTrials.length} trials ready for evaluation.`);

        for (const trial of dueTrials) {
            console.log(`Evaluating trial for Squire: ${trial.squire_name}, Channel: ${trial.channel_id}`);
            await evaluateSquireTrial(guild, trial.channel_id, trial.poll_thread_id, trial.trial_duration);
        }
    } catch (error) {
        console.error('Error evaluating due trials:', error);
    }
}

async function fetchAllMessages(pollThread) {
    const allMessages = new Map();
    let lastMessageId = null;

    try {
        while (true) {
            const messages = await pollThread.messages.fetch({ limit: 100, before: lastMessageId }).catch(error => {
                console.error('Failed to fetch messages batch:', error);
                return new Map();
            });

            if (!messages.size) break;

            messages.forEach(msg => allMessages.set(msg.id, msg));
            lastMessageId = messages.last().id;
        }
    } catch (error) {
        console.error('Error fetching messages in batches:', error);
    }

    return Array.from(allMessages.values());
}

async function createAndSendTranscript(pollThread, logChannelId, titlePrefix, guild) {
    const messages = await fetchAllMessages(pollThread);
    const transcriptMessages = messages.filter(
        msg => !(msg.author.bot && (msg.content.trim() === '' || msg.content.includes('was added to the thread')))
    );

    const sortedMessages = transcriptMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let transcriptText = sortedMessages
        .map(msg => `**${msg.author.tag}**: ${msg.content}`)
        .join('\n') || 'No messages to display.';

    if (transcriptText.length > 4096) {
        console.warn(`Transcript too long (${transcriptText.length}). Truncating.`);
        transcriptText = transcriptText.slice(0, 4093) + '...';
    }

    const fullTranscriptText = sortedMessages
        .map(msg => `${msg.author.tag}: ${msg.content}`)
        .join('\n');

    const transcriptEmbed = new EmbedBuilder()
        .setTitle(`${titlePrefix}: ${pollThread.name} Transcript`)
        .setDescription(transcriptText)
        .setColor('#FF0000');

    const transcriptFile = new AttachmentBuilder(
        Buffer.from(fullTranscriptText, 'utf-8'),
        { name: `${pollThread.name.replace(/\s+/g, '_')}_transcript.txt` }
    );

    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [transcriptEmbed], files: [transcriptFile] });
        console.log(`Transcript sent to log channel: ${logChannel.id}`);
    } else {
        console.error('Failed to fetch or send to log channel.');
    }
}

async function evaluateSquireTrial(guild, trialChannelId, pollThreadId, trialDuration) {
    try {
        const trialData = await getSquireTrial(trialChannelId);
        if (!trialData) {
            console.error(`No trial data found for channel ID: ${trialChannelId}`);
            return;
        }

        const {
            squire_id, squire_name, sponsor_id, sponsor_name, poll_id,
            yay_votes, nay_votes, pre_squire_rank, started_at
        } = trialData;

        const startTime = new Date(started_at).getTime();
        const elapsedTime = Date.now() - startTime;

        if (elapsedTime < trialDuration) {
            console.log(`Trial not yet concluded for ${squire_name}. Time remaining: ${(trialDuration - elapsedTime) / 1000} seconds.`);
            return;
        }

        const yayCount = yay_votes ? yay_votes.split(',').filter(Boolean).length : 0;
        const nayCount = nay_votes ? nay_votes.split(',').filter(Boolean).length : 0;

        console.log(`Evaluating ${squire_name}: Yay=${yayCount}, Nay=${nayCount}`);

        const pollThread = await guild.channels.fetch(pollThreadId).catch(error => {
            console.error(`Failed to fetch poll thread ${pollThreadId}:`, error);
            return null;
        });

        if (!pollThread) {
            console.error(`Poll thread ${pollThreadId} not found. Skipping.`);
            return;
        }

        // Unarchive the thread if archived
        if (pollThread.archived) {
            await pollThread.setArchived(false).catch(err => console.error(`Failed to unarchive thread ${pollThreadId}:`, err));
        }

        const pollMessages = await fetchAllMessages(pollThread);
        console.log(`Found ${pollMessages.length} messages in thread ${pollThreadId}`);

        // Case-insensitive search for the poll message
        const pollMessage = pollMessages.find(msg =>
            msg.embeds.length > 0 &&
            typeof msg.embeds[0]?.title === 'string' &&
            msg.embeds[0].title.toLowerCase().includes(squire_name.toLowerCase())
        );

        if (!pollMessage) {
            console.error(`Poll message not found for squire "${squire_name}" in thread ${pollThreadId}.`);
            console.error(`Searching for: ${squire_name.toLowerCase()}`);
            console.error(`Available embed titles:`, pollMessages
                .filter(msg => msg.embeds.length > 0 && msg.embeds[0]?.title)
                .map(msg => msg.embeds[0]?.title.toLowerCase())
            );
            return;
        }

        console.log(`Found poll message: ${pollMessage.id} with title: "${pollMessage.embeds[0]?.title}"`);

        const db = await connectToMySQL();
        const passed = yayCount > nayCount;
        const outcome = passed ? 'Passed' : 'Failed';
        const color = passed ? '#00FF00' : '#FF0000';
        const title = `${squire_name}'s Squire Trial ${outcome}!`;
        const description = passed
            ? `The Squire Trial for **${squire_name}**, sponsored by **${sponsor_name}**, has passed!\n\n**${squire_name}** has been elevated to Rank 7 Knight!`
            : `The Squire Trial for **${squire_name}**, sponsored by **${sponsor_name}**, has failed.\n\n**${squire_name}**'s rank has been reverted to **[${pre_squire_rank}]**.`;

        const updatedEmbed = EmbedBuilder.from(pollMessage.embeds[0])
            .setTitle(title)
            .setDescription(description)
            .setColor(color);

        if (pollMessage.author.id === guild.client.user.id) {
            await pollMessage.edit({ embeds: [updatedEmbed], components: [] });
        } else {
            updatedEmbed.setFooter({ text: 'Final trial result (new message)' });
            await pollThread.send({ embeds: [updatedEmbed] });
        }

        await db.query(
            `UPDATE squire_trials 
             SET trial_status = 'concluded', pass_fail = ?, evaluated_at = NOW() 
             WHERE channel_id = ?`,
            [passed ? 'pass' : 'fail', trialChannelId]
        );
        console.log(`Marked ${squire_name}'s trial as ${passed ? 'pass' : 'fail'}.`);

        const squire = await guild.members.fetch(squire_id).catch(() => null);
        if (squire) {
            const fakeMessage = { guild, author: guild.client.user, client: guild.client, channel: pollThread };
            let finalRank = passed ? 'KM7' : pre_squire_rank;
            await rankCommand.execute(fakeMessage, [finalRank, `${squire.user.tag}`]);

            // Restore LL legacy role if applicable
            if (passed && /^LL\d+$/i.test(pre_squire_rank)) {
                const legacyRoleId = '1304192533533819002';
                if (!squire.roles.cache.has(legacyRoleId)) {
                    await squire.roles.add(legacyRoleId).catch(err =>
                        console.error(`Failed to add legacy role to ${squire.user.tag}:`, err)
                    );
                    console.log(`Granted legacy LL role to ${squire.user.tag}`);
                }
            }
        }

        const sponsor = await guild.members.fetch(sponsor_id).catch(() => null);
        if (sponsor && sponsor.roles.cache.has('1318329035268427796')) {
            await sponsor.roles.remove('1318329035268427796');
            console.log(`Removed Knight Sponsor role from ${sponsor_name}.`);
        }

        const trialChannel = await guild.channels.fetch(trialChannelId).catch(() => null);
        if (trialChannel) {
            await trialChannel.delete();
            console.log(`Deleted trial channel: ${trialChannelId}`);
        }

        if (pollThread) {
            await pollThread.setArchived(true).catch(err => console.error(`Failed to archive thread ${pollThreadId}:`, err));
            await createAndSendTranscript(pollThread, '1169011365466349649', passed ? 'Ballot' : 'Failed Ballot', guild);
            await pollThread.delete().catch(err => console.error(`Failed to delete thread ${pollThreadId}:`, err));
            console.log(`Deleted poll thread: ${pollThreadId}`);
        }
    } catch (error) {
        console.error('Error evaluating Squire Trial:', error);
    }
}

// ========== WEEKLY EVALUATION SYSTEM ==========

// Weekly evaluation button handler (for the main weekly evaluation command)
async function handleWeeklyEvaluationButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may perform weekly evaluations.',
                ephemeral: true
            });
        }

        // Get all ongoing trials
        const db = await connectToMySQL();
        const [ongoingTrials] = await db.query(
            `SELECT * FROM squire_trials 
             WHERE trial_status = 'ongoing' AND pass_fail IS NULL`
        );

        if (!ongoingTrials.length) {
            return interaction.reply({
                content: 'No ongoing Squire Trials found for evaluation.',
                ephemeral: true
            });
        }

        // Create selection menu for trials
        const trialOptions = ongoingTrials.map((trial, index) => {
            const daysRunning = Math.floor((Date.now() - new Date(trial.started_at).getTime()) / (1000 * 60 * 60 * 24));
            return {
                label: `${trial.squire_name} (${daysRunning} days)`,
                description: `Sponsored by ${trial.sponsor_name}`,
                value: trial.channel_id
            };
        });

        const { StringSelectMenuBuilder } = require('discord.js');
        const trialSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_trial_for_evaluation')
            .setPlaceholder('Select a Squire Trial to evaluate...')
            .addOptions(trialOptions);

        const row = new ActionRowBuilder().addComponents(trialSelectMenu);

        await interaction.reply({
            content: `**Weekly Squire Trial Evaluation**\nFound ${ongoingTrials.length} ongoing trials. Select one to evaluate:`,
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling weekly evaluation:', error);
        await interaction.reply({
            content: 'An error occurred while fetching trials for evaluation.',
            ephemeral: true
        });
    }
}

// Weekly reminder system for trial threads
async function postWeeklyTrialReminder(pollThreadId, trialData) {
    try {
        const guild = client.guilds.cache.get(trialData.guild_id);
        const pollThread = await guild.channels.fetch(pollThreadId).catch(() => null);
        
        if (!pollThread || pollThread.archived) {
            console.log(`Poll thread ${pollThreadId} is archived or not found, skipping reminder`);
            return;
        }

        // Calculate days and progress
        const startTime = new Date(trialData.started_at).getTime();
        const daysRunning = Math.floor((Date.now() - startTime) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, 30 - daysRunning);
        const progressPercentage = Math.min((daysRunning / 30) * 100, 100);

        // Get current vote counts
        const db = await connectToMySQL();
        const [voteCounts] = await db.query(
            `SELECT 
                COUNT(CASE WHEN vote_type = 'Yay' THEN 1 END) as yay_count,
                COUNT(CASE WHEN vote_type = 'Nay' THEN 1 END) as nay_count
             FROM squire_votes 
             WHERE poll_id = ?`,
            [trialData.poll_id]
        );

        const yayCount = voteCounts[0]?.yay_count || 0;
        const nayCount = voteCounts[0]?.nay_count || 0;

        const reminderEmbed = new EmbedBuilder()
            .setTitle(`🔄 Weekly Trial Update: ${trialData.squire_name}`)
            .setDescription(
                `**This is your weekly trial progress update!**\n\n` +
                `**Trial Progress:**\n` +
                `⏰ ${daysRunning}/30 days completed (${progressPercentage.toFixed(1)}%)\n` +
                `📅 ${daysRemaining} days remaining\n` +
                `📊 Current Votes: ✅ ${yayCount} | ❌ ${nayCount}\n\n` +
                `**Overseer Evaluation Options:**\n` +
                `• **Evaluate Now**: Process trial immediately with current votes\n` +
                `• **Extend Trial**: Add 7 more days for evaluation\n` +
                `• **Request Update**: Ask for progress report from sponsor/squire\n` +
                `• **Skip Week**: Take no action this week\n\n` +
                `*Only Overseers may use these actions.*`
            )
            .setColor('#FFA500')
            .setFooter({ text: 'Weekly trial evaluation reminder - Overseers Only' })
            .setTimestamp();

        // Create action buttons for weekly evaluation (Overseers only)
        const evaluateButton = new ButtonBuilder()
            .setCustomId(`weekly_evaluate_${trialData.poll_id}`)
            .setLabel('Evaluate Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const extendButton = new ButtonBuilder()
            .setCustomId(`weekly_extend_${trialData.poll_id}`)
            .setLabel('Extend 7 Days')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏰');

        const updateButton = new ButtonBuilder()
            .setCustomId(`weekly_update_${trialData.poll_id}`)
            .setLabel('Request Update')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝');

        const skipButton = new ButtonBuilder()
            .setCustomId(`weekly_skip_${trialData.poll_id}`)
            .setLabel('Skip Week')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️');

        const row = new ActionRowBuilder().addComponents(evaluateButton, extendButton, updateButton, skipButton);

        await pollThread.send({
            content: `<@&1308081615083278378> <@&1308081895266844712>`,
            embeds: [reminderEmbed],
            components: [row]
        });

        console.log(`Weekly reminder posted for ${trialData.squire_name} in thread ${pollThreadId}`);

    } catch (error) {
        console.error('Error posting weekly reminder:', error);
    }
}

// Handle the "Evaluate Now" button in threads
async function handleWeeklyEvaluateButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may evaluate trials.',
                ephemeral: true
            });
        }

        const pollId = interaction.customId.replace('weekly_evaluate_', '');
        
        // Get trial data
        const trialData = await getSquireTrialByPollId(pollId);
        if (!trialData) {
            return interaction.reply({
                content: 'Trial data not found.',
                ephemeral: true
            });
        }

        // Confirm evaluation
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirm Immediate Evaluation')
            .setDescription(
                `You are about to **immediately evaluate** ${trialData.squire_name}'s trial.\n\n` +
                `**This will:**\n` +
                `• End the trial now with current votes\n` +
                `• Promote to KM7 if Yay votes > Nay votes\n` +
                `• Revert to ${trialData.pre_squire_rank} if failed\n` +
                `• Close this thread and the private channel\n\n` +
                `**This action cannot be undone!**`
            )
            .setColor('#FF0000')
            .setTimestamp();

        const confirmButton = new ButtonBuilder()
            .setCustomId(`confirm_evaluate_${trialData.channel_id}`)
            .setLabel('Confirm Evaluation')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_evaluate')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        await interaction.reply({
            embeds: [confirmEmbed],
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling weekly evaluate:', error);
        await interaction.reply({
            content: 'An error occurred while processing evaluation.',
            ephemeral: true
        });
    }
}

// Handle the "Extend Trial" button in threads
async function handleWeeklyExtendButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may extend trials.',
                ephemeral: true
            });
        }

        const pollId = interaction.customId.replace('weekly_extend_', '');
        
        const trialData = await getSquireTrialByPollId(pollId);
        if (!trialData) {
            return interaction.reply({
                content: 'Trial data not found.',
                ephemeral: true
            });
        }

        // Check if already extended multiple times
        const maxExtensions = 2;
        if (trialData.extended_count >= maxExtensions) {
            return interaction.reply({
                content: `This trial has already been extended ${trialData.extended_count} times (maximum ${maxExtensions}).`,
                ephemeral: true
            });
        }

        const extendEmbed = new EmbedBuilder()
            .setTitle('⏰ Extend Trial Period')
            .setDescription(
                `Extend ${trialData.squire_name}'s trial by **7 additional days**?\n\n` +
                `**Current Status:**\n` +
                `• Running for ${Math.floor((Date.now() - new Date(trialData.started_at).getTime()) / (1000 * 60 * 60 * 24))} days\n` +
                `• Previously extended: ${trialData.extended_count || 0} times\n` +
                `• New total duration: ${30 + ((trialData.extended_count || 0) + 1) * 7} days\n\n` +
                `*This gives more time for evaluation and voting.*`
            )
            .setColor('#3498db')
            .setTimestamp();

        const extendButton = new ButtonBuilder()
            .setCustomId(`confirm_extend_${trialData.channel_id}`)
            .setLabel('Extend 7 Days')
            .setStyle(ButtonStyle.Primary);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_extend')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(extendButton, cancelButton);

        await interaction.reply({
            embeds: [extendEmbed],
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling weekly extend:', error);
        await interaction.reply({
            content: 'An error occurred while processing extension.',
            ephemeral: true
        });
    }
}

// Handle "Request Update" button
async function handleWeeklyUpdateButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may request updates.',
                ephemeral: true
            });
        }

        const pollId = interaction.customId.replace('weekly_update_', '');
        
        const trialData = await getSquireTrialByPollId(pollId);
        if (!trialData) {
            return interaction.reply({
                content: 'Trial data not found.',
                ephemeral: true
            });
        }

        // Request progress update from sponsor and squire
        const privateChannel = interaction.guild.channels.cache.get(trialData.channel_id);
        if (privateChannel) {
            const updateRequestEmbed = new EmbedBuilder()
                .setTitle('📋 Progress Update Requested')
                .setDescription(
                    `The Overseers have requested a progress update on your Squire Trial.\n\n` +
                    `**Please provide:**\n` +
                    `• Recent activities and accomplishments\n` +
                    `• Any challenges or concerns\n` +
                    `• Goals for the coming week\n` +
                    `• General feedback on the trial experience\n\n` +
                    `*Please post your update in this channel within 48 hours.*`
                )
                .setColor('#FFA500')
                .setFooter({ text: `Requested by Overseer ${interaction.user.displayName}` })
                .setTimestamp();

            await privateChannel.send({
                content: `<@${trialData.squire_id}> <@${trialData.sponsor_id}>`,
                embeds: [updateRequestEmbed]
            });
        }

        // Notify the thread
        const updateNoticeEmbed = new EmbedBuilder()
            .setTitle('📝 Update Requested by Overseer')
            .setDescription(
                `${interaction.user.displayName} has requested a progress update from ${trialData.squire_name} and ${trialData.sponsor_name}.\n\n` +
                `They have been notified in their private channel to provide an update within 48 hours.`
            )
            .setColor('#3498db')
            .setTimestamp();

        await interaction.reply({
            embeds: [updateNoticeEmbed]
        });

    } catch (error) {
        console.error('Error handling update request:', error);
        await interaction.reply({
            content: 'An error occurred while requesting update.',
            ephemeral: true
        });
    }
}

// Handle "Skip Week" button
async function handleWeeklySkipButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may use this button.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: '✅ No action taken this week. Trial will continue normally.',
            ephemeral: true
        });
    } catch (error) {
        console.error('Error handling skip week:', error);
        await interaction.reply({
            content: 'An error occurred.',
            ephemeral: true
        });
    }
}

// Handle confirm evaluation
async function handleConfirmEvaluateButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may confirm evaluations.',
                ephemeral: true
            });
        }

        const channelId = interaction.customId.replace('confirm_evaluate_', '');
        
        const trialData = await getSquireTrial(channelId);
        if (!trialData) {
            return interaction.reply({
                content: 'Trial data not found.',
                ephemeral: true
            });
        }

        // Force immediate evaluation
        await evaluateSquireTrial(interaction.guild, channelId, trialData.poll_thread_id, 0);

        await interaction.update({
            content: `✅ **Trial Evaluated**: ${trialData.squire_name}'s trial has been processed immediately by Overseer ${interaction.user.displayName}.`,
            embeds: [],
            components: []
        });

    } catch (error) {
        console.error('Error confirming evaluation:', error);
        await interaction.reply({
            content: 'An error occurred while evaluating the trial.',
            ephemeral: true
        });
    }
}

// Handle confirm extension
async function handleConfirmExtendButton(interaction) {
    try {
        // Check if user is an Overseer
        if (!isOverseer(interaction.member)) {
            return interaction.reply({
                content: 'Only Overseers may confirm extensions.',
                ephemeral: true
            });
        }

        const channelId = interaction.customId.replace('confirm_extend_', '');
        
        const trialData = await getSquireTrial(channelId);
        if (!trialData) {
            return interaction.reply({
                content: 'Trial data not found.',
                ephemeral: true
            });
        }

        // Extend trial by 7 days
        const extensionDays = 7;
        const extensionMs = extensionDays * 24 * 60 * 60 * 1000;

        const db = await connectToMySQL();
        await db.query(
            `UPDATE squire_trials 
             SET trial_duration = trial_duration + ?, 
                 extended_count = COALESCE(extended_count, 0) + 1,
                 last_extended = NOW()
             WHERE channel_id = ?`,
            [extensionMs, channelId]
        );

        // Notify both thread and private channel
        const extensionEmbed = new EmbedBuilder()
            .setTitle(`⏰ Trial Extended by Overseer ${interaction.user.displayName}`)
            .setDescription(
                `**Trial extended by ${extensionDays} days.**\n\n` +
                `• New end date: ${new Date(Date.now() + trialData.trial_duration + extensionMs).toLocaleDateString()}\n` +
                `• Total extensions: ${(trialData.extended_count || 0) + 1}\n` +
                `• Extended via weekly evaluation`
            )
            .setColor('#3498db')
            .setTimestamp();

        // Send to poll thread
        await interaction.channel.send({ embeds: [extensionEmbed] });

        // Send to private channel
        const privateChannel = interaction.guild.channels.cache.get(channelId);
        if (privateChannel) {
            const privateEmbed = new EmbedBuilder()
                .setTitle(`⏳ Trial Period Extended by Overseers`)
                .setDescription(
                    `Your Squire Trial has been extended by **${extensionDays} days**.\n\n` +
                    `**New trial end date:** ${new Date(Date.now() + trialData.trial_duration + extensionMs).toLocaleDateString()}\n` +
                    `This extension was granted during the weekly evaluation by the Overseers.`
                )
                .setColor('#3498db')
                .setTimestamp();

            await privateChannel.send({ embeds: [privateEmbed] });
        }

        await interaction.update({
            content: `✅ **Trial Extended**: ${trialData.squire_name}'s trial extended by ${extensionDays} days.`,
            embeds: [],
            components: []
        });

    } catch (error) {
        console.error('Error confirming extension:', error);
        await interaction.reply({
            content: 'An error occurred while extending the trial.',
            ephemeral: true
        });
    }
}

// Cancel handlers
async function handleCancelEvaluate(interaction) {
    if (!isOverseer(interaction.member)) {
        return interaction.reply({
            content: 'Only Overseers may use this button.',
            ephemeral: true
        });
    }
    
    await interaction.update({
        content: 'Evaluation cancelled.',
        embeds: [],
        components: []
    });
}

async function handleCancelExtend(interaction) {
    if (!isOverseer(interaction.member)) {
        return interaction.reply({
            content: 'Only Overseers may use this button.',
            ephemeral: true
        });
    }
    
    await interaction.update({
        content: 'Extension cancelled.',
        embeds: [],
        components: []
    });
}


// TEST FUNCTION: Send weekly reminder to ALL active trial threads
async function postWeeklyTrialReminderToAllActive(client) {
    try {
        const db = await connectToMySQL();
        
        // Get all active trials
        const [activeTrials] = await db.query(
            `SELECT * FROM squire_trials 
             WHERE trial_status = 'ongoing' AND pass_fail IS NULL`
        );

        console.log(`TEST: Sending weekly reminders to ${activeTrials.length} active trials`);

        for (const trial of activeTrials) {
            try {
                // Get the guild
                const guild = client.guilds.cache.get('1166103102378750033'); // Your guild ID
                if (!guild) {
                    console.log('Guild not found');
                    continue;
                }

                // Get the poll thread
                const pollThread = await guild.channels.fetch(trial.poll_thread_id).catch(() => null);
                if (!pollThread) {
                    console.log(`Thread not found: ${trial.poll_thread_id}`);
                    continue;
                }

                if (pollThread.archived) {
                    await pollThread.setArchived(false);
                }

                // Calculate days and progress
                const startTime = new Date(trial.started_at).getTime();
                const daysRunning = Math.floor((Date.now() - startTime) / (1000 * 60 * 60 * 24));
                const daysRemaining = Math.max(0, 30 - daysRunning);
                const progressPercentage = Math.min((daysRunning / 30) * 100, 100);

                // Get vote counts from squire_trials table (yay_votes and nay_votes are stored as comma-separated strings)
                const yayCount = trial.yay_votes ? trial.yay_votes.split(',').filter(Boolean).length : 0;
                const nayCount = trial.nay_votes ? trial.nay_votes.split(',').filter(Boolean).length : 0;

                const reminderEmbed = new EmbedBuilder()
                    .setTitle(`🔄 TEST: Weekly Trial Update: ${trial.squire_name}`)
                    .setDescription(
                        `**THIS IS A TEST REMINDER**\n\n` +
                        `**Trial Progress:**\n` +
                        `⏰ ${daysRunning}/30 days completed (${progressPercentage.toFixed(1)}%)\n` +
                        `📅 ${daysRemaining} days remaining\n` +
                        `📊 Current Votes: ✅ ${yayCount} | ❌ ${nayCount}\n\n` +
                        `**Overseer Evaluation Options:**\n` +
                        `• **Evaluate Now**: Process trial immediately\n` +
                        `• **Extend Trial**: Add 7 more days\n` +
                        `• **Request Update**: Ask for progress report\n` +
                        `• **Skip Week**: Take no action\n\n` +
                        `*Only Overseers may use these actions.*`
                    )
                    .setColor('#FFA500')
                    .setFooter({ text: 'TEST: Weekly trial evaluation reminder' })
                    .setTimestamp();

                // Create action buttons
                const evaluateButton = new ButtonBuilder()
                    .setCustomId(`weekly_evaluate_${trial.poll_id}`)
                    .setLabel('Evaluate Now')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅');

                const extendButton = new ButtonBuilder()
                    .setCustomId(`weekly_extend_${trial.poll_id}`)
                    .setLabel('Extend 7 Days')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏰');

                const updateButton = new ButtonBuilder()
                    .setCustomId(`weekly_update_${trial.poll_id}`)
                    .setLabel('Request Update')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📝');

                const skipButton = new ButtonBuilder()
                    .setCustomId(`weekly_skip_${trial.poll_id}`)
                    .setLabel('Skip Week')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➡️');

                const row = new ActionRowBuilder().addComponents(evaluateButton, extendButton, updateButton, skipButton);

                await pollThread.send({
                    content: `<@&1308081615083278378> <@&1308081895266844712>`,
                    embeds: [reminderEmbed],
                    components: [row]
                });

                console.log(`TEST: Weekly reminder posted for ${trial.squire_name} in thread ${trial.poll_thread_id}`);

                // Add delay between posts to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (trialError) {
                console.error(`Error posting reminder for trial ${trial.squire_name}:`, trialError);
            }
        }

        console.log('TEST: All weekly reminders posted successfully');

    } catch (error) {
        console.error('Error in postWeeklyTrialReminderToAllActive:', error);
        throw error;
    }
}

// Helper function to get trial by poll ID
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

module.exports = {
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
    getSquireTrialByPollId,
    postWeeklyTrialReminderToAllActive
};