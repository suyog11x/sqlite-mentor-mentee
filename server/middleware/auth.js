const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'mentor_mentee_secret';

function authenticate(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        // Log activity
        db.prepare("INSERT INTO activity_log (user_id, action) VALUES (?, ?)").run(decoded.id, `API ${req.method} ${req.path}`);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) {
            return res.status(403).json({ error: `Forbidden: requires role ${roles.join(' or ')}` });
        }
        next();
    };
}

module.exports = { authenticate, requireRole };
