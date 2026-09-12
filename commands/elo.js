const { EmbedBuilder, Colors } = require('discord.js');
const fuzzball = require('fuzzball');
const { connectToMySQL } = require('../db');

const ALLOWED_ROLE_IDS = [
    '1173822659071578182',
    '1173822697956982794',
    '1173822842442367026',
    '1390871349408436224',
    '1304192533533819002',
    '1304192471806246953',
];

const ALLOWED_USER_IDS = [
    '246067535613657089',
    '720344087466868827',
    '97923226469953536',
];

module.exports = {
    name: 'elo',
    description: 'Get Classic (Chess) ELO and Glicko2 ELO for a user by RSI handle or Discord username (partial, case-insensitive).',
    usage: '!elo PlayerName',
    async execute(message, args) {
        if (!message.guild) return;

        // Permission check
        const member = message.member;
        const allowed =
            ALLOWED_USER_IDS.includes(member.id) ||
            member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id));
        if (!allowed) {
            setTimeout(() => message.delete().catch(() => {}), 10000);
            return message.reply('You are not authorized to use this command.')
                .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
        }

        const searchName = args.join(' ').trim();
        if (!searchName) {
            return message.reply('Please provide a player name.')
                .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
        }

        setTimeout(() => message.delete().catch(() => {}), 10000);

        try {
            const db = await connectToMySQL();

            // Fetch data from both tables
            const [globalPlayers] = await db.query(
                `SELECT username, dojo_elo_api, dojo_glicko_elo FROM global_players`
            );
            const [members] = await db.query(
                `SELECT username, dojo_elo_api, dojo_glicko_elo FROM members`
            );

            const combined = [
                ...globalPlayers.map(p => ({ ...p, source: 'global' })),
                ...members.map(m => ({ ...m, source: 'member' }))
            ];

            if (!combined.length) {
                return message.reply('No ELO data found in the database.')
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
            }

            // Fuzzy match candidates
            const scored = combined.map(row => ({
                ...row,
                score: fuzzball.ratio(searchName.toLowerCase(), row.username.toLowerCase())
            })).sort((a, b) => b.score - a.score);

            const bestMatch = scored[0];

            if (!bestMatch || bestMatch.score < 60) {
                return message.reply(`No close match found for **${searchName}**.`)
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
            }

            // If best match confidence is < 85%, show top 3
            if (bestMatch.score < 85) {
                const top3 = scored.slice(0, 3);
                const description = top3.map(
                    (m, i) =>
                        `**${i + 1}. ${m.username}**\n` +
                        `Classic ELO: \`${m.dojo_elo_api || 1200}\`\n` +
                        `Glicko2 ELO: \`${m.dojo_glicko_elo || 1200}\`\n` +
                        `Confidence: \`${m.score}%\`\n`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📊 Top 3 Matches for "${searchName}"`)
                    .setColor(Colors.Orange)
                    .setDescription(description)
                    .setFooter({
                        text: `Requested by ${message.author.tag}`,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setTimestamp();

                return await message.channel.send({ embeds: [embed] });
            }

            // Prefer `global_players` record if available
            const matchInGlobal = globalPlayers.find(
                g => g.username.toLowerCase() === bestMatch.username.toLowerCase()
            );
            const finalData = matchInGlobal || bestMatch;

            const embed = new EmbedBuilder()
                .setTitle('📊 ELO Rankings')
                .setColor(Colors.Gold)
                .setDescription(
                    `**${finalData.username}**\n\n` +
                    `**Classic ELO:** \`${finalData.dojo_elo_api || 1200}\`\n` +
                    `**Glicko2 ELO:** \`${finalData.dojo_glicko_elo || 1200}\``
                )
                .setFooter({
                    text: `Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (err) {
            console.error('Error fetching ELO:', err);
            await message.reply('⚠️ Failed to fetch ELO. Try again later.')
                .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
        }
    }
};
