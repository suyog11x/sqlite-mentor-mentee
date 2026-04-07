const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:    { type: String, required: true },
    content:  { type: String, required: true },
}, { timestamps: { createdAt: 'created_at' } });

module.exports = mongoose.model('Announcement', announcementSchema);
