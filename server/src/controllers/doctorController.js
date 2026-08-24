const prisma = require('../config/prisma');

// Patients search doctors by specialization and/or name (case-insensitive
// partial match on either, combined with AND when both are given). Omitting
// both returns all approved doctors.
async function searchDoctors(req, res, next) {
  try {
    const { specialization, name } = req.query;

    const doctors = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
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

module.exports = { searchDoctors };
