const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'heatmapConfig.json');

function getHeatmapMessageId() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.heatmapMessageId || null;
  } catch (err) {
    console.warn('⚠️ Could not read heatmapConfig.json:', err.message);
    return null;
  }
}

function saveHeatmapMessageId(messageId) {
  try {
    const config = { heatmapMessageId: messageId };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`💾 Saved new heatmapMessageId: ${messageId}`);
  } catch (err) {
    console.error('❌ Failed to save heatmapConfig.json:', err.message);
  }
}

module.exports = { getHeatmapMessageId, saveHeatmapMessageId };
