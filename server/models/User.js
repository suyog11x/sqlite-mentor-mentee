const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role:         { type: String, required: true, enum: ['admin', 'mentor', 'mentee'] },
    department:   { type: String, default: '' },
    phone:        { type: String, default: '' },
    fatherMobile: { type: String, default: '' },   // Father's contact (from bulk upload)
    motherMobile: { type: String, default: '' },   // Mother's contact (from bulk upload)
    rollno:       { type: String, default: '' },   // = UID for mentees (e.g. 24U1234)
    year:         { type: String, default: '' },
}, { timestamps: { createdAt: 'created_at' } });

// Compare plain password against stored hash
userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compareSync(plain, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
