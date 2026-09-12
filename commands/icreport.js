const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Events } = require('discord.js');

// Channel to post the final embed to
const TARGET_CHANNEL_ID = '1361586087407124522';

module.exports = {
  name: 'icreport',
  description: 'Post the IC report submission embed',

  execute: async (message) => {
    const embed = new EmbedBuilder()
      .setTitle('Submit a Issue Council Report')
      .setDescription('Click the button below to publicly share an IC Report to be upvoted.')
      .setColor(0x00AE86);

    const button = new ButtonBuilder()
      .setCustomId('submit_ic_report')
      .setLabel('Click Below to Public IC Report to Be Upvoted')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);
    await message.channel.send({ embeds: [embed], components: [row] });
  },
};
