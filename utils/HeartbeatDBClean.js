const { connectToMySQL } = require('../db');

async function HeartbeatDBClean() {
    try {
        const db = await connectToMySQL();
        if (!db) {
            console.error('Database connection failed.');
            return;
        }

        console.log('Database connection successful.');

        // Deleting records older than 2 minutes
        const [result] = await db.execute(`
            DELETE FROM heartbeats
            WHERE last_seen < DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        `);

        // Log how many records were deleted
        console.log(`Deleted ${result.affectedRows} old heartbeat records.`);
    } catch (error) {
        console.error('Error clearing old heartbeat records:', error);
    }
}

// Run every 1 minute (60,000 ms)
setInterval(HeartbeatDBClean, 60000);

module.exports = { HeartbeatDBClean };
