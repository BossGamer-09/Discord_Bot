const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Scrape RSI profile for a citizen by handle.
 * Returns object with org, org url, avatar, display name, handle, enlisted date, etc.
 */
async function fetchRSIProfileData(name) {
    const profile_url = `https://robertsspaceindustries.com/citizens/${name}`;
    let data = {
        org_name: null,
        org_url: null,
        org_short: null,
        display_name: null,
        handle_name: null,
        website_url: null,
        bio_text: null,
        enlisted_date: null,
        avatar_url: null,
        status_code: null,
        profile_url: null,
        spectrum_id: null,
    };

    try {
        const r = await axios.get(profile_url);
        const $ = cheerio.load(r.data);

        // Org Info
        const orgElement = $('div.main-org.right-col div.info p.entry a[href^="/orgs/"]');
        data.org_name = orgElement.text().trim() || null;
        const org_url = orgElement.attr('href');
        if (org_url) {
            data.org_url = 'https://robertsspaceindustries.com' + org_url;
            data.org_short = org_url.split("/").pop();
        }

        // Enlisted Date
        let enlisted_date_element = null;
        const enlisted_p = $('span.label').filter((i, el) => $(el).text().trim() === 'Enlisted').first();
        if (enlisted_p.length && enlisted_p.parent().is('p')) {
            enlisted_date_element = enlisted_p.parent().find('strong.value');
        }
        data.enlisted_date = enlisted_date_element && enlisted_date_element.text().trim() || null;

        // Profile info
        const profileInfoDiv = $('div.profile.left-col div.info');
        let display_name_element = null;
        let handle_name_element = null;
        if (profileInfoDiv.length) {
            const first_p_entry = profileInfoDiv.find('p.entry').first();
            if (first_p_entry.length) {
                display_name_element = first_p_entry.find('strong.value');
            }
            const handle_p = profileInfoDiv.find('span.label').filter((i, el) => $(el).text().trim() === 'Handle name').first();
            if (handle_p.length && handle_p.parent().is('p')) {
                handle_name_element = handle_p.parent().find('strong.value');
            }
        }
        data.display_name = display_name_element && display_name_element.text().trim() || null;
        data.handle_name = handle_name_element && handle_name_element.text().trim() || null;

        // Website URL
        const website_link_element = $('div.right-col p.entry.website a.js-modal-outbound');
        data.website_url = website_link_element.attr('href') || null;

        // Bio
        const bio_text_element = $('div.entry.bio div.value');
        data.bio_text = bio_text_element.text().trim() || null;

        // Avatar
        const avatarUrl =
            $('img.profile-avatar').attr('src') ||
            $('img.account-avatar').attr('src');
        data.avatar_url = avatarUrl
            ? (avatarUrl.startsWith("http") ? avatarUrl : "https://robertsspaceindustries.com" + avatarUrl)
            : null;

        data.status_code = r.status;
        data.profile_url = (r.status === 200) ? profile_url : null;
    } catch (err) {
        data.status_code = err.response ? err.response.status : 500;
    }

    // Spectrum ID (optional)
    try {
        const spectrumResp = await axios.post(
            'https://robertsspaceindustries.com/api/spectrum/member/info/nickname',
            { nickname: name }
        );
        data.spectrum_id = spectrumResp?.data?.data?.member?.id || null;
    } catch (err) {
        data.spectrum_id = null;
    }

    return data;
}

module.exports = fetchRSIProfileData;
