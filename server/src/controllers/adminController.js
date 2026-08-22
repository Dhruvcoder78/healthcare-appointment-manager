const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { SALT_ROUNDS, sanitizeUser } = require('./authController');

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Creates a DOCTOR user account together with its DoctorProfile in one
// transaction, so a doctor never exists without profile data (working
// hours, slot duration) needed for booking.
async function createDoctor(req, res, next) {
  try {
    const {
      email,
      password,
      name,
      phone,
      specialization,
      bio,
      workingHoursStart,
      workingHoursEnd,
      workingDays,
      slotDurationMinutes,
    } = req.body;

    if (!email || !password || !name || !specialization) {
      return res
        .status(400)
        .json({ error: 'email, password, name, and specialization are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (workingHoursStart && !HHMM_RE.test(workingHoursStart)) {
      return res.status(400).json({ error: 'workingHoursStart must be in HH:MM format' });
    }
    if (workingHoursEnd && !HHMM_RE.test(workingHoursEnd)) {
      return res.status(400).json({ error: 'workingHoursEnd must be in HH:MM format' });
    }
    if (
      workingDays !== undefined &&
      (!Array.isArray(workingDays) || !workingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    ) {
      return res.status(400).json({ error: 'workingDays must be an array of integers 0-6' });
    }
    if (slotDurationMinutes !== undefined && (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0)) {
      return res.status(400).json({ error: 'slotDurationMinutes must be a positive integer' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const doctor = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        phone,
        role: 'DOCTOR',
        doctorProfile: {
          create: {
            specialization,
            bio,
            ...(workingHoursStart && { workingHoursStart }),
            ...(workingHoursEnd && { workingHoursEnd }),
            ...(workingDays && { workingDays }),
            ...(slotDurationMinutes && { slotDurationMinutes }),
          },
        },
      },
      include: { doctorProfile: true },
    });

    res.status(201).json({ user: sanitizeUser(doctor) });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDoctor };
