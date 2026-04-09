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
 * - Mentor Name is carried forward from the last non-empty "Mentor Mobile" cell
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const User = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const ActivityLog = require('../models/ActivityLog');
const { authenticate, requireRole } = require('../middleware/auth');

// ─── Config ──────────────────────────────────────────────────────────────────
const EMAIL_DOMAIN = 'students.git.edu';      // expected email domain
const DEFAULT_PASSWORD = 'git@12345';
// Columns required in the TEMPLATE format (shown on UI)
const EXPECTED_COLUMNS = ['Student Name', 'UID', 'Contact Number', 'Father Mobile Number', 'Mother Mobile Number', 'Mentor Name'];

// ─── Column name aliases (maps actual Excel col → normalised key) ─────────────
// Keys are lowercase+trimmed versions of what appears in the real xlsx file.
const COL_ALIASES = {
    // normalised template format
    'student name':         'studentName',
    'uid':                  'uid',
    'contact number':       'phone',
    'father mobile number': 'fatherPhone',
    'mother mobile number': 'motherPhone',
    'mentor name':          'mentorRaw',
    // actual college xlsx format
    'name of the student':  'studentName',
    'student id':           'uid',
    'student mobile':       'phone',
    'father mobile':        'fatherPhone',
    'mother mobile':        'motherPhone',
    'mentor mobile':        'mentorRaw',   // contains "NAME   phone" or blank
};

/**
 * Build a mapping from raw Excel column headers to normalised keys.
 * Trims surrounding whitespace from every header for matching.
 */
function buildColMap(rawHeaders) {
    const map = {};  // normalised key → raw header name
    for (const rawCol of rawHeaders) {
        const trimmed = rawCol.trim().toLowerCase();
        if (COL_ALIASES[trimmed]) {
            map[COL_ALIASES[trimmed]] = rawCol;
        }
    }
    return map;
}

/**
 * Extract only the mentor name portion from a cell that contains
 * "PROF. SOME NAME     9876543210" or just a plain name.
 * Returns empty string if nothing useful found.
 */
function parseMentorName(raw) {
    const str = String(raw || '').trim();
    if (!str) return '';
    // Strip a trailing phone number (10+ digits, possibly with spaces before it)
    const withoutPhone = str.replace(/\s+\d{10,}\s*$/, '').trim();
    return withoutPhone || str;
}

// Store uploads in a temp directory (cleaned after processing)
const uploadDir = path.join(__dirname, '../../uploads/bulk_tmp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `bulk_${Date.now()}.xlsx`),
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx') return cb(new Error('Only .xlsx files are accepted'));
        cb(null, true);
    },
});

router.use(authenticate, requireRole('admin'));

// ─── Helper: validate & normalise one row ─────────────────────────────────────
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
    // mentorName missing is a warning, not a hard error (will be handled downstream)

    // UID format: alphanumeric only (e.g. 24U1234)
    if (uid && !/^[A-Za-z0-9]+$/.test(uid)) {
        errors.push(`UID "${uid}" contains invalid characters`);
    }

    // Email derived from UID
    const email = uid ? `${uid.toLowerCase()}@${EMAIL_DOMAIN}` : '';

    return {
        valid: errors.length === 0,
        errors,
        data: { name, uid, email, phone, fatherPhone, motherPhone, mentorName, rowNum },
    };
}

