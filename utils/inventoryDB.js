const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Debug mode - set DEBUG_MODE=true in .env to enable debug logging
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Constants
const MERIT_ITEM_KEY = 'merit_request';
const UEC_ITEM_KEY = 'uec_request';
const UEC_LOCATION = 'universal';
const STAFF_ROLE_ID = '1387113275082150030';
const REQUEST_CHANNEL_ID = '1387544060591476929';
const INVENTORY_CHANNEL_ID = '1387544060591476929';
const PATCH_LOG_CHANNEL_ID = '1387114378847060130';
const PATCH_ADJUST_ROLE_ID = '1387113275082150030';

// Item Groups - Reorganized with Wikelo categories
const ITEM_GROUPS = {
  // Money
  'AUEC/Merits': [
    { label: 'AUEC', value: 'uec_request' },
    { label: 'Merits', value: MERIT_ITEM_KEY },
  ],
  // Wikelo Currencies
  'Wikelo Currencies': [
    { label: 'Wikelo Favor', value: 'wikelo_favor' },
    { label: 'Polaris Bit', value: 'polaris_bit' },
    { label: 'MG Scrip', value: 'mg_scrip' },
    { label: 'Council Scrip', value: 'council_scrip' },
  ],
  
  // Wikelo Crafting Materials
  'Wikelo Materials': [
    { label: 'Carinite', value: 'carinite' },
    { label: 'Pure Carinite', value: 'pure_carinite' },
    { label: 'Jaclium (Ore)', value: 'jaclium_ore' },
    { label: 'Saldynium (Ore)', value: 'saldynium_ore' },
    { label: 'ASD Secure Drive', value: 'asd_secure_drive' },
    { label: 'DCHS-05 Comp-Board', value: 'dchs05_compboard' },
    { label: 'Quantanium (24 SCU)', value: 'quantanium_24scu' },
    { label: 'Atlasium (8 SCU)', value: 'atlasium_8scu' },
  ],
  
  // Wikelo Monster Parts
  'Monster Parts': [
    { label: 'Valakkar Fang (Juvenile)', value: 'valakkar_fang_juv' },
    { label: 'Valakkar Fang (Adult)', value: 'valakkar_fang_adult' },
    { label: 'Valakkar Fang (Apex)', value: 'valakkar_fang_apex' },
    { label: 'Irradiated Valakkar Fang', value: 'irradiated_valakkar_fang' },
    { label: 'Valakkar Pearl (AA)', value: 'valakkar_pearl_aa' },
    { label: 'Valakkar Pearl (AAA)', value: 'valakkar_pearl_aaa' },
    { label: 'Yormandi Eye', value: 'yormandi_eye' },
    { label: 'Yormandi Tongue', value: 'yormandi_tongue' },
    { label: 'Tundra Kopion Horn', value: 'tundra_kopion_horn' },
    { label: 'Irradiated Kopion Horn', value: 'irradiated_kopion_horn' },
    { label: 'SB-Apex Fang', value: 'sb_apexval_fang' },
    { label: 'SB-Apex Pearl', value: 'sb_apexval_pearl' },
  ],
  
  // Wikelo Military Items
  'Military Items': [
    { label: 'Ace Interceptor Helmet', value: 'ace_helmet' },
    { label: 'Advocacy Badge (Replica)', value: 'advocacy_badge' },
    { label: 'UEE 6th Platoon Medal', value: 'uee_6th_platoon_medal' },
    { label: 'Tevarin War Service Marker', value: 'tevarin_war_marker' },
    { label: 'Gov Cartography Medal', value: 'gov_cartography_medal' },
    { label: 'Vanduul Plating', value: 'vanduul_plating' },
    { label: 'Vanduul Metal', value: 'vanduul_metal' },
    { label: 'Large Artifact Fragment', value: 'large_artifact_fragment' },
    { label: 'Grassland Grazer Egg', value: 'grassland_grazer_egg' },
  ],
  
  // Wikelo Components
  'Wikelo Components': [
    { label: 'RCMBNT-PWL-1', value: 'rcmbnt_pwl_1' },
    { label: 'RCMBNT-PWL-2', value: 'rcmbnt_pwl_2' },
    { label: 'RCMBNT-PWL-3', value: 'rcmbnt_pwl_3' },
    { label: 'RCMBNT-RGL-1', value: 'rcmbnt_rgl_1' },
    { label: 'RCMBNT-RGL-2', value: 'rcmbnt_rgl_2' },
    { label: 'RCMBNT-RGL-3', value: 'rcmbnt_rgl_3' },
    { label: 'RCMBNT-XTL-1', value: 'rcmbnt_xtl_1' },
    { label: 'RCMBNT-XTL-2', value: 'rcmbnt_xtl_2' },
    { label: 'RCMBNT-XTL-3', value: 'rcmbnt_xtl_3' },
    { label: 'NN-13 Cannon', value: 'nn13_cannon' },
    { label: 'Scourge Railgun', value: 'scourge_railgun' },
  ],
  
  // Wikelo Weapons (Base)
  'Wikelo Weapons': [
    { label: 'Parallax Energy Rifle', value: 'parallax_rifle' },
    { label: 'Prism Laser Shotgun', value: 'prism_shotgun' },
    { label: 'Zenith Laser Sniper', value: 'zenith_sniper' },
    { label: 'Fresnel Energy LMG', value: 'fresnel_lmg' },
    { label: 'Quartz Energy SMG', value: 'quartz_smg' },
    { label: 'Karna Rifle', value: 'karna_rifle' },
    { label: 'S71 Rifle', value: 's71_rifle' },
    { label: 'Coda Pistol', value: 'coda_pistol' },
    { label: 'F55 LMG', value: 'f55_lmg' },
    { label: 'Boomtube Rocket Launcher', value: 'boomtube_rl' },
  ],
  
  // Infantry Weapons
  'Infantry Weapons': [
    { label: 'Inf-HVY Animus', value: 'inf_hvy_animus' },
    { label: 'Inf-HVY Railgun', value: 'inf_hvy_railgun' },
    { label: 'Inf-HVY Boomtube ', value: 'inf_hvy_boomtube' },
     { label: 'Inf-HVY Boomtube Ammo', value: 'inf_hvy_boomtube_ammo' },
    { label: 'Inf-HVY Railgun Ammo', value: 'inf_hvy_railgun_ammo' },
    { label: 'Inf-MOD Tweaker', value: 'inf_mod_tweaker' },
    { label: 'Inf-MOD Scorcher', value: 'inf_mod_scorcher' },

  ],
  
  // Pilot Meta Components
  'Pilot Meta': [
    { label: 'Weap-S1 Bulldog', value: 'gun_s1_cf117_bulldog' },
    { label: 'Weap-S2 Badger', value: 'gun_s2_cf227_badger' },
    { label: 'Weap-S3 Panther', value: 'gun_s3_cf337_panther' },
    { label: 'Weap-S4 Rhino', value: 'gun_s4_cf447_rhino' },
    { label: 'Comp-S1 Palisade', value: 'shield_s1_palisade' },
    { label: 'Comp-S1 FR-66', value: 'shield_s1_fr66' },
    { label: 'Comp-S2 Rampart', value: 'shield_s2_rampart' },
    { label: 'Comp-S2 FR-76', value: 'shield_s1_fr76' },
    { label: 'Comp-S1 Lumacore', value: 'pp_s1_lumacore' },
    { label: 'Comp-S1 DeltaMax', value: 'pp_s1_deltamaxpp' },
    { label: 'Comp-S2 Cirrus', value: 'pp_s2_cirrus' },
    { label: 'Comp-S1 Vaporblock', value: 'cooler_s1_vaporblock' },
    { label: 'Comp-S1 Spectre', value: 'ship_stealth_s1_spectre' },
    { label: 'Comp-S2 Spicule', value: 'ship_stealth_s2_spicule' },
  ],
  
  // Pilot Non-Meta
  'Pilot Non-Meta': [
    { label: 'Comp-S1 Slipstream', value: 'ship_stealth_s1_pp' },
    { label: 'Comp-S2 Eclipse', value: 'ship_stealth_s2_eclipse' },
    { label: 'Comp-S1 Zephyr', value: 'qd_s1_zephyr' },
    { label: 'Comp-S2 Bolt', value: 'qd_s1_bolt' },
    { label: 'Idris-S10 RailGun', value: 'idris_s10' },
    { label: 'Weap-S1 NDB-26', value: 's1_ndb' },
    { label: 'Weap-S2 NDB-28', value: 's2_ndb' },
    { label: 'Weap-S3 NDB-30', value: 's3_ndb' },
  ],
  
  // Legacy Loot Items (for backward compatibility)
  'Legacy Loot': [
    { label: 'CZ-Red Keycard', value: 'cz_red_keycard' },
    { label: 'CZ-Comp Board Set', value: 'cz_compboard_set' },
    { label: 'CZ-Comp Board 5', value: 'cz_compboard7' },
    { label: 'Hathor-Pure Caranite', value: 'hathor_purecaranite' },
    { label: 'Hathor-Caranite', value: 'hathor_caranite' },
    { label: 'Hathor-Jaclium', value: 'hathor_jaclium' },
    { label: 'SB-Keycard', value: 'sb_keycard' },
  ],
};

// Location Options
const LOCATIONS = [
  { label: 'Stanton-Orison', value: 'stanton' },
  { label: 'Pyro-Obituary', value: 'pyro' },
  { label: 'Universal (UEC/Merits)', value: UEC_LOCATION },
];

// Withdrawal Reasons - Updated
const WITHDRAW_REASONS = [
  { label: 'Infantry META', value: 'infmeta' },
  { label: 'Pilot META', value: 'pltmeta' },
  { label: 'Org vs Org', value: 'ovo' },
  { label: 'Prison Break', value: 'prisonbreak' },
  { label: 'Wikelo Crafting', value: 'wikelo_crafting' },
  { label: 'Ship Modification', value: 'ship_mod' },
  { label: 'Armor Modification', value: 'armor_mod' },
  { label: 'Weapon Modification', value: 'weapon_mod' },
  { label: 'Cosmetic', value: 'cosmetic' },
  { label: 'Emergency Funds', value: 'emergency_funds' },
  { label: 'Patch Correction', value: 'patchcorrect' }
];

