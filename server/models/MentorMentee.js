const mongoose = require('mongoose');

const mentorMenteeSchema = new mongoose.Schema({
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    menteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    assignedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MentorMentee', mentorMenteeSchema);
