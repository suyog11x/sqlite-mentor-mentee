const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action:    { type: String, required: true },
    details:   { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
});

// TTL index: auto-delete logs older than 90 days (scalability feature)
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
