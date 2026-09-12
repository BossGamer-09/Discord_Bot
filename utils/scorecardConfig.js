module.exports = {
    // Allowed roles for scorecard management
    ALLOWED_ROLES: {
        INFANTRY: {
            overseer: '1308081895266844712',
            instructor: '1168327592269598760'
        },
        PILOT: {
            overseer: '1308081615083278378',
            instructor: '1168327555917557780'
        },
        CREWMAN: {
            overseer: '1308081958424940545',
            instructor: '1168327699203375114'
        },
        SUPPORT: {
            overseer: '1308082015622664262',
            instructor: '1168327804874661931'
        }
    },

    // Scorecard tags with emojis and colors
    TAGS: {
        PILOT: {
            emoji: '🛩️',
            color: '#2196F3',
            startGradient: '#0f1a1f',
            endGradient: '#1a2b4a'
        },
        INFANTRY: {
            emoji: '🎯',
            color: '#4CAF50',
            startGradient: '#0f1a1f',
            endGradient: '#1a2b3a'
        },
        SUPPORT: {
            emoji: '🛠️',
            color: '#FF9800',
            startGradient: '#1f0f0f',
            endGradient: '#3a1a2b'
        },
        CREWMAN: {
            emoji: '👨‍🔧',
            color: '#FFC107',
            startGradient: '#1f1a0f',
            endGradient: '#3a3a1a'
        }
    },

    // Score categories for v2
    CATEGORIES: {
        COMBAT: ['aim_snap', 'aim_tracking', 'aim_accuracy'],
        TACTICAL: ['teamplay', 'comms', 'strategy'],
        KNOWLEDGE: ['resource_management', 'game_knowledge'],
        LEADERSHIP: ['leadership'],
        MINDSET: ['mindset_growth']
    },

    // Score ranges and labels
    SCORE_RANGES: {
        9: { label: 'ELITE', color: '#FFD700' },
        8: { label: 'EXPERT', color: '#4CAF50' },
        7: { label: 'PROFICIENT', color: '#8BC34A' },
        6: { label: 'COMPETENT', color: '#CDDC39' },
        5: { label: 'DEVELOPING', color: '#FFC107' },
        4: { label: 'BASIC', color: '#FF9800' },
        0: { label: 'NOVICE', color: '#F44336' }
    },

    // Branding
    BRANDING: {
        PRIMARY_COLOR: '#9C27B0', // Purple
        SECONDARY_COLOR: '#673AB7',
        WATERMARK_URL: 'https://i.imgur.com/MC3poeX.png',
        SERVER_NAME: 'Blightveil'
    },

    // Database configuration
    DB_CONFIG: {
        SCORECARDS_TABLE: 'scorecards',
        HISTORY_TABLE: 'scorecard_history',
        DM_TRACKING_TABLE: 'scorecard_dm_tracking'
    }
};