// Wikelo Bundles for special requests
const WIKELO_BUNDLES = {
  'Wikelo Idris Bundle': [
    { item: 'wikelo_favor', quantity: 50 },
    { item: 'polaris_bit', quantity: 50 },
    { item: 'dchs05_compboard', quantity: 50 },
    { item: 'carinite', quantity: 50 },
    { item: 'valakkar_fang_apex', quantity: 50 },
    { item: 'mg_scrip', quantity: 50 },
    { item: 'ace_helmet', quantity: 50 },
    { item: 'valakkar_pearl_aaa', quantity: 30 },
    { item: 'uee_6th_platoon_medal', quantity: 30 },
    { item: 'pure_carinite', quantity: 30 },
    { item: 'asd_secure_drive', quantity: 30 },
    { item: 'rcmbnt_pwl_1', quantity: 5 },
    { item: 'rcmbnt_pwl_2', quantity: 5 },
    { item: 'rcmbnt_pwl_3', quantity: 5 },
    { item: 'rcmbnt_rgl_1', quantity: 5 },
    { item: 'rcmbnt_rgl_2', quantity: 5 },
    { item: 'rcmbnt_rgl_3', quantity: 5 },
    { item: 'rcmbnt_xtl_1', quantity: 5 },
    { item: 'rcmbnt_xtl_2', quantity: 5 },
    { item: 'rcmbnt_xtl_3', quantity: 5 },
  ],
  
  'Wikelo Polaris Bundle': [
    { item: 'wikelo_favor', quantity: 50 },
    { item: 'polaris_bit', quantity: 25 },
    { item: 'dchs05_compboard', quantity: 20 },
    { item: 'carinite', quantity: 20 },
    { item: 'valakkar_fang_apex', quantity: 20 },
    { item: 'mg_scrip', quantity: 20 },
    { item: 'ace_helmet', quantity: 15 },
    { item: 'valakkar_pearl_aaa', quantity: 20 },
    { item: 'uee_6th_platoon_medal', quantity: 20 },
    { item: 'pure_carinite', quantity: 20 },
    { item: 'asd_secure_drive', quantity: 20 },
    { item: 'rcmbnt_pwl_1', quantity: 1 },
    { item: 'rcmbnt_pwl_2', quantity: 1 },
    { item: 'rcmbnt_pwl_3', quantity: 1 },
    { item: 'rcmbnt_rgl_1', quantity: 1 },
    { item: 'rcmbnt_rgl_2', quantity: 1 },
    { item: 'rcmbnt_rgl_3', quantity: 1 },
    { item: 'rcmbnt_xtl_1', quantity: 1 },
    { item: 'rcmbnt_xtl_2', quantity: 1 },
    { item: 'rcmbnt_xtl_3', quantity: 1 },
  ],
  
  'Wikelo ATLAS Bundle': [
    { item: 'wikelo_favor', quantity: 3 },
    { item: 'valakkar_pearl_aa', quantity: 10 },
    { item: 'valakkar_fang_apex', quantity: 5 },
    { item: 'nn13_cannon', quantity: 2 },
  ],
  
  'Wikelo Ship Bundle (Medium)': [
    { item: 'wikelo_favor', quantity: 20 },
    { item: 'dchs05_compboard', quantity: 6 },
    { item: 'carinite', quantity: 10 },
    { item: 'tevarin_war_marker', quantity: 1 },
  ],
};

// Flattened items array
const ITEMS = Object.values(ITEM_GROUPS).flat();

// Message ID storage
let storedInventoryMessageIds = [];

// ========== DEBUG UTILITY FUNCTIONS ==========

/**
 * Debug log function - only logs if DEBUG_MODE is true
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

/**
 * Debug error function - always logs errors
 * @param {...any} args - Arguments to log
 */
function debugError(...args) {
  console.error(...args);
}

/**
 * Get stored message IDs
 * @returns {string[]} Array of message IDs
 */
function getStoredMessageIds() {
  return storedInventoryMessageIds;
}

/**
 * Set stored message IDs
 * @param {string[]} ids Array of message IDs
 */
function setStoredMessageIds(ids) {
  storedInventoryMessageIds = ids;
  debugLog('Stored message IDs updated:', storedInventoryMessageIds);
}

// ========== UTILITY FUNCTIONS ==========

// ========== FUNCTIONS FOR MONEY CONVERSION ==========

/**
 * Convert a number to text representation
 * @param {number} amount - The amount to convert
 * @returns {string} - Text representation of the amount
 */
function numberToWords(amount) {
  if (amount === 0) return 'Zero';
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  
  const scale = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion', 'Quintillion'];
  
  function convertHundreds(num) {
    let result = '';
    
    // Hundreds place
    if (num >= 100) {
      result += ones[Math.floor(num / 100)] + ' Hundred';
      num %= 100;
      if (num > 0) result += ' ';
    }
    
    // Tens place
    if (num >= 20) {
      result += tens[Math.floor(num / 10)];
      num %= 10;
      if (num > 0) result += '-';
    } else if (num >= 10) {
      result += teens[num - 10];
      num = 0;
    }
    
    // Ones place
    if (num > 0) {
      result += ones[num];
    }
    
    return result;
  }
  
  if (amount < 1000) {
    return convertHundreds(amount);
  }
  
  // Handle larger numbers
  let result = '';
  let scaleIndex = 0;
  
  while (amount > 0) {
    const chunk = amount % 1000;
    if (chunk !== 0) {
      let chunkWords = convertHundreds(chunk);
      if (scale[scaleIndex]) {
        chunkWords += ' ' + scale[scaleIndex];
      }
      if (result) {
        result = chunkWords + ' ' + result;
      } else {
        result = chunkWords;
      }
    }
    amount = Math.floor(amount / 1000);
    scaleIndex++;
  }
  
  return result.trim();
}

/**
 * Format money with simplified text representation
 * @param {number} amount - The money amount
 * @param {boolean} includeText - Whether to include text representation
 * @returns {string} - Formatted money string
 */
function formatMoney(amount, includeText = true) {
  const formattedNumber = amount.toLocaleString();
  
  if (!includeText || amount === 0) {
    return formattedNumber;
  }
  
  // For very large numbers, show a simplified text version
  if (amount >= 1000000000) {
    const billions = (amount / 1000000000).toFixed(2);
    return `${formattedNumber} (${billions.replace(/\.00$/, '')} Billion)`;
  } else if (amount >= 1000000) {
    const millions = (amount / 1000000).toFixed(2);
    return `${formattedNumber} (${millions.replace(/\.00$/, '')} Million)`;
  } else if (amount >= 1000) {
    const thousands = (amount / 1000).toFixed(1);
    return `${formattedNumber} (${thousands.replace(/\.0$/, '')} Thousand)`;
  }
  
  return formattedNumber;
}

/**
 * Format money with detailed text representation
 * @param {number} amount - The money amount
 * @param {boolean} includeText - Whether to include text representation
 * @returns {string} - Formatted money string
 */
function formatMoneyDetailed(amount, includeText = true) {
  const formattedNumber = amount.toLocaleString();
  
  if (!includeText || amount === 0) {
    return formattedNumber;
  }
  
  const textRepresentation = numberToWords(amount);
  return `${formattedNumber}\n(${textRepresentation})`;
}

/**
 * Calculate merits from prison time string
 * @param {string} timeString - Time like "1h 30m", "45m", "2h"
 * @returns {number|null} - Number of merits (seconds) or null if invalid
 */
function calculateMeritsFromPrisonTime(timeString) {
  const timePattern = /(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i;
  const match = timeString.match(timePattern);
  
  if (!match) return null;
  
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  
  const totalSeconds = (hours * 3600) + (minutes * 60);
  
  return totalSeconds > 0 ? totalSeconds : null;
}

/**
 * Format seconds into readable time string
 * @param {number} seconds - Number of seconds
 * @returns {string} - Formatted time like "1h 30m 15s"
 */
function formatPrisonTimeDisplay(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
  
  return parts.join(' ');
}

/**
 * Create prison time input modal
 * @returns {ModalBuilder} - Discord modal
 */
function createPrisonTimeModal() {
  return new ModalBuilder()
    .setCustomId('prison_time_modal')
    .setTitle('Prison Time Input')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('prison_time_input')
          .setLabel('Enter your prison time')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 1h 30m, 45m, 2h, 90 minutes')
          .setRequired(true)
      )
    );
}

/**
 * Create patch adjustment modal
 * @param {string} location - Location to adjust
 * @param {string} itemKey - Item key to adjust
 * @param {number} currentValue - Current inventory value
 * @returns {ModalBuilder} - Discord modal
 */
function createPatchAdjustmentModal(location, itemKey, currentValue) {
  const itemLabel = ITEMS.find(i => i.value === itemKey)?.label || itemKey;
  const locationLabel = LOCATIONS.find(l => l.value === location)?.label || location;
  
  const shortenedLocationLabel = locationLabel.includes('Universal') ? 'Universal' : locationLabel;
  
  const baseTextLength = 'New qty for  ()'.length + shortenedLocationLabel.length;
  const maxItemLabelLength = 45 - baseTextLength;
  
  let displayItemLabel = itemLabel;
  if (displayItemLabel.length > maxItemLabelLength) {
    displayItemLabel = displayItemLabel.substring(0, maxItemLabelLength - 3) + '...';
  }
  
  const modalLabel = `New qty for ${displayItemLabel} (${shortenedLocationLabel})`;
  
  return new ModalBuilder()
    .setCustomId(`patch_adjust_${location}_${itemKey}`)
    .setTitle('Patch Adjustment')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_quantity')
          .setLabel(modalLabel.length > 45 ? `${displayItemLabel} (${shortenedLocationLabel})` : modalLabel)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`Current: ${currentValue}`)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('adjustment_reason')
          .setLabel('Reason for adjustment')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g., Patch 3.23.1 balance changes, inventory audit, etc.')
          .setRequired(true)
      )
    );
}

