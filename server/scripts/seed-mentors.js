/**
 * seed-mentors.js
 * ───────────────
 * One-time script: creates mentor accounts and assigns existing mentees.
 * Run: node server/scripts/seed-mentors.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User       = require('../models/User');
const MentorMentee = require('../models/MentorMentee');

// ─── Data ────────────────────────────────────────────────────────────────────
const DATA = [
  {
    mentor: 'PROF. SEENA KALGHATGI',
    mentees: ['ANUSHREE V RAICHUR','SOUJANYA','SANIKA RAJARAM JADHAV','BHOOMIKA','SNEHA','ADWITA AJIT SHENOY'],
  },
  {
    mentor: 'PROF. NAMITHA BHAT',
    mentees: ['SINDHU SHIVANAND MADDANI','SHREELATA TAVANAPPA SHIRAGAPUR','PRIYA RAJENDRA VANDURE','AFRA TAHERALI SAYED','SHREEYA SACHIN ASHTAPUTRE','NAMRATA R GANDIGAWAD'],
  },
  {
    mentor: 'PROF. PANKAJA KADALAGI',
    mentees: ['LAXMI M CHIMMALAGI','SAYALI DUDAPPA BELGAONKAR','PRADNYA MANOHAR SAWANT','ANKITA HANAMANT BHOVI','SRUSHTI SHIVAPUJIMATH'],
  },
  {
    mentor: 'PROF. ARATI SHAHAPURKAR',
    mentees: ['DARSHINI DODDAGOUDA PATIL','PRANISHA PARASHURAM CHOPADE','ANANYA KULKARNI','DEEPA NINGANAGOUDA PATIL','TANUSHREE BANASI'],
  },
  {
    mentor: 'PROF. KAVITA HANABARATTI',
    mentees: ['HARSHA DALAVAYI','MEHAK DANGE','PADMASHREE SHRINIVAS SAOOR','SNEHA HIREMANI','SANJANA KAMBAR'],
  },
  {
    mentor: 'PROF. SHUBHADA S KULKARNI',
    mentees: ['MANVITA D KALAL','SRUSHTI HANAMANT GADIVADDAR','RAKSHITA MURIGEPPA GADAVI','ARPITA HANUMANT TALAGADE','DEEPA MAHADEV NAYAK'],
  },
  {
    mentor: 'PROF. SUDHA SALAKE',
    mentees: ['RAKSHITA HANCHANAL','SRUSHTI SIDAGOND BAGALI','RASHMI RAMESH JIDDI','PAVITRA SOUDAGAR','KORI VIDYA CHANDRASHEKHAR'],
  },
  {
    mentor: 'DR. SHARADA M KORI',
    mentees: ['SAKSHI KALLAPPA MAJALATTI','DHRUVI SINDAGI','SAANVI P SHETTY','VAIBHAVI KHANDOJI','AISHWARYA S HIREMATH'],
  },
  {
    mentor: 'DR. ARUNDHATI NELLI',
    mentees: ['SAMRUDDHI CHOUGULE','SHREYA SHEETAL CHOUGALE','AMRUTA BASAYYA MATHAPATI','BHAKTI KALUTI','DIVYA GOUDAPPA PATIL'],
  },
  {
    mentor: 'PROF. JYOTI AMBOJI',
    mentees: ['RAKSHITA RAVENDRA KUDACHE','HARSHA SARNOBAT','PREETI VINOD IRESHANAVAR','NAVELI MARUTI CHOUGULE','BHAKTI SANJAY DHAMANEKAR'],
  },
  {
    mentor: 'PROF. AMRUTA DESHPANDE',
    mentees: ['MEGHA IRANAGOUDRA','SHREEYA GAJANAN DESAI','VALENCIA RODRIGUES','MEGHA PATTAR','VANISHREE ANGOLKAR'],
  },
  {
    mentor: 'DR. RANJANA BATTUR',
    mentees: ['VANDANA SATYAPPA SANTI','VAISHANAVI MAHADEV HONGAL','RUCHITA RAVI HEBALI','SHRUSTI SATISH NAYAK','SHREYA ASHOK HALINGALI'],
  },
  {
    mentor: 'PROF. VEENA KANGRALKAR',
    mentees: ['TANUSHA NAGARAJ BARKER','SHAMBHAVI PRABHUDEV HOLAGI','SOUNDARYA MARUTI VADEYAR','INDIRA ARUN NYAMAGOUDAR','SADHVI NAGARALE'],
  },
  {
    mentor: 'PROF. SAVITA BAKARE',
    mentees: ['SOUMYASHREE MUGGANNAVAR','DESAI RAJLAXMI RAJESH','S PUNYASHREE','RADHIKA','CHAITRA HIREMATH'],
  },
];

const DEFAULT_PASSWORD    = 'git@12345';
const MENTOR_EMAIL_DOMAIN = 'faculty.git.edu';
const MENTEE_EMAIL_DOMAIN = 'students.git.edu';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "PROF. SEENA KALGHATGI" → "seena.kalghatgi@faculty.git.edu" */
function mentorEmail(fullName) {
  const slug = fullName
    .toLowerCase()
    .replace(/^(prof\.|dr\.)\s*/i, '')   // strip title
    .trim()
    .replace(/\s+/g, '.');
  return `${slug}@${MENTOR_EMAIL_DOMAIN}`;
}

