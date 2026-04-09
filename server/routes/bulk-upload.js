'use strict';
/**
 * Bulk Upload Route — POST /api/admin/bulk-upload
 *
 * Accepts the actual college .xlsx file with columns (with possible leading/trailing spaces):
 *   SN | Name of the Student | Student ID | Student Mobile | Father Mobile | Mother Mobile | Mentor Mobile
 *
 * Also accepts the normalized template format:
 *   Student Name | UID | Contact Number | Father Mobile Number | Mother Mobile Number | Mentor Name
 *
 * - Email is auto-derived: {UID}@students.git.edu
 * - Default password: git@12345 (bcrypt hashed)
 * - If UID already exists → update details (upsert)
 * - Maps student to mentor by mentor name (case-insensitive)
 */

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const XLSX       = require('xlsx');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const fs         = require('fs');
const { db }     = require('../db');
const User       = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const ActivityLog  = require('../models/ActivityLog');
const { authenticate, requireRole } = require('../middleware/auth');

const EMAIL_DOMAIN      = 'students.git.edu';
const DEFAULT_PASSWORD  = 'git@12345';
const EXPECTED_COLUMNS  = ['Student Name', 'UID', 'Contact Number', 'Father Mobile Number', 'Mother Mobile Number', 'Mentor Name'];

const COL_ALIASES = {
    'student name':         'studentName',
    'uid':                  'uid',
    'contact number':       'phone',
    'father mobile number': 'fatherPhone',
    'mother mobile number': 'motherPhone',
    'mentor name':          'mentorRaw',
    'name of the student':  'studentName',
    'student id':           'uid',
    'student mobile':       'phone',
    'student mobile number': 'phone',
    'father mobile':        'fatherPhone',
    'mother mobile':        'motherPhone',
    'mentor mobile':        'mentorRaw',
    'mentor mobile number': 'mentorRaw',
    'mentor name with their mobile number': 'mentorRaw',
};

function buildColMap(rawHeaders) {
    const map = {};
    for (const rawCol of rawHeaders) {
        const trimmed = rawCol.trim().toLowerCase();
        if (COL_ALIASES[trimmed]) map[COL_ALIASES[trimmed]] = rawCol;
    }
    return map;
}

function parseMentorName(raw) {
    const str = String(raw || '').trim();
    if (!str) return '';
    const withoutPhone = str.replace(/\s+\d{10,}\s*$/, '').trim();
    return withoutPhone || str;
}

const uploadDir = path.join(__dirname, '../../uploads/bulk_tmp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `bulk_${Date.now()}.xlsx`),
});
const upload = multer({
    storage,
    limits:     { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx') return cb(new Error('Only .xlsx files are accepted'));
        cb(null, true);
    },
});

router.use(authenticate, requireRole('admin'));

function validateRow(normalised, rowNum) {
    const errors = [];
    const name        = String(normalised.studentName || '').trim();
    const uid         = String(normalised.uid         || '').trim();
    const phone       = String(normalised.phone       || '').trim();
    const fatherPhone = String(normalised.fatherPhone || '').trim();
    const motherPhone = String(normalised.motherPhone || '').trim();
    const mentorName  = String(normalised.mentorName  || '').trim();

    if (!name) errors.push('Student Name is required');
    if (!uid)  errors.push('UID is required');

    if (uid && !/^[A-Za-z0-9]+$/.test(uid)) {
        errors.push(`UID "${uid}" contains invalid characters`);
    }

    const email = uid ? `${uid.toLowerCase()}@${EMAIL_DOMAIN}` : '';

    return {
        valid: errors.length === 0,
        errors,
        data: { name, uid, email, phone, fatherPhone, motherPhone, mentorName, rowNum },
    };
}

