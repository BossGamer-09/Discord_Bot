const { connectToMySQL } = require('../db');
const { EmbedBuilder } = require('discord.js');

async function checkLM9Evaluations(guild) {
    const db = await connectToMySQL();

    try {
        const [membersToEvaluate] = await db.query(
            `SELECT user_id, lm9_date 
             FROM members 
             WHERE lm9_date IS NOT NULL 
               AND TIMESTAMPDIFF(DAY, lm9_date, NOW()) >= 30`
        );

        if (!membersToEvaluate.length) {
            console.log('No LM9 evaluations needed at this time.');
            return;
        }

        const roleIds = ['1174715276126859274', '1168234521301356715', '1168253795818549319'];
        const roleMentions = roleIds.map(id => `<@&${id}>`).join(' ');

        const reviewChannel = guild.channels.cache.find(ch => ch.name === 'new-member-apps-submissions');
        if (!reviewChannel || !reviewChannel.isTextBased()) {
            console.error(`Channel 'new-member-apps-submissions' not found or not text-based.`);
            return;
        }

        for (const member of membersToEvaluate) {
            let user;

            try {
                user = await guild.members.fetch(member.user_id);
                console.log(`Fetched user: ${user.user.username} (${user.id})`);
            } catch (err) {
                if (err.code === 10007) {
                    console.error(`User ${member.user_id} has left or is no longer a member of the guild.`);
                    await reviewChannel.send(`USER <@${member.user_id}> has left Discord or is no longer a member.`);
                } else {
                    console.error(`Failed to fetch member ${member.user_id}:`, err);
                }
                continue;
            }

            // Check active threads
            let existingThread = reviewChannel.threads.cache.find(
                t => t.name === `Culture Fit Review: ${user.user.username}`
            );

            // Check archived threads if not found in active
            if (!existingThread) {
                const archived = await reviewChannel.threads.fetchArchived();
                existingThread = archived.threads.find(
                    t => t.name === `Culture Fit Review: ${user.user.username}`
                );
            }

            let thread;
            if (existingThread) {
                console.log(`Existing thread found for ${user.user.username}`);
                thread = existingThread;
            } else {
                try {
                    thread = await reviewChannel.threads.create({
                        name: `Culture Fit Review: ${user.user.username}`,
                        autoArchiveDuration: 60,
                        reason: `Culture fit evaluation for ${user.user.username} (LM9)`,
                        invitable: false
                    });

                    await thread.permissionOverwrites.edit(guild.roles.everyone, {
                        ViewChannel: false
                    });

                    for (const roleId of roleIds) {
                        await thread.permissionOverwrites.edit(roleId, {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true
                        });
                    }

                    console.log(`Thread created for ${user.user.username}`);
                } catch (err) {
                    console.error(`Failed to create thread for ${user.user.username}:`, err);
                    continue;
                }
            }

            let voiceDuration = 0;
            try {
                const [voiceActivity] = await db.query(
                    `SELECT SUM(time_spent) AS total_duration
                     FROM voice_activity
                     WHERE user_id = ? AND timestamp >= ?`,
                    [user.id, member.lm9_date]
                );

                voiceDuration = (voiceActivity.length && voiceActivity[0].total_duration) || 0;
                console.log(`Voice time for ${user.user.username}: ${voiceDuration} seconds`);
            } catch (err) {
                console.error(`Failed to fetch voice activity for ${user.user.username}:`, err);
            }

            const hours = Math.floor(voiceDuration / 3600);
            const minutes = Math.floor((voiceDuration % 3600) / 60);

            const reminderEmbed = new EmbedBuilder()
                .setTitle('Culture Fit Evaluation Reminder')
                .setDescription(`It has been 30 days since <@${user.id}> received the LM9 tag. Please review their culture fit.`)
                .addFields(
                    { name: 'Voice Activity', value: `Total Time Spent in Voice: ${hours} hours ${minutes} minutes` }
                )
                .setColor('#FFAA00');

            try {
                await thread.send({
                    content: `${roleMentions}`,
                    embeds: [reminderEmbed]
                });

                console.log(`Sent culture fit message for ${user.user.username}`);

                await db.query(
                    `UPDATE members SET lm9_date = NULL WHERE user_id = ?`,
                    [user.id]
                );
            } catch (err) {
                console.error(`Failed to send message in thread for ${user.user.username}:`, err);
            }
        }
    } catch (err) {
        console.error('Error during LM9 evaluation process:', err);
    }
}

module.exports = { checkLM9Evaluations };