/**
 * Create grouped item dropdowns
 * @param {Object} itemGroups - Item groups object
 * @returns {ActionRowBuilder[]} - Array of Discord action rows
 */
function createGroupedItemDropdowns(itemGroups) {
  const dropdowns = [];

  for (const [groupName, items] of Object.entries(itemGroups)) {
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      const sanitizedGroupName = groupName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`item_select_${sanitizedGroupName}_${Math.floor(i / 25)}`)
        .setPlaceholder(`${groupName} Items`)
        .setMinValues(0)
        .setMaxValues(chunk.length)
        .addOptions(chunk);

      dropdowns.push(new ActionRowBuilder().addComponents(selectMenu));
    }
  }

  return dropdowns;
}

/**
 * Create paginated dropdowns for inventory selection
 * @param {string} action - The action (input/withdraw)
 * @param {number} page - Page number (0-indexed)
 * @returns {ActionRowBuilder[]} - Array of Discord action rows with navigation
 */
function createPaginatedDropdowns(action = 'input', page = 0) {
  const allGroups = Object.entries(ITEM_GROUPS);
  const itemsPerPage = 3; // Number of dropdown groups per page (max 5 total components including nav)
  
  const startIdx = page * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageGroups = allGroups.slice(startIdx, endIdx);
  
  // Convert page groups back to object for createGroupedItemDropdowns
  const pageGroupsObj = Object.fromEntries(pageGroups);
  const dropdowns = createGroupedItemDropdowns(pageGroupsObj);
  
  // Add navigation buttons row
  const navRow = new ActionRowBuilder();
  
  // Calculate total pages
  const totalPages = Math.ceil(allGroups.length / itemsPerPage);
  
  // Previous button
  if (page > 0) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`inventory_page_${action}_${page - 1}`)
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  
  // Page indicator
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId('page_indicator')
      .setLabel(`Page ${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  
  // Finished button
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId('item_selection_finished')
      .setLabel('Finished')
      .setStyle(ButtonStyle.Success)
  );
  
  // Next button
  if (endIdx < allGroups.length) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`inventory_page_${action}_${page + 1}`)
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  
  // Create an array to hold all components
  const allComponents = [...dropdowns];
  
  // Add Wikelo bundle button for withdrawals on first page only
  if (action === 'withdraw' && page === 0) {
    const wikeloButtonRow = createWikeloBundleButton();
    allComponents.push(wikeloButtonRow);
  }
  
  // Add navigation row last
  allComponents.push(navRow);
  
  // Return all components (max 5 rows total)
  return allComponents.slice(0, 5); // Discord allows max 5 action rows
}

/**
 * Create Wikelo bundle selection dropdown
 * @returns {ActionRowBuilder} - Discord action row with select menu
 */
function createWikeloBundleSelect() {
  const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
  
  const bundleOptions = Object.entries(WIKELO_BUNDLES).map(([bundleName, items]) => {
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    
    return {
      label: bundleName.length > 100 ? `${bundleName.substring(0, 97)}...` : bundleName,
      value: bundleName,
      description: `${totalItems} items, ${totalQuantity} total`
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('wikelo_bundle_select')
    .setPlaceholder('📦 Select Wikelo Bundle')
    .setMinValues(0)
    .setMaxValues(1)
    .addOptions(bundleOptions);

  return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Create Wikelo bundle button
 * @returns {ActionRowBuilder} - Discord action row with button
 */
function createWikeloBundleButton() {
  const { ButtonBuilder, ButtonStyle } = require('discord.js');
  
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wikelo_bundle_select_btn')
      .setLabel('📦 Wikelo Bundles')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📦')
  );
}

/**
 * Get dropdown rows for inventory selection
 * @param {string} action - The action (input/withdraw)
 * @returns {ActionRowBuilder[]} - Array of Discord action rows
 */
function dropdownRows(action = 'input') {
  // Use paginated dropdowns for page 0
  return createPaginatedDropdowns(action, 0);
}

/**
 * Create finished selection button
 * @returns {ActionRowBuilder} - Discord action row
 */
function createFinishedButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('item_selection_finished')
      .setLabel('Finished')
      .setStyle(ButtonStyle.Success)
  );
}

/**
 * Create patch adjustment button (only visible to authorized roles)
 * @returns {ActionRowBuilder} - Discord action row
 */
function createPatchAdjustmentButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('inventory_patch_adjust')
      .setLabel('🛠️ Patch Adjustment')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚙️')
  );
}

/**
 * Create location selection for patch adjustments
 * @returns {ActionRowBuilder} - Discord action row
 */
function createPatchLocationSelect() {
  const locationSelect = new StringSelectMenuBuilder()
    .setCustomId('patch_location_select')
    .setPlaceholder('Select location to adjust')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(LOCATIONS);

  return new ActionRowBuilder().addComponents(locationSelect);
}

/**
 * Split embed fields to avoid Discord character limits
 * @param {EmbedBuilder} embedBuilder - Original embed
 * @param {number} maxChars - Maximum characters per embed
 * @returns {EmbedBuilder[]} - Array of embeds
 */
function splitEmbedFields(embedBuilder, maxChars = 6000) {
  const embeds = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle(embedBuilder.data.title)
    .setColor(embedBuilder.data.color)
    .setDescription(embedBuilder.data.description ?? null);

  let currentLength = 0;

  for (const field of embedBuilder.data.fields || []) {
    const fieldText = field.name + field.value;
    if (currentLength + fieldText.length > maxChars) {
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder()
        .setTitle(`${embedBuilder.data.title} (cont.)`)
        .setColor(embedBuilder.data.color)
        .setDescription(null);
      currentLength = 0;
    }
    currentEmbed.addFields(field);
    currentLength += fieldText.length;
  }
  
  if (embeds.length === 0 || currentEmbed.data.fields?.length > 0) {
    embeds.push(currentEmbed);
  }
  
  return embeds;
}

// ========== DATABASE FUNCTIONS ==========

/**
 * Fetch inventory totals from database
 * @returns {Promise<Object>} - Inventory data by location and item
 */
async function fetchInventoryTotals() {
  try {
    const [rows] = await pool.query('SELECT location, item_key, quantity FROM inventory_totals');
    const data = {};

    for (const row of rows) {
      // Initialize location if not exists
      if (!data[row.location]) {
        data[row.location] = {};
      }
      
      // Directly assign the value
      data[row.location][row.item_key] = row.quantity;
    }

    return data;
  } catch (err) {
    debugError('Error fetching inventory totals:', err);
    return {};
  }
}

/**
 * Save request to database
 * @param {Object} params - Request parameters
 * @returns {Promise<number|null>} - Request ID or null on error
 */
async function saveRequestToDB({ user_nickname, action, items, location, quantities, reason }) {
  try {
    const itemsJson = JSON.stringify(items);
    const quantitiesJson = JSON.stringify(quantities);
    
    const [result] = await pool.query(
      `INSERT INTO inventory_requests (user_nickname, action, items, location, quantity, reason, status, thread_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', '')`,
      [user_nickname, action, itemsJson, location, quantitiesJson, reason]
    );
    
    return result.insertId;
  } catch (err) {
    debugError('Error saving request:', err);
    return null;
  }
}

/**
 * Log patch adjustment to database
 * @param {Object} params - Adjustment parameters
 * @returns {Promise<number|null>} - Log ID or null on error
 */
