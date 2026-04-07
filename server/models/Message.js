const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content:    { type: String, required: true },
    timestamp:  { type: Date, default: Date.now },
    isRead:     { type: Boolean, default: false },
});

// Compound index so conversation queries are fast at scale
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, isRead: 1 });

module.exports = mongoose.model('Message', messageSchema);
