const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function evaluateMember(client, userId, type) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return console.error(`User ${userId} not found in guild.`);

  const evalChannelId = process.env.EVAL_CHANNEL_ID || '1168942402824847391';
  const evalChannel = await guild.channels.fetch(evalChannelId).catch(() => null);
  if (!evalChannel) return console.error('Evaluation channel not found.');

  const isLegion = type === 'legion';

  const embed = new EmbedBuilder()
    .setTitle(`⏰ 29-Day Evaluation: ${member.displayName}`)
    .setDescription(`Please vote on <@${userId}>'s progression.\nThey have completed 29 days in the **${isLegion ? 'Legion' : 'Auxiliary'} Division**.`)
    .setColor('#3498db');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`eval_promote_${isLegion ? 'lm8' : 'aux'}_${userId}`)
      .setLabel(isLegion ? 'Promote to LM8' : 'Promote in AUX')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`eval_promote_${isLegion ? 'lm7' : 'legion'}_${userId}`)
      .setLabel(isLegion ? 'Promote to LM7' : 'Transfer to Legion')
      .setStyle(ButtonStyle.Primary)
  );

  await evalChannel.send({
    content: `⏳ <@&1168234521301356715>, please vote on <@${userId}>:`,
    embeds: [embed],
    components: [row]
  });

  console.log(`✅ Scheduled evaluation posted for ${member.displayName}`);
}

module.exports = { evaluateMember };
