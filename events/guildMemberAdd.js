const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const { AttachmentBuilder } = require('discord.js'); // Update from MessageAttachment to AttachmentBuilder
const fetch = require('node-fetch');
const sharp = require('sharp');

registerFont(path.resolve(__dirname, '../fonts/NewRocker-Regular.ttf'), { family: 'New Rocker' });

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            console.log('Event "guildMemberAdd" triggered.');

            const canvas = createCanvas(700, 250);
            const ctx = canvas.getContext('2d');

            // Load the background image
            const backgroundPath = path.resolve(__dirname, '../images/welcome banner1.png');
            const background = await loadImage(backgroundPath);
            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Fetch the avatar
            const avatarURL = member.user.displayAvatarURL({ format: 'png', size: 128 });
            console.log('Avatar URL:', avatarURL);

            const response = await fetch(avatarURL);
            if (!response.ok) throw new Error(`Failed to fetch avatar: ${response.statusText}`);
            const avatarBuffer = await response.buffer();

            // Convert the avatar to PNG format using sharp
            const avatarPngBuffer = await sharp(avatarBuffer).png().toBuffer();

            // Load the PNG buffer into canvas
            const avatar = await loadImage(avatarPngBuffer);

            const avatarSize = 100;
            const avatarX = 342;
            const avatarY = 115;

            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();

            ctx.font = '27px "New Rocker"';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('Welcome', avatarX + avatarSize + 20, 135);
            ctx.fillText(`${member.user.username}`, avatarX + avatarSize + 20, 170);
            ctx.fillText('to BlightVeil', avatarX + avatarSize + 20, 205);

            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' }); // Use AttachmentBuilder

            const channel = member.guild.channels.cache.get('1168228580526936124');
            if (!channel) return;

            channel.send({
                content: `Welcome <@${member.user.id}>,\nTo access the public area of the BlightVeil server you must go to the ⁠<#1217853203056689303> and follow the instructions provided.\n\nIf you have any questions about BlightVeil you can ask any of the organization's leadership or check out the ⁠<#1175140451951587398> channel.`,
                files: [attachment], // Send attachment with updated syntax
            });
        } catch (error) {
            console.error('Error in guildMemberAdd event handler:', error);
        }
    },
};
