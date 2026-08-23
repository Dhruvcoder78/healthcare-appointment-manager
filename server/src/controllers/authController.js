const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { signToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

function sanitizeUser(user) {
  const { password, googleAccessToken, googleRefreshToken, ...safe } = user;
  return safe;
}

const SELF_REGISTERABLE_ROLES = ['PATIENT', 'DOCTOR'];

// Public self-registration. Only PATIENT and DOCTOR may self-register —
// ADMIN accounts are never created through this endpoint (allowing an
// arbitrary caller to request role: 'ADMIN' would be an unauthenticated
// privilege escalation). A self-registered DOCTOR gets an unapproved
// DoctorProfile: they can't log in and won't appear in patient search until
// an admin approves them (see adminController.approveDoctor).
async function register(req, res, next) {
  try {
    const { email, password, name, phone, role, specialization } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const requestedRole = role || 'PATIENT';
    if (!SELF_REGISTERABLE_ROLES.includes(requestedRole)) {
      return res.status(400).json({ error: 'role must be PATIENT or DOCTOR' });
    }
    if (requestedRole === 'DOCTOR' && !specialization) {
      return res.status(400).json({ error: 'specialization is required when registering as a doctor' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        phone,
        role: requestedRole,
        ...(requestedRole === 'DOCTOR' && {
          doctorProfile: { create: { specialization, approved: false } },
        }),
      },
      include: { doctorProfile: true },
    });

    if (requestedRole === 'DOCTOR') {
      return res.status(201).json({
        user: sanitizeUser(user),
        pendingApproval: true,
        message: 'Your doctor account has been created and is pending admin approval before you can log in.',
      });
    }

    const token = signToken(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email }, include: { doctorProfile: true } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.role === 'DOCTOR' && !user.doctorProfile?.approved) {
      return res.status(403).json({ error: 'Your doctor account is pending admin approval.' });
    }

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, sanitizeUser, SALT_ROUNDS };
