'use strict';
const { db } = require('../db');

const ActivityLog = {
    create(data) {
        try {
            const info = db.prepare(`
                INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)
            `).run(
                data.userId || data.user_id || null,
                data.action,
                data.details || ''
            );
            return db.prepare(`SELECT * FROM activity_logs WHERE id = ?`).get(info.lastInsertRowid);
        } catch (e) {
            // silently ignore (e.g. FK violation on missing user)
            return null;
        }
    },

    find(filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return db.prepare(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100`).all();
        }
        return [];
    },
};

module.exports = ActivityLog;