// ─── POST /api/admin/bulk-upload ──────────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const result = {
        total: 0,
        added: 0,
        updated: 0,
        failed: 0,
        errors: [],          // [{ row, uid, reason }]
        warnings: [],        // [{ row, uid, message }]
    };

    try {
        // ── Parse Excel ──
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Excel file is empty' });
        }

        // ── Detect & map column headers (flexible: handles real xlsx + template) ──
        const rawHeaders  = Object.keys(rows[0]);
        const colMap      = buildColMap(rawHeaders);
        const hasStudentName = colMap.studentName && colMap.uid;

        if (!hasStudentName) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                error: 'Missing required columns: could not find student name or UID columns',
                expected: EXPECTED_COLUMNS,
                found: rawHeaders,
            });
        }

        // ── Normalise rows + carry-forward mentor name ──
        let lastMentorName = '';
        const normalisedRows = rows.map(row => {
            const get = key => (colMap[key] ? row[colMap[key]] : '');
            const mentorRaw = get('mentorRaw');
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

        // Filter out completely empty rows (e.g. blank trailing rows)
        const filteredRows = normalisedRows.filter(r => r.uid || r.studentName);
        result.total = filteredRows.length;

        // ── Build mentor lookup cache (name → _id) ──
        const mentorDocs = await User.find({ role: 'mentor' }).select('name _id').lean();
        const mentorMap = {};
        for (const m of mentorDocs) {
            mentorMap[m.name.toLowerCase().trim()] = m._id;
        }

        // ── Hash default password once ──
        const defaultHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

        // ── Collect UIDs to detect in-file duplicates ──
        const seenUIDs = new Set();

        // ── Process each row ──
        for (let i = 0; i < filteredRows.length; i++) {
            const rowNum = i + 2; // Excel row (header=1)
            const { valid, errors, data } = validateRow(filteredRows[i], rowNum);

            if (!valid) {
                result.failed++;
                result.errors.push({ row: rowNum, uid: data.uid || '—', reasons: errors });
                continue;
            }

            const { name, uid, email, phone, fatherPhone, motherPhone, mentorName } = data;

            // ── In-file duplicate UID ──
            if (seenUIDs.has(uid.toLowerCase())) {
                result.failed++;
                result.errors.push({ row: rowNum, uid, reasons: ['Duplicate UID found within the file'] });
                continue;
            }
            seenUIDs.add(uid.toLowerCase());

            // ── Mentor lookup ──
            const mentorId = mentorMap[mentorName.toLowerCase()];
            if (!mentorId) {
                result.warnings.push({
                    row: rowNum,
                    uid,
                    message: `Mentor "${mentorName}" not found — student created but not assigned`,
                });
            }

            try {
                // ── Upsert user (find by rollno = UID) ──
                let userDoc = await User.findOne({ rollno: uid });
                let isNew = false;

                if (userDoc) {
                    // Update existing
                    userDoc.name        = name;
                    userDoc.email       = email;
                    userDoc.phone       = phone;
                    userDoc.fatherMobile = fatherPhone;
                    userDoc.motherMobile = motherPhone;
                    userDoc.role        = 'mentee';
                    await userDoc.save();
                } else {
                    // Check email collision (different user)
                    const emailClash = await User.findOne({ email });
                    if (emailClash) {
                        result.failed++;
                        result.errors.push({ row: rowNum, uid, reasons: [`Email ${email} already in use by another account`] });
                        continue;
                    }
                    userDoc = await User.create({
                        name, email, rollno: uid,
                        passwordHash: defaultHash,
                        role: 'mentee',
                        phone,
                        fatherMobile: fatherPhone,
                        motherMobile: motherPhone,
                    });
                    isNew = true;
                }

                // ── Mentor mapping ──
                if (mentorId) {
                    const existingMap = await MentorMentee.findOne({ menteeId: userDoc._id });
                    if (existingMap) {
                        if (String(existingMap.mentorId) !== String(mentorId)) {
                            existingMap.mentorId = mentorId;
                            existingMap.assignedAt = new Date();
                            await existingMap.save();
                        }
                    } else {
                        await MentorMentee.create({ mentorId, menteeId: userDoc._id });
                    }
                }

                isNew ? result.added++ : result.updated++;
            } catch (dbErr) {
                result.failed++;
                result.errors.push({ row: rowNum, uid, reasons: [dbErr.message] });
            }
        }

        // ── Log activity ──
        await ActivityLog.create({
            userId: req.user.id,
            action: 'bulk_upload',
            details: `Bulk upload: ${result.added} added, ${result.updated} updated, ${result.failed} failed out of ${result.total}`,
        });

        // ── Cleanup temp file ──
        fs.unlinkSync(filePath);
        return res.json(result);

    } catch (err) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        console.error('Bulk upload error:', err);
        return res.status(500).json({ error: 'Failed to process file: ' + err.message });
    }
});

// ─── GET /api/admin/bulk-upload/template ─────────────────────────────────────
// Download a blank Excel template with correct column headers
router.get('/template', (req, res) => {
    const wb = XLSX.utils.book_new();
    const sampleData = [
        {
            'Student Name':       'Arjun Sharma',
            'UID':                '24U1001',
            'Contact Number':     '9876543210',
            'Father Mobile Number': '9876500001',
            'Mother Mobile Number': '9876500002',
            'Mentor Name':        'Dr. Ramesh Kumar',
        },
        {
            'Student Name':       'Priya Patel',
            'UID':                '24U1002',
            'Contact Number':     '8765432109',
            'Father Mobile Number': '8765400001',
            'Mother Mobile Number': '8765400002',
            'Mentor Name':        'Dr. Ramesh Kumar',
        },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);

    // Column widths
    ws['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 25 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="student_bulk_upload_template.xlsx"');
    res.send(buf);
});

// ─── GET /api/admin/bulk-upload/validate-uid/:uid ────────────────────────────
// Quick endpoint to check if a UID email domain is correct
router.get('/validate-uid/:uid', async (req, res) => {
    const uid = req.params.uid.trim();
    if (!uid) return res.status(400).json({ error: 'UID required' });

    const email = `${uid.toLowerCase()}@${EMAIL_DOMAIN}`;
    const exists = await User.findOne({ rollno: uid }).select('name email').lean();

    res.json({
        uid,
        derivedEmail: email,
        emailDomain: EMAIL_DOMAIN,
        alreadyExists: !!exists,
        existingUser: exists ? { name: exists.name, email: exists.email } : null,
    });
});

module.exports = router;