async function logPatchAdjustment({ adjusted_by, location, item_key, old_quantity, new_quantity, reason }) {
  try {
    const [result] = await pool.query(
      `INSERT INTO inventory_adjustments (adjusted_by, location, item_key, old_quantity, new_quantity, reason, adjusted_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [adjusted_by, location, item_key, old_quantity, new_quantity, reason]
    );
    
    return result.insertId;
  } catch (err) {
    debugError('Error logging patch adjustment:', err);
    return null;
  }
}

/**
 * Update inventory quantity directly
 * @param {string} location - Location
 * @param {string} itemKey - Item key
 * @param {number} newQuantity - New quantity
 * @returns {Promise<boolean>} - Success status
 */
async function updateInventoryQuantity(location, itemKey, newQuantity) {
  debugLog('DEBUG - updateInventoryQuantity called with:');
  debugLog('DEBUG - location:', JSON.stringify(location));
  debugLog('DEBUG - itemKey:', JSON.stringify(itemKey));
  debugLog('DEBUG - newQuantity:', newQuantity);
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [[current]] = await connection.query(
      'SELECT quantity FROM inventory_totals WHERE location = ? AND item_key = ?',
      [location, itemKey]
    );

    debugLog('DEBUG - Current row from DB:', current);

    if (current) {
      debugLog('DEBUG - Executing UPDATE:');
      debugLog('DEBUG - SQL: UPDATE inventory_totals SET quantity = ? WHERE location = ? AND item_key = ?');
      debugLog('DEBUG - Params:', [newQuantity, location, itemKey]);
      
      await connection.query(
        'UPDATE inventory_totals SET quantity = ? WHERE location = ? AND item_key = ?',
        [newQuantity, location, itemKey]
      );
      debugLog('DEBUG - Updated existing record');
    } else {
      debugLog('DEBUG - Executing INSERT:');
      debugLog('DEBUG - SQL: INSERT INTO inventory_totals (location, item_key, quantity) VALUES (?, ?, ?)');
      debugLog('DEBUG - Params:', [location, itemKey, newQuantity]);
      
      await connection.query(
        'INSERT INTO inventory_totals (location, item_key, quantity) VALUES (?, ?, ?)',
        [location, itemKey, newQuantity]
      );
      debugLog('DEBUG - Inserted new record');
    }

    await connection.commit();
    
    // Verify the update
    const [[verify]] = await connection.query(
      'SELECT location, item_key, quantity FROM inventory_totals WHERE location = ? AND item_key = ?',
      [location, itemKey]
    );
    debugLog('DEBUG - Verification result:', verify);
    
    return true;
  } catch (err) {
    await connection.rollback();
    debugError('Error updating inventory quantity:', err);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Migrate all AUEC and Merits to universal location
 * @returns {Promise<boolean>} - Success status
 */
async function migrateMoneyToUniversal() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    debugLog('Starting migration of AUEC and Merits to universal location...');
    
    // Get all AUEC and Merits from all locations
    const [moneyItems] = await connection.query(
      'SELECT location, item_key, quantity FROM inventory_totals WHERE item_key IN (?, ?)',
      [UEC_ITEM_KEY, MERIT_ITEM_KEY]
    );
    
    debugLog('Found money items:', moneyItems);
    
    // Sum up quantities by item_key
    const totals = {};
    for (const item of moneyItems) {
      if (!totals[item.item_key]) {
        totals[item.item_key] = 0;
      }
      totals[item.item_key] += item.quantity;
    }
    
    debugLog('Totals to migrate:', totals);
    
    // Delete all old entries for AUEC and Merits
    await connection.query(
      'DELETE FROM inventory_totals WHERE item_key IN (?, ?)',
      [UEC_ITEM_KEY, MERIT_ITEM_KEY]
    );
    
    // Insert new entries in universal location
    for (const [itemKey, totalQuantity] of Object.entries(totals)) {
      await connection.query(
        'INSERT INTO inventory_totals (location, item_key, quantity) VALUES (?, ?, ?)',
        [UEC_LOCATION, itemKey, totalQuantity]
      );
    }
    
    await connection.commit();
    debugLog('Successfully migrated AUEC and Merits to universal location');
    return true;
  } catch (err) {
    await connection.rollback();
    debugError('Error migrating money to universal:', err);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Update request thread ID
 * @param {number} requestId - Request ID
 * @param {string} threadId - Thread ID
 */
async function updateRequestThreadId(requestId, threadId) {
  try {
    await pool.query('UPDATE inventory_requests SET thread_id = ? WHERE id = ?', [threadId, requestId]);
  } catch (err) {
    debugError('Error updating request thread id:', err);
  }
}

/**
 * Get pending request by thread ID
 * @param {string} threadId - Thread ID
 * @returns {Promise<Object|null>} - Request data or null
 */
async function getPendingRequestByThreadId(threadId) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM inventory_requests WHERE thread_id = ? AND status = "pending"', 
      [threadId]
    );
    return rows[0] || null;
  } catch (err) {
    debugError('Error fetching request by thread ID:', err);
    return null;
  }
}

/**
 * Mark request as closed
 * @param {number} requestId - Request ID
 */
async function markRequestClosed(requestId) {
  try {
    await pool.query('UPDATE inventory_requests SET status = "closed" WHERE id = ?', [requestId]);
  } catch (err) {
    debugError('Error marking request closed:', err);
  }
}

/**
 * Update inventory database with request
 * @param {string} reqType - Request type ('input' or 'withdraw')
 * @param {number} requestId - Request ID
 * @returns {Promise<boolean>} - Success status
 */
async function updateInventoryDatabase(reqType, requestId) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [rows] = await connection.query(
      'SELECT * FROM inventory_requests WHERE id = ? AND status = "pending"', 
      [requestId]
    );
    
    if (rows.length === 0) {
      throw new Error('Request not found or already handled');
    }

    const req = rows[0];
    const items = JSON.parse(req.items);
    const quantities = JSON.parse(req.quantity);

    const updates = [];
    for (const itemKey of items) {
      // ALWAYS use universal location for AUEC and Merits
      const loc = (itemKey === UEC_ITEM_KEY || itemKey === MERIT_ITEM_KEY) 
        ? UEC_LOCATION 
        : req.location;
      const qty = quantities[itemKey] ?? 0;
      
      const [[current]] = await connection.query(
        'SELECT quantity FROM inventory_totals WHERE location = ? AND item_key = ?', 
        [loc, itemKey]
      );

      let newQty;
      if (reqType === 'input') {
        newQty = (current?.quantity ?? 0) + qty;
      } else if (reqType === 'withdraw') {
        newQty = Math.max(0, (current?.quantity ?? 0) - qty);
      }

      if (current) {
        updates.push(
          connection.query(
            'UPDATE inventory_totals SET quantity = ? WHERE location = ? AND item_key = ?',
            [newQty, loc, itemKey]
          )
        );
      } else {
        updates.push(
          connection.query(
            'INSERT INTO inventory_totals (location, item_key, quantity) VALUES (?, ?, ?)',
            [loc, itemKey, newQty]
          )
        );
      }
    }

    await Promise.all(updates);
    
    await connection.query(
      'UPDATE inventory_requests SET status = "approved" WHERE id = ?', 
      [requestId]
    );

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    debugError('Error updating inventory database:', err);
    return false;
  } finally {
    connection.release();
  }
}

// ========== WIKELO BUNDLE FUNCTIONS ==========

/**
 * Handle Wikelo bundle selection
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} userSessions - User sessions map
 */
async function handleWikeloBundleSelect(interaction, userSessions) {
  const userId = interaction.user.id;
  const session = userSessions.get(userId);
  
  if (!session) {
    return interaction.reply({ 
      content: 'Session expired. Please start your inventory request again.', 
      flags: 64 
    });
  }

  const bundleName = interaction.values[0];
  const bundle = WIKELO_BUNDLES[bundleName];
  
  if (!bundle) {
    return interaction.reply({ 
      content: 'Invalid bundle selected.', 
      flags: 64 
    });
  }

  session.items = session.items || [];
  session.quantities = session.quantities || {};
  
  // Add all bundle items with their pre-defined quantities
  for (const bundleItem of bundle) {
    const itemKey = bundleItem.item;
    const bundleQuantity = bundleItem.quantity;
    
    if (!session.items.includes(itemKey)) {
      session.items.push(itemKey);
    }
    
    // Add the bundle quantity to any existing quantity
    session.quantities[itemKey] = (session.quantities[itemKey] || 0) + bundleQuantity;
  }
  
  userSessions.set(userId, session);

  // Create summary of added items
  const summary = bundle.map(b => {
    const item = ITEMS.find(i => i.value === b.item);
    return `• ${item?.label || b.item}: ${b.quantity}`;
  }).join('\n');
  
  await interaction.reply({
    content: `✅ Added **${bundleName}** to your request!\n\n**Bundle Contents:**\n${summary}\n\nThese items have been automatically added with their pre-defined quantities. Continue selecting other items or click "Finished" when done.`,
    flags: 64
  });
}

/**
 * Handle Wikelo bundle button click
 * @param {Interaction} interaction - Discord interaction
 */
async function handleWikeloBundleButton(interaction) {
  try {
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
    
    const bundleOptions = Object.entries(WIKELO_BUNDLES).map(([bundleName, items]) => {
      const totalItems = items.length;
      const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
      
      return {
        label: bundleName.length > 100 ? `${bundleName.substring(0, 97)}...` : bundleName,
        value: bundleName,
        description: `${totalItems} items, ${totalQuantity} total`,
        emoji: '📦'
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('wikelo_bundle_select')
      .setPlaceholder('📦 Select Wikelo Bundle')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(bundleOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({
      content: '📦 **Wikelo Bundles**\n\nSelect a Wikelo bundle to automatically add all items with their pre-defined quantities:',
      components: [row],
      flags: 64
    });
  } catch (error) {
    debugError('Error in handleWikeloBundleButton:', error);
    await interaction.reply({
      content: '❌ An error occurred while loading bundles.',
      flags: 64
    });
  }
}

// ========== PAGINATION FUNCTIONS ==========

/**
 * Handle inventory button click with pagination
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} userSessions - User sessions map
 */
async function handleInventoryButtonWithPagination(interaction, userSessions) {
  const customId = interaction.customId;
  
  if (customId === 'inventory_input' || customId === 'inventory_withdraw') {
    const action = customId === 'inventory_input' ? 'input' : 'withdraw';
    userSessions.set(interaction.user.id, { action });
    
    // Use paginated dropdowns
    const components = createPaginatedDropdowns(action, 0);
    const totalPages = Math.ceil(Object.keys(ITEM_GROUPS).length / 3);
    
    return interaction.reply({
      content: `Please select the item(s) you want to ${action} (Page 1/${totalPages}):`,
      components: components,
      flags: 64, // Use MessageFlags.Ephemeral
    });
  }
}

/**
 * Handle inventory page navigation
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} userSessions - User sessions map
 */
async function handleInventoryPageNavigation(interaction, userSessions) {
  const userId = interaction.user.id;
  const session = userSessions.get(userId);
  
  if (!session) {
    return interaction.reply({ 
      content: 'Session expired. Please start your inventory request again.', 
      flags: 64 
    });
  }
  
  const customId = interaction.customId;
  const [, , , pageStr] = customId.split('_');
  const page = parseInt(pageStr, 10);
  const action = session.action || 'input';
  
  if (isNaN(page)) {
    return interaction.reply({ 
      content: 'Invalid page number.', 
      flags: 64 
    });
  }
  
  // Update session if needed
  userSessions.set(userId, session);
  
  // Get components for the requested page
  const components = createPaginatedDropdowns(action, page);
  
  // Update the message
  const totalPages = Math.ceil(Object.keys(ITEM_GROUPS).length / 3);
  await interaction.update({
    content: `Please select the item(s) you want to ${action} (Page ${page + 1}/${totalPages}):`,
    components: components,
  });
}

// ========== MAIN FUNCTIONS ==========

/**
 * Handle prison time modal submission
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} userSessions - User sessions map
 */
async function handlePrisonTimeModal(interaction, userSessions) {
  const userId = interaction.user.id;
  const session = userSessions.get(userId);
  
  if (!session) {
    return interaction.reply({ 
      content: 'Session expired. Please start your inventory request again.', 
      flags: 64 
    });
  }

  const prisonTime = interaction.fields.getTextInputValue('prison_time_input');
  const meritsNeeded = calculateMeritsFromPrisonTime(prisonTime);
  
  if (!meritsNeeded) {
    return interaction.reply({
      content: '❌ Invalid time format. Please use formats like "1h 30m", "45m", "2h", or "90 minutes".',
      flags: 64
    });
  }
  
  session.quantities = session.quantities || {};
  session.quantities[MERIT_ITEM_KEY] = meritsNeeded;
  userSessions.set(userId, session);
  
  const formattedTime = formatPrisonTimeDisplay(meritsNeeded);
  
  await interaction.reply({
    content: `✅ Converted prison time "${prisonTime}" to **${meritsNeeded.toLocaleString()} merits** (${formattedTime})\n\nContinue selecting other items or click "Finished" when done.`,
    flags: 64
  });
}

/**
 * Handle patch adjustment modal submission
 * @param {Interaction} interaction - Discord interaction
 */
async function handlePatchAdjustmentModal(interaction) {
  try {
    debugLog('DEBUG - Starting handlePatchAdjustmentModal');
    
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(PATCH_ADJUST_ROLE_ID)) {
      return interaction.reply({ 
        content: '❌ You do not have permission to make patch adjustments.', 
        flags: 64 
      });
    }

    const customId = interaction.customId;
    debugLog('DEBUG - Raw customId:', customId);

    // Split the customId
    const parts = customId.split('_');
    debugLog('DEBUG - Split parts:', parts);

    // The first two parts are "patch" and "adjust"
    // The location is the third part
    // The item key is everything after the third part, rejoined with underscores
    const location = parts[2];
    const itemKey = parts.slice(3).join('_');

    debugLog('DEBUG - Parsed location:', location);
    debugLog('DEBUG - Parsed itemKey:', itemKey);
    debugLog('DEBUG - MERIT_ITEM_KEY:', MERIT_ITEM_KEY);
    debugLog('DEBUG - Are they equal?', itemKey === MERIT_ITEM_KEY);
    
    const newQuantityStr = interaction.fields.getTextInputValue('new_quantity');
    const reason = interaction.fields.getTextInputValue('adjustment_reason');
    
    const newQuantity = parseInt(newQuantityStr.replace(/,/g, ''), 10);
    if (isNaN(newQuantity) || newQuantity < 0) {
      return interaction.reply({ 
        content: '❌ Quantity must be a positive number or zero.', 
        flags: 64 
      });
    }

    debugLog('DEBUG - New quantity:', newQuantity);

    // Fetch current quantity directly from database
    const connection = await pool.getConnection();
    let currentQuantity = 0;
    
    try {
      const [[row]] = await connection.query(
        'SELECT quantity FROM inventory_totals WHERE location = ? AND item_key = ?',
        [location, itemKey]
      );
      
      currentQuantity = row ? row.quantity : 0;
      debugLog('DEBUG - Current quantity from DB:', currentQuantity);
    } finally {
      connection.release();
    }

    const success = await updateInventoryQuantity(location, itemKey, newQuantity);
    if (!success) {
      return interaction.reply({ 
        content: '❌ Failed to update inventory. Please try again.', 
        flags: 64 
      });
    }

    // Verify the update worked
    const [verifyRows] = await pool.query(
      'SELECT quantity FROM inventory_totals WHERE location = ? AND item_key = ?',
      [location, itemKey]
    );
    debugLog('DEBUG - Verification query result:', verifyRows);
    debugLog('DEBUG - Should be:', newQuantity, 'Got:', verifyRows[0]?.quantity);

    const logId = await logPatchAdjustment({
      adjusted_by: interaction.user.id,
      location: location,
      item_key: itemKey,
      old_quantity: currentQuantity,
      new_quantity: newQuantity,
      reason: reason
    });

    debugLog('DEBUG - Log ID created:', logId);

    // Update the inventory embed using database-backed function
    try {
      debugLog('DEBUG - Calling updateMainInventoryEmbedWithDB');
      await updateMainInventoryEmbedWithDB(interaction.guild);
      debugLog('DEBUG - updateMainInventoryEmbedWithDB completed');
    } catch (err) {
      debugError('Failed to update inventory embed:', err);
      await interaction.followUp({
        content: `⚠️ Inventory was updated but embed refresh failed. Error: ${err.message}`,
        flags: 64
      }).catch(() => {});
    }

    await sendPatchAdjustmentNotification(interaction, {
      logId,
      adjusted_by: interaction.user.id,
      location: location,
      item_key: itemKey,
      item_label: ITEMS.find(i => i.value === itemKey)?.label || itemKey,
      location_label: LOCATIONS.find(l => l.value === location)?.label || location,
      old_quantity: currentQuantity,
      new_quantity: newQuantity,
      reason: reason,
      timestamp: new Date()
    });

    const itemLabel = ITEMS.find(i => i.value === itemKey)?.label || itemKey;
    const locationLabel = LOCATIONS.find(l => l.value === location)?.label || location;
    
    await interaction.reply({
      content: `✅ Patch adjustment applied!\n\n**${itemLabel}** at **${locationLabel}**\n` +
               `📊 **From:** ${currentQuantity.toLocaleString()}\n` +
               `📈 **To:** ${newQuantity.toLocaleString()}\n` +
               `📝 **Reason:** ${reason}\n\n` +
               `✅ Notification sent to <#${PATCH_LOG_CHANNEL_ID}>`,
      flags: 64
    });

  } catch (error) {
    debugError('Error in handlePatchAdjustmentModal:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while processing the patch adjustment.', 
      flags: 64 
    });
  }
}

