const jwt         = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');

const JWT_SECRET = process.env.JWT_SECRET || 'mentor_mentee_secret';

function authenticate(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.token || req.query?.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        // Fire-and-forget activity log (non-blocking — runs synchronously but won't throw)
        try {
            ActivityLog.create({
                userId: decoded.id,
                action: `API ${req.method} ${req.path}`,
            });
        } catch (_) {}
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
