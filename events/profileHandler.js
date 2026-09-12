const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const rsiUrlRegex = /https:\/\/robertsspaceindustries\.com\/en\/citizens\/\w+/;
const twitchUrlRegex = /https:\/\/www\.twitch\.tv\/[a-zA-Z0-9_]+/;
const youtubeUrlRegex = /https:\/\/www\.youtube\.com\/channel\/[a-zA-Z0-9_-]+/;

async function handleStreamerProfilesButton(interaction) {
    // Send initial embed with "Start" button to begin form
    const embed = new EmbedBuilder()
        .setTitle('Provide Streamer\'s RSI Handle and Streaming Profiles')
        .setDescription('Click the button to start the process of linking the streamer\'s RSI Handle and streaming profiles.');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('start_form')
                .setLabel('Start Form')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: 64, // Ephemeral message
    });
}

async function startForm(interaction) {
    // Initial question (RSI handle)
    const embed = new EmbedBuilder()
        .setTitle('Step 1: Provide RSI Handle')
        .setDescription('Please provide the RSI handle in the format `https://robertsspaceindustries.com/en/citizens/your_handle`');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('next_rsi')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.update({
        embeds: [embed],
        components: [row],
        flags: 64, // Ephemeral message
    });
}

async function handleRSI(interaction) {
    const filter = response => response.author.id === interaction.user.id;
    const rsiCollector = interaction.channel.createMessageCollector({ filter, time: 60000 });

    rsiCollector.on('collect', async message => {
        const rsiHandle = message.content.trim();
        const isValidRsiUrl = rsiUrlRegex.test(rsiHandle);

        if (!isValidRsiUrl) {
            return await message.reply({ content: 'Please provide a valid RSI handle URL. Example: `https://robertsspaceindustries.com/en/citizens/Streamer`', flags: 64 });
        }

        // Ask for the next step (Twitch URL)
        const embed = new EmbedBuilder()
            .setTitle('Step 2: Provide Twitch URL')
            .setDescription('Please provide the Twitch URL (optional). If you don\'t have a Twitch, click "Next" to skip.');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('next_twitch')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.reply({
            embeds: [embed],
            components: [row],
            flags: 64, // Ephemeral message
        });

        rsiCollector.stop();
    });
}

async function handleTwitch(interaction) {
    const filter = response => response.author.id === interaction.user.id;
    const twitchCollector = interaction.channel.createMessageCollector({ filter, time: 60000 });

    twitchCollector.on('collect', async message => {
        const twitchLink = message.content.trim();
        const isValidTwitchUrl = twitchLink && twitchUrlRegex.test(twitchLink);

        if (twitchLink && !isValidTwitchUrl) {
            return await message.reply({ content: 'Please provide a valid Twitch URL. Example: `https://www.twitch.tv/streamer_name`', flags: 64 });
        }

        // Ask for YouTube URL
        const embed = new EmbedBuilder()
            .setTitle('Step 3: Provide YouTube URL')
            .setDescription('Please provide the YouTube URL (optional). If you don\'t have YouTube, click "Submit".');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('next_youtube')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.reply({
            embeds: [embed],
            components: [row],
            flags: 64, // Ephemeral message
        });

        twitchCollector.stop();
    });
}

async function handleYoutube(interaction) {
    const filter = response => response.author.id === interaction.user.id;
    const youtubeCollector = interaction.channel.createMessageCollector({ filter, time: 60000 });

    youtubeCollector.on('collect', async message => {
        const youtubeLink = message.content.trim();
        const isValidYoutubeUrl = youtubeLink && youtubeUrlRegex.test(youtubeLink);

        if (youtubeLink && !isValidYoutubeUrl) {
            return await message.reply({ content: 'Please provide a valid YouTube URL. Example: `https://www.youtube.com/channel/UCXXXXXX`', flags: 64 });
        }

        // Final confirmation
        const embed = new EmbedBuilder()
            .setTitle('Profile Recorded')
            .setDescription('Thank you! Your information has been recorded.');

        await message.reply({
            embeds: [embed],
            flags: 64, // Ephemeral message
        });

        youtubeCollector.stop();
    });
}

module.exports = {
    handleStreamerProfilesButton,
    startForm,
    handleRSI,
    handleTwitch,
    handleYoutube,
};
