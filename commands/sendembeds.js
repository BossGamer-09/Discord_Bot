const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'sendembeds',
    description: 'Send the core values, prosperity, excellence, and FAQ embeds.',
    async execute(message, args) {
        const embed1 = new EmbedBuilder()
            .setTitle('Core Values')
            .setDescription(`No Frustration, Only Determination: At BlightVeil, we leave frustration at the door. We thrive on challenges and view setbacks as opportunities for growth. We channel our energy into determination, constantly seeking ways to overcome obstacles and achieve success.

Ego Checked at the Airlock: We value humility over hubris. There's no room for overbearing egos within our ranks. We recognize that true strength lies in our ability to learn from one another and adapt. We check our egos to foster a collaborative and constructive environment.

Relentless Pursuit of Mastery: We are driven by the pursuit of mastery. Each day, we strive to improve and hone our skills. Whether it's combat, logistics, or leadership, we are committed to continuous growth and excellence in our chosen crafts.

Respect for All Voices: Every opinion matters at BlightVeil. We embrace diversity of thought and respect the perspectives of our fellow members. Open and respectful dialogue is the cornerstone of our decision-making process.

Comms Discipline, Always: In the heat of battle or during critical operations, comms discipline is non-negotiable. We communicate clearly, efficiently, and effectively, ensuring that our orders are received and executed flawlessly.

Validation Through Testing: In our quest for excellence, we rely on validated testing. We employ rigorous assessments and evaluations to ensure that our strategies, tactics, and techniques are battle-tested and proven.

Structured Villainism: We are no mere marauders; we are a disciplined force. Our villainy is strategic and calculated. We strike with precision and purpose, never leaving chaos in our wake. Our actions are structured to achieve our goals, leaving nothing to chance.

Responsibility and Delegation: We believe in shared responsibility and delegation of duties. Leaders lead by example, and responsibilities are delegated according to skill and expertise. We trust each member to fulfill their roles and contribute to our collective success.`);

        const embed2 = new EmbedBuilder()
            .setTitle('By Any Means, We Prosper.')
            .setDescription(`"The BlightVeil Legion has never been about merely existing within the confines of a virtual universe. Since its inception, our organization has forged a legacy built on ambition, resourcefulness, and a relentless drive to achieve the extraordinary. We do not restrict ourselves to predefined narratives or imaginary scenarios. Instead, we focus on the exhilarating realm of meta-gaming, where reality meets ambition.

The Legion is a great place for all gameplay types, from casual trading to PvP dogfighting, always striving to be the best at any task put in front of them, and dominating objectives ruthlessly."`);

        const buttonRow1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('BVL RSI Link')
                    .setStyle('LINK')
                    .setURL('https://robertsspaceindustries.com/orgs/BVL')
            );

        const embed3 = new EmbedBuilder()
            .setTitle('Where Excellence Meets Victory.')
            .setDescription(`"The BlightVeil Knights, the epitome of excellence within the BlightVeil Legion were not born from a desire for prestige or accolades. They emerged from the crucible of competition and the relentless pursuit of victory. Handpicked from the Legion’s best, they represent the pinnacle of meta-focused gameplay.

The Knights are dedicated PvP combat focused operators with the relentlessness to dominate their opponents whether from the cockpit of a fighter, the seat of a turret, or behind the scope of their rifle."`);

        const buttonRow2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('BVK RSI Link')
                    .setStyle('LINK')
                    .setURL('https://robertsspaceindustries.com/orgs/BVK')
            );

        const embed4 = new EmbedBuilder()
            .setTitle('Please see the FAQ channel for more information.')
            .setDescription('Check out ⁠<#1175140451951587398> for more information and frequently asked questions about BlightVeil.');

        await message.channel.send({ embeds: [embed1] });
        await message.channel.send({ embeds: [embed2], components: [buttonRow1] });
        await message.channel.send({ embeds: [embed3], components: [buttonRow2] });
        await message.channel.send({ embeds: [embed4] });
    }
};
