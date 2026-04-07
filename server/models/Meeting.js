const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    mentorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    menteeId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, required: true },
    venue:       { type: String, default: '' },
    agenda:      { type: String, default: '' },
    remarks:     { type: String, default: '' },
    status:      { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
}, { timestamps: { createdAt: 'created_at' } });

module.exports = mongoose.model('Meeting', meetingSchema);
