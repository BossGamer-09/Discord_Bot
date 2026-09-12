const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// Replace with the actual channel ID and message ID for the message you want to edit
const CHANNEL_ID = '1247185540982374453';
const MESSAGE_ID = '1285592774200000513';

module.exports = {
    name: 'editdisciplineselection',
    description: 'Edits the existing discipline selection embed and select menu.',
    async execute(message, args, client) {
        try {
            // Fetch the channel and message
            const channel = await client.channels.fetch(CHANNEL_ID);
            const msg = await channel.messages.fetch(MESSAGE_ID);

            // Updated embed content
            const updatedEmbed = new EmbedBuilder()
                .setTitle('Choose Your Main Discipline')
                .setDescription("Your Main specialty discipline is what gameplay you intend to devote your skills and efforts towards.\n\n**Pilot**\nYou are best being at the helm of your own ship, as a fighter pilot or helming a larger ship.\n\n**Infantry**\nYou excel most being on the ground engaging enemy combatants in FPS combat.\n\n**Crewman**\nYou prefer to be in a support role of a multi crew ship, such as gunner, engineer, etc.\n\n**Tradesman**\nYou enjoy \"the economy\" of SC. Haulers, pirates, salvagers, etc all belong here.");

            // Updated select menu
            const updatedRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_discipline')
                        .setPlaceholder('Select your main discipline')
                        .addOptions([
                            {
                                label: 'Pilot',
                                description: 'You are best being at the helm of your own ship, as a fighter pilot or helming a larger ship.',
                                value: 'pilot',
                            },
                            {
                                label: 'Infantry',
                                description: 'You excel most being on the ground engaging enemy combatants in FPS combat.',
                                value: 'infantry',
                            },
                            {
                                label: 'Crewman',
                                description: 'You prefer to be in a support role of a multi crew ship, such as gunner, engineer, etc.',
                                value: 'crewman',
                            },
                            {
                                label: 'Support',
                                description: 'You enjoy "the economy" of SC. Haulers, pirates, salvagers, etc all belong here.',
                                value: 'tradesman',
                            },
                        ]),
                );

            // Edit the original message with the new embed and select menu
            await msg.edit({ embeds: [updatedEmbed], components: [updatedRow] });
            await message.channel.send("Embed and select menu updated successfully!");
        } catch (error) {
            console.error("Error updating embed:", error);
            await message.channel.send("There was an error updating the embed.");
        }
    },
};
