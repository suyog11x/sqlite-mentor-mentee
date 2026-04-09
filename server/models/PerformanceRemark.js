'use strict';
const { db } = require('../db');

const PerformanceRemark = {
    create(data) {
        const info = db.prepare(`
            INSERT INTO performance_remarks (mentor_id, mentee_id, remarks, semester, cgpa)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            data.mentorId || data.mentor_id,
            data.menteeId || data.mentee_id,
            data.remarks,
            data.semester || '',
            data.cgpa     || ''
        );
        return db.prepare(`SELECT * FROM performance_remarks WHERE id = ?`).get(info.lastInsertRowid);
    },

    find(filter) {
        if (filter && filter.mentorId !== undefined && filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM performance_remarks WHERE mentor_id=? AND mentee_id=? ORDER BY created_at DESC`)
                     .all(filter.mentorId, filter.menteeId);
        }
        if (filter && filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM performance_remarks WHERE mentee_id=? ORDER BY created_at DESC`).all(filter.menteeId);
        }
        return db.prepare(`SELECT * FROM performance_remarks ORDER BY created_at DESC`).all();
    },
};

module.exports = PerformanceRemark;
