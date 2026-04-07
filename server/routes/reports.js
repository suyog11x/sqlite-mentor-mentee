const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const Meeting = require('../models/Meeting');
const Document = require('../models/Document');
const PerformanceRemark = require('../models/PerformanceRemark');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'mentor'));

// GET /api/reports/overview — analytics data
router.get('/overview', async (req, res) => {
    try {
        const [byDept, meetingsByStatus, docsByType, monthlyMeetings, topMentors] = await Promise.all([
            // Mentees grouped by department
            User.aggregate([
                { $match: { role: 'mentee' } },
                { $group: { _id: '$department', count: { $sum: 1 } } },
                { $project: { _id: 0, department: '$_id', count: 1 } },
            ]),
            // Meetings grouped by status
            Meeting.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $project: { _id: 0, status: '$_id', count: 1 } },
            ]),
            // Documents grouped by type
            Document.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 } } },
                { $project: { _id: 0, type: '$_id', count: 1 } },
            ]),
            // Meetings per month (last 6 months)
            Meeting.aggregate([
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$scheduledAt' } },
                    count: { $sum: 1 },
                }},
                { $sort: { _id: -1 } },
                { $limit: 6 },
                { $project: { _id: 0, month: '$_id', count: 1 } },
            ]),
            // Top mentors by mentee count
            MentorMentee.aggregate([
                { $group: { _id: '$mentorId', mentee_count: { $sum: 1 } } },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'mentor' } },
                { $unwind: '$mentor' },
                { $project: { _id: 0, name: '$mentor.name', mentee_count: 1 } },
                { $sort: { mentee_count: -1 } },
                { $limit: 5 },
            ]),
        ]);
        res.json({ byDept, meetingsByStatus, docsByType, monthlyMeetings, topMentors });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/reports/mentee/:id/pdf — generate PDF report
router.get('/mentee/:id/pdf', async (req, res) => {
    try {
        const mentee = await User.findOne({ _id: req.params.id, role: 'mentee' }).lean();
        if (!mentee) return res.status(404).json({ error: 'Mentee not found' });

        const mapping = await MentorMentee.findOne({ menteeId: mentee._id })
            .populate('mentorId', 'name email').lean();
        const mentor = mapping?.mentorId || null;

        const [meetings, docs, remarks] = await Promise.all([
            Meeting.find({ menteeId: mentee._id }).sort({ scheduledAt: -1 }).lean(),
            Document.find({ menteeId: mentee._id }).sort({ uploadDate: -1 }).lean(),
            PerformanceRemark.find({ menteeId: mentee._id }).sort({ created_at: -1 }).lean(),
        ]);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="report-${mentee.rollno || mentee._id}.pdf"`);
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
                    .text(`Date: ${new Date(m.scheduledAt).toLocaleString('en-IN')} | Status: ${m.status}`)
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
                    .text(`• [${d.type}] ${d.originalName} — ${new Date(d.uploadDate).toLocaleDateString('en-IN')}`);
            });
        }

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
