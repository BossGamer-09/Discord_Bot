// utils/validators.js

function validateRSIHandle(rsiHandle) {
    // Basic RSI Handle validation (e.g., check if it matches a specific pattern)
    const rsiPattern = /^[A-Za-z0-9_]+$/; // Adjust the regex to your requirements
    return rsiPattern.test(rsiHandle);
}

function validateURL(url) {
    // Basic URL validation for Twitch and YouTube URLs
    const twitchPattern = /^https:\/\/(www\.)?twitch\.tv\/[A-Za-z0-9_]+$/;
    const youtubePattern = /^https:\/\/(www\.)?youtube\.com\/.*$/;
    return twitchPattern.test(url) || youtubePattern.test(url);
}

module.exports = { validateRSIHandle, validateURL };
