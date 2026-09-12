const { EmbedBuilder, ChannelType, Events, AuditLogEvent, Colors } = require('discord.js');

module.exports = {
    name: 'actionLog',
    async execute(client) {
        console.log('Initializing Action Log...');

        const logChannelId = '1172764982132359258'; // Action log channel ID
        const logChannel = client.channels.cache.get(logChannelId);

        if (!logChannel || !logChannel.isTextBased()) {
            console.error(`Log channel with ID ${logChannelId} not found or is not text-based.`);
            return;
        }

        // Utility: Fetch Audit Logs
        const fetchAuditLog = async (guild, type, targetId = null) => {
            try {
                const logs = await guild.fetchAuditLogs({ type, limit: 5 });
                return targetId 
                    ? logs.entries.find(entry => entry.target?.id === targetId) || null 
                    : logs.entries.first();
            } catch (error) {
                console.error(`Failed to fetch audit logs: ${error.message}`);
                return null;
            }
        };

        // Utility: Send Log Embed
        const sendLogEmbed = async (logData) => {
            try {
                const embed = new EmbedBuilder()
                    .setColor(logData.color || Colors.Blue)
                    .setTitle(logData.title || 'Log Event')
                    .setDescription(logData.description || 'Details below')
                    .addFields(logData.fields || [])
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Failed to send log embed: ${error.message}`);
            }
        };

        // Centralized Event Handlers
        const eventHandlers = {
            [Events.GuildBanAdd]: async (ban) => {
                const auditEntry = await fetchAuditLog(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
                const executor = auditEntry?.executor?.tag || 'Unknown';
                const reason = auditEntry?.reason || 'No reason provided';

                await sendLogEmbed({
                    color: Colors.Red,
                    title: 'Member Banned',
                    description: `${ban.user.tag} was banned from the server.`,
                    fields: [
                        { name: 'Banned By', value: executor },
                        { name: 'Reason', value: reason }
                    ]
                });
            },
            [Events.GuildMemberRemove]: async (member) => {
                // Fetch the specific channel for exit logs
                const exitLogChannel = member.guild.channels.cache.get('1168237722926854164');
                if (!exitLogChannel || !exitLogChannel.isTextBased()) {
                    console.error('Exit log channel not found or is not text-based.');
                    return;
                }

                // Fetch audit log to check if the member was kicked
                const auditEntry = await fetchAuditLog(member.guild, AuditLogEvent.MemberKick, member.user.id);
                const executor = auditEntry?.executor?.tag || 'Unknown';

                // Send a generic "member left" message to the exit log channel with a ping
                const leaveEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle('A user has left the server')
                    .setDescription(`<@${member.id}> (${member.user.tag}) has left.`); // Ping + Username
                await exitLogChannel.send({ embeds: [leaveEmbed] });

                // If the member was kicked, add additional information to the exit log channel
                if (auditEntry) {
                    const kickEmbed = new EmbedBuilder()
                        .setColor(Colors.Orange)
                        .setTitle('Member Kicked')
                        .setDescription(`<@${member.id}> (${member.user.tag}) was kicked from the server.`)
                        .addFields([{ name: 'Kicked By', value: executor }]);
                    await exitLogChannel.send({ embeds: [kickEmbed] });
                }
            },
            [Events.MessageUpdate]: async (oldMessage, newMessage) => {
                if (oldMessage.partial) await oldMessage.fetch();
                if (newMessage.partial) await newMessage.fetch();

                // Ignore if there was no content before the edit
                if (!oldMessage.content) return;

                const oldContent = oldMessage.content || '[No Content]';
                const newContent = newMessage.content || '[No Content]';

                // Ignore if the content has not changed
                if (oldContent === newContent) return;

                await sendLogEmbed({
                    color: Colors.Orange,
                    title: 'Message Edited',
                    description: `Message from ${newMessage.author?.tag || 'Unknown'} edited in ${newMessage.channel}.`,
                    fields: [
                        { name: 'Before', value: oldContent, inline: true },
                        { name: 'After', value: newContent, inline: true }
                    ],
                    timestamp: new Date()
                });
            },
            [Events.MessageDelete]: async (message) => {
                if (!message.guild) return;

                await sendLogEmbed({
                    color: Colors.Red,
                    title: 'Message Deleted',
                    description: `A message from ${message.author?.tag || 'Unknown'} was deleted in ${message.channel}.`,
                    fields: [
                        { name: 'Content', value: message.content || '[No Content]', inline: false }
                    ]
                });
            },
            [Events.ChannelCreate]: async (channel) => {
                const auditEntry = await fetchAuditLog(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
                const executor = auditEntry?.executor?.tag || 'Unknown';

                const channelType = {
                    [ChannelType.GuildText]: 'Text',
                    [ChannelType.GuildVoice]: 'Voice',
                    [ChannelType.GuildCategory]: 'Category',
                    [ChannelType.GuildAnnouncement]: 'Announcement'
                }[channel.type] || 'Other';

                await sendLogEmbed({
                    color: Colors.Green,
                    title: 'Channel Created',
                    description: `A new ${channelType} channel was created: ${channel.name}.`,
                    fields: [{ name: 'Created By', value: executor }]
                });
            },
            [Events.ChannelDelete]: async (channel) => {
                const auditEntry = await fetchAuditLog(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
                const executor = auditEntry?.executor?.tag || 'Unknown';

                const channelType = {
                    [ChannelType.GuildText]: 'Text',
                    [ChannelType.GuildVoice]: 'Voice',
                    [ChannelType.GuildCategory]: 'Category',
                    [ChannelType.GuildAnnouncement]: 'Announcement'
                }[channel.type] || 'Other';

                await sendLogEmbed({
                    color: Colors.Red,
                    title: 'Channel Deleted',
                    description: `A ${channelType} channel was deleted: ${channel.name || '[Unknown Name]'}.`,
                    fields: [{ name: 'Deleted By', value: executor }]
                });
            },
            [Events.VoiceStateUpdate]: async (oldState, newState) => {
                const member = newState.member;
                const guild = member.guild;

                // Detect server mute changes
                if (oldState.serverMute !== newState.serverMute) {
                    const action = newState.serverMute ? 'Server Muted' : 'Server Unmuted';
                    const auditEntry = await fetchAuditLog(guild, AuditLogEvent.MemberUpdate, member.id);
                    const executor = auditEntry?.executor?.tag || 'Unknown';

                    // Skip if action is "Unknown"
                    if (executor === 'Unknown') return;

                    await sendLogEmbed({
                        color: newState.serverMute ? Colors.Red : Colors.Green,
                        title: `Member ${action}`,
                        description: `${member.user.tag} was ${action.toLowerCase()}.`,
                        fields: [{ name: 'Action By', value: executor }]
                    });
                }

                // Detect server deafen changes
                if (oldState.serverDeaf !== newState.serverDeaf) {
                    const action = newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened';
                    const auditEntry = await fetchAuditLog(guild, AuditLogEvent.MemberUpdate, member.id);
                    const executor = auditEntry?.executor?.tag || 'Unknown';

                    // Skip if action is "Unknown"
                    if (executor === 'Unknown') return;

                    await sendLogEmbed({
                        color: newState.serverDeaf ? Colors.Red : Colors.Green,
                        title: `Member ${action}`,
                        description: `${member.user.tag} was ${action.toLowerCase()}.`,
                        fields: [{ name: 'Action By', value: executor }]
                    });
                }
            },
        };

        // Register Event Handlers
        for (const [event, handler] of Object.entries(eventHandlers)) {
            client.on(event, (...args) => handler(...args).catch(err => console.error(`Error in ${event}: ${err.message}`)));
        }

        console.log('Action Log Initialized.');
    }
};