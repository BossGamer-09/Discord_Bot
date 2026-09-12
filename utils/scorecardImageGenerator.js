const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

// Register fonts
try {
    registerFont(path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });
    registerFont(path.join(__dirname, '../assets/fonts/Roboto-Regular.ttf'), { family: 'Roboto', weight: 'normal' });
    registerFont(path.join(__dirname, '../assets/fonts/Roboto-Light.ttf'), { family: 'Roboto', weight: '300' });
} catch (error) {
    console.log('Custom fonts not found, using system fonts');
}

class ScorecardImageGenerator {
    constructor() {
        this.width = 1200;
        this.height = 1800;
        this.padding = 60;
    }

    async generateScorecardImage(user, scorecard, tag, guild, previousScores = null) {
        console.log(`[DEBUG] generateScorecardImage called with:`, {
            user: typeof user === 'object' ? user.username : user,
            tag: tag,
            guildProvided: !!guild,
            guildId: guild?.id,
            hasPreviousScores: !!previousScores,
            version: scorecard.version || 1
        });

        const canvas = createCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');

        await this.drawCleanBackground(ctx, tag);
        await this.drawCompleteHeader(ctx, user, tag, guild);
        await this.drawAllScoresWithComparison(ctx, scorecard, tag, previousScores);
        await this.drawOverallRatingWithComparison(ctx, scorecard, tag, previousScores);
        await this.drawFooter(ctx, scorecard.version || 1);

        return canvas;
    }

    async drawCleanBackground(ctx, tag) {
        const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
        const colors = {
            'Infantry': { start: '#0f1a1f', end: '#1a2b3a' },
            'Pilot': { start: '#0f1a1f', end: '#1a2b4a' },
            'Support': { start: '#1f0f0f', end: '#3a1a2b' },
            'Crewman': { start: '#1f1a0f', end: '#3a3a1a' }
        };
        
        const colorSet = colors[tag] || colors['Infantry'];
        gradient.addColorStop(0, colorSet.start);
        gradient.addColorStop(1, colorSet.end);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    async drawCompleteHeader(ctx, user, tag, guild) {
        const headerHeight = 180;
        
        // Header background
        const headerGradient = ctx.createLinearGradient(0, 0, 0, headerHeight);
        headerGradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
        headerGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        
        ctx.fillStyle = headerGradient;
        ctx.fillRect(0, 0, this.width, headerHeight);
        
        // Accent bar
        const accentColor = this.getTagColor(tag);
        ctx.fillStyle = accentColor;
        ctx.fillRect(0, 0, this.width, 6);
        
        // Title
        ctx.font = 'bold 36px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('BLIGHTVEIL SCORECARD', this.width / 2, 60);
        
        // Get display name
        let displayName;
        
        if (typeof user === 'object' && user.id && user.username) {
            console.log(`[DEBUG] Processing Discord User object: ${user.username} (ID: ${user.id})`);
            
            if (guild) {
                try {
                    console.log(`[DEBUG] Fetching member ${user.id} from guild ${guild.id}`);
                    const member = await guild.members.fetch(user.id);
                    
                    // Use nickname if available, otherwise use username
                    displayName = member.nickname || user.username;
                    console.log(`[DEBUG] Member fetched - Nickname: "${member.nickname}", Username: "${user.username}", Final: "${displayName}"`);
                    
                } catch (error) {
                    console.log(`[DEBUG] Member fetch failed: ${error.message}, using username`);
                    displayName = user.username;
                }
            } else {
                console.log(`[DEBUG] No guild provided, using username: ${user.username}`);
                displayName = user.username;
            }
        } else if (typeof user === 'string') {
            console.log(`[DEBUG] Username string provided: "${user}" - cannot fetch nickname without User object`);
            displayName = user;
        } else {
            console.log(`[DEBUG] Invalid user type: ${typeof user}, using string representation`);
            displayName = String(user);
        }
        
        // Username display with truncation if too long
        ctx.font = 'bold 32px Roboto, Arial, sans-serif';
        const finalDisplayName = displayName && displayName.length > 20 ? displayName.substring(0, 18) + '...' : displayName;
        ctx.fillText(finalDisplayName, this.width / 2, 110);
        
        // Tag badge
        const tagEmoji = this.getTagEmoji(tag);
        const badgeText = `${tagEmoji} ${tag.toUpperCase()}`;
        const badgeWidth = ctx.measureText(badgeText).width + 40;
        
        ctx.fillStyle = accentColor;
        this.drawRoundedRect(ctx, (this.width - badgeWidth) / 2, 125, badgeWidth, 40, 8);
        ctx.fill();
        
        ctx.font = 'bold 18px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(badgeText, this.width / 2, 152);
    }

    async drawAllScoresWithComparison(ctx, scorecard, tag, previousScores = null) {
        const startY = 220;
        const columnWidth = (this.width - (this.padding * 3)) / 2;
        const rowHeight = 70;
        
        // Section title with change indicator
        let sectionTitle = 'SKILLS';
        if (previousScores) {
            sectionTitle += '•Updated';
        }
        
        ctx.font = 'bold 24px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(sectionTitle, this.width / 2, startY - 10);
        
        // Categories with actual scores - Leadership is marked as non-scoring
        const categories = [
            // Left Column - Combat Skills
            { 
                name: 'Aim - Snap', 
                score: scorecard.aim_snap, 
                previous: previousScores ? previousScores.aim_snap : null,
                countsTowardOverall: true
            },
            { 
                name: 'Aim - Tracking', 
                score: scorecard.aim_tracking, 
                previous: previousScores ? previousScores.aim_tracking : null,
                countsTowardOverall: true
            },
            { 
                name: 'Aim - Accuracy', 
                score: scorecard.aim_accuracy, 
                previous: previousScores ? previousScores.aim_accuracy : null,
                countsTowardOverall: true
            },
            { 
                name: 'Aim - Average', 
                score: scorecard.aim_avg, 
                previous: previousScores ? previousScores.aim_avg : null,
                countsTowardOverall: true
            },
            
            // Right Column - Tactical & Support Skills  
            { 
                name: 'Teamplay', 
                score: scorecard.teamplay, 
                previous: previousScores ? previousScores.teamplay : null,
                countsTowardOverall: true
            },
            { 
                name: 'Comms', 
                score: scorecard.comms, 
                previous: previousScores ? previousScores.comms : null,
                countsTowardOverall: true
            },
            { 
                name: 'Strategy', 
                score: scorecard.strategy, 
                previous: previousScores ? previousScores.strategy : null,
                countsTowardOverall: true
            },
            { 
                name: 'Resource Management', 
                score: scorecard.resource_management, 
                previous: previousScores ? previousScores.resource_management : null,
                countsTowardOverall: true
            },
            { 
                name: 'Game Knowledge', 
                score: scorecard.game_knowledge, 
                previous: previousScores ? previousScores.game_knowledge : null,
                countsTowardOverall: true
            },
            // NEW CATEGORIES - Leadership doesn't count toward overall
            { 
                name: 'Leadership', 
                score: scorecard.leadership || 0, 
                previous: previousScores ? previousScores.leadership : null,
                countsTowardOverall: false
            },
            { 
                name: 'Mindset & Growth', 
                score: scorecard.mindset_growth || 0, 
                previous: previousScores ? previousScores.mindset_growth : null,
                countsTowardOverall: true
            }
        ];
        
        console.log('[DEBUG] Categories with comparison:', categories.map(c => ({
            name: c.name,
            current: c.score,
            previous: c.previous,
            changed: c.previous !== null && c.previous !== c.score,
            countsTowardOverall: c.countsTowardOverall
        })));

        // Split into columns - left column gets 4, right column gets the rest
        const leftColumn = categories.slice(0, 4);
        const rightColumn = categories.slice(4);
        
        // Draw left column
        leftColumn.forEach((category, index) => {
            const y = startY + (index * rowHeight);
            this.drawCompleteScoreRowWithComparison(ctx, category, this.padding, y, columnWidth);
        });
        
        // Draw right column  
        rightColumn.forEach((category, index) => {
            const y = startY + (index * rowHeight);
            this.drawCompleteScoreRowWithComparison(ctx, category, this.padding + columnWidth + this.padding, y, columnWidth);
        });
        
        // Divider line
        const maxRows = Math.max(leftColumn.length, rightColumn.length);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.width / 2, startY - 5);
        ctx.lineTo(this.width / 2, startY + (maxRows * rowHeight));
        ctx.stroke();
        
        // Column labels
        ctx.font = 'bold 16px Roboto, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.textAlign = 'center';
        ctx.fillText('COMBAT SKILLS', this.padding + (columnWidth / 2), startY - 25);
        ctx.fillText('TACTICAL & PERSONAL SKILLS', this.width - this.padding - (columnWidth / 2), startY - 25);
    }

