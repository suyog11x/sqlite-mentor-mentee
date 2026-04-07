const mongoose = require('mongoose');

const performanceRemarkSchema = new mongoose.Schema({
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    menteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    remarks:  { type: String, required: true },
    semester: { type: String, default: '' },
    cgpa:     { type: String, default: '' },
}, { timestamps: { createdAt: 'created_at' } });

module.exports = mongoose.model('PerformanceRemark', performanceRemarkSchema);
