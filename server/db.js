const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
}

async function connectDB() {
    await mongoose.connect(MONGODB_URI, {
        maxPoolSize: 10,          // Handle up to 10 concurrent connections (scalable)
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    });
    console.log('✅  Connected to MongoDB Atlas');
    await seedDemoData();
}

async function seedDemoData() {
    const User = require('./models/User');
    const MentorMentee = require('./models/MentorMentee');
    const Meeting = require('./models/Meeting');
    const Message = require('./models/Message');
    const PerformanceRemark = require('./models/PerformanceRemark');

    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
        // Ensure demo passwords are always valid (fixes cloned-DB hash mismatches)
        const demos = [
            { email: 'admin@college.edu',  password: 'admin123'  },
            { email: 'mentor@college.edu', password: 'mentor123' },
            { email: 'mentee@college.edu', password: 'mentee123' },
        ];
        for (const { email, password } of demos) {
            const u = await User.findOne({ email });
            if (u && !u.comparePassword(password)) {
                u.passwordHash = bcrypt.hashSync(password, 10);
                await u.save();
                console.log(`🔑  Fixed password for ${email}`);
            }
        }
        return;
    }

    // Seed admin
    const admin = await User.create({
        name: 'System Administrator',
        email: 'admin@college.edu',
        passwordHash: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        department: 'Administration',
    });

    // Seed mentor
    const mentor = await User.create({
        name: 'Dr. Ramesh Kumar',
        email: 'mentor@college.edu',
        passwordHash: bcrypt.hashSync('mentor123', 10),
        role: 'mentor',
        department: 'Computer Science',
    });

    // Seed mentee
    const mentee = await User.create({
        name: 'Arjun Sharma',
        email: 'mentee@college.edu',
        passwordHash: bcrypt.hashSync('mentee123', 10),
        role: 'mentee',
        department: 'Computer Science',
        rollno: 'CS2024001',
        year: '2nd Year',
    });

    // Assign mentee to mentor
    await MentorMentee.create({ mentorId: mentor._id, menteeId: mentee._id });

    // Demo meeting (2 days from now)
    const meetingDate = new Date();
    meetingDate.setDate(meetingDate.getDate() + 2);
    await Meeting.create({
        mentorId: mentor._id,
        menteeId: mentee._id,
        scheduledAt: meetingDate,
        venue: 'Room 201, CSE Block',
        agenda: 'Academic progress review for Semester 4',
        status: 'scheduled',
    });

    // Demo message
    await Message.create({
        senderId: mentor._id,
        receiverId: mentee._id,
        content: 'Welcome to the mentorship program! Please upload your course registration documents at the earliest.',
    });

    // Demo remark
    await PerformanceRemark.create({
        mentorId: mentor._id,
        menteeId: mentee._id,
        remarks: 'Good academic performance. Needs to improve lab record submission punctuality.',
        semester: 'Semester 3',
        cgpa: '8.2',
    });

    console.log('✅  Database seeded with demo accounts');
    console.log('   Admin:  admin@college.edu / admin123');
    console.log('   Mentor: mentor@college.edu / mentor123');
    console.log('   Mentee: mentee@college.edu / mentee123');
}

module.exports = connectDB;
