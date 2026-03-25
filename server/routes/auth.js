const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'mentor_mentee_secret';

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    db.prepare("INSERT INTO activity_log (user_id, action, details) VALUES (?, 'login', ?)").run(user.id, `User logged in: ${user.email}`);

    res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, rollno: user.rollno, year: user.year }
    });
});

// POST /api/auth/change-password
const { authenticate } = require('../middleware/auth');
router.post('/change-password', authenticate, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
        return res.status(400).json({ error: 'Old password is incorrect' });
    }
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    res.json({ message: 'Password changed successfully' });
});

module.exports = router;
