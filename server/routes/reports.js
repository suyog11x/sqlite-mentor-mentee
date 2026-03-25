const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'mentor'));

// GET /api/reports/overview — analytics data
router.get('/overview', (req, res) => {
    const byDept = db.prepare(`
    SELECT department, COUNT(*) as count FROM users WHERE role='mentee' GROUP BY department
  `).all();

    const meetingsByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM meetings GROUP BY status
  `).all();

    const docsByType = db.prepare(`
    SELECT type, COUNT(*) as count FROM documents GROUP BY type
  `).all();

    const monthlyMeetings = db.prepare(`
    SELECT strftime('%Y-%m', scheduled_at) as month, COUNT(*) as count
    FROM meetings GROUP BY month ORDER BY month DESC LIMIT 6
  `).all();

    const topMentors = db.prepare(`
    SELECT u.name, COUNT(mm.mentee_id) as mentee_count
    FROM users u LEFT JOIN mentor_mentee mm ON u.id=mm.mentor_id
    WHERE u.role='mentor' GROUP BY u.id ORDER BY mentee_count DESC LIMIT 5
  `).all();

    res.json({ byDept, meetingsByStatus, docsByType, monthlyMeetings, topMentors });
});

// GET /api/reports/mentee/:id/pdf — generate PDF report
router.get('/mentee/:id/pdf', (req, res) => {
    const mentee = db.prepare("SELECT * FROM users WHERE id=? AND role='mentee'").get(req.params.id);
    if (!mentee) return res.status(404).json({ error: 'Mentee not found' });

    const mentor = db.prepare(`
    SELECT u.name, u.email FROM mentor_mentee mm JOIN users u ON mm.mentor_id=u.id WHERE mm.mentee_id=?
  `).get(mentee.id);

    const meetings = db.prepare("SELECT * FROM meetings WHERE mentee_id=? ORDER BY scheduled_at DESC").all(mentee.id);
    const docs = db.prepare("SELECT * FROM documents WHERE mentee_id=? ORDER BY upload_date DESC").all(mentee.id);
    const remarks = db.prepare("SELECT * FROM performance_remarks WHERE mentee_id=? ORDER BY created_at DESC").all(mentee.id);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${mentee.rollno || mentee.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).fillColor('#1a237e').text('MENTOR–MENTEE INTERACTION REPORT', { align: 'center' });
    doc.fontSize(12).fillColor('#555').text('College Mentorship Management System', { align: 'center' });
    doc.moveDown().moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#1a237e').stroke();

    // Student info
    doc.moveDown().fontSize(14).fillColor('#1a237e').text('Student Information');
    doc.fontSize(11).fillColor('#333');
    doc.text(`Name: ${mentee.name}`);
    doc.text(`Email: ${mentee.email}`);
    doc.text(`Roll No: ${mentee.rollno || 'N/A'}`);
    doc.text(`Year: ${mentee.year || 'N/A'}`);
    doc.text(`Department: ${mentee.department || 'N/A'}`);
    doc.text(`Mentor: ${mentor ? mentor.name : 'Not Assigned'}`);
    doc.text(`Report Generated: ${new Date().toLocaleDateString('en-IN')}`);

    // Remarks
    doc.moveDown().fontSize(14).fillColor('#1a237e').text('Performance Remarks');
    if (remarks.length === 0) {
        doc.fontSize(11).fillColor('#666').text('No remarks recorded.');
    } else {
        remarks.forEach(r => {
            doc.fontSize(11).fillColor('#333')
                .text(`[${r.semester || 'N/A'}] CGPA: ${r.cgpa || 'N/A'}`)
                .fontSize(10).fillColor('#555').text(r.remarks).moveDown(0.5);
        });
    }

    // Meetings
    doc.moveDown().fontSize(14).fillColor('#1a237e').text('Meeting History');
    if (meetings.length === 0) {
        doc.fontSize(11).fillColor('#666').text('No meetings recorded.');
    } else {
        meetings.forEach(m => {
            doc.fontSize(11).fillColor('#333')
                .text(`Date: ${new Date(m.scheduled_at).toLocaleString('en-IN')} | Status: ${m.status}`)
                .fontSize(10).fillColor('#555')
                .text(`Venue: ${m.venue || 'N/A'} | Agenda: ${m.agenda || 'N/A'}`)
                .text(`Remarks: ${m.remarks || 'None'}`)
                .moveDown(0.5);
        });
    }

    // Documents
    doc.moveDown().fontSize(14).fillColor('#1a237e').text('Uploaded Documents');
    if (docs.length === 0) {
        doc.fontSize(11).fillColor('#666').text('No documents uploaded.');
    } else {
        docs.forEach(d => {
            doc.fontSize(11).fillColor('#333')
                .text(`• [${d.type}] ${d.original_name} — ${new Date(d.upload_date).toLocaleDateString('en-IN')}`);
        });
    }

    doc.end();
});

module.exports = router;
