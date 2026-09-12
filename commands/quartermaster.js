const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'exportinventory',
  description: 'Send export inventory embed with XML and CSV options',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('Inventory Export')
      .setDescription('Click a button below to export the inventory in your preferred format.')
      .setColor('#0099ff');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('export_inventory_xml')
        .setLabel('📤 Export to XML')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('export_inventory_csv')
        .setLabel('📤 Export to CSV')
        .setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
};
