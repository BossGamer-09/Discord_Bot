const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'verify',
    description: 'Send a verification embed for ambassadorship.',
    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setTitle('Verification for Ambassadorship')
            .setDescription(
                'When you entered the BlightVeil server by indicating you are a representative for another Org you were given the "External Citizen" role which allows access to this channel.\n\n' +
                'If you would like to organize events between your Org and BlightVeil or to properly represent your Org within the BlightVeil Server we must verify you are authorized by your Org to do so.\n\n' +
                'Please fill out this questionnaire so that we can verify your status with your organization to receive Ambassador status with BlightVeil.'
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_form')
                    .setLabel('Verify Form')
                    .setStyle('PRIMARY')
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
