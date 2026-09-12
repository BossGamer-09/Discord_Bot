const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchInventoryTotals, LOCATIONS, ITEMS } = require('../utils/inventoryDB');

module.exports = {
  name: 'inventory',
  description: 'Show inventory overview and submit input or withdraw requests',
  async execute(message) {
    try {
      const inventoryData = await fetchInventoryTotals();

      const embed = new EmbedBuilder()
        .setTitle('Blightveil Inventory')
        .setDescription(
          'Select **Input** or **Withdraw** below to submit requests.\n\n[Track your request status:](https://quatermaster.blightveil.org/)'
        )
        .setColor('#0066cc')
        .setTimestamp()
        .setFooter({ text: 'Inventory Bot' });

      for (const loc of LOCATIONS) {
        let locText = '';
        for (const item of ITEMS) {
          const count = inventoryData[loc.value]?.[item.value] ?? 0;
          locText += `**${item.label}**: ${count}\n`;
        }
        embed.addFields({ name: loc.label, value: locText, inline: true });
      }

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('inventory_input')
          .setLabel('Input')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('inventory_withdraw')
          .setLabel('Withdraw')
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Error in !inventory command:', err);
      message.reply('Sorry, something went wrong while fetching the inventory.');
    }
  },
};
