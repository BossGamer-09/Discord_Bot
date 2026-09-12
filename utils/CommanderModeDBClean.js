const { connectToMySQL } = require('../db');

async function CommanderModeDBClean() {
    const db = await connectToMySQL();
    if (!db) {
        console.error('Database connection failed.');
        return;
    }

    try {
        const [result] = await db.execute(`
            DELETE FROM commanders
            WHERE last_heartbeat < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        `);

        //console.log(`Deleted ${result.affectedRows} old records from commanders.`);
    } catch (error) {
        console.error('Error clearing old database entries in Commander Mode:', error);
    }
}

// Run every 5 minutes (300,000 ms)
setInterval(CommanderModeDBClean, 300000);

module.exports = { CommanderModeDBClean };
