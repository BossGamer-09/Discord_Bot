const { listEvaluations, getLastPromotion } = require('../db');
const { EmbedBuilder } = require('discord.js');

// Helper function to calculate days since last promotion
function calculateDaysSinceLastPromotion(lastPromotionDate) {
    if (!lastPromotionDate) return null;
    
    const lastPromotion = new Date(lastPromotionDate);
    const today = new Date();
    const timeDiff = today.getTime() - lastPromotion.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    
    return daysDiff;
}

module.exports = {
    name: 'listevals',
    description: 'List pending evaluations with detailed information including last promotion date',
    async execute(message) {
        try {
            const rows = await listEvaluations(message.guild.id);
            if (!rows.length) return message.reply('No evaluations pending.');

            // Fetch all guild members once to avoid multiple API calls
            let members;
            try {
                members = await message.guild.members.fetch();
            } catch (error) {
                console.error('Error fetching members:', error);
                return message.reply('Error fetching server members.');
            }

            // Group evaluations
            const pendingEvals = [];
            const promotedUsers = [];
            const leftServer = [];
            
            // Store user fetch promises for users not in the guild
            const userFetchPromises = [];
            
            for (const row of rows) {
                const member = members.get(row.user_id);
                const type = row.type || "N/A";
                
                // Format date
                let startDate = "N/A";
                if (row.start_date) {
                    try {
                        startDate = new Date(row.start_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        });
                    } catch {
                        startDate = String(row.start_date);
                    }
                }
                
                // Check posted status
                const isPosted = row.posted === 1;
                
                // Check nickname prefixes
                let hasUXPrefix = false;
                let hasLMPrefix = false;
                let currentNickname = null;
                
                if (member) {
                    currentNickname = member.nickname || member.user.username;
                    
                    // Check for UX prefix (e.g., [UX] John)
                    if (currentNickname && (currentNickname.startsWith('[UX9]') || currentNickname.startsWith('[UX8]'))) {
                        hasUXPrefix = true;
                    }
                    
                    // Check for LM 8 or 9 prefix (e.g., [LM9] John or [LM8] John)
                    if (currentNickname && (currentNickname.startsWith('[LM9]') || currentNickname.startsWith('[LM8]'))) {
                        hasLMPrefix = true;
                    }
                    
                    // Get last promotion data
                    let lastPromotionDate = "N/A";
                    let daysSinceLastPromotion = "N/A";
                    let lastPromotionRank = "N/A";
                    
                    try {
                        const promotionData = await getLastPromotion(row.user_id);
                        if (promotionData) {
                            lastPromotionDate = new Date(promotionData.last_promotion_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });
                            daysSinceLastPromotion = calculateDaysSinceLastPromotion(promotionData.last_promotion_date);
                            lastPromotionRank = promotionData.rank_code || "N/A";
                        }
                    } catch (promotionError) {
                        console.error(`Error fetching promotion data for user ${row.user_id}:`, promotionError);
                    }
                    
                    // Store member user data
                    const evalData = {
                        userId: row.user_id,
                        guildId: row.guild_id,
                        startDate: startDate,
                        type: type,
                        posted: isPosted,
                        member: member,
                        nickname: currentNickname,
                        username: member.user.username,
                        discriminator: member.user.discriminator,
                        hasUXPrefix: hasUXPrefix,
                        hasLMPrefix: hasLMPrefix,
                        daysInEval: row.start_date ? Math.floor((new Date() - new Date(row.start_date)) / (1000 * 60 * 60 * 24)) : 'N/A',
                        lastPromotionDate: lastPromotionDate,
                        daysSinceLastPromotion: daysSinceLastPromotion,
                        lastPromotionRank: lastPromotionRank
                    };
                    
                    if (!hasUXPrefix && !hasLMPrefix) {
                        // User still in server but promoted (no longer has required prefixes)
                        promotedUsers.push(evalData);
                    } else {
                        // User still in evaluation (has required prefixes)
                        pendingEvals.push(evalData);
                    }
                } else {
                    // User not in the guild - fetch user info from Discord API
                    const userPromise = message.client.users.fetch(row.user_id)
                        .then(async (user) => {
                            // Get last promotion data for left users too
                            let lastPromotionDate = "N/A";
                            let daysSinceLastPromotion = "N/A";
                            let lastPromotionRank = "N/A";
                            
                            try {
                                const promotionData = await getLastPromotion(row.user_id);
                                if (promotionData) {
                                    lastPromotionDate = new Date(promotionData.last_promotion_date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    });
                                    daysSinceLastPromotion = calculateDaysSinceLastPromotion(promotionData.last_promotion_date);
                                    lastPromotionRank = promotionData.rank_code || "N/A";
                                }
                            } catch (promotionError) {
                                console.error(`Error fetching promotion data for user ${row.user_id}:`, promotionError);
                            }
                            
                            return {
                                userId: row.user_id,
                                guildId: row.guild_id,
                                startDate: startDate,
                                type: type,
                                posted: isPosted,
                                member: null,
                                nickname: null,
                                username: user.username,
                                discriminator: user.discriminator,
                                userObject: user,
                                hasUXPrefix: false,
                                hasLMPrefix: false,
                                daysInEval: row.start_date ? Math.floor((new Date() - new Date(row.start_date)) / (1000 * 60 * 60 * 24)) : 'N/A',
                                lastPromotionDate: lastPromotionDate,
                                daysSinceLastPromotion: daysSinceLastPromotion,
                                lastPromotionRank: lastPromotionRank
                            };
                        })
                        .catch(error => {
                            // If we can't fetch the user, use the ID
                            console.error(`Error fetching user ${row.user_id}:`, error.message);
                            
                            // Still try to get promotion data
                            let lastPromotionDate = "N/A";
                            let daysSinceLastPromotion = "N/A";
                            let lastPromotionRank = "N/A";
                            
                            return {
                                userId: row.user_id,
                                guildId: row.guild_id,
                                startDate: startDate,
                                type: type,
                                posted: isPosted,
                                member: null,
                                nickname: null,
                                username: null,
                                discriminator: null,
                                userObject: null,
                                hasUXPrefix: false,
                                hasLMPrefix: false,
                                daysInEval: row.start_date ? Math.floor((new Date() - new Date(row.start_date)) / (1000 * 60 * 60 * 24)) : 'N/A',
                                lastPromotionDate: lastPromotionDate,
                                daysSinceLastPromotion: daysSinceLastPromotion,
                                lastPromotionRank: lastPromotionRank
                            };
                        });
                    
                    userFetchPromises.push(userPromise);
                }
            }
            
            // Wait for all user fetches to complete
            const leftServerUsers = await Promise.all(userFetchPromises);
            leftServer.push(...leftServerUsers);
            
            // Calculate statistics
            let avgDaysSinceLastPromotion = 0;
            let usersWithPromotionData = 0;
            let totalDaysSincePromotion = 0;
            
            // Calculate for all users (including left users)
            const allUsers = [...pendingEvals, ...promotedUsers, ...leftServer];
            allUsers.forEach(user => {
                if (user.daysSinceLastPromotion !== "N/A" && user.daysSinceLastPromotion !== null) {
                    usersWithPromotionData++;
                    totalDaysSincePromotion += user.daysSinceLastPromotion;
                }
            });
            
            if (usersWithPromotionData > 0) {
                avgDaysSinceLastPromotion = Math.round(totalDaysSincePromotion / usersWithPromotionData);
            }
            
            // Send total summary first with promotion statistics
            const summaryEmbed = new EmbedBuilder()
                .setTitle('📋 Evaluation Summary')
                .setColor('#0099ff')
                .setTimestamp()
                .addFields(
                    { name: 'Total Evaluations', value: `**${rows.length}** total entries`, inline: true },
                    { name: 'Pending Evaluations', value: `**${pendingEvals.length}** users still in eval`, inline: true },
                    { name: 'Promoted Users', value: `**${promotedUsers.length}** users promoted`, inline: true },
                    { name: 'Left Server', value: `**${leftServer.length}** users left`, inline: true },
                    { name: 'Avg Days Since Last Promotion', value: `**${avgDaysSinceLastPromotion}** days`, inline: true },
                    { name: 'Users With Promotion Data', value: `**${usersWithPromotionData}/${rows.length}** users`, inline: true }
                );
            
            await message.channel.send({ embeds: [summaryEmbed] });
            
            // Send pending evaluations if any
            if (pendingEvals.length > 0) {
                await sendEvaluationGroup(message, pendingEvals, '📝 Pending Evaluations', 'These users still have UX/LM prefixes and are in evaluation:', 0x00ff00);
            }
            
            // Send promoted users if any
            if (promotedUsers.length > 0) {
                await sendEvaluationGroup(message, promotedUsers, '🎉 Promoted Users', 'These users are still in server but no longer have UX/LM prefixes (likely promoted):', 0xffa500);
            }
            
            // Send left server users if any
            if (leftServer.length > 0) {
                await sendLeftServerGroup(message, leftServer, '🚪 Left Server', 'These users have left the server:', 0xff0000);
            }
            
        } catch (error) {
            console.error('Error in listevals command:', error);
            message.reply('An error occurred while fetching evaluations. Please try again later.');
        }
    }
};

