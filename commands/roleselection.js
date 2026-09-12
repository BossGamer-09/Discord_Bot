const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'roleselection',
    description: 'Sends an embed for selecting or removing specific roles',
    async execute(message, args) {
        // Create the embed
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🎮 Optional Role Selection')
            .setDescription("Select the roles you want from the dropdown below. You can select multiple or none!\n\n**How it works:**\n• ✅ Select a role to add it\n• ❌ Deselect a role to remove it\n• You can change your selections anytime")
            .addFields(
                {
                    name: '💬 Chat & Content',
                    value: '• **Shittalk** - Less moderated PVP chat\n• **Media** - Content creation & sharing\n• **Issue Council** - Bug reporting/testing',
                    inline: true
                },
                {
                    name: '⚔️ Gaming & PVP',
                    value: '• **SCPVP** - Star Citizen PVP ops\n• **SCPiracy** - Piracy & combat events\n• **EVE Online** - EVE Online channels',
                    inline: true
                },
                {
                    name: '🎮 Control Setup',
                    value: '• **HOSAM** - Stick + Mouse\n• **HOSAS** - Dual sticks\n• **HOTAS** - Throttle + Stick\n• **Headtracker** - Head tracking\n• **Pedals** - Flight pedals\n• **KB/M** - Keyboard & Mouse',
                    inline: false
                },
                {
                    name: '🌍 Region',
                    value: '• **EU** - Europe\n• **NA** - North America\n• **OCE** - Australia/NZ',
                    inline: true
                },
                {
                    name: '🔔 Notifications',
                    value: '• **EXECHanger** - Hangar change alerts',
                    inline: true
                }
            )
            .setFooter({ text: 'You can update your selections anytime' })
            .setTimestamp();

        // Create the simplified select menu
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_optional_roles')
                    .setPlaceholder('Click to select/deselect roles')
                    .setMinValues(0)
                    .setMaxValues(16) // Allow selecting all or none
                    .addOptions([
                        // Chat & Content
                        {
                            label: 'Shittalk',
                            description: 'Less moderated PVP chat channel',
                            value: '1360292465961336902',
                            emoji: '💩'
                        },
                        {
                            label: 'Media',
                            description: 'Content creation & sharing',
                            value: '1360302092102930626',
                            emoji: '🎬'
                        },
                        {
                            label: 'Issue Council',
                            description: 'Bug reporting & testing',
                            value: '1353210962093801563',
                            emoji: '🐛'
                        },
                        
                        // Gaming & PVP
                        {
                            label: 'SCPVP',
                            description: 'Star Citizen PVP operations',
                            value: '1360302217499770922',
                            emoji: '⚔️'
                        },
                        {
                            label: 'SCPiracy',
                            description: 'Piracy & combat events',
                            value: '1395877928713326692',
                            emoji: '🏴‍☠️'
                        },
                        {
                            label: 'EVE Online',
                            description: 'EVE Online channels',
                            value: '1436273738734632980',
                            emoji: '🌌'
                        },
                        
                        // Control Setup
                        {
                            label: 'HOSAM',
                            description: 'Hands on Stick and Mouse',
                            value: '1365554822954225765',
                            emoji: '🎮'
                        },
                        {
                            label: 'HOSAS',
                            description: 'Dual sticks setup',
                            value: '1365554907985219584',
                            emoji: '🕹️'
                        },
                        {
                            label: 'HOTAS',
                            description: 'Throttle and Stick setup',
                            value: '1365554947726381108',
                            emoji: '✈️'
                        },
                        {
                            label: 'Headtracker',
                            description: 'Head tracking gear users',
                            value: '1365555089414164602',
                            emoji: '👁️'
                        },
                        {
                            label: 'Pedals',
                            description: 'Flight pedals users',
                            value: '1365555135371284592',
                            emoji: '👣'
                        },
                        {
                            label: 'KB/M',
                            description: 'Keyboard and Mouse players',
                            value: '1365555185618915328',
                            emoji: '⌨️'
                        },
                        
                        // Region
                        {
                            label: 'EU',
                            description: 'European players',
                            value: '1365555236894277722',
                            emoji: '🇪🇺'
                        },
                        {
                            label: 'NA',
                            description: 'North American players',
                            value: '1365555264127897711',
                            emoji: '🇺🇸'
                        },
                        {
                            label: 'OCE',
                            description: 'Australian/NZ players',
                            value: '1365555289440649296',
                            emoji: '🇦🇺'
                        },
                        
                        // Notifications
                        {
                            label: 'EXECHanger',
                            description: 'Hangar change notifications',
                            value: '1437704919191916614',
                            emoji: '🔀'
                        }
                    ])
            );

        // Send the message
        await message.channel.send({ 
            content: '**Select your roles below:**\nChoose the roles you want, leave them unchecked to remove them.',
            embeds: [embed], 
            components: [row] 
        });
    },
};