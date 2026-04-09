'use strict';
const { db } = require('../db');

const Meeting = {
    findOne(filter) {
        if (filter._id !== undefined && filter.mentorId !== undefined) {
            return db.prepare(`SELECT * FROM meetings WHERE id=? AND mentor_id=? LIMIT 1`)
                     .get(filter._id, filter.mentorId);
        }
        if (filter._id !== undefined) {
            return db.prepare(`SELECT * FROM meetings WHERE id=? LIMIT 1`).get(filter._id);
        }
        return null;
    },

    find(filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return db.prepare(`SELECT * FROM meetings ORDER BY scheduled_at DESC`).all();
        }
        if (filter.mentorId !== undefined && filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM meetings WHERE mentor_id=? AND mentee_id=? ORDER BY scheduled_at DESC`)
                     .all(filter.mentorId, filter.menteeId);
        }
        if (filter.mentorId !== undefined) {
            return db.prepare(`SELECT * FROM meetings WHERE mentor_id=? ORDER BY scheduled_at DESC`).all(filter.mentorId);
        }
        if (filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM meetings WHERE mentee_id=? ORDER BY scheduled_at DESC`).all(filter.menteeId);
        }
        return [];
    },

    create(data) {
        const info = db.prepare(`
            INSERT INTO meetings (mentor_id, mentee_id, scheduled_at, venue, agenda, remarks, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            data.mentorId,
            data.menteeId,
            data.scheduledAt instanceof Date ? data.scheduledAt.toISOString() : (data.scheduledAt || new Date().toISOString()),
            data.venue    || '',
            data.agenda   || '',
            data.remarks  || '',
            data.status   || 'scheduled'
        );
        return db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(info.lastInsertRowid);
    },

    save(row) {
        db.prepare(`
            UPDATE meetings SET mentor_id=?, mentee_id=?, scheduled_at=?, venue=?, agenda=?, remarks=?, status=?
            WHERE id=?
        `).run(row.mentor_id, row.mentee_id, row.scheduled_at, row.venue, row.agenda, row.remarks, row.status, row.id);
        return row;
    },

    findOneAndDelete(filter) {
        const row = Meeting.findOne(filter);
        if (row) db.prepare(`DELETE FROM meetings WHERE id=?`).run(row.id);
        return row;
    },

    countDocuments(filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return db.prepare(`SELECT COUNT(*) as c FROM meetings`).get().c;
        }
        if (filter.mentorId !== undefined && filter.status !== undefined && filter.scheduledAt?.$gte) {
            return db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentor_id=? AND status=? AND scheduled_at >= ?`)
                     .get(filter.mentorId, filter.status, filter.scheduledAt.$gte.toISOString()).c;
        }
        if (filter.menteeId !== undefined && filter.status !== undefined && filter.scheduledAt?.$gte) {
            return db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentee_id=? AND status=? AND scheduled_at >= ?`)
                     .get(filter.menteeId, filter.status, filter.scheduledAt.$gte.toISOString()).c;
        }
        if (filter.mentorId !== undefined) {
            return db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentor_id=?`).get(filter.mentorId).c;
        }
        return 0;
    },
};

module.exports = Meeting;