/**
 * Send patch adjustment notification to log channel
 */
async function sendPatchAdjustmentNotification(interaction, adjustmentData) {
  try {
    const logChannel = interaction.guild.channels.cache.get(PATCH_LOG_CHANNEL_ID);
    if (!logChannel) {
      debugError('Patch log channel not found:', PATCH_LOG_CHANNEL_ID);
      return false;
    }

    const changeType = adjustmentData.new_quantity > adjustmentData.old_quantity ? '📈 INCREASE' : 
                      adjustmentData.new_quantity < adjustmentData.old_quantity ? '📉 DECREASE' : 
                      '🔄 NO CHANGE';
    
    const changeEmoji = adjustmentData.new_quantity > adjustmentData.old_quantity ? '📈' : 
                       adjustmentData.new_quantity < adjustmentData.old_quantity ? '📉' : 
                       '🔄';
    
    const changeAmount = Math.abs(adjustmentData.new_quantity - adjustmentData.old_quantity);
    const changePercentage = adjustmentData.old_quantity > 0 ? 
      ((changeAmount / adjustmentData.old_quantity) * 100).toFixed(1) : 
      'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`${changeEmoji} Patch Adjustment #${adjustmentData.logId}`)
      .setColor(adjustmentData.new_quantity > adjustmentData.old_quantity ? '#00FF00' : 
                adjustmentData.new_quantity < adjustmentData.old_quantity ? '#FF0000' : 
                '#FFFF00')
      .setDescription(`**${changeType}** - ${adjustmentData.item_label} at ${adjustmentData.location_label}`)
      .addFields(
        {
          name: '📊 Quantity Changes',
          value: `**Old:** ${adjustmentData.old_quantity.toLocaleString()}\n` +
                 `**New:** ${adjustmentData.new_quantity.toLocaleString()}\n` +
                 `**Δ Change:** ${changeAmount.toLocaleString()} (${changePercentage}%)`,
          inline: true
        },
        {
          name: '📍 Location',
          value: adjustmentData.location_label,
          inline: true
        },
        {
          name: '👤 Adjusted By',
          value: `<@${adjustmentData.adjusted_by}>`,
          inline: true
        }
      )
      .addFields(
        {
          name: '📝 Reason',
          value: adjustmentData.reason.length > 1024 ? 
                 adjustmentData.reason.substring(0, 1020) + '...' : 
                 adjustmentData.reason
        }
      )
      .setFooter({ 
        text: `Adjustment ID: ${adjustmentData.logId} • ${adjustmentData.item_key}` 
      })
      .setTimestamp(adjustmentData.timestamp);

    await logChannel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    debugError('Error sending patch adjustment notification:', error);
    return false;
  }
}

/**
 * Handle location selection with AUEC/Merits restriction
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} userSessions - User sessions map
 */
async function handleLocationSelect(interaction, userSessions) {
  const userId = interaction.user.id;
  const session = userSessions.get(userId);
  
  if (!session) {
    return interaction.reply({ 
      content: 'Session expired. Please start your inventory request again.', 
      flags: 64 
    });
  }

  const selectedLocation = interaction.values[0];
  
  // Check if user selected AUEC or Merits
  const hasMoneyItems = session.items?.some(item => 
    item === UEC_ITEM_KEY || item === MERIT_ITEM_KEY
  );
  
  if (hasMoneyItems && selectedLocation !== UEC_LOCATION) {
    // Force universal location for money items
    session.location = UEC_LOCATION;
    await interaction.reply({
      content: `⚠️ **Note:** AUEC and Merits can only be stored in the **Universal** location.\nYour location has been automatically set to **Universal**.`,
      flags: 64
    });
  } else {
    session.location = selectedLocation;
  }
  
  userSessions.set(userId, session);
  
  // If user has items that need quantity input, show quantity modal
  const needsQuantity = session.items?.some(item => {
    if (item === MERIT_ITEM_KEY && session.quantities?.[MERIT_ITEM_KEY]) {
      return false; // Already has merits from prison time modal
    }
    return item !== MERIT_ITEM_KEY;
  });
  
  if (needsQuantity) {
    // Create quantity input modal
    const modal = new ModalBuilder()
      .setCustomId('inventory_quantity_modal')
      .setTitle('Enter Quantities');

    session.items.forEach(item => {
      if (item === MERIT_ITEM_KEY && session.quantities?.[MERIT_ITEM_KEY]) {
        return; // Skip merits if already set
      }
      
      const itemLabel = ITEMS.find(i => i.value === item)?.label || item;
      const modalInput = new TextInputBuilder()
        .setCustomId(`quantity_${item}`)
        .setLabel(`Quantity for ${itemLabel}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter amount')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(modalInput));
    });

    await interaction.showModal(modal);
  } else {
    // All items are merits with quantities already set
    if (session.action === 'withdraw') {
      const reasonSelect = new StringSelectMenuBuilder()
        .setCustomId('withdraw_reason_select')
        .setPlaceholder('Select reason for withdrawal')
        .addOptions(WITHDRAW_REASONS);

      return interaction.reply({
        content: 'Select the reason for withdrawal:',
        components: [new ActionRowBuilder().addComponents(reasonSelect)],
        flags: 64,
      });
    }
    
    return await finalizeRequest(interaction, session, interaction.client);
  }
}

/**
 * Handle inventory quantity modal submission
 */
async function handleInventoryQuantityModal(interaction, userSessions) {
  const userId = interaction.user.id;
  const session = userSessions.get(userId);
  
  if (!session) {
    return interaction.reply({ 
      content: 'Session expired, please start again.', 
      flags: 64 
    });
  }

  const itemQuantities = session.quantities || {};
  
  for (const item of session.items) {
    if (item === MERIT_ITEM_KEY && itemQuantities[MERIT_ITEM_KEY]) {
      continue;
    }
    
    const raw = interaction.fields.getTextInputValue(`quantity_${item}`);
    const quantity = parseInt(raw, 10);
    const itemLabel = ITEMS.find(i => i.value === item)?.label || item;

    if (isNaN(quantity) || quantity <= 0) {
      return interaction.reply({ 
        content: `Quantity for **${itemLabel}** must be a positive number.`, 
        flags: 64 
      });
    }

    itemQuantities[item] = quantity;
  }

  session.quantities = itemQuantities;
  userSessions.set(userId, session);

  if (session.action === 'withdraw') {
    const reasonSelect = new StringSelectMenuBuilder()
      .setCustomId('withdraw_reason_select')
      .setPlaceholder('Select reason for withdrawal')
      .addOptions(WITHDRAW_REASONS);

    return interaction.reply({
      content: 'Select the reason for withdrawal:',
      components: [new ActionRowBuilder().addComponents(reasonSelect)],
      flags: 64,
    });
  }

  return await finalizeRequest(interaction, session, interaction.client);
}

/**
 * Handle patch adjustment button
 */
async function handlePatchAdjustmentButton(interaction) {
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(PATCH_ADJUST_ROLE_ID)) {
      return interaction.reply({ 
        content: '❌ You do not have permission to make patch adjustments. This feature is for Quartermasters only.', 
        flags: 64 
      });
    }

    const locationSelect = new StringSelectMenuBuilder()
      .setCustomId('patch_location_select')
      .setPlaceholder('Select location to adjust')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(LOCATIONS);
    
    const row = new ActionRowBuilder().addComponents(locationSelect);
    
    await interaction.reply({
      content: '🔧 **Patch Adjustment Tool**\n\nSelect a location to adjust inventory values:',
      components: [row],
      flags: 64
    });

  } catch (error) {
    debugError('Error in handlePatchAdjustmentButton:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while starting patch adjustment.', 
      flags: 64 
    });
  }
}

/**
 * Handle patch location selection
 */
async function handlePatchLocationSelect(interaction) {
  try {
    const location = interaction.values[0];
    const inventoryData = await fetchInventoryTotals();
    const locationData = inventoryData[location] || {};
    
    const itemOptions = ITEMS
      .filter(item => {
        if (location === UEC_LOCATION) {
          return item.value === UEC_ITEM_KEY || item.value === MERIT_ITEM_KEY;
        }
        return item.value !== UEC_ITEM_KEY && item.value !== MERIT_ITEM_KEY;
      })
      .map(item => {
        const currentQty = locationData[item.value] || 0;
        return {
          label: `${item.label.substring(0, 20)} (${currentQty})`,
          value: item.value,
          description: `Current: ${currentQty.toLocaleString()}`
        };
      });

    if (itemOptions.length === 0) {
      return interaction.update({
        content: `❌ No items found at this location to adjust.`,
        components: [],
        flags: 64
      });
    }

    const itemSelects = [];
    for (let i = 0; i < itemOptions.length; i += 25) {
      const chunk = itemOptions.slice(i, i + 25);
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`patch_item_select_${location}_${Math.floor(i / 25)}`)
        .setPlaceholder(`Select item to adjust (${Math.floor(i/25) + 1})`)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(chunk);
      
      itemSelects.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    await interaction.update({
      content: `📍 **${LOCATIONS.find(l => l.value === location)?.label}**\n\nSelect an item to adjust:`,
      components: itemSelects,
      flags: 64
    });

  } catch (error) {
    debugError('Error in handlePatchLocationSelect:', error);
    await interaction.update({ 
      content: '❌ An error occurred while loading items.', 
      components: [],
      flags: 64 
    });
  }
}

/**
 * Handle patch item selection
 */
async function handlePatchItemSelect(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const location = customIdParts[3];
    const itemKey = interaction.values[0];
    
    // Fetch the current quantity directly from database
    const connection = await pool.getConnection();
    let currentQuantity = 0;
    
    try {
      const [[row]] = await connection.query(
        'SELECT quantity FROM inventory_totals WHERE location = ? AND item_key = ?',
        [location, itemKey]
      );
      
      currentQuantity = row ? row.quantity : 0;
    } finally {
      connection.release();
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`patch_adjust_${location}_${itemKey}`)
      .setTitle('Patch Adjustment');

    const itemLabel = ITEMS.find(i => i.value === itemKey)?.label || itemKey;
    const locationLabel = LOCATIONS.find(l => l.value === location)?.label || location;
    
    const shortenedLocationLabel = locationLabel.includes('Universal') ? 'Universal' : locationLabel;
    
    const maxItemLabelLength = 45 - `New quantity for  (${shortenedLocationLabel})`.length;
    const truncatedItemLabel = itemLabel.length > maxItemLabelLength 
      ? itemLabel.substring(0, maxItemLabelLength - 3) + '...' 
      : itemLabel;
    
    const quantityInputLabel = `New quantity for ${truncatedItemLabel} (${shortenedLocationLabel})`;
    
    const finalLabel = quantityInputLabel.length > 45 
      ? `${truncatedItemLabel} (${shortenedLocationLabel})` 
      : quantityInputLabel;
    
    const quantityInput = new TextInputBuilder()
      .setCustomId('new_quantity')
      .setLabel(finalLabel)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`Current: ${currentQuantity.toLocaleString()}`)
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('adjustment_reason')
      .setLabel('Reason for adjustment')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('e.g., Patch 3.23.1 balance changes, inventory audit, etc.')
      .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(quantityInput);
    const secondRow = new ActionRowBuilder().addComponents(reasonInput);

    modal.addComponents(firstRow, secondRow);
    await interaction.showModal(modal);

  } catch (error) {
    debugError('Error in handlePatchItemSelect:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while loading adjustment form.', 
      flags: 64 
    });
  }
}

/**
 * Update main inventory embed with debug logging
 */
async function updateMainInventoryEmbed(guild, storedMessageIds = []) {
  try {
    debugLog('DEBUG - Starting updateMainInventoryEmbed');
    debugLog('DEBUG - UEC_LOCATION:', UEC_LOCATION);
    debugLog('DEBUG - MERIT_ITEM_KEY:', MERIT_ITEM_KEY);
    debugLog('DEBUG - UEC_ITEM_KEY:', UEC_ITEM_KEY);
    
    const channel = guild.channels.cache.get(INVENTORY_CHANNEL_ID);
    if (!channel) {
      debugError('Inventory channel not found:', INVENTORY_CHANNEL_ID);
      throw new Error('Inventory channel not found');
    }
    
    debugLog('DEBUG - Channel name:', channel.name);
    debugLog('DEBUG - Channel ID:', channel.id);

    // Clear the channel first if storedMessageIds is empty (initial setup)
    if (storedMessageIds.length === 0) {
      debugLog('Initial setup - clearing channel for new embeds');
      try {
        // Fetch recent messages
        const messages = await channel.messages.fetch({ limit: 50 });
        // Delete all messages from the bot in this channel
        const botMessages = messages.filter(msg => msg.author.id === guild.client.user.id);
        for (const message of botMessages.values()) {
          try {
            await message.delete();
          } catch (error) {
            debugLog(`Could not delete message ${message.id}:`, error.message);
          }
        }
      } catch (error) {
        debugLog('Error clearing channel:', error.message);
      }
    }

    const inventoryData = await fetchInventoryTotals();
    debugLog('DEBUG - Full inventory data:', JSON.stringify(inventoryData, null, 2));
    
    // Check what's in the universal location
    const universalData = inventoryData[UEC_LOCATION] || {};
    debugLog('DEBUG - Universal location data:', JSON.stringify(universalData, null, 2));
    debugLog('DEBUG - All keys in universalData:', Object.keys(universalData));
    
    const uecTotal = universalData[UEC_ITEM_KEY] || 0;
    const meritTotal = universalData[MERIT_ITEM_KEY] || 0;
    
    debugLog('DEBUG - UEC total found:', uecTotal);
    debugLog('DEBUG - Merits total found:', meritTotal);
    debugLog('DEBUG - Merits found with key "' + MERIT_ITEM_KEY + '":', meritTotal);
    
    const baseEmbed = new EmbedBuilder()
      .setTitle('Blightveil Inventory')
      .setColor('#0066cc')
      .setTimestamp()
      .setFooter({ text: 'Audit-Log' })
      .setDescription('Select **Input** or **Withdraw** below to submit requests.\n\n[Track your request status:](https://quartermaster.blightveil.org/)');

    // Process each location
    for (const loc of LOCATIONS) {
      if (loc.value === UEC_LOCATION) continue;
      
      const locationData = inventoryData[loc.value] || {};
      
      // Create a map of items by category for this location
      const itemsByCategory = {};
      
      // Organize items by their original groups
      for (const [categoryName, categoryItems] of Object.entries(ITEM_GROUPS)) {
        const categoryItemList = [];
        
        for (const item of categoryItems) {
          // Skip UEC and Merits for location-specific displays
          if (item.value === UEC_ITEM_KEY || item.value === MERIT_ITEM_KEY) continue;
          
          const count = locationData[item.value] ?? 0;
          // Only show items that exist in inventory (count > 0)
          if (count > 0) {
            categoryItemList.push(`**${item.label}**: ${count}`);
          }
        }
        
        if (categoryItemList.length > 0) {
          itemsByCategory[categoryName] = categoryItemList;
        }
      }
      
      // If no items at this location, show placeholder
      if (Object.keys(itemsByCategory).length === 0) {
        baseEmbed.addFields({ 
          name: loc.label, 
          value: 'No items in stock', 
          inline: true 
        });
        continue;
      }
      
      // Create formatted output for this location
      let locationText = '';
      
      for (const [categoryName, items] of Object.entries(itemsByCategory)) {
        // Add category header
        locationText += `__${categoryName}:__\n`;
        
        // Add items in this category (max 8 per category to avoid too long fields)
        const itemsToShow = items.slice(0, 8);
        locationText += itemsToShow.join('\n');
        
        // If there are more items, show count
        if (items.length > 8) {
          locationText += `\n...and ${items.length - 8} more`;
        }
        
        locationText += '\n\n';
      }
      
      // Trim trailing newlines
      locationText = locationText.trim();
      
      // Split into chunks if still too long
      if (locationText.length > 1024) {
        // First field with location name
        baseEmbed.addFields({ 
          name: `📦 ${loc.label}`, 
          value: locationText.substring(0, 1000) + '...', 
          inline: true 
        });
        
        // Continue with remaining text
        let remainingText = locationText.substring(1000);
        let continuationCount = 1;
        
        while (remainingText.length > 0) {
          const chunk = remainingText.substring(0, 1000);
          remainingText = remainingText.substring(1000);
          
          baseEmbed.addFields({ 
            name: `↪ ${loc.label} (${continuationCount})`, 
            value: chunk + (remainingText.length > 0 ? '...' : ''), 
            inline: true 
          });
          continuationCount++;
        }
      } else {
        baseEmbed.addFields({ 
          name: `📦 ${loc.label}`, 
          value: locationText || 'No items in stock', 
          inline: true 
        });
      }
    }

    // Add universal items (UEC and Merits)
    const meritHours = Math.floor(meritTotal / 3600);
    const meritMinutes = Math.floor((meritTotal % 3600) / 60);
    const meritDisplay = `${meritTotal.toLocaleString()} (${meritHours}h ${meritMinutes}m)`;

    debugLog('DEBUG - Adding to embed: UEC:', uecTotal, 'Merits:', meritTotal, 'Display:', meritDisplay);

    // Format UEC with text representation - using simplified version for large numbers
    const uecDisplay = formatMoney(uecTotal, true);

    baseEmbed.addFields(
      { 
        name: '💰 Universal Currencies', 
        value: `**UEC**: ${uecDisplay}\n**Merits**: ${meritDisplay}`, 
        inline: false 
      }
    );

    const embeds = splitEmbedFields(baseEmbed);
    const newMessageIds = [];

    const actionRows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('inventory_input')
          .setLabel('Input')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('inventory_withdraw')
          .setLabel('Withdraw')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('inventory_patch_adjust')
          .setLabel('Patch Adjustment')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚙️')
      )
    ];

    debugLog(`Updating inventory embed in channel ${INVENTORY_CHANNEL_ID}`);
    debugLog(`Number of embeds: ${embeds.length}`);
    debugLog(`Stored message IDs:`, storedMessageIds);

    // Create or update the first message (with buttons)
    if (storedMessageIds[0]) {
      try {
        // Try to edit the existing first message
        const msg = await channel.messages.fetch(storedMessageIds[0]);
        debugLog(`Editing existing message ${msg.id}...`);
        await msg.edit({ 
          embeds: [embeds[0]], 
          components: actionRows 
        });
        newMessageIds.push(msg.id);
        debugLog(`Successfully updated message ${msg.id}`);
      } catch (error) {
        debugLog(`Could not edit message ${storedMessageIds[0]}, creating new:`, error.message);
        // Create new message if edit fails
        const newMsg = await channel.send({ 
          embeds: [embeds[0]], 
          components: actionRows 
        });
        newMessageIds.push(newMsg.id);
        debugLog(`Created new message with ID: ${newMsg.id}`);
      }
    } else {
      // Create new first message
      debugLog(`Creating new first message...`);
      const newMsg = await channel.send({ 
        embeds: [embeds[0]], 
        components: actionRows 
      });
      newMessageIds.push(newMsg.id);
      debugLog(`Created new first message with ID: ${newMsg.id}`);
    }

    // Create or update continuation messages
    for (let i = 1; i < embeds.length; i++) {
      if (storedMessageIds[i]) {
        try {
          // Try to edit existing continuation message
          const msg = await channel.messages.fetch(storedMessageIds[i]);
          debugLog(`Editing existing continuation message ${msg.id}...`);
          await msg.edit({ 
            embeds: [embeds[i]], 
            components: [] 
          });
          newMessageIds.push(msg.id);
          debugLog(`Successfully updated continuation message ${msg.id}`);
        } catch (error) {
          debugLog(`Could not edit continuation message ${storedMessageIds[i]}, creating new:`, error.message);
          // Create new message if edit fails
          const newMsg = await channel.send({ 
            embeds: [embeds[i]], 
            components: [] 
          });
          newMessageIds.push(newMsg.id);
          debugLog(`Created new continuation message with ID: ${newMsg.id}`);
        }
      } else {
        // Create new continuation message
        debugLog(`Creating new continuation message ${i + 1}/${embeds.length}...`);
        const newMsg = await channel.send({ 
          embeds: [embeds[i]], 
          components: [] 
        });
        newMessageIds.push(newMsg.id);
        debugLog(`Created new continuation message with ID: ${newMsg.id}`);
      }
    }

    // Clean up any extra messages that are no longer needed
    for (let i = embeds.length; i < storedMessageIds.length; i++) {
      if (storedMessageIds[i]) {
        try {
          const msg = await channel.messages.fetch(storedMessageIds[i]);
          await msg.delete();
          debugLog(`Deleted old extra message ${storedMessageIds[i]}`);
        } catch (error) {
          debugLog(`Could not delete message ${storedMessageIds[i]}:`, error.message);
        }
      }
    }

    // After updating, fetch and log the actual message content
    try {
      const msg = await channel.messages.fetch(newMessageIds[0]);
      debugLog('DEBUG - Final message embed data:', JSON.stringify(msg.embeds[0]?.data, null, 2));
    } catch (error) {
      debugLog('DEBUG - Could not fetch final message:', error.message);
    }

    debugLog(`Inventory update completed. New message IDs:`, newMessageIds);
    return newMessageIds;
  } catch (err) {
    debugError('Error updating main inventory embed:', err);
    debugError('Error stack:', err.stack);
    return storedMessageIds;
  }
}

/**
 * Get stored message IDs from database
 */
async function getStoredMessageIdsFromDB() {
  try {
    const [rows] = await pool.query('SELECT message_id, embed_index FROM inventory_message_ids ORDER BY embed_index');
    // Create array in correct order
    const ids = new Array(rows.length);
    rows.forEach(row => {
      ids[row.embed_index] = row.message_id;
    });
    return ids.filter(id => id); // Remove any undefined slots
  } catch (err) {
    debugError('Error fetching message IDs from DB:', err);
    return [];
  }
}

/**
 * Set stored message IDs in database
 */
async function setStoredMessageIdsToDB(ids) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Clear existing entries
    await connection.query('DELETE FROM inventory_message_ids');
    
    // Insert new entries
    for (let i = 0; i < ids.length; i++) {
      if (ids[i]) {
        await connection.query(
          'INSERT INTO inventory_message_ids (message_id, embed_index) VALUES (?, ?)',
          [ids[i], i]
        );
      }
    }
    
    await connection.commit();
    debugLog('Stored message IDs updated in database');
  } catch (err) {
    await connection.rollback();
    debugError('Error updating message IDs in DB:', err);
  } finally {
    connection.release();
  }
}

/**
 * Update main inventory embed with database persistence
 */
async function updateMainInventoryEmbedWithDB(guild) {
  try {
    debugLog('DEBUG - Starting updateMainInventoryEmbedWithDB');
    // Get current message IDs from database
    const storedIds = await getStoredMessageIdsFromDB();
    debugLog('DEBUG - Retrieved stored IDs from DB:', storedIds);
    
    // Update the embed
    const newIds = await updateMainInventoryEmbed(guild, storedIds);
    debugLog('DEBUG - New IDs from update:', newIds);
    
    // Save new IDs to database
    await setStoredMessageIdsToDB(newIds);
    
    return true;
  } catch (err) {
    debugError('Error in updateMainInventoryEmbedWithDB:', err);
    debugError('Error stack:', err.stack);
    return false;
  }
}

/**
 * Finalize inventory request
 */
async function finalizeRequest(interaction, session, client) {
  try {
    await interaction.deferReply({ flags: 64 });

    // Validate location for AUEC/Merits
    const hasMoneyItems = session.items?.some(item => 
      item === UEC_ITEM_KEY || item === MERIT_ITEM_KEY
    );
    
    if (hasMoneyItems && session.location !== UEC_LOCATION) {
      // Force universal location for money items
      session.location = UEC_LOCATION;
    }

    if (session.action === 'withdraw') {
      const inventory = await fetchInventoryTotals();
      const missingItems = [];

      for (const itemKey of session.items) {
        const loc = (itemKey === UEC_ITEM_KEY || itemKey === MERIT_ITEM_KEY)
          ? UEC_LOCATION
          : session.location;

        const available = inventory[loc]?.[itemKey] ?? 0;
        const requested = session.quantities?.[itemKey] ?? 0;
        
        if (requested > available) {
          const item = ITEMS.find(i => i.value === itemKey);
          missingItems.push(item ? item.label : itemKey);
        }
      }

      if (missingItems.length > 0) {
        return await interaction.editReply({
          content: `❌ Not enough stock for:\n${missingItems.map(i => `• ${i}`).join('\n')}\n\nPlease try again later.`,
        });
      }
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const nickname = member.nickname || interaction.user.username;

    const requestId = await saveRequestToDB({
      user_nickname: nickname,
      action: session.action,
      items: session.items,
      location: session.location,
      quantities: session.quantities,
      reason: session.reason || null,
    });

    if (!requestId) {
      return await interaction.editReply({
        content: 'Failed to submit request. Please try again later.',
      });
    }

    const requestChannel = interaction.guild.channels.cache.get(REQUEST_CHANNEL_ID);
    if (!requestChannel || requestChannel.type !== 0) {
      return await interaction.editReply({
        content: 'Request channel is not found or invalid. Contact staff.',
      });
    }

    const thread = await requestChannel.threads.create({
      name: `${session.action === 'input' ? 'Deposit' : 'Withdraw'}: ${nickname}`,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      reason: `Request by ${interaction.user.tag}`,
      topic: '[Track your request status:](https://quartermaster.blightveil.org/)'
    });

    const staffRole = interaction.guild.roles.cache.get(STAFF_ROLE_ID);
    if (staffRole) {
      const addPromises = [];
      for (const member of staffRole.members.values()) {
        addPromises.push(
          thread.members.add(member.id).catch(err => 
            debugError(`Failed to add member ${member.user.tag} to thread:`, err)
          )
        );
      }
      await Promise.allSettled(addPromises);
    }

    await updateRequestThreadId(requestId, thread.id);

    const embed = new EmbedBuilder()
      .setTitle(`${session.action === 'input' ? 'Loot Deposit Request' : 'Loot Withdrawal Request'}`)
      .setColor(session.action === 'input' ? '#00ff99' : '#ff6600')
      .setDescription('[Track your request status here](https://quartermaster.blightveil.org/)')
      .addFields(
        { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Location', value: session.location, inline: true },
        {
          name: 'Items',
          value: session.items.map(i => {
            const itemLabel = ITEMS.find(item => item.value === i)?.label || i;
            let qty = session.quantities?.[i] || 0;
            
            if (i === MERIT_ITEM_KEY) {
              const formattedTime = formatPrisonTimeDisplay(qty);
              return `• ${itemLabel}: ${qty.toLocaleString()} (${formattedTime})`;
            }
            
            return `• ${itemLabel}: ${qty}`;
          }).join('\n')
        }
      )
      .setFooter({ text: 'Awaiting approval from staff' })
      .setTimestamp();

    if (session.reason) {
      embed.addFields({ name: 'Reason', value: session.reason });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv_success_${requestId}`)
        .setLabel('Fulfill')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`inv_failure_${requestId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`inv_close_thread_${thread.id}`)
        .setLabel('Close Order')
        .setStyle(ButtonStyle.Secondary)
    );

    await thread.send({
      content: `<@${interaction.user.id}> A Quartermaster will be with you shortly.`,
      embeds: [embed],
      components: [row],
    });

    await interaction.editReply({
      content: 'Your request has been submitted for approval. A staff member will review it shortly.',
    });

  } catch (err) {
    debugError('Error in finalizeRequest:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'There was an error submitting your request. Please try again later.',
        flags: 64,
      });
    } else {
      await interaction.editReply({
        content: 'There was an error submitting your request. Please try again later.',
      }).catch(() => {});
    }
  }
}

/**
 * Handle approve/deny button for inventory requests
 */
async function BankApproveDenyButton(interaction, pool) {
  try {
    const approverMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!approverMember.roles.cache.has(STAFF_ROLE_ID)) {
      return await interaction.reply({ 
        content: '❌ You do not have permission to use this button.', 
        flags: 64 
      });
    }

    const [prefix, action, requestIdStr] = interaction.customId.split('_');
    const requestId = parseInt(requestIdStr, 10);

    if (prefix !== 'inv' || !['success', 'failure'].includes(action) || isNaN(requestId)) {
      return await interaction.reply({ 
        content: 'Invalid action or request ID.', 
        flags: 64 
      });
    }

    const [rows] = await pool.query('SELECT * FROM inventory_requests WHERE id = ?', [requestId]);
    const request = rows[0];

    if (!request) {
      return await interaction.reply({ 
        content: 'Request not found.', 
        flags: 64 
      });
    }

    const approverNickname = approverMember.nickname || approverMember.user.username;

    if (action === 'success') {
      const success = await updateInventoryDatabase(request.action, requestId);
      if (!success) {
        return await interaction.reply({ 
          content: 'Failed to update inventory. Please try again later.', 
          flags: 64 
      });
      }

      await pool.query(
        'UPDATE inventory_requests SET status = "approved", staff_nickname = ? WHERE id = ?',
        [approverNickname, requestId]
      );

      // Update the inventory embed using database-backed function
      try {
        await updateMainInventoryEmbedWithDB(interaction.guild);
      } catch (err) {
        debugError('Failed to update inventory embed:', err);
        // Log the error but don't fail the approval
        await interaction.followUp({
          content: `⚠️ Inventory was updated but embed refresh failed. Error: ${err.message}`,
          flags: 64
        }).catch(() => {});
      }

      await interaction.reply({ 
        content: `✅ Request #${requestId} approved by **${approverNickname}**.\n📊 Inventory has been updated.`, 
        flags: 64 
      });
    } else {
      await pool.query(
        'UPDATE inventory_requests SET status = "denied", staff_nickname = ? WHERE id = ?',
        [approverNickname, requestId]
      );

      await interaction.reply({ 
        content: `❌ Request #${requestId} denied by **${approverNickname}**.`, 
        flags: 64 
      });
    }

  } catch (error) {
    debugError('Error in BankApproveDenyButton:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: 'An error occurred while processing the request.', 
        flags: 64 
      });
    } else if (interaction.replied || interaction.deferred) {
      // Try to send a follow-up if we already replied
      await interaction.followUp({
        content: '❌ An error occurred while processing your request.',
        flags: 64
      }).catch(() => {});
    }
  }
}