// POST /api/admin/bulk-upload
router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const result = { total: 0, added: 0, updated: 0, failed: 0, errors: [], warnings: [] };

    try {
        const workbook  = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet     = workbook.Sheets[sheetName];
        const rows      = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Excel file is empty' });
        }

        const rawHeaders  = Object.keys(rows[0]);
        const colMap      = buildColMap(rawHeaders);
        const hasStudentName = colMap.studentName && colMap.uid;

        if (!hasStudentName) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Missing required columns', expected: EXPECTED_COLUMNS, found: rawHeaders });
        }

        let lastMentorName = '';
        const normalisedRows = rows.map(row => {
            const get = key => (colMap[key] ? row[colMap[key]] : '');
            const mentorRaw   = get('mentorRaw');
            const parsedMentor = parseMentorName(mentorRaw);
            if (parsedMentor) lastMentorName = parsedMentor;
            return {
                studentName:  String(get('studentName') || '').trim(),
                uid:          String(get('uid')         || '').trim(),
                phone:        String(get('phone')       || '').trim(),
                fatherPhone:  String(get('fatherPhone') || '').trim(),
                motherPhone:  String(get('motherPhone') || '').trim(),
                mentorName:   parsedMentor || lastMentorName,
            };
        });

        const filteredRows = normalisedRows.filter(r => r.uid || r.studentName);
        result.total = filteredRows.length;

        // Build mentor lookup (name → id)
        const mentorDocs = db.prepare(`SELECT id, name FROM users WHERE role='mentor'`).all();
        const mentorMap  = {};
        for (const m of mentorDocs) mentorMap[m.name.toLowerCase().trim()] = m.id;

        const defaultHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
        const seenUIDs    = new Set();

        for (let i = 0; i < filteredRows.length; i++) {
            const rowNum = i + 2;
            const { valid, errors, data } = validateRow(filteredRows[i], rowNum);

            if (!valid) {
                result.failed++;
                result.errors.push({ row: rowNum, uid: data.uid || '—', reasons: errors });
                continue;
            }

            const { name, uid, email, phone, fatherPhone, motherPhone, mentorName } = data;

            if (seenUIDs.has(uid.toLowerCase())) {
                result.failed++;
                result.errors.push({ row: rowNum, uid, reasons: ['Duplicate UID found within the file'] });
                continue;
            }
            seenUIDs.add(uid.toLowerCase());

            const mentorId = mentorMap[mentorName.toLowerCase()];
            if (!mentorId) {
                result.warnings.push({ row: rowNum, uid, message: `Mentor "${mentorName}" not found — student created but not assigned` });
            }

            try {
                // Derive batch from UID prefix (e.g. "24U0007" → "2024")
                const batchMatch = uid.match(/^(\d{2})[A-Za-z]/);
                const batch = batchMatch ? `20${batchMatch[1]}` : '2024';

                let userDoc = db.prepare(`SELECT * FROM users WHERE rollno=? LIMIT 1`).get(uid);
                let isNew   = false;

                if (userDoc) {
                    db.prepare(`UPDATE users SET name=?, email=?, phone=?, father_mobile=?, mother_mobile=?, role='mentee', batch=? WHERE id=?`)
                      .run(name, email, phone, fatherPhone, motherPhone, batch, userDoc.id);
                } else {
                    const emailClash = db.prepare(`SELECT id FROM users WHERE email=? LIMIT 1`).get(email);
                    if (emailClash) {
                        result.failed++;
                        result.errors.push({ row: rowNum, uid, reasons: [`Email ${email} already in use by another account`] });
                        continue;
                    }
                    const info = db.prepare(`
                        INSERT INTO users (name, email, rollno, password_hash, role, phone, father_mobile, mother_mobile, batch)
                        VALUES (?, ?, ?, ?, 'mentee', ?, ?, ?, ?)
                    `).run(name, email, uid, defaultHash, phone, fatherPhone, motherPhone, batch);
                    userDoc = db.prepare(`SELECT * FROM users WHERE id=?`).get(info.lastInsertRowid);
                    isNew   = true;
                }

                if (mentorId) {
                    const existingMap = db.prepare(`SELECT * FROM mentor_mentee WHERE mentee_id=? LIMIT 1`).get(userDoc.id);
                    if (existingMap) {
                        if (existingMap.mentor_id !== mentorId) {
                            db.prepare(`UPDATE mentor_mentee SET mentor_id=?, assigned_at=? WHERE id=?`)
                              .run(mentorId, new Date().toISOString(), existingMap.id);
                        }
                    } else {
                        db.prepare(`INSERT INTO mentor_mentee (mentor_id, mentee_id) VALUES (?, ?)`).run(mentorId, userDoc.id);
                    }
                }

                isNew ? result.added++ : result.updated++;
            } catch (dbErr) {
                result.failed++;
                result.errors.push({ row: rowNum, uid, reasons: [dbErr.message] });
            }
        }

        ActivityLog.create({
            userId:  req.user.id,
            action:  'bulk_upload',
            details: `Bulk upload: ${result.added} added, ${result.updated} updated, ${result.failed} failed out of ${result.total}`,
        });

        fs.unlinkSync(filePath);
        return res.json(result);

    } catch (err) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        console.error('Bulk upload error:', err);
        return res.status(500).json({ error: 'Failed to process file: ' + err.message });
    }
});

// GET /api/admin/bulk-upload/template
router.get('/template', (req, res) => {
    const wb = XLSX.utils.book_new();
    const sampleData = [
        { 'Student Name': 'Arjun Sharma',  'UID': '24U1001', 'Contact Number': '9876543210', 'Father Mobile Number': '9876500001', 'Mother Mobile Number': '9876500002', 'Mentor Name': 'Dr. Ramesh Kumar' },
        { 'Student Name': 'Priya Patel',   'UID': '24U1002', 'Contact Number': '8765432109', 'Father Mobile Number': '8765400001', 'Mother Mobile Number': '8765400002', 'Mentor Name': 'Dr. Ramesh Kumar' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="student_bulk_upload_template.xlsx"');
    res.send(buf);
});

// GET /api/admin/bulk-upload/validate-uid/:uid
router.get('/validate-uid/:uid', async (req, res) => {
    const uid   = req.params.uid.trim();
    if (!uid) return res.status(400).json({ error: 'UID required' });
    const email  = `${uid.toLowerCase()}@${EMAIL_DOMAIN}`;
    const exists = db.prepare(`SELECT name, email FROM users WHERE rollno=? LIMIT 1`).get(uid);
    res.json({ uid, derivedEmail: email, emailDomain: EMAIL_DOMAIN, alreadyExists: !!exists, existingUser: exists || null });
});

module.exports = router;
