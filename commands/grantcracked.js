const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'grantcracked',
    description: 'Send an embed with a dropdown for granting cracked roles.',
    async execute(message, args, client) {
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Grant Cracked Roles')
            .setDescription(
                `Select Cracked Pilot or Cracked Infantry from the drop down below and then select the member(s) receiving the role.\n\n` +
                `Cracked roles should only be granted to members who have successfully met the criteria to receive them.`
            )
            .setColor('#0099FF'); // Optional: Add a color to the embed

        // Create the dropdown menu
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('grant_cracked_roles_select')
                .setPlaceholder('Select a role to grant')
                .addOptions([
                    { label: 'Cracked Pilot', value: 'cracked_pilot' },
                    { label: 'Cracked Infantry', value: 'cracked_infantry' },
                ])
        );

        // Send the embed and dropdown menu to the same channel the command is used in
        await message.channel.send({ embeds: [embed], components: [row] });

        // Notify the command user that the message was sent successfully
        await message.reply({ content: 'The "Grant Cracked Roles" embed has been sent.', ephemeral: true });
        message.channel.send('Command executed successfully!');
    },
};