const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags, UserSelectMenuBuilder } = require('discord.js');
const { connectToMySQL } = require('../db');
const scorecardImageGenerator = require('../utils/scorecardImageGenerator');

// Define the constants directly in the file
const ALLOWED_SCORECARD_ROLES = [
    '1308081895266844712', // Infantry Overseer
    '1168327592269598760', // Infantry Instructor
    '1308081615083278378', // Pilot Overseer
    '1168327555917557780', // Polit Instructor
    '1308081958424940545', // Crewman Overseer
    '1168327699203375114', // Crewman Instructor
    '1308082015622664262', // Support Overseer
    '1168327804874661931', // Support Instructor,
];

const SCORECARD_TAGS = {
    'Pilot': '🛩️',
    'Infantry': '🎯', 
    'Support': '🛠️',
    'Crewman': '👨‍🔧'
};

module.exports = {
    name: 'scorecard',
    description: 'Manage scorecards',
    async execute(message, args) {
        try {
            // Auto-delete the command message
            await message.delete().catch(console.error);

            if (args[0] === 'create') {
                // !scorecard create - show user selection dropdown
                if (!message.member.roles.cache.some(role => ALLOWED_SCORECARD_ROLES.includes(role.id))) {
                    const reply = await message.channel.send('❌ You do not have permission to create scorecards.');
                    setTimeout(() => reply.delete(), 5000);
                    return;
                }

                await this.showUserSelectionDropdown(message);
                
            } else {
                // !scorecard or !scorecard username
                let targetUsername = message.author.tag;
                let isViewingOwnScorecard = true;
                
                // Check if they provided a username (not a mention)
                if (args.length > 0 && !message.mentions.users.first()) {
                    // Check permissions for viewing other users' scorecards
                    if (!message.member.roles.cache.some(role => ALLOWED_SCORECARD_ROLES.includes(role.id))) {
                        const reply = await message.channel.send('❌ You do not have permission to view other users\' scorecards.');
                        setTimeout(() => reply.delete(), 5000);
                        return;
                    }
                    targetUsername = args.join(' ');
                    isViewingOwnScorecard = false;
                } else if (message.mentions.users.first()) {
                    // Handle mentions for backward compatibility
                    if (!message.member.roles.cache.some(role => ALLOWED_SCORECARD_ROLES.includes(role.id))) {
                        const reply = await message.channel.send('❌ You do not have permission to view other users\' scorecards.');
                        setTimeout(() => reply.delete(), 5000);
                        return;
                    }
                    targetUsername = message.mentions.users.first().tag;
                    isViewingOwnScorecard = false;
                }

                await this.showUserScorecardMessage(message, targetUsername, isViewingOwnScorecard);
            }

        } catch (error) {
            console.error('Error handling scorecard command:', error);
            const reply = await message.channel.send('❌ An error occurred while processing the command.');
            setTimeout(() => reply.delete(), 5000);
        }
    },

    // Show user selection dropdown for scorecard creation
    async showUserSelectionDropdown(message) {
        const embed = new EmbedBuilder()
            .setTitle('🎯 Create Scorecard')
            .setDescription('Select a user from the dropdown below to create a scorecard for them.')
            .setColor(0x0099FF)
            .addFields(
                { 
                    name: 'Instructions', 
                    value: 'You will be asked to rate the following categories:\n• Aim - Snap\n• Aim - Tracking\n• Aim - Accuracy\n• Teamplay\n• Comms\n• Strategy\n• Resource Management\n• Game Knowledge\n• Leadership\n• Mindset & Growth\n• Specialty Tag\n\n**Note:** Use 0 for N/A (Not Applicable)' 
                }
            )
            .setFooter({ text: 'All scores are on a scale of 0-10 (0 = N/A)' });

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId('scorecard_user_select')
            .setPlaceholder('Select a user...')
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(userSelect);

        const reply = await message.channel.send({
            embeds: [embed],
            components: [row]
        });

        // Auto-delete the message after 2 minutes
        setTimeout(() => {
            reply.delete().catch(console.error);
        }, 120000);
    },

    async showUserScorecardMessage(message, username, isViewingOwnScorecard = true) {
        try {
            const pool = await connectToMySQL();
            
            // Check if a specific tag was mentioned in the command
            const args = message.content.split(' ');
            const requestedTag = args.find(arg => 
                ['pilot', 'infantry', 'support', 'crewman'].includes(arg.toLowerCase())
            );
            
            let query, queryParams;
            
            if (requestedTag) {
                query = 'SELECT * FROM scorecards WHERE user_id = ? AND tag = ? ORDER BY updated_at DESC LIMIT 1';
                queryParams = [username, requestedTag.charAt(0).toUpperCase() + requestedTag.slice(1)];
            } else {
                query = 'SELECT * FROM scorecards WHERE user_id = ? ORDER BY updated_at DESC';
                queryParams = [username];
            }
            
            const [rows] = await pool.execute(query, queryParams);

            if (rows.length === 0) {
                const reply = await message.channel.send('❌ No scorecard found for this user.');
                setTimeout(() => reply.delete(), 5000);
                return;
            }

            if (requestedTag || rows.length === 1) {
                const scorecard = rows[0];

                try {
                    // Get previous version for comparison
                    const [historyRows] = await pool.execute(
                        'SELECT * FROM scorecard_history WHERE user_id = ? AND tag = ? ORDER BY created_at DESC LIMIT 1',
                        [username, scorecard.tag]
                    );

                    let previousScores = null;
                    if (historyRows.length > 0) {
                        previousScores = historyRows[0];
                        console.log(`[DEBUG] Found previous scores for comparison:`, previousScores);
                    }

                    // Find the ACTUAL user that the scorecard belongs to
                    let targetUser;
                    let displayName = username;
                    
                    try {
                        const members = await message.guild.members.fetch();
                        const member = members.find(m => 
                            m.user.username === username || 
                            m.displayName === username ||
                            m.nickname === username ||
                            m.user.tag === username
                        );
                        
                        if (member) {
                            targetUser = member.user;
                            displayName = member.nickname || member.displayName || member.user.username;
                        } else {
                            targetUser = { 
                                id: '0',
                                username: username,
                                tag: username
                            };
                        }
                    } catch (memberError) {
                        console.log(`[DEBUG] Error fetching members: ${memberError.message}`);
                        targetUser = { 
                            id: '0',
                            username: username,
                            tag: username
                        };
                    }

                    // Generate scorecard image with previous scores for comparison
                    const canvas = await scorecardImageGenerator.generateScorecardImage(
                        targetUser,
                        scorecard,
                        scorecard.tag,
                        message.guild,
                        previousScores
                    );
                    const safeFilename = `scorecard_${username.replace(/[^a-zA-Z0-9]/g, '_')}_${scorecard.tag}_v${scorecard.version || 1}.png`;
                    const attachment = await scorecardImageGenerator.createImageAttachment(canvas, safeFilename);

                    const embed = new EmbedBuilder()
                        .setTitle('🎯 Blightveil Scorecard')
                        .setDescription(`${SCORECARD_TAGS[scorecard.tag]} ${scorecard.tag} Scorecard for ${displayName}${previousScores ? ' • UPDATED' : ''}\n\n[Infantry Master Doc](https://docs.google.com/document/d/1FHPWfk-3bleCC5B0OL6lWRDEtQFSUvURsQnx2JWGyCM/edit?tab=t.0#heading=h.mp4hi2rdtolk)`)
                        .setColor(0x0099FF)
                        .setImage(`attachment://${safeFilename}`)
                        .setFooter({ text: `Last updated • ${new Date(scorecard.updated_at).toLocaleDateString()} • Version ${scorecard.version || 1}` })
                        .setTimestamp();

                    if (isViewingOwnScorecard) {
                        try {
                            await message.author.send({
                                embeds: [embed],
                                files: [attachment]
                            });
                            const confirmation = await message.channel.send('✅ Check your DMs for your scorecard!');
                            setTimeout(() => confirmation.delete(), 5000);
                        } catch (dmError) {
                            console.error('Error sending DM:', dmError);
                            const fallbackReply = await message.channel.send({
                                embeds: [embed],
                                files: [attachment],
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else {
                        const reply = await message.channel.send({
                            embeds: [embed],
                            files: [attachment]
                        });
                        setTimeout(() => reply.delete(), 1200000);
                    }

                } catch (imageError) {
                    console.error('Error generating scorecard image:', imageError);
                    // Fallback: send scorecard data without image
                    const embed = new EmbedBuilder()
                        .setTitle('🎯 Blightveil Scorecard')
                        .setDescription(`${SCORECARD_TAGS[scorecard.tag]} ${scorecard.tag} Scorecard for ${username}`)
                        .setColor(0x0099FF)
                        .addFields(
                            { name: 'Aim - Snap', value: this.formatScoreDisplay(scorecard.aim_snap), inline: true },
                            { name: 'Aim - Tracking', value: this.formatScoreDisplay(scorecard.aim_tracking), inline: true },
                            { name: 'Aim - Accuracy', value: this.formatScoreDisplay(scorecard.aim_accuracy), inline: true },
                            { name: 'Aim - Average', value: this.formatScoreDisplay(scorecard.aim_avg), inline: true },
                            { name: 'Teamplay', value: this.formatScoreDisplay(scorecard.teamplay), inline: true },
                            { name: 'Comms', value: this.formatScoreDisplay(scorecard.comms), inline: true },
                            { name: 'Strategy', value: this.formatScoreDisplay(scorecard.strategy), inline: true },
                            { name: 'Resource Management', value: this.formatScoreDisplay(scorecard.resource_management), inline: true },
                            { name: 'Game Knowledge', value: this.formatScoreDisplay(scorecard.game_knowledge), inline: true },
                            { name: 'Leadership', value: this.formatScoreDisplay(scorecard.leadership || 0), inline: true },
                            { name: 'Mindset & Growth', value: this.formatScoreDisplay(scorecard.mindset_growth || 0), inline: true }
                        )
                        .setFooter({ text: `Last updated • ${new Date(scorecard.updated_at).toLocaleDateString()} • Version ${scorecard.version || 1}` })
                        .setTimestamp();

                    if (isViewingOwnScorecard) {
                        // DM the user their scorecard (fallback without image)
                        try {
                            await message.author.send({
                                embeds: [embed]
                            });
                            const confirmation = await message.channel.send('✅ Check your DMs for your scorecard!');
                            setTimeout(() => confirmation.delete(), 5000);
                        } catch (dmError) {
                            console.error('Error sending DM:', dmError);
                            // If DM fails, fall back to ephemeral in channel
                            const fallbackReply = await message.channel.send({
                                embeds: [embed],
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else {
                        // Public scorecard view for others
                        const reply = await message.channel.send({
                            embeds: [embed]
                        });
                        setTimeout(() => reply.delete(), 1200000);
                    }
                }
            } else {
                // Show scorecard selection menu
                // First, get unique tags with their most recent scorecard
                const uniqueTags = new Map();
                
                rows.forEach((scorecard, index) => {
                    // If we haven't seen this tag yet, or this scorecard is more recent
                    if (!uniqueTags.has(scorecard.tag) || 
                        new Date(scorecard.updated_at) > new Date(uniqueTags.get(scorecard.tag).updated_at)) {
                        uniqueTags.set(scorecard.tag, {
                            ...scorecard,
                            originalIndex: index
                        });
                    }
                });
                
                // Convert Map to array of unique scorecards
                const uniqueScorecards = Array.from(uniqueTags.values());
                
                console.log(`[DEBUG] Found ${rows.length} total scorecards, ${uniqueScorecards.length} unique tags`);
                
                const embed = new EmbedBuilder()
                    .setTitle('🎯 Multiple Scorecards Found')
                    .setDescription(`Found ${uniqueScorecards.length} scorecard types for ${username}. Select one to view:`)
                    .setColor(0x0099FF);

                const options = uniqueScorecards.map((scorecard, index) => {
                    // Create a unique value for each option
                    const uniqueValue = `${scorecard.tag}_${username}_${index}`;
                    
                    return {
                        label: `${SCORECARD_TAGS[scorecard.tag]} ${scorecard.tag}`,
                        description: `Updated ${new Date(scorecard.updated_at).toLocaleDateString()} • Version ${scorecard.version || 1}`,
                        value: uniqueValue,
                        emoji: SCORECARD_TAGS[scorecard.tag] || '📊'
                    };
                });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_scorecard')
                    .setPlaceholder('Choose a scorecard to view...')
                    .addOptions(options);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                if (isViewingOwnScorecard) {
                    // DM the selection menu to the user
                    try {
                        await message.author.send({
                            embeds: [embed],
                            components: [row]
                        });
                        const confirmation = await message.channel.send('✅ Check your DMs to select which scorecard to view!');
                        setTimeout(() => confirmation.delete(), 5000);
                    } catch (dmError) {
                        console.error('Error sending DM:', dmError);
                        // If DM fails, fall back to ephemeral in channel
                        const fallbackReply = await message.channel.send({
                            embeds: [embed],
                            components: [row],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } else {
                    // Public selection menu for others
                    const reply = await message.channel.send({
                        embeds: [embed],
                        components: [row]
                    });
                    setTimeout(() => reply.delete(), 30000);
                }
            }

        } catch (error) {
            console.error('Error fetching scorecard:', error);
            const reply = await message.channel.send('❌ An error occurred while fetching the scorecard.');
            setTimeout(() => reply.delete(), 5000);
        }
    },

    validateScore(scoreText) {
        const score = parseInt(scoreText);
        if (isNaN(score) || score < 0 || score > 10) {
            throw new Error(`Invalid score: ${scoreText}. Must be between 0-10 (0 = N/A).`);
        }
        return score;
    },

    formatScoreDisplay(score) {
        if (score === 0 || score === null || score === undefined) {
            return 'N/A';
        }
        return `${score}/10`;
    }
};