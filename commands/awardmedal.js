const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'awardmedal',
    description: 'Award a medal or commendation to a member',
    async execute(message) {
        // List of allowed channel IDs
        const allowedChannelIds = ['1168237930091913267', '1286049530365874342'];
    
        // Check if the command is used in one of the allowed channels
        if (!allowedChannelIds.includes(message.channel.id)) {
            return message.reply('This command can only be used in the designated channels.');
        }
        const embed = new EmbedBuilder()
            .setTitle('Award Medal/Commendation')
            .setDescription('Please select a medal/commendation below and enter who it is to be awarded to!');

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('award_1179511435471093851')
                    .setLabel('Crest of Knighthood')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179511949713752215')
                    .setLabel('Operational Performance Medal')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179511948321243256')
                    .setLabel('Exceptional Marksmanship Medal')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179490989019242658')
                    .setLabel('Commendation of Potential')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179490984762019921')
                    .setLabel('Commendation of Prowess')
                    .setStyle('SECONDARY')
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('award_1179491522748624977')
                    .setLabel('Commendation of Distinction')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179490981591142440')
                    .setLabel('Commendation of Excellence')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1181295837553369169')
                    .setLabel('Distinguished Tradesman Medal')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1181295806461005964')
                    .setLabel('Distinguished Crewman Medal')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1176959504492007635')
                    .setLabel('Distinguished Infantry Medal')
                    .setStyle('SECONDARY')
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('award_1179470795773333634')
                    .setLabel('Distinguished Pilot Medal')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179511959805239296')
                    .setLabel('Distinguished Command Medal')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1250794474481647617')
                    .setLabel('Tournament Champion')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1176955192953020416')
                    .setLabel('Valiant Medal of Slaughter')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1179489896554041424')
                    .setLabel('BlightVeil Medal of Glory')
                    .setStyle('SECONDARY')
            );

        const row4 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('award_1280978643589271593')
                    .setLabel('Troll Lord')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('award_1280978452694040577')
                    .setLabel('Meme Lord')
                    .setStyle('SECONDARY'),
            );

        await message.channel.send({ embeds: [embed], components: [row1, row2, row3, row4] });
    },
};