/**
 * Handle close thread button
 */
async function handleCloseThreadButton(interaction) {
  const threadId = interaction.customId.split('_').slice(3).join('_');

  try {
    const thread = await interaction.guild.channels.fetch(threadId);
    
    if (thread?.isThread() && !thread.archived) {
      await thread.setArchived(true, 'Thread closed via inventory close button');
    }
  } catch (error) {
    debugError('Error closing thread:', error);
  }
}

// ========== EXPORTS ==========

module.exports = {
  // Constants
  ITEMS,
  LOCATIONS,
  WITHDRAW_REASONS,
  MERIT_ITEM_KEY,
  UEC_ITEM_KEY,
  UEC_LOCATION,
  STAFF_ROLE_ID,
  REQUEST_CHANNEL_ID,
  PATCH_ADJUST_ROLE_ID,
  PATCH_LOG_CHANNEL_ID,
  ITEM_GROUPS,
  WIKELO_BUNDLES,
  
  // Debug Functions
  DEBUG_MODE,
  debugLog,
  debugError,
  
  // Message ID Management
  getStoredMessageIds,
  setStoredMessageIds,
  getStoredMessageIdsFromDB,
  setStoredMessageIdsToDB,
  
  // Money Conversion Functions
  numberToWords,
  formatMoney,
  formatMoneyDetailed,
  
  // Prison Time Functions
  calculateMeritsFromPrisonTime,
  formatPrisonTimeDisplay,
  createPrisonTimeModal,
  handlePrisonTimeModal,
  handleInventoryQuantityModal,
  
  // Patch Adjustment Functions
  createPatchAdjustmentModal,
  handlePatchAdjustmentModal,
  handlePatchAdjustmentButton,
  handlePatchLocationSelect,
  handlePatchItemSelect,
  createPatchLocationSelect,
  sendPatchAdjustmentNotification,
  
  // Wikelo Functions
  createWikeloBundleSelect,
  createWikeloBundleButton,
  handleWikeloBundleSelect,
  handleWikeloBundleButton,
  
  // Pagination Functions
  createPaginatedDropdowns,
  handleInventoryPageNavigation,
  handleInventoryButtonWithPagination,
  
  // Database Functions
  fetchInventoryTotals,
  saveRequestToDB,
  logPatchAdjustment,
  updateInventoryQuantity,
  migrateMoneyToUniversal,
  updateInventoryDatabase,
  markRequestClosed,
  getPendingRequestByThreadId,
  updateRequestThreadId,
  
  // Display Functions
  updateMainInventoryEmbed,
  updateMainInventoryEmbedWithDB,
  finalizeRequest,
  BankApproveDenyButton,
  handleCloseThreadButton,
  
  // UI Components
  pool,
  dropdownRows,
  createGroupedItemDropdowns,
  createFinishedButton,
  createPatchLocationSelect,
  
  // New Functions
  handleLocationSelect
};