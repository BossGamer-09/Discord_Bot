const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const { connectToMySQL } = require('../db');
let lastRsilookup = new Set();

module.exports = {
    name: 'rsilookup',
    description: 'Lookup RSI profile information',

    async execute(message, args) {
        if (lastRsilookup.has(message.author.id)) return; // ignore repeats briefly
        lastRsilookup.add(message.author.id);
        setTimeout(() => lastRsilookup.delete(message.author.id), 3000); // 3 seconds cooldown
        message.delete().catch(() => {});

        if (!args.length) {
            return message.channel.send('❌ You must provide a username.\nUsage: `!rsilookup <username>`')
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
                .catch(() => {});
        }

        const username = args[0];
        const profileUrl = `https://robertsspaceindustries.com/en/citizens/${username}`;

        try {
            const response = await axios.get(profileUrl);
            const $ = cheerio.load(response.data);

            const safeGet = (el) => el ? el.text().trim() : null;

            // --- ORG INFO ---
            const orgElement = $('div.main-org.right-col div.info p.entry a[href^="/orgs/"]');
            const orgName = safeGet(orgElement);
            const orgUrlPath = orgElement.attr('href');
            const orgUrl = orgUrlPath ? `https://robertsspaceindustries.com${orgUrlPath}` : null;
            const orgLogo = $('div.main-org.right-col div.logo img').attr('src') || null;

            // --- OTHER PROFILE INFO ---
            const enlistedLabel = $('span.label').filter((i, el) => $(el).text().trim() === 'Enlisted');
            const enlistedDate = safeGet(enlistedLabel.parent().find('strong.value'));

            const displayName = safeGet($('div.profile.left-col div.info p.entry strong.value').first());
            const handleLabel = $('span.label').filter((i, el) => $(el).text().trim() === 'Handle name');
            const handleName = safeGet(handleLabel.parent().find('strong.value'));

            // --- SID SCRAPE ---
            const sidLabel = $('span.label').filter((i, el) => $(el).text().trim() === 'Spectrum Identification (SID)');
            const sid = safeGet(sidLabel.parent().find('strong.value'));

            const websiteUrl = $('div.right-col p.entry.website a.js-modal-outbound').attr('href') || 'None';
            const bio = $('div.entry.bio div.value').text().trim() || 'No bio available.';

            const avatarUrlRaw = $('div.thumb').find('img').attr('src') || null;
            const defaultRSIAvatar = "https://cdn.robertsspaceindustries.com/static/images/account/avatar_default_big.jpg";
            const fallbackAvatar = "https://cdn.discordapp.com/attachments/1176596448041779270/1300872217210523648/BlightVeilArtboard_4PNG.png";

            let avatarUrl = avatarUrlRaw;
            if (avatarUrlRaw && avatarUrlRaw.startsWith('/media')) {
                avatarUrl = `https://robertsspaceindustries.com${avatarUrlRaw}`;
            }
            if (!avatarUrl || avatarUrl === defaultRSIAvatar) {
                avatarUrl = fallbackAvatar;
            }

            const pool = await connectToMySQL();

            // --- DB SYNC ---
            const [results] = await pool.query('SELECT * FROM rsi_profiles WHERE username = ?', [username]);

            let nameChanged = false;
            let oldDisplayName = null;
            let oldHandleName = null;

            if (results.length > 0) {
                const row = results[0];
                if (row.display_name !== displayName) {
                    nameChanged = true;
                    oldDisplayName = row.display_name;
                    oldHandleName = row.handle_name;
                }

                // Update org_name and sid
                await pool.query(
                    'UPDATE rsi_profiles SET org_name = ?, sid = ? WHERE username = ?',
                    [orgName || null, sid || null, username]
                );

            } else {
                // Insert new record with org_name and sid
                await pool.query(
                    'INSERT INTO rsi_profiles (username, display_name, handle_name, org_name, sid) VALUES (?, ?, ?, ?, ?)',
                    [username, displayName, handleName, orgName || null, sid || null]
                );
            }

            // --- EMBED ---
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'RSI Lookup by Servitor™', iconURL: 'https://imgur.com/VJ2rRsc.png' })
                .setTitle(`${displayName || username}'s RSI Profile`)
                .setURL(profileUrl)
                .setColor(nameChanged ? 0xFF0000 : 0xA38EDB)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: 'Display Name', value: displayName || 'N/A', inline: true },
                    { name: 'Handle', value: handleName || 'N/A', inline: true },
                    { name: 'Enlisted', value: enlistedDate || 'Unknown', inline: true },
                    { name: 'Organization', value: orgName ? `[${orgName}](${orgUrl})` : 'None', inline: false },
                    { name: 'SID', value: sid || 'None', inline: true },
                    { name: 'Website', value: websiteUrl, inline: false },
                    { name: 'Bio', value: bio.length > 1024 ? bio.substring(0, 1021) + '...' : bio }
                )
                .setFooter({
                    text: 'Data provided by RSI / Cloud Imperium Games  !rsilookup "User"',
                    iconURL: 'https://imgur.com/VSkyEhV.png'
                });

            if (nameChanged) {
                embed.addFields({
                    name: '⚠️ Name Change Detected!',
                    value: `**Previous Display Name:** ${oldDisplayName || 'Unknown'}\n**Handle (unchanged):** ${oldHandleName || 'Unknown'}`
                });
            }

            if (orgLogo) {
                embed.setImage(orgLogo);
            }

            // Add "Add Bounty" button
            const addBountyButton = new ButtonBuilder()
                .setCustomId(`add_bounty_${username}_${message.author.id}`)
                .setLabel('Add Bounty')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(addBountyButton);

            await message.channel.send({ embeds: [embed], components: [row] });

        } catch (err) {
            if (err.response && err.response.status === 404) {
                return message.channel.send('❌ Could not find that RSI profile. Please check the username.')
                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
                    .catch(() => {});
            }

            console.error(`[RSILookup Error]`, err.message || err);
            return message.channel.send('❌ An error occurred while looking up the RSI profile.')
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
                .catch(() => {});
        }
    },
};
