const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { saveEntombedKnight, updateLastPromotion, getLastPromotion } = require('../db');

// Rate limit tracking
const rateLimit = new Map();

// Allowed roles to use rank command
const ALLOWED_ROLES = [
    '1168253795818549319', // SOV
    '1168644418484588694', // Steward
    '1168234521301356715', // HC
    '1308081615083278378', // Pilot Overseer
    '1308081895266844712', // Infantry Overseer
    '1308081958424940545', // Crewman Overseer
    '1308082015622664262', // Support Overseer
    '1304192471806246953', // Knights Leader
    '1304192533533819002'  // Legion Leader
];

// Define all rank choices for autocomplete (no 25-item limit here!)
const ALL_RANK_CHOICES = [
    { name: 'UX9', value: 'UX9' }, { name: 'UX8', value: 'UX8' }, { name: 'UX7', value: 'UX7' },
    { name: 'UX6', value: 'UX6' }, { name: 'UX5', value: 'UX5' }, { name: 'UX4', value: 'UX4' },
    { name: 'UX3', value: 'UX3' }, { name: 'UX2', value: 'UX2' }, { name: 'UX1', value: 'UX1' },
    { name: 'LM9', value: 'LM9' }, { name: 'LM8', value: 'LM8' }, { name: 'LM7', value: 'LM7' },
    { name: 'LM6', value: 'LM6' }, { name: 'LM5', value: 'LM5' }, { name: 'LM4', value: 'LM4' },
    { name: 'LM3', value: 'LM3' }, { name: 'LM2', value: 'LM2' }, { name: 'LM1', value: 'LM1' },
    { name: 'KM9', value: 'KM9' }, { name: 'KM8', value: 'KM8' }, { name: 'KM7', value: 'KM7' },
    { name: 'KM6', value: 'KM6' }, { name: 'KM5', value: 'KM5' }, { name: 'KM4', value: 'KM4' },
    { name: 'KM3', value: 'KM3' }, { name: 'KM2', value: 'KM2' }, { name: 'KM1', value: 'KM1' },
    { name: 'KS9', value: 'KS9' }, { name: 'KS8', value: 'KS8' }, { name: 'KS7', value: 'KS7' },
    { name: 'KS6', value: 'KS6' }, { name: 'KS5', value: 'KS5' }, { name: 'KS4', value: 'KS4' },
    { name: 'KS3', value: 'KS3' }, { name: 'KS2', value: 'KS2' }, { name: 'KS1', value: 'KS1' },
    { name: 'LL9', value: 'LL9' }, { name: 'LL8', value: 'LL8' }, { name: 'LL7', value: 'LL7' },
    { name: 'LL6', value: 'LL6' }, { name: 'LL5', value: 'LL5' }, { name: 'LL4', value: 'LL4' },
    { name: 'LL3', value: 'LL3' }, { name: 'LL2', value: 'LL2' }, { name: 'LL1', value: 'LL1' },
    { name: 'KL9', value: 'KL9' }, { name: 'KL8', value: 'KL8' }, { name: 'KL7', value: 'KL7' },
    { name: 'KL6', value: 'KL6' }, { name: 'KL5', value: 'KL5' }, { name: 'KL4', value: 'KL4' },
    { name: 'KL3', value: 'KL3' }, { name: 'KL2', value: 'KL2' }, { name: 'KL1', value: 'KL1' },
    { name: 'LO9', value: 'LO9' }, { name: 'LO8', value: 'LO8' }, { name: 'LO7', value: 'LO7' },
    { name: 'LO6', value: 'LO6' }, { name: 'LO5', value: 'LO5' }, { name: 'LO4', value: 'LO4' },
    { name: 'LO3', value: 'LO3' }, { name: 'LO2', value: 'LO2' }, { name: 'LO1', value: 'LO1' },
    { name: 'KO9', value: 'KO9' }, { name: 'KO8', value: 'KO8' }, { name: 'KO7', value: 'KO7' },
    { name: 'KO6', value: 'KO6' }, { name: 'KO5', value: 'KO5' }, { name: 'KO4', value: 'KO4' },
    { name: 'KO3', value: 'KO3' }, { name: 'KO2', value: 'KO2' }, { name: 'KO1', value: 'KO1' },
    { name: 'HC9', value: 'HC9' }, { name: 'HC8', value: 'HC8' }, { name: 'HC7', value: 'HC7' },
    { name: 'HC6', value: 'HC6' }, { name: 'HC5', value: 'HC5' }, { name: 'HC4', value: 'HC4' },
    { name: 'HC3', value: 'HC3' }, { name: 'HC2', value: 'HC2' }, { name: 'HC1', value: 'HC1' },
    { name: 'KME (Knight Entombed)', value: 'KME' },
    { name: 'LM? (Evaluation)', value: 'LM?' }, { name: 'KM? (Evaluation)', value: 'KM?' },
    { name: 'UX? (Evaluation)', value: 'UX?' }, { name: 'LL? (Evaluation)', value: 'LL?' },
    { name: 'KL? (Evaluation)', value: 'KL?' }, { name: 'LO? (Evaluation)', value: 'LO?' },
    { name: 'KO? (Evaluation)', value: 'KO?' }, { name: 'HC? (Evaluation)', value: 'HC?' }
];

