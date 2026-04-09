'use strict';
const { db } = require('../db');

const Message = {
    create(data) {
        const info = db.prepare(`
            INSERT INTO messages (sender_id, receiver_id, content, is_read)
            VALUES (?, ?, ?, ?)
        `).run(
            data.senderId   || data.sender_id,
            data.receiverId || data.receiver_id,
            data.content,
            data.isRead ? 1 : 0
        );
        return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(info.lastInsertRowid);
    },

    // filter: { $or: [{senderId, receiverId}, {senderId, receiverId}] }
    find(filter) {
        if (filter && filter.$or && filter.$or.length === 2) {
            const [a, b] = filter.$or;
            return db.prepare(`
                SELECT * FROM messages
                WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
                ORDER BY timestamp ASC
            `).all(a.senderId, a.receiverId, b.senderId, b.receiverId);
        }
        return [];
    },

    findOne(filter) {
        if (filter && filter.$or && filter.$or.length === 2) {
            const [a, b] = filter.$or;
            return db.prepare(`
                SELECT * FROM messages
                WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
                ORDER BY timestamp DESC LIMIT 1
            `).get(a.senderId, a.receiverId, b.senderId, b.receiverId);
        }
        return null;
    },

    countDocuments(filter) {
        if (filter && filter.receiverId !== undefined && filter.senderId !== undefined && filter.isRead === false) {
            return db.prepare(`SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND sender_id=? AND is_read=0`)
                     .get(filter.receiverId, filter.senderId).c;
        }
        if (filter && filter.receiverId !== undefined && filter.isRead === false) {
            return db.prepare(`SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND is_read=0`)
                     .get(filter.receiverId).c;
        }
        return db.prepare(`SELECT COUNT(*) as c FROM messages`).get().c;
    },

    updateMany(filter, update) {
        if (filter.receiverId !== undefined && filter.senderId !== undefined && filter.isRead === false) {
            const isReadNew = update.isRead ? 1 : 0;
            db.prepare(`UPDATE messages SET is_read=? WHERE receiver_id=? AND sender_id=? AND is_read=0`)
              .run(isReadNew, filter.receiverId, filter.senderId);
        }
    },
};

module.exports = Message;
