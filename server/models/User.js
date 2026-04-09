'use strict';
const { db } = require('../db');
const bcrypt  = require('bcryptjs');

const User = {
    findOne(filter) {
        if (filter.email !== undefined) {
            return db.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`).get(filter.email);
        }
        if (filter.role !== undefined) {
            return db.prepare(`SELECT * FROM users WHERE role = ? LIMIT 1`).get(filter.role);
        }
        if (filter.rollno !== undefined) {
            return db.prepare(`SELECT * FROM users WHERE rollno = ? LIMIT 1`).get(filter.rollno);
        }
        if (filter._id !== undefined || filter.id !== undefined) {
            const id = filter._id ?? filter.id;
            return db.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).get(id);
        }
        return null;
    },

    findById(id) {
        const row = db.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).get(id);
        if (!row) return null;
        return _withMethods(row);
    },

    find(filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return db.prepare(`SELECT * FROM users ORDER BY role, name`).all();
        }
        if (filter.role !== undefined) {
            return db.prepare(`SELECT * FROM users WHERE role = ? ORDER BY name`).all(filter.role);
        }
        return [];
    },

    create(data) {
        const stmt = db.prepare(`
            INSERT INTO users (name, email, password_hash, role, department, phone, father_mobile, mother_mobile, rollno, year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            data.name || '',
            (data.email || '').toLowerCase(),
            data.passwordHash || data.password_hash || '',
            data.role || 'mentee',
            data.department || '',
            data.phone || '',
            data.fatherMobile || data.father_mobile || '',
            data.motherMobile || data.mother_mobile || '',
            data.rollno || '',
            data.year || ''
        );
        return _withMethods(db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid));
    },

    save(row) {
        db.prepare(`
            UPDATE users SET
                name=?, email=?, password_hash=?, role=?, department=?,
                phone=?, father_mobile=?, mother_mobile=?, rollno=?, year=?
            WHERE id=?
        `).run(
            row.name, row.email, row.password_hash, row.role, row.department,
            row.phone, row.father_mobile, row.mother_mobile, row.rollno, row.year,
            row.id
        );
        return row;
    },

    findByIdAndDelete(id) {
        db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    },

    countDocuments(filter) {
        if (filter && filter.role) {
            return db.prepare(`SELECT COUNT(*) as c FROM users WHERE role=?`).get(filter.role).c;
        }
        return db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
    },

    comparePassword(row, plain) {
        return bcrypt.compareSync(plain, row.password_hash);
    },
};

function _withMethods(row) {
    if (!row) return null;
    // normalise fields so routes can use both camelCase and snake_case
    row._id = row.id;
    row.passwordHash = row.password_hash;
    row.comparePassword = (plain) => bcrypt.compareSync(plain, row.password_hash);
    row.save = () => User.save(row);
    return row;
}

// Patch findOne/findById to always attach methods
const _findOneFn = User.findOne.bind(User);
User.findOne = (...args) => { const r = _findOneFn(...args); return r ? _withMethods(r) : null; };
const _findByIdFn = User.findById.bind(User);
User.findById = (...args) => _findByIdFn(...args);

module.exports = User;
