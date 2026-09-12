const axios = require('axios');
let useFirstKey = true;

async function fetchSCProfile(handle) {
    try {
        const apiKey = useFirstKey ? process.env.SC_API : process.env.SC_API2;
        useFirstKey = !useFirstKey; // flip key for next time

        const apiMode = 'auto';
        const apiUrl = `https://api.starcitizen-api.com/${apiKey}/v1/${apiMode}/user/${handle}`;

        console.log('Fetching SC profile from:', apiUrl);

        const response = await axios.get(apiUrl, {
            headers: { Accept: 'application/json' }
        });

        if (response.data && response.data.success) {
            const profile = response.data.data;
            return {
                handle: profile.profile?.handle || handle,
                orgName: profile.organization?.name || "No organization",
                orgSID: profile.organization?.sid || null,
                avatar: profile.profile?.image || null
            };
        } else {
            console.log(`Failed to fetch SC profile: ${response.data.message}`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching SC profile for ${handle}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

module.exports = { fetchSCProfile };
