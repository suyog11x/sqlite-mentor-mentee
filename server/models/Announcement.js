'use strict';
const { db } = require('../db');

const Announcement = {
    create(data) {
        const info = db.prepare(`
            INSERT INTO announcements (mentor_id, title, content) VALUES (?, ?, ?)
        `).run(data.mentorId || data.mentor_id, data.title, data.content);
        return db.prepare(`SELECT * FROM announcements WHERE id = ?`).get(info.lastInsertRowid);
    },

    find(filter) {
        if (filter && filter.mentorId !== undefined) {
            return db.prepare(`SELECT * FROM announcements WHERE mentor_id=? ORDER BY created_at DESC`).all(filter.mentorId);
        }
        return db.prepare(`SELECT * FROM announcements ORDER BY created_at DESC`).all();
    },
};

module.exports = Announcement;
