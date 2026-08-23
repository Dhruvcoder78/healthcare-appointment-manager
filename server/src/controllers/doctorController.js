const prisma = require('../config/prisma');
const { validateScheduleFields } = require('../utils/scheduling');

// Patients search doctors by specialization (case-insensitive partial match).
// Omitting the query returns all doctors.
async function searchDoctors(req, res, next) {
  try {
    const { specialization } = req.query;

    const doctors = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        doctorProfile: {
          status: 'APPROVED',
          ...(specialization && { specialization: { contains: specialization, mode: 'insensitive' } }),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        doctorProfile: {
          select: {
            specialization: true,
            bio: true,
            workingHoursStart: true,
            workingHoursEnd: true,
            workingDays: true,
            slotDurationMinutes: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ doctors });
  } catch (err) {
    next(err);
  }
}

// Lets the authenticated doctor update their own working hours, working
// days, and slot duration. All fields optional — only what's provided is
// changed. Existing future appointments are unaffected; the new schedule
// only governs subsequent booking/reschedule validation and slot generation.
async function updateMySchedule(req, res, next) {
  try {
    const { workingHoursStart, workingHoursEnd, workingDays, slotDurationMinutes } = req.body;

    const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    // Cross-field validation (start-before-end) needs both values together,
    // so fall back to the existing stored value for whichever side of the
    // pair wasn't included in this request.
    const scheduleError = validateScheduleFields({
      workingHoursStart: workingHoursStart ?? profile.workingHoursStart,
      workingHoursEnd: workingHoursEnd ?? profile.workingHoursEnd,
      workingDays,
      slotDurationMinutes,
    });
    if (scheduleError) {
      return res.status(400).json({ error: scheduleError });
    }

    const updated = await prisma.doctorProfile.update({
      where: { id: profile.id },
      data: {
        ...(workingHoursStart !== undefined && { workingHoursStart }),
        ...(workingHoursEnd !== undefined && { workingHoursEnd }),
        ...(workingDays !== undefined && { workingDays }),
        ...(slotDurationMinutes !== undefined && { slotDurationMinutes }),
      },
    });

    res.json({ doctorProfile: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchDoctors, updateMySchedule };