    drawCompleteScoreRowWithComparison(ctx, category, x, y, width) {
        const rowHeight = 60;
        
        // Row background - highlight if changed
        if (category.previous !== null && category.previous !== category.score) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        }
        this.drawRoundedRect(ctx, x, y, width, rowHeight, 8);
        ctx.fill();
        
        // Category name
        ctx.textAlign = 'left';
        ctx.font = '16px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        
        // Adjust font size for longer category names
        let categoryName = category.name;
        if (category.name.length > 15) {
            ctx.font = '14px Roboto, Arial, sans-serif';
        }
        
        // Add indicator for non-scoring categories
        if (!category.countsTowardOverall) {
            categoryName += ' *';
        }
        
        ctx.fillText(categoryName, x + 15, y + 25);
        
        // Score bar
        const barWidth = width - 120;
        const barY = y + 35;
        
        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.drawRoundedRect(ctx, x + 15, barY, barWidth, 8, 4);
        ctx.fill();
        
        // Bar fill with unified color system
        const fillWidth = (category.score / 10) * barWidth;
        ctx.fillStyle = this.getScoreColor(category.score);
        this.drawRoundedRect(ctx, x + 15, barY, fillWidth, 8, 4);
        ctx.fill();
        
        // Show previous score indicator if available and changed
        if (category.previous !== null && category.previous !== category.score) {
            const previousFillWidth = (category.previous / 10) * barWidth;
            const changeIndicatorX = x + 15 + previousFillWidth;
            
            // Draw change indicator line
            ctx.strokeStyle = category.previous < category.score ? '#00FF00' : '#FF0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(changeIndicatorX, barY - 5);
            ctx.lineTo(changeIndicatorX, barY + 13);
            ctx.stroke();
            
            // Draw change arrow
            ctx.fillStyle = category.previous < category.score ? '#00FF00' : '#FF0000';
            if (category.previous < category.score) {
                // Up arrow
                ctx.beginPath();
                ctx.moveTo(changeIndicatorX - 3, barY - 8);
                ctx.lineTo(changeIndicatorX + 3, barY - 8);
                ctx.lineTo(changeIndicatorX, barY - 12);
                ctx.closePath();
                ctx.fill();
            } else {
                // Down arrow
                ctx.beginPath();
                ctx.moveTo(changeIndicatorX - 3, barY + 13);
                ctx.lineTo(changeIndicatorX + 3, barY + 13);
                ctx.lineTo(changeIndicatorX, barY + 17);
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // Score dots
        const dotSpacing = barWidth / 9;
        for (let i = 0; i < 10; i++) {
            const dotX = x + 15 + (i * dotSpacing);
            const isFilled = i < category.score;
            ctx.fillStyle = isFilled ? this.getScoreColor(category.score) : 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.arc(dotX, barY, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Score text with change indicator
        ctx.textAlign = 'right';
        ctx.font = 'bold 20px Roboto, Arial, sans-serif';
        ctx.fillStyle = this.getScoreColor(category.score);
        
        let scoreText = `${category.score}/10`;
        if (category.previous !== null && category.previous !== category.score) {
            const change = category.score - category.previous;
            const changeSymbol = change > 0 ? '↗' : '↘';
            scoreText = `${scoreText} ${changeSymbol}`;
        }
        
        ctx.fillText(scoreText, x + width - 15, y + 28);
    }

    async drawOverallRatingWithComparison(ctx, scorecard, tag, previousScores = null) {
        // Moved overall rating down to accommodate more categories
        const overallY = 950;
        const boxWidth = this.width - (this.padding * 2);
        const boxHeight = 120;
        
        // FIRST: Calculate the actual Aim Average from the three sub-categories
        const aimAverage = (scorecard.aim_snap + scorecard.aim_tracking + scorecard.aim_accuracy) / 3;
        
        // Calculate overall score using Aim Average instead of individual aim sub-categories
        // Also exclude Leadership
        const scoringCategories = [
            aimAverage,  // Use calculated aim average instead of individual scores
            scorecard.teamplay,
            scorecard.comms,
            scorecard.strategy,
            scorecard.resource_management,
            scorecard.game_knowledge,
            scorecard.mindset_growth || 0
        ];
        
        // Calculate average of scoring categories only
        const totalScore = scoringCategories.reduce((sum, score) => sum + score, 0);
        const overallScore = totalScore / scoringCategories.length;
        
        // Calculate previous overall if available (also using aim average and excluding leadership)
        let previousOverall = null;
        if (previousScores) {
            // Calculate previous aim average
            const previousAimAverage = (previousScores.aim_snap + previousScores.aim_tracking + previousScores.aim_accuracy) / 3;
            
            const previousScoringCategories = [
                previousAimAverage,  // Use calculated previous aim average
                previousScores.teamplay,
                previousScores.comms,
                previousScores.strategy,
                previousScores.resource_management,
                previousScores.game_knowledge,
                previousScores.mindset_growth || 0
            ];
            const previousTotalScore = previousScoringCategories.reduce((sum, score) => sum + score, 0);
            previousOverall = previousTotalScore / previousScoringCategories.length;
        }
        
        console.log(`[DEBUG] Calculated Aim Average: ${aimAverage.toFixed(2)}`);
        console.log(`[DEBUG] Overall score calculation using aim average: ${totalScore} / ${scoringCategories.length} = ${overallScore.toFixed(1)}`);
        console.log(`[DEBUG] Scoring categories:`, scoringCategories.map(s => s.toFixed(1)));
        
        const ratingText = this.getOverallRating(overallScore);
        
        // Overall rating box - highlight if changed
        if (previousOverall !== null && Math.abs(previousOverall - overallScore) > 0.1) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        }
        this.drawRoundedRect(ctx, this.padding, overallY, boxWidth, boxHeight, 12);
        ctx.fill();
        
        ctx.strokeStyle = this.getScoreColor(overallScore);
        ctx.lineWidth = 2;
        this.drawRoundedRect(ctx, this.padding, overallY, boxWidth, boxHeight, 12);
        ctx.stroke();
        
        // Rating content
        ctx.textAlign = 'center';
        
        ctx.font = 'bold 20px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('OVERALL RATING', this.width / 2, overallY + 35);
        
        // Overall score with change indicator
        ctx.font = 'bold 32px Roboto, Arial, sans-serif';
        ctx.fillStyle = this.getScoreColor(overallScore);
        
        let overallText = `${overallScore.toFixed(1)}/10`;
        if (previousOverall !== null && Math.abs(previousOverall - overallScore) > 0.1) {
            const change = overallScore - previousOverall;
            const changeSymbol = change > 0 ? '↗' : '↘';
            overallText = `${overallText} ${changeSymbol}`;
        }
        
        ctx.fillText(overallText, this.width / 2, overallY + 75);
        
        ctx.font = 'bold 18px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(ratingText, this.width / 2, overallY + 105);
        
        // Update footnote to explain calculation
        ctx.font = '12px Roboto, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText('* Leadership excluded • Aim Average used instead of individual aim scores', this.width / 2, overallY + 130);
    }

    async drawFooter(ctx, version = 1) {
        const footerY = this.height - 60;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, footerY, this.width, 60);
        
        ctx.font = '14px Roboto, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(`Last updated: ${new Date().toLocaleDateString()} • Version ${version}`, this.width / 2, footerY + 35);
    }

    getTagColor(tag) {
        const colors = {
            'Infantry': '#4CAF50',
            'Pilot': '#2196F3',
            'Support': '#FF9800',
            'Crewman': '#FFC107'
        };
        return colors[tag] || '#4CAF50';
    }

    getTagEmoji(tag) {
        const emojis = {
            'Infantry': '🎯',
            'Pilot': '🛩️',
            'Support': '🛠️',
            'Crewman': '👨‍🔧'
        };
        return emojis[tag] || '❓';
    }

    getScoreColor(score) {
        // Unified color system based on score ranges
        if (score >= 9) return '#FFD700'; // Gold - Elite
        if (score >= 8) return '#4CAF50';  // Green - Expert
        if (score >= 7) return '#8BC34A';  // Light Green - Proficient
        if (score >= 6) return '#CDDC39';  // Lime - Competent
        if (score >= 5) return '#FFC107';  // Amber/Yellow - Developing
        if (score >= 4) return '#FF9800';  // Orange - Basic
        return '#F44336';                  // Red - Novice
    }

    getOverallRating(score) {
        if (score >= 9) return 'ELITE';
        if (score >= 8) return 'EXPERT';
        if (score >= 7) return 'PROFICIENT';
        if (score >= 6) return 'COMPETENT';
        if (score >= 5) return 'DEVELOPING';
        return 'NOVICE';
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    async createImageAttachment(canvas, filename = 'scorecard.png') {
        const buffer = canvas.toBuffer('image/png');
        return new AttachmentBuilder(buffer, { name: filename });
    }
}

module.exports = new ScorecardImageGenerator();