const { EmbedBuilder } = require('discord.js');
const { getMembersByGuild } = require('../db');

module.exports = {
    name: 'listleftmembers',
    description: 'List members who have left the Discord server in the last 12 months',
    async execute(message) {
        try {
            // Send initial response to show the command is working
            const initialEmbed = new EmbedBuilder()
                .setTitle('🔄 Checking for Left Members...')
                .setDescription('Fetching current server members and comparing with database...')
                .setColor('#3498db')
                .setTimestamp();
            
            const initialMessage = await message.reply({ embeds: [initialEmbed] });

            // First, fetch all current guild members with rate limit handling
            let currentMembers;
            try {
                console.log(`Fetching members for guild: ${message.guild.id}`);
                currentMembers = await message.guild.members.fetch({ 
                    withPresences: false, // Don't fetch presences to reduce load
                    force: false // Use cache if available
                });
                console.log(`Successfully fetched ${currentMembers.size} members`);
            } catch (error) {
                console.error('Error fetching current members:', error);
                
                // If we get rate limited, try a different approach
                if (error.code === 0 || error.message.includes('rate limited')) {
                    const rateLimitEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Rate Limit Hit')
                        .setDescription('Discord API rate limit reached. Using cached members...')
                        .setColor('#f39c12')
                        .setTimestamp();
                    
                    await initialMessage.edit({ embeds: [rateLimitEmbed] });
                    
                    // Try to use cached members
                    currentMembers = message.guild.members.cache;
                    console.log(`Using cached members: ${currentMembers.size} members available`);
                    
                    if (currentMembers.size === 0) {
                        throw new Error('No cached members available. Please try again later.');
                    }
                } else {
                    throw error;
                }
            }

            // Get current member IDs
            const currentMemberIds = new Set(currentMembers.map(member => member.id));

            // Update progress
            const progressEmbed = new EmbedBuilder()
                .setTitle('📊 Progress Update')
                .setDescription(`Fetched ${currentMembers.size} current members\nNow querying database...`)
                .setColor('#3498db')
                .setTimestamp();
            
            await initialMessage.edit({ embeds: [progressEmbed] });

            // Use the function from db.js to get members
            const rows = await getMembersByGuild(message.guild.id);

            if (!rows.length) {
                await initialMessage.edit({ 
                    embeds: [new EmbedBuilder()
                        .setTitle('❌ No Members Found')
                        .setDescription('No members found in database.')
                        .setColor('#e74c3c')
                        .setTimestamp()
                    ] 
                });
                return;
            }

            // Find members who are in database but not in current guild
            const leftMembers = rows.filter(row => !currentMemberIds.has(row.user_id));
            
            // Filter for members who left in the last 12 months
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

            const recentLeftMembers = leftMembers.filter(member => {
                // If we have an updated_at date, use it to determine when they might have left
                if (member.updated_at) {
                    const lastUpdate = new Date(member.updated_at);
                    return lastUpdate > twelveMonthsAgo;
                }
                // If no updated_at date, include them anyway since we can't tell when they left
                return true;
            });

            // Sort by most recent first (based on updated_at)
            recentLeftMembers.sort((a, b) => {
                const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
                const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
                return dateB - dateA;
            });

            if (recentLeftMembers.length === 0) {
                await initialMessage.edit({ 
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ No Recent Departures')
                        .setDescription('No members have left the server in the last 12 months.')
                        .setColor('#2ecc71')
                        .addFields(
                            { name: 'Total in Database', value: rows.length.toString(), inline: true },
                            { name: 'Current Members', value: currentMembers.size.toString(), inline: true },
                            { name: 'All Left Members', value: leftMembers.length.toString(), inline: true }
                        )
                        .setTimestamp()
                    ] 
                });
                return;
            }

            // Send summary first
            const summaryEmbed = new EmbedBuilder()
                .setTitle('🚪 Members Who Left Server (Last 12 Months)')
                .setColor('#ff9900')
                .setDescription(`Found **${recentLeftMembers.length}** members who left in the last 12 months`)
                .addFields(
                    { name: 'Time Period', value: 'Last 12 months', inline: true },
                    { name: 'Current Server Members', value: currentMembers.size.toString(), inline: true },
                    { name: 'Total in Database', value: rows.length.toString(), inline: true },
                    { name: 'All Left Members', value: leftMembers.length.toString(), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Server: ${message.guild.name}` });

            await initialMessage.edit({ embeds: [summaryEmbed] });

            // Send detailed list with mentions in the exact format from your example
            await sendMemberListWithMentions(message, recentLeftMembers, '📋 Members Who Left', '#ff5555');

        } catch (error) {
            console.error('Error in listleftmembers command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`An error occurred: ${error.message}\n\nThis might be due to Discord API rate limits. Please try again in a few minutes.`)
                .setColor('#e74c3c')
                .setTimestamp();
            
            await message.channel.send({ embeds: [errorEmbed] });
        }
    }
};

async function sendMemberListWithMentions(message, members, title, color) {
    // Split members into chunks of 6 (to match your example format with inline fields)
    const chunkSize = 6;
    const chunks = [];
    
    for (let i = 0; i < members.length; i += chunkSize) {
        chunks.push(members.slice(i, i + chunkSize));
    }
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        
        let embed = new EmbedBuilder()
            .setTitle(chunkIndex === 0 ? title : `${title} (cont.)`)
            .setColor(color)
            .setTimestamp();
        
        for (const member of chunk) {
            // Calculate days since last update
            let daysAgo = 'Unknown';
            let lastUpdateFormatted = 'Never';
            
            if (member.updated_at) {
                const lastUpdate = new Date(member.updated_at);
                const today = new Date();
                const timeDiff = today.getTime() - lastUpdate.getTime();
                daysAgo = Math.floor(timeDiff / (1000 * 3600 * 24));
                lastUpdateFormatted = lastUpdate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            }

            // Create display name - use display_name if available, otherwise username
            const displayName = member.display_name || member.username || `ID: ${member.user_id}`;
            
            // Format exactly like your example
            const valueLines = [
                `**Last Updated:** ${lastUpdateFormatted}`,
                `**Days Since:** ${daysAgo}`,
                `<@${member.user_id}>`
            ];

            embed.addFields({
                name: displayName.substring(0, 256),
                value: valueLines.join('\n').substring(0, 1024),
                inline: true
            });
        }
        
        await message.channel.send({ embeds: [embed] });
        
        // Add a small delay between embeds to avoid rate limits
        if (chunkIndex < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}