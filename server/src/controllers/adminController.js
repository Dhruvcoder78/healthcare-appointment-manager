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

const ACTIVE_APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED'];

// A bare "YYYY-MM-DD" date has no time component; when it marks the end of
// a leave range we want it to cover the whole day, so push it to 23:59:59.999.
function parseDateBoundary(value, isEnd) {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isDateOnly && isEnd) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

// Marks a doctor on leave for a date range and cancels every existing
// PENDING/CONFIRMED appointment that falls within it, returning the list of
// affected patients (with their appointment details) so they can be notified.
async function markDoctorLeave(req, res, next) {
  try {
    const { doctorId } = req.params;
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = parseDateBoundary(startDate, false);
    const end = parseDateBoundary(endDate, true);
    if (!start || !end) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
    }
    if (end < start) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: 'DOCTOR' },
      include: { doctorProfile: true },
    });
    if (!doctor || !doctor.doctorProfile) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const { leave, affectedAppointments } = await prisma.$transaction(async (tx) => {
      const createdLeave = await tx.doctorLeave.create({
        data: {
          doctorId: doctor.doctorProfile.id,
          startDate: start,
          endDate: end,
          reason,
        },
      });

      const appointmentsToCancel = await tx.appointment.findMany({
        where: {
          doctorId: doctor.id,
          scheduledAt: { gte: start, lte: end },
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
        },
        include: {
          patient: { select: { id: true, name: true, email: true, phone: true } },
        },
      });

      if (appointmentsToCancel.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: appointmentsToCancel.map((a) => a.id) } },
          data: { status: 'CANCELLED' },
        });
      }

      return { leave: createdLeave, affectedAppointments: appointmentsToCancel };
    });

    const affectedPatients = affectedAppointments.map((appt) => ({
      appointmentId: appt.id,
      scheduledAt: appt.scheduledAt,
      patient: appt.patient,
    }));

    res.status(201).json({ leave, affectedPatients });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDoctor, markDoctorLeave };
