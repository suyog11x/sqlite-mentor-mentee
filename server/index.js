require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve frontend
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/mentor', require('./routes/mentor'));
app.use('/api/mentee', require('./routes/mentee'));
app.use('/api/reports', require('./routes/reports'));

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`\n🎓 Mentor–Mentee System running at http://localhost:${PORT}`);
    console.log(`   Demo accounts:`);
    console.log(`     Admin:  admin@college.edu  / admin123`);
    console.log(`     Mentor: mentor@college.edu / mentor123`);
    console.log(`     Mentee: mentee@college.edu / mentee123\n`);
});
