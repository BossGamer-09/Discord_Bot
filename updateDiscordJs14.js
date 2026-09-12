const fs = require('fs');
const path = require('path');

// Mapping of old to new constructs
const replacements = {
    'EmbedBuilder': 'EmbedBuilder',
    'ActionRowBuilder': 'ActionRowBuilder',
    'ButtonBuilder': 'ButtonBuilder',
    'StringSelectMenuBuilder': 'StringSelectMenuBuilder',
    'TextInputBuilder': 'TextInputBuilder',
    'ModalBuilder': 'ModalBuilder'
};

// Function to update file contents
function updateFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;

    for (const [oldConstruct, newConstruct] of Object.entries(replacements)) {
        if (content.includes(oldConstruct)) {
            content = content.replace(new RegExp(`\\b${oldConstruct}\\b`, 'g'), newConstruct);
            updated = true;
        }
    }

    if (updated) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

// Recursive function to traverse directories
function traverseAndUpdate(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            traverseAndUpdate(filePath);
        } else if (file.endsWith('.js')) {
            updateFile(filePath);
        }
    });
}

// Start updating from the current directory
traverseAndUpdate('./');
console.log('Update completed!');