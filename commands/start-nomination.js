const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'start-nomination',
    description: 'Start a nomination process',
    async execute(message) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('nominate_button')
                    .setLabel('Nominate')
                    .setStyle('PRIMARY')
            );

        const embed = new EmbedBuilder()
            .setTitle('Nomination of Distinction')
            .setDescription('Select the button below and enter the information required to give your nomination to a BV member for exceptional operational performance or feat.\n\nNominations contribute to a member\'s distinction level.')
            .setColor('BLUE');

        await message.channel.send({ embeds: [embed], components: [row] });
    }
};


module.exports = {
    name: 'update-nomination',
    description: 'Update an existing nomination embed',
    async execute(message) {
        const channelId = '1263872187526287502';
        const messageId = '1263873250316783669';

        try {
            const channel = await message.client.channels.fetch(channelId);
            const targetMessage = await channel.messages.fetch(messageId);

            if (!targetMessage) {
                return message.reply('Message not found!');
            }

            const updatedEmbed = new EmbedBuilder()
                .setTitle('Recognition and Nomination of Distinction')
                .setDescription(
                    'Select the button below and enter the information required to give your nomination to a BV member for exceptional operational performance or feat.\n\n' +
                    'Nominations contribute to a member\'s distinction level.\n\n' +
                    'If your submission is determined to be a Recognition, then the nominee will receive recognition for their feat, but it will not count towards their Distinction Level.'
                )
                .setColor('Blue');

            const updatedRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_button')
                        .setLabel('Nominate')
                        .setStyle(ButtonStyle.Primary)
                );

            await targetMessage.edit({
                embeds: [updatedEmbed],
                components: [updatedRow], 
            });

            message.reply('The nomination embed has been updated successfully.');
        } catch (error) {
            console.error('Error updating the embed:', error);
            message.reply('Failed to update the embed. Please check the details and try again.');
        }
    }
};