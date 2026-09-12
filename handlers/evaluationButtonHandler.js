const { removeEvaluation } = require('../db');
const rankCommand = require('../commands/rank.js');

module.exports = async function handleEvaluationButton(interaction) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith('promote_')) return;

    const [, userId, target] = customId.split('_');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: 'User not found.', ephemeral: true });

    let rankCode;
    if (target === 'LM8' || target === 'LM7' || target === 'UX9') rankCode = target;
    else if (target === 'AUX') rankCode = 'UX9';
    else if (target === 'LEGION') rankCode = 'LM9';
    else return interaction.reply({ content: 'Invalid promotion target.', ephemeral: true });

    const fakeMessage = { guild: interaction.guild, channel: interaction.channel };
    await rankCommand.execute(fakeMessage, [rankCode, member.user.tag]);

    await removeEvaluation(userId);

    await interaction.update({
        content: `✅ ${member.user.tag} has been promoted to ${rankCode}.`,
        components: [],
        embeds: []
    });
};
