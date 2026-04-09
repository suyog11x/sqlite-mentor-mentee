'use strict';
const { db } = require('../db');

const Document = {
    create(data) {
        const info = db.prepare(`
            INSERT INTO documents (mentee_id, type, original_name, filename, filepath)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            data.menteeId || data.mentee_id,
            data.type,
            data.originalName || data.original_name,
            data.filename,
            data.filepath
        );
        return db.prepare(`SELECT * FROM documents WHERE id = ?`).get(info.lastInsertRowid);
    },

    find(filter) {
        if (filter && filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM documents WHERE mentee_id=? ORDER BY upload_date DESC`).all(filter.menteeId);
        }
        return db.prepare(`SELECT * FROM documents ORDER BY upload_date DESC`).all();
    },

    findOne(filter) {
        if (filter._id !== undefined && filter.menteeId !== undefined) {
            return db.prepare(`SELECT * FROM documents WHERE id=? AND mentee_id=? LIMIT 1`)
                     .get(filter._id, filter.menteeId);
        }
        if (filter._id !== undefined) {
            return db.prepare(`SELECT * FROM documents WHERE id=? LIMIT 1`).get(filter._id);
        }
        return null;
    },

    findByIdAndDelete(id) {
        db.prepare(`DELETE FROM documents WHERE id=?`).run(id);
    },

    countDocuments(filter) {
        if (filter && filter.menteeId !== undefined) {
            return db.prepare(`SELECT COUNT(*) as c FROM documents WHERE mentee_id=?`).get(filter.menteeId).c;
        }
        return db.prepare(`SELECT COUNT(*) as c FROM documents`).get().c;
    },
};

module.exports = Document;
