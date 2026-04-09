'use strict';
const { db } = require('../db');

const MentorMentee = {
    findOne(filter) {
        if (filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM mentor_mentee WHERE mentee_id = ? LIMIT 1`).get(filter.menteeId);
        }
        if (filter.mentorId !== undefined) {
            return db.prepare(`SELECT * FROM mentor_mentee WHERE mentor_id = ? LIMIT 1`).get(filter.mentorId);
        }
        return null;
    },

    find(filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return db.prepare(`SELECT * FROM mentor_mentee`).all();
        }
        if (filter.mentorId !== undefined) {
            return db.prepare(`SELECT * FROM mentor_mentee WHERE mentor_id = ?`).all(filter.mentorId);
        }
        return [];
    },

    create(data) {
        const info = db.prepare(`
            INSERT INTO mentor_mentee (mentor_id, mentee_id) VALUES (?, ?)
        `).run(data.mentorId, data.menteeId);
        return db.prepare(`SELECT * FROM mentor_mentee WHERE id = ?`).get(info.lastInsertRowid);
    },

    save(row) {
        db.prepare(`UPDATE mentor_mentee SET mentor_id=?, assigned_at=? WHERE id=?`)
          .run(row.mentor_id, row.assigned_at || new Date().toISOString(), row.id);
        return row;
    },

    findByIdAndDelete(id) {
        db.prepare(`DELETE FROM mentor_mentee WHERE id = ?`).run(id);
    },
};

module.exports = MentorMentee;