async function sendEvaluationGroup(message, evaluations, title, description, color) {
    let embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
    
    let fieldCount = 0;
    
    for (const evalData of evaluations) {
        // Create display name
        let displayName;
        if (evalData.nickname) {
            displayName = evalData.nickname;
        } else {
            displayName = evalData.username || `User: ${evalData.userId}`;
        }
        
        // Create value with information including promotion data
        const valueLines = [
            `**Type:** ${evalData.type}`,
            `**Started:** ${evalData.startDate}`,
            `**Days in Eval:** ${evalData.daysInEval}`
        ];
        
        // Add promotion information if available
        if (evalData.lastPromotionDate !== "N/A") {
            valueLines.push(`**Last Promoted:** ${evalData.lastPromotionDate}`);
            valueLines.push(`**Days Since Promotion:** ${evalData.daysSinceLastPromotion}`);
            valueLines.push(`**Last Rank:** ${evalData.lastPromotionRank}`);
        }
        
        valueLines.push(`**Posted:** ${evalData.posted ? '✅ Yes' : '❌ No'}`);
        valueLines.push(`<@${evalData.userId}>`);
        
        const value = valueLines.join('\n');
        
        embed.addFields({
            name: displayName.substring(0, 256),
            value: value.substring(0, 1024),
            inline: true
        });
        
        fieldCount++;
        
        // If this embed has 6 inline fields (to accommodate extra promotion data), send it and start new one
        if (fieldCount >= 6) {
            await message.channel.send({ embeds: [embed] });
            embed = new EmbedBuilder()
                .setTitle(`${title} (cont.)`)
                .setColor(color)
                .setTimestamp();
            fieldCount = 0;
        }
    }
    
    // Send the last embed if it has leftover fields
    if (fieldCount > 0) {
        await message.channel.send({ embeds: [embed] });
    }
}