/** "ANUSHREE V RAICHUR" → "anushree.v.raichur@students.git.edu" */
function menteeEmail(fullName) {
  const slug = fullName.toLowerCase().trim().replace(/\s+/g, '.');
  return `${slug}@${MENTEE_EMAIL_DOMAIN}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔗  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  Connected\n');

  const defaultHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

  const stats = {
    mentorsCreated: 0,
    mentorsExisting: 0,
    menteesFound: 0,
    menteesCreated: 0,
    menteesNotFound: 0,
    assignmentsCreated: 0,
    assignmentsExisting: 0,
  };

  for (const { mentor: mentorName, mentees } of DATA) {
    console.log(`\n👩🏫  ${mentorName}`);

    // ── Find or create mentor ──
    const email = mentorEmail(mentorName);
    let mentorDoc = await User.findOne({ email });

    if (!mentorDoc) {
      // Also try matching by name (case-insensitive) in case the email differs
      mentorDoc = await User.findOne({ name: new RegExp(`^${mentorName}$`, 'i'), role: 'mentor' });
    }

    if (mentorDoc) {
      // Ensure role is mentor
      if (mentorDoc.role !== 'mentor') {
        mentorDoc.role = 'mentor';
        await mentorDoc.save();
      }
      console.log(`   ✔ Mentor exists (${mentorDoc.email})`);
      stats.mentorsExisting++;
    } else {
      mentorDoc = await User.create({
        name: mentorName,
        email,
        passwordHash: defaultHash,
        role: 'mentor',
      });
      console.log(`   ➕ Mentor created (${email})`);
      stats.mentorsCreated++;
    }

    // ── Process each mentee ──
    for (const menteeName of mentees) {
      // Try to find by name (case-insensitive) and role
      let menteeDoc = await User.findOne({
        name: new RegExp(`^${menteeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        role: 'mentee',
      });

      if (!menteeDoc) {
        // Broader search — any role, any case
        menteeDoc = await User.findOne({
          name: new RegExp(`^${menteeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });
      }

      if (menteeDoc) {
        // Ensure role is mentee
        if (menteeDoc.role !== 'mentee') {
          menteeDoc.role = 'mentee';
          await menteeDoc.save();
        }
        console.log(`      ✔ Mentee found: ${menteeDoc.name}`);
        stats.menteesFound++;
      } else {
        // Create mentee with name-derived email
        const mEmail = menteeEmail(menteeName);
        const existingByEmail = await User.findOne({ email: mEmail });
        if (existingByEmail) {
          // Already exists under a different name casing — use it
          menteeDoc = existingByEmail;
          console.log(`      ⚠ Mentee email clash, reusing: ${mEmail}`);
          stats.menteesFound++;
        } else {
          menteeDoc = await User.create({
            name: menteeName,
            email: mEmail,
            passwordHash: defaultHash,
            role: 'mentee',
          });
          console.log(`      ➕ Mentee created: ${menteeName} (${mEmail})`);
          stats.menteesCreated++;
        }
      }

      // ── Create or update mapping ──
      const existingMap = await MentorMentee.findOne({ menteeId: menteeDoc._id });
      if (existingMap) {
        if (String(existingMap.mentorId) !== String(mentorDoc._id)) {
          existingMap.mentorId  = mentorDoc._id;
          existingMap.assignedAt = new Date();
          await existingMap.save();
          console.log(`         🔄 Re-assigned to ${mentorName}`);
          stats.assignmentsCreated++;
        } else {
          console.log(`         ↩ Assignment already exists`);
          stats.assignmentsExisting++;
        }
      } else {
        await MentorMentee.create({ mentorId: mentorDoc._id, menteeId: menteeDoc._id });
        console.log(`         🔗 Assigned`);
        stats.assignmentsCreated++;
      }
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log('📊  Summary');
  console.log(`   Mentors created   : ${stats.mentorsCreated}`);
  console.log(`   Mentors existing  : ${stats.mentorsExisting}`);
  console.log(`   Mentees found     : ${stats.menteesFound}`);
  console.log(`   Mentees created   : ${stats.menteesCreated}`);
  console.log(`   Assignments new   : ${stats.assignmentsCreated}`);
  console.log(`   Assignments exist : ${stats.assignmentsExisting}`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✅  Done');
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