// Helper function to calculate days since last promotion
function calculateDaysSinceLastPromotion(lastPromotionDate) {
    if (!lastPromotionDate) return null;
    
    const lastPromotion = new Date(lastPromotionDate);
    const today = new Date();
    const timeDiff = today.getTime() - lastPromotion.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    
    return daysDiff;
}

// Helper function to check if user has required permissions
function hasPermission(member) {
    if (!member) return false;
    
    // Check if user has Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Check if user has any of the allowed roles
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// Helper function to validate rank codes
function isValidRankCode(rankCode) {
    const validCodes = ALL_RANK_CHOICES.map(choice => choice.value);
    return validCodes.includes(rankCode.toUpperCase());
}

// Common rank assignment function (used by both command types)
async function assignRankInternal(member, rankCode, context = null) {
    // Normalize the rank code - replace O with 0 for consistent matching
    const normalizedRankCode = rankCode.replace(/O/g, '0').toUpperCase();
    rankCode = rankCode.toUpperCase(); // Ensure original is uppercase for display

    const roleMappings = {
        0: { L: '1168215961757810779', K: '1168214951446454352', H: '1168234521301356715', U: '1370534162179555488' },
        1: { M: '1173822915574251570', L: '1173822842442367026', O: '1173822697956982794', C: '1173822659071578182', X: '1373070720258670712', S: '1168233382577197086' },
        2: { 9: '1173823132260384899', 8: '1173823130742050907', 7: '1173823129810911254', 6: '1173823128976228473', 5: '1173823127977996399', 4: '1173823125918588969', 3: '1173823121942396978', 2: '1173823118163325009', 1: '1173822995198902362' }
    };
    
    const combinationMappings = {
        UX9: ['1168221758126567559'], UX8: ['1168221758126567559'], UX7: ['1370535832796135524'], UX6: ['1370535832796135524'], UX5: ['1370535832796135524'], UX4: ['1370535832796135524'], UX3: ['1370535832796135524'], UX2: ['1370535832796135524'], UX1: ['1370535832796135524'], 
        LM9: ['1168221758126567559'], LM8: ['1168221758126567559'], LM7: ['1168230900945928274'], LM6: ['1168230900945928274'], LM5: ['1168230900945928274'], LM4: ['1168230900945928274'], LM3: ['1168230900945928274'], LM2: ['1168230900945928274'], LM1: ['1168230900945928274'], 
        KS9: ['1168233497467551784'], KS8: ['1168233497467551784'], KS7: ['1168233497467551784'], KS6: ['1168233497467551784'], KS5: ['1168233497467551784'], KS4: ['1168233497467551784'], KS3: ['1168233497467551784'], KS2: ['1168233497467551784'], KS1: ['1168233497467551784'],
        LL9: ['1168233049784324136', '1304192533533819002'], LL8: ['1168233049784324136', '1304192533533819002'], LL7: ['1168233049784324136', '1304192533533819002'], LL6: ['1168233049784324136', '1304192533533819002'], LL5: ['1168233049784324136', '1304192533533819002'], LL4: ['1168233175391142008', '1304192533533819002'], LL3: ['1168233175391142008', '1304192533533819002'], LL2: ['1168233175391142008', '1304192533533819002'], LL1: ['1168233175391142008', '1304192533533819002'],
        LO9: ['1168233227455037551'], LO8: ['1168233227455037551'], LO7: ['1168233227455037551'], LO6: ['1168233227455037551'], LO5: ['1168233227455037551'], LO4: ['1168233227455037551'], LO3: ['1168233227455037551'], LO2: ['1168233227455037551'], LO1: ['1168233227455037551'],
        KM9: ['1168233382577197086'], KM8: ['1168233382577197086'], KM7: ['1168233497467551784'], KM6: ['1168233497467551784'], KM5: ['1168233497467551784'], KM4: ['1168233497467551784'], KM3: ['1168233497467551784'], KM2: ['1168233497467551784'], KM1: ['1168233497467551784'],
        KL9: ['1168233555596415087', '1304192471806246953'], KL8: ['1168233555596415087', '1304192471806246953'], KL7: ['1168233555596415087', '1304192471806246953'], KL6: ['1168233555596415087', '1304192471806246953'], KL5: ['1168233555596415087', '1304192471806246953'], KL4: ['1168233555596415087', '1304192471806246953'], KL3: ['1168233555596415087', '1304192471806246953'], KL2: ['1168233555596415087', '1304192471806246953'], KL1: ['1168233555596415087', '1304192471806246953'],
        KO9: ['1168234361708089454'], KO8: ['1168234361708089454'], KO7: ['1168234361708089454'], KO6: ['1168234361708089454'], KO5: ['1168234361708089454'], KO4: ['1168234361708089454'], KO3: ['1168234361708089454'], KO2: ['1168234361708089454'], KO1: ['1168234361708089454'],
        HC9: ['1176977627580469258'], HC8: ['1176977627580469258'], HC7: ['1176977627580469258'], HC6: ['1176977627580469258'], HC5: ['1176977627580469258'], HC4: ['1176977627580469258'], HC3: ['1176977627580469258'], HC2: ['1176977627580469258'], HC1: ['1176977627580469258']
    };
    
    // Create a normalized version of combinationMappings for lookup
    const normalizedCombinationMappings = {};
    for (const [key, value] of Object.entries(combinationMappings)) {
        const normalizedKey = key.replace(/O/g, '0');
        normalizedCombinationMappings[normalizedKey] = value;
    }

    const LLRole = '1304192533533819002';
    const KLRole = '1304192471806246953';
    const EntombedRole = '1420243837527527574';
    const KnightRole = '1168214951446454352';
    const KnightTitleRole = '1168233497467551784';
    
    const divisionRoles = [
        '1168214951446454352',
        '1168215961757810779', 
        '1168234521301356715',
        '1370534162179555488'
    ];

    const rankOrder = [
        "UX9", "UX8", "UX7", "UX6", "UX5", "UX4", "UX3", "UX2", "UX1",
        "LM9", "LM8", "LM7", "LM6", "LM5", "LM4", "LM3", "LM2", "LM1",
        "KM9", "KM8", "KM7", "KM6", "KM5", "KM4", "KM3", "KM2", "KM1",
        "KS9", "KS8", "KS7", "KS6", "KS5", "KS4", "KS3", "KS2", "KS1",
        "LL9", "LL8", "LL7", "LL6", "LL5", "LL4", "LL3", "LL2", "LL1",
        "KL9", "KL8", "KL7", "KL6", "KL5", "KL4", "KL3", "KL2", "KL1",
        "L09", "L08", "L07", "L06", "L05", "L04", "L03", "L02", "L01",
        "K09", "K08", "K07", "K06", "K05", "K04", "K03", "K02", "K01",
        "HC9", "HC8", "HC7", "HC6", "HC5", "HC4", "HC3", "HC2", "HC1"
    ];

    function compareRanks(currentRank, newRank) {
        const normalizeRank = (rank) => rank.replace(/O/g, "0").toUpperCase();
        const cleanCurrentRank = normalizeRank(currentRank);
        const cleanNewRank = normalizeRank(newRank);

        const currentIndex = rankOrder.indexOf(cleanCurrentRank);
        const newIndex = rankOrder.indexOf(cleanNewRank);

        if (currentIndex === -1 || newIndex === -1) {
            console.error(`Rank not found in rankOrder: ${cleanCurrentRank} or ${cleanNewRank}`);
            return false;
        }

        return newIndex > currentIndex;
    }

    const extraRoleId = '1179511435471093851';
    const conflictingRoles = ['1168925938692669554', '1180258600132821102', '1168254522980843602'];
    const rankAscensionChannelId = '1303837974521315449';
    const entombedChannelId = '1168288242613899284';
    const ERROR_LOG_CHANNEL_ID = '1168237930091913267';

    console.log(`Processing rank change for ${member.user.tag}: ${rankCode} (normalized: ${normalizedRankCode})`);

    const currentRoles = new Set(member.roles.cache.map(role => role.id));
    const rolesToAdd = [];
    const rolesToRemove = new Set();

    // Check if this is a KME assignment OR a rank reset with "?"
    const isBecomingKME = rankCode === 'KME';
    const isRankReset = rankCode.endsWith('?');
    const wasEntombed = currentRoles.has(EntombedRole);
    const isKnight = currentRoles.has(KnightRole);

    // Handle rank reset with "?" - only update nickname, no role changes
    if (isRankReset) {
        // Clean up the nickname - remove any existing rank brackets including evaluation ranks
        const cleanNickname = member.displayName
            .replace(/\[\w+\?\]/g, '')  // Remove evaluation ranks like [LM?]
            .replace(/\[\w+\d\]/g, '')  // Remove regular ranks like [LM8]
            .replace(/\[KME\]/g, '')    // Remove KME
            .replace(/\s+/g, ' ')       // Collapse multiple spaces
            .trim();
        
        const newNickname = `[${rankCode}] ${cleanNickname}`;
        await member.setNickname(newNickname);
        
        const embed = new EmbedBuilder()
            .setTitle('Rank Reset')
            .setDescription(`Rank reset to evaluation status for ${member.displayName}.`)
            .setColor('#FFFF00');
        
        // Send response if context allows
        if (context && context.editReply) {
            await context.editReply({ embeds: [embed] });
        } else if (context && context.channel) {
            await context.channel.send({ embeds: [embed] });
        }
        return;
    }

    // Handle KME (Knight Entombed) assignment
    if (isBecomingKME) {
        // Ensure they have the Knight role
        if (!isKnight) {
            throw new Error(`Cannot entomb ${member.user.tag} - only Knights can be entombed.`);
        }
        
        // Add Entombed role
        if (!currentRoles.has(EntombedRole)) {
            rolesToAdd.push(EntombedRole);
        }
        
        // Remove Knight role
        if (currentRoles.has(KnightRole)) {
            rolesToRemove.add(KnightRole);
        }
        
        // Remove Knight title role
        if (currentRoles.has(KnightTitleRole)) {
            rolesToRemove.add(KnightTitleRole);
        }
        
        // Remove all rank roles but preserve other division roles (L, H, U)
        for (let i = 0; i < 3; i++) {
            const roleIds = Object.values(roleMappings[i]);
            for (const roleId of roleIds) {
                // Keep only non-Knight division roles
                if (i === 0 && divisionRoles.includes(roleId) && roleId !== KnightRole) {
                    continue; // Keep L, H, U division roles
                }
                // Remove all other roles
                if (currentRoles.has(roleId)) {
                    rolesToRemove.add(roleId);
                }
            }
        }
        
        // Remove LL and KL roles
        if (currentRoles.has(LLRole)) rolesToRemove.add(LLRole);
        if (currentRoles.has(KLRole)) rolesToRemove.add(KLRole);
        if (currentRoles.has(extraRoleId)) rolesToRemove.add(extraRoleId);
        
        // Remove all title roles from combinationMappings
        for (const roleIds of Object.values(combinationMappings)) {
            roleIds.forEach(roleId => {
                if (currentRoles.has(roleId)) {
                    rolesToRemove.add(roleId);
                }
            });
        }
        
        // Save to database when entombing a Knight as KME
        const currentRankMatch = member.nickname?.match(/\[(\w+\d)\]/);
        const currentRank = currentRankMatch ? currentRankMatch[1] : 'KM1';

        const saved = await saveEntombedKnight(member.id, member.user.tag, currentRank);
        if (!saved) {
            console.error('Error saving KME entombment data to database');
        } else {
            console.log(`KME ${member.user.tag} saved to database with rank ${currentRank}`);
        }
        
    } else {
        // NORMAL RANK ASSIGNMENT
        
        // Remove Entombed role if present (only for Knights being restored)
        if (currentRoles.has(EntombedRole)) {
            rolesToRemove.add(EntombedRole);
        }

        // Get the title roles for this rank code (using normalized lookup)
        const newCombinationRoles = normalizedCombinationMappings[normalizedRankCode] || [];
        console.log(`Title roles for ${normalizedRankCode}:`, newCombinationRoles);

        // Remove ALL old title roles from combinationMappings
        for (const roleIds of Object.values(combinationMappings)) {
            roleIds.forEach(roleId => {
                if (currentRoles.has(roleId) && !newCombinationRoles.includes(roleId)) {
                    rolesToRemove.add(roleId);
                }
            });
        }

        // Remove old rank roles
        for (let i = 0; i < 3; i++) {
            const roleIds = Object.values(roleMappings[i]);
            for (const roleId of roleIds) {
                if (currentRoles.has(roleId)) {
                    rolesToRemove.add(roleId);
                }
            }
        }

        // Add new rank roles based on rankCode
        for (let i = 0; i < rankCode.length; i++) {
            const char = rankCode[i];
            const roleId = roleMappings[i][char.toUpperCase()];
            if (roleId) {
                if (!currentRoles.has(roleId)) {
                    rolesToAdd.push(roleId);
                } else {
                    rolesToRemove.delete(roleId);
                }
            } else {
                throw new Error(`Invalid character ${char} in position ${i + 1} of rank code.`);
            }
        }

        // Add new title roles
        newCombinationRoles.forEach(roleId => {
            if (!currentRoles.has(roleId)) {
                rolesToAdd.push(roleId);
            } else {
                rolesToRemove.delete(roleId);
            }
        });

        // Handle LL/KL roles
        if (normalizedRankCode.startsWith('LL') && !currentRoles.has(LLRole)) {
            rolesToAdd.push(LLRole);
        } else if (!normalizedRankCode.startsWith('LL') && currentRoles.has(LLRole)) {
            rolesToRemove.add(LLRole);
        }

        if (normalizedRankCode.startsWith('KL') && !currentRoles.has(KLRole)) {
            rolesToAdd.push(KLRole);
        } else if (!normalizedRankCode.startsWith('KL') && currentRoles.has(KLRole)) {
            rolesToRemove.add(KLRole);
        }

        // Handle extra role
        if (newCombinationRoles.includes('1168233497467551784') || 
            newCombinationRoles.includes('1168233555596415087') || 
            newCombinationRoles.includes('1168234361708089454')) {
            if (!currentRoles.has(extraRoleId)) {
                rolesToAdd.push(extraRoleId);
            } else {
                rolesToRemove.delete(extraRoleId);
            }
        } else {
            if (currentRoles.has(extraRoleId)) {
                rolesToRemove.add(extraRoleId);
            }
        }
    }

    // Remove conflicting roles
    for (const conflictingRoleId of conflictingRoles) {
        if (currentRoles.has(conflictingRoleId)) {
            rolesToRemove.add(conflictingRoleId);
        }
    }

    console.log('Roles to add:', rolesToAdd);
    console.log('Roles to remove:', Array.from(rolesToRemove));

    // OPTIMIZED: Batch role operations with delays to avoid rate limits
    if (rolesToRemove.size > 0) {
        await member.roles.remove(Array.from(rolesToRemove));
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd);
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Handle nickname - FIXED: Properly handle evaluation rank replacement
    if (isBecomingKME) {
        const newNickname = member.displayName
            .replace(/\[\w+\?\]/g, '')  // Remove evaluation ranks
            .replace(/\[\w+\d\]/g, '')  // Remove regular ranks
            .replace(/\[KME\]/g, '')    // Remove any existing KME
            .replace(/\s+/g, ' ')       // Collapse multiple spaces
            .trim();
        await member.setNickname(`[KME] ${newNickname}`);
    } else {
        const currentNickname = member.displayName || member.user.username;
        
        // Check for current rank in nickname (both regular and evaluation)
        const currentRankMatch = currentNickname.match(/\[(\w+\d)\]/) || currentNickname.match(/\[(\w+\?)\]/);
        const currentRankCode = currentRankMatch ? currentRankMatch[1].replace(/O/g, "0").toUpperCase() : null;

        if (!rankOrder.includes(normalizedRankCode)) {
            throw new Error(`Invalid rank code: ${rankCode}. Please provide a valid rank.`);
        }

        // Only check for ascension if current rank is a valid rank (not evaluation)
        let isAscension = true;
        if (currentRankCode && rankOrder.includes(currentRankCode)) {
            isAscension = compareRanks(currentRankCode, normalizedRankCode);
        }

        // Use the original rankCode for display
        const nicknameRankCode = rankCode.toUpperCase();
        
        // Clean the nickname - remove any existing rank brackets (including evaluation)
        const cleanNickname = currentNickname
            .replace(/\[\w+\?\]/g, '')  // Remove evaluation ranks like [LM?]
            .replace(/\[\w+\d\]/g, '')  // Remove regular ranks like [LM8]
            .replace(/\[KME\]/g, '')    // Remove KME
            .replace(/\s+/g, ' ')       // Collapse multiple spaces
            .trim();
        
        const newNickname = `[${nicknameRankCode}] ${cleanNickname}`;
        await member.setNickname(newNickname);

        if (isAscension && member.guild) {
            let fourthRoleName = 'Unknown Role';
            const combinationRoleIds = normalizedCombinationMappings[normalizedRankCode] || [];
            
            if (combinationRoleIds.length > 0) {
                const fourthRoleId = combinationRoleIds[0];
                const role = member.guild.roles.cache.get(fourthRoleId);
                if (role) {
                    fourthRoleName = role.name.startsWith("Title - ")
                        ? role.name.replace("Title - ", "")
                        : role.name;
                }
            }

            const ascensionChannel = member.guild.channels.cache.get(rankAscensionChannelId);
            if (ascensionChannel) {
                const ascensionEmbed = new EmbedBuilder()
                    .setTitle('Rank Ascension')
                    .setDescription(`Congratulations ${member}, you have achieved **${fourthRoleName} Rank ${nicknameRankCode.slice(-1)}** and thus attained **${nicknameRankCode}**!\n\nAs you continue to climb the ranks of BlightVeil, remember...\n**By Any Means, We Prosper!**`)
                    .setColor('#FFD700');
                await ascensionChannel.send({ content: `${member}`, embeds: [ascensionEmbed] });
            }
        }
    }

    // Handle KME announcements
    if (isBecomingKME && !wasEntombed && member.guild) {
        const entombedChannel = member.guild.channels.cache.get(entombedChannelId);
        if (entombedChannel) {
            const entombedMessage = `🏰 **A Knight Has Been Entombed!** 🏰\n\n` +
                                   `The once-valiant Knight **${member.displayName}** has taken their place among the silent guardians of BlightVeil.\n\n` +
                                   `*"Even in death, their honor remains eternal."*`;
            
            const entombedEmbed = new EmbedBuilder()
                .setTitle('🧊 Knight Entombed 🧊')
                .setDescription(entombedMessage)
                .setColor('#2F3136')
                .setTimestamp();
            
            await entombedChannel.send({ embeds: [entombedEmbed] });
        }
    }

    // UPDATE LAST PROMOTION DATE IN DATABASE
    // Only update for actual rank changes, not for KME or evaluation ranks
    if (!isBecomingKME && !isRankReset) {
        const dbUpdated = await updateLastPromotion(member.id, rankCode);
        if (dbUpdated) {
            console.log(`Updated last promotion date for ${member.user.tag} to rank ${rankCode}`);
            
            // Get previous promotion info for comparison
            const previousPromotion = await getLastPromotion(member.id);
            if (previousPromotion) {
                const daysSinceLast = calculateDaysSinceLastPromotion(previousPromotion.last_promotion_date);
                console.log(`User was last promoted ${daysSinceLast} days ago to ${previousPromotion.rank_code}`);
            }
        } else {
            console.error('Failed to update last promotion date in database');
        }
    }

    // Return success message if context allows
    if (context && (context.editReply || context.channel)) {
        const embed = new EmbedBuilder()
            .setTitle('Rank Change')
            .setDescription(`Roles and nickname updated for ${member.displayName}.`)
            .setColor('#00FF00');
        
        // Add promotion info to the embed if applicable
        if (!isBecomingKME && !isRankReset) {
            const previousPromotion = await getLastPromotion(member.id);
            if (previousPromotion) {
                const daysSinceLast = calculateDaysSinceLastPromotion(previousPromotion.last_promotion_date);
                embed.addFields(
                    { name: 'Previous Rank', value: previousPromotion.rank_code, inline: true },
                    { name: 'Days Since Last Promotion', value: daysSinceLast?.toString() || 'N/A', inline: true }
                );
            }
        }
        
        if (context.editReply) {
            await context.editReply({ embeds: [embed] });
        } else if (context.channel) {
            await context.channel.send({ embeds: [embed] });
        }
    }
}

// ================== AUTCOMPLETE HANDLER ==================
async function autocompleteHandler(interaction) {
    const focusedValue = interaction.options.getFocused();
    const focusedOption = interaction.options.getFocused(true);
    
    // Only handle autocomplete for rank_code option
    if (focusedOption.name !== 'rank_code') {
        await interaction.respond([]);
        return;
    }
    
    // Filter choices based on user input
    const filtered = ALL_RANK_CHOICES.filter(choice => 
        choice.name.toLowerCase().includes(focusedValue.toLowerCase()) ||
        choice.value.toLowerCase().includes(focusedValue.toLowerCase())
    ).slice(0, 25); // Discord shows max 25 suggestions at a time
    
    await interaction.respond(filtered);
}

module.exports = {
    // ================== PREFIX COMMAND VERSION (!rank) ==================
    name: 'rank',
    description: 'Assigns roles and sets nickname based on a dynamic rank code',
    async execute(message, args) {
        // Check if message.author exists (for programmatic calls)
        if (!message.author) {
            // If called programmatically, skip rate limiting and permission checks
            console.log('Rank command called programmatically, skipping rate limiting and permission checks');
        } else {
            // Rate limiting - 5 seconds between commands
            const now = Date.now();
            const cooldown = 5000;
            const lastUsed = rateLimit.get(message.author.id);
            
            if (lastUsed && (now - lastUsed) < cooldown) {
                return message.channel.send(`Please wait ${Math.ceil((cooldown - (now - lastUsed)) / 1000)} seconds before using this command again.`);
            }
            rateLimit.set(message.author.id, now);
            
            // Permission check for prefix command
            const member = message.member;
            if (!member) {
                return message.channel.send('Unable to verify your permissions. Please try again in a server channel.');
            }
            
            if (!hasPermission(member)) {
                const embed = new EmbedBuilder()
                    .setTitle('Permission Denied')
                    .setDescription('You do not have permission to use this command.')
                    .addFields(
                        { name: 'Required Roles', value: 'SOV, Steward, HC, Overseers, Knights Leader, or Legion Leader' },
                        { name: 'Alternative', value: 'Administrator permission' }
                    )
                    .setColor('#FF0000');
                return message.channel.send({ embeds: [embed] });
            }
        }

        if (args.length < 2) {
            return message.channel.send('Usage: !rank rank_code user.tag');
        }

        let rankCode = args[0].toUpperCase();
        const userTag = args[1];

        // Validate rank code for prefix command
        if (!isValidRankCode(rankCode)) {
            return message.channel.send(`Invalid rank code: "${rankCode}". Please use a valid rank code like: LM8, UX9, KME, or LM?`);
        }

        try {
            // Get the guild from message
            const guild = message.guild;
            if (!guild) {
                return message.channel.send('Error: Could not find guild.');
            }

            // OPTIMIZED: Only fetch specific member instead of all guild members
            let member = guild.members.cache.find(m => m.user.tag.toLowerCase() === userTag.toLowerCase());
            
            if (!member) {
                // If member not in cache, fetch them specifically
                try {
                    const fetchedMembers = await guild.members.fetch({ query: userTag, limit: 1 });
                    member = fetchedMembers.first();
                } catch (fetchError) {
                    console.error('Error fetching member:', fetchError);
                }
                
                if (!member) {
                    return message.channel.send(`Member with user tag ${userTag} not found.`);
                }
            }

            // Call the internal rank assignment logic
            await assignRankInternal(member, rankCode, message);

        } catch (error) {
            console.error('Detailed error in rank command:', error);
            
            // Send error to dedicated error channel instead of the command channel
            const ERROR_LOG_CHANNEL_ID = '1168237930091913267';
            const errorChannel = message.guild?.channels?.cache?.get(ERROR_LOG_CHANNEL_ID);
            if (errorChannel) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('Rank Command Error')
                    .setDescription(`Error processing rank command: ${error.message}`)
                    .addFields(
                        { name: 'Command', value: `!rank ${args.join(' ')}`, inline: true },
                        { name: 'User', value: userTag, inline: true },
                        { name: 'Channel', value: message.channel?.toString() || 'Unknown', inline: true }
                    )
                    .setColor('#FF0000')
                    .setTimestamp();
                await errorChannel.send({ embeds: [errorEmbed] });
            }
            
            if (message.channel) {
                message.channel.send('There was an error assigning roles or setting the nickname.');
            }
        }
    },

    // ================== SLASH COMMAND VERSION (/rank) ==================
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Assign roles and set nickname based on a rank code')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageNicknames)
        .addStringOption(option =>
            option.setName('rank_code')
                .setDescription('The rank code (e.g., LM8, UX9, KME, or LM? for evaluation)')
                .setRequired(true)
                .setAutocomplete(true) // Enable autocomplete for this option
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to assign the rank to')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('custom_code')
                .setDescription('Custom rank code (if not in autocomplete)')
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        // Defer reply to give more time for processing
        await interaction.deferReply({ ephemeral: false });

        // Rate limiting - 5 seconds between commands
        const now = Date.now();
        const cooldown = 5000;
        const lastUsed = rateLimit.get(interaction.user.id);
        
        if (lastUsed && (now - lastUsed) < cooldown) {
            const waitTime = Math.ceil((cooldown - (now - lastUsed)) / 1000);
            return interaction.editReply(`Please wait ${waitTime} seconds before using this command again.`);
        }
        rateLimit.set(interaction.user.id, now);

        // Permission check for slash command
        const member = interaction.member;
        if (!member) {
            return interaction.editReply('Unable to verify your permissions. Please try again in a server channel.');
        }
        
        if (!hasPermission(member)) {
            const embed = new EmbedBuilder()
                .setTitle('Permission Denied')
                .setDescription('You do not have permission to use this command.')
                .addFields(
                    { name: 'Required Roles', value: 'SOV, Steward, HC, Overseers, Knights Leader, or Legion Leader' },
                    { name: 'Alternative', value: 'Administrator permission' }
                )
                .setColor('#FF0000');
            return interaction.editReply({ embeds: [embed] });
        }

        try {
            const rankCodeOption = interaction.options.getString('rank_code');
            const customCodeOption = interaction.options.getString('custom_code');
            const userOption = interaction.options.getUser('user');
            
            // Use custom code if provided, otherwise use autocomplete option
            let rankCode = customCodeOption || rankCodeOption;
            
            // Validate inputs
            if (!rankCode || typeof rankCode !== 'string') {
                return interaction.editReply('Please provide a valid rank code.');
            }
            
            if (!userOption) {
                return interaction.editReply('Please specify a user.');
            }

            // Convert and validate rank code
            rankCode = rankCode.toUpperCase().trim();
            
            // Validate the rank code
            if (!isValidRankCode(rankCode)) {
                return interaction.editReply(`Invalid rank code: "${rankCode}". Please use a valid rank code like: LM8, UX9, KME, or LM?`);
            }

            // Get member from guild
            const guild = interaction.guild;
            if (!guild) {
                return interaction.editReply('Error: Could not find guild.');
            }

            let member;
            try {
                member = await guild.members.fetch(userOption.id);
            } catch (error) {
                return interaction.editReply(`Member ${userOption.tag} not found in this server.`);
            }

            // Call the internal rank assignment logic
            await assignRankInternal(member, rankCode, interaction);

        } catch (error) {
            console.error('Detailed error in rank command:', error);
            
            // Send error to dedicated error channel
            const ERROR_LOG_CHANNEL_ID = '1168237930091913267';
            const errorChannel = interaction.guild?.channels?.cache?.get(ERROR_LOG_CHANNEL_ID);
            if (errorChannel) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('Rank Command Error')
                    .setDescription(`Error processing rank command: ${error.message}`)
                    .addFields(
                        { name: 'Command', value: `/rank`, inline: true },
                        { name: 'User', value: interaction.user.tag, inline: true },
                        { name: 'Target', value: interaction.options.getUser('user')?.tag || 'Unknown', inline: true },
                        { name: 'Rank Code', value: interaction.options.getString('rank_code') || 'Unknown', inline: true },
                        { name: 'Channel', value: interaction.channel?.toString() || 'Unknown', inline: true }
                    )
                    .setColor('#FF0000')
                    .setTimestamp();
                await errorChannel.send({ embeds: [errorEmbed] });
            }
            
            await interaction.editReply('There was an error assigning roles or setting the nickname.');
        }
    },

    // ================== AUTCOMPLETE HANDLER ==================
    autocomplete: autocompleteHandler,

    // ================== EXPORTED FUNCTIONALITY ==================
    // Internal rank assignment function that can be called programmatically
    assignRankInternal,
    
    // Helper function for external use
    hasPermission,
    
    // Promotion tracking helper functions
    calculateDaysSinceLastPromotion
};