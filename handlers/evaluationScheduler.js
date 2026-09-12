const schedule = require('node-schedule');
const { getDueEvaluations, markEvaluationAsPosted } = require('../db');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { connectToMySQL } = require('../db');  // add this

const EVAL_CHANNEL_ID = '1168237930091913267';

async function getUserVoiceTimeLast30Days(userId) {
  try {
    const db = await connectToMySQL();

    const [rows] = await db.query(
      `SELECT SUM(time_spent) AS total_time
       FROM voice_activity
       WHERE user_id = ? AND join_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [userId]
    );

    return rows[0].total_time || 0;
  } catch (error) {
    console.error('Error fetching user voice time:', error);
    return 0;
  }
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${m}m ${s}s`;
}

async function runEvaluationCheck(client) {
  const due = await getDueEvaluations();
  if (!due.length) return;

  for (const entry of due) {
    const guild = await client.guilds.fetch(entry.guild_id).catch(() => null);
    if (!guild) continue;

    const member = await guild.members.fetch(entry.user_id).catch(() => null);
    if (!member) continue;

    const channel = guild.channels.cache.get(EVAL_CHANNEL_ID);
    if (!channel) continue;

    // Fetch voice activity time for last 30 days
    const totalVoiceTimeSecs = await getUserVoiceTimeLast30Days(entry.user_id);
    const formattedVoiceTime = formatTime(totalVoiceTimeSecs);

    const buttons = new ActionRowBuilder();

    if (entry.type === 'LEGION') {
      buttons.addComponents(
        new ButtonBuilder().setCustomId(`promote_${entry.user_id}_LM8`).setLabel('LM8').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`promote_${entry.user_id}_LM7`).setLabel('LM7').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`promote_${entry.user_id}_AUX`).setLabel('AUX').setStyle(ButtonStyle.Danger)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder().setCustomId(`promote_${entry.user_id}_LEGION`).setLabel('LEGION').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`promote_${entry.user_id}_AUX`).setLabel('AUX').setStyle(ButtonStyle.Secondary)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('30-Day Evaluation')
      .setDescription(
        `<@${entry.user_id}> has been in BlightVeil for 30 days and must be evaluated.\n\n` +
        `**Voice Activity (last 30 days):** ${formattedVoiceTime}`
      )
      .setColor('#FFD700')
      .setFooter({ text: `Division: ${entry.type}` });

    await channel.send({ embeds: [embed], components: [buttons] });
    await markEvaluationAsPosted(entry.user_id);
  }
}

function scheduleEvaluationCheck(client) {
  schedule.scheduleJob('0 0 * * *', () => runEvaluationCheck(client));
}

module.exports = { runEvaluationCheck, scheduleEvaluationCheck };
