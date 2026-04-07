const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    menteeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type:         { type: String, required: true },
    originalName: { type: String, required: true },
    filename:     { type: String, required: true },
    filepath:     { type: String, required: true },
    uploadDate:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Document', documentSchema);
