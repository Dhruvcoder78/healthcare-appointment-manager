const prisma = require('../config/prisma');

// Patients search doctors by specialization (case-insensitive partial match).
// Omitting the query returns all doctors.
async function searchDoctors(req, res, next) {
  try {
    const { specialization } = req.query;

    const doctors = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        doctorProfile: specialization
          ? { specialization: { contains: specialization, mode: 'insensitive' } }
          : { isNot: null },
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