async function sendLeftServerGroup(message, evaluations, title, description, color) {
    let embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
    
    let fieldCount = 0;
    
    for (const evalData of evaluations) {
        // Create display name - prefer username if available, otherwise use ID
        let displayName;
        if (evalData.username) {
            // For new Discord usernames (no discriminator)
            if (evalData.discriminator && evalData.discriminator !== '0') {
                displayName = `${evalData.username}#${evalData.discriminator}`;
            } else {
                displayName = evalData.username;
            }
        } else {
            displayName = `ID: ${evalData.userId}`;
        }
        
        // Create value with information including promotion data
        const valueLines = [
            `**Type:** ${evalData.type}`,
            `**Started:** ${evalData.startDate}`,
            `**Days in Eval:** ${evalData.daysInEval}`
        ];
        
        // Add promotion information if available
        if (evalData.lastPromotionDate !== "N/A") {
            valueLines.push(`**Last Promoted:** ${evalData.lastPromotionDate}`);
            valueLines.push(`**Days Since Promotion:** ${evalData.daysSinceLastPromotion}`);
            valueLines.push(`**Last Rank:** ${evalData.lastPromotionRank}`);
        }
        
        valueLines.push(`**Posted:** ${evalData.posted ? '✅ Yes' : '❌ No'}`);
        valueLines.push(`*(Left Server)*`);
        
        const value = valueLines.join('\n');
        
        embed.addFields({
            name: displayName.substring(0, 256),
            value: value.substring(0, 1024),
            inline: true
        });
        
        fieldCount++;
        
        // If this embed has 6 inline fields (to accommodate extra promotion data), send it and start new one
        if (fieldCount >= 6) {
            await message.channel.send({ embeds: [embed] });
            embed = new EmbedBuilder()
                .setTitle(`${title} (cont.)`)
                .setColor(color)
                .setTimestamp();
            fieldCount = 0;
        }
    }
    
    // Send the last embed if it has leftover fields
    if (fieldCount > 0) {
        await message.channel.send({ embeds: [embed] });
    }
}