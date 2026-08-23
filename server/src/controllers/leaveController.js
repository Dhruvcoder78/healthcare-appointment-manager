const prisma = require('../config/prisma');
const { parseDateBoundary } = require('../utils/scheduling');

// A doctor requests leave for themselves. Created as PENDING — it does not
// block bookings or cancel any appointment until an admin approves it
// (see adminController.approveLeaveRequest).
async function requestLeave(req, res, next) {
  try {
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

    const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }
    if (profile.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Your account must be approved before requesting leave' });
    }

    const leave = await prisma.doctorLeave.create({
      data: {
        doctorId: profile.id,
        startDate: start,
        endDate: end,
        reason,
        status: 'PENDING',
      },
    });

    res.status(201).json({ leave });
  } catch (err) {
    next(err);
  }
}

// Lists the authenticated doctor's own leave requests (any status).
async function listMyLeaves(req, res, next) {
  try {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) {
      return res.status(404).json({ error: 'Doctor profile not found' });
    }

    const leaves = await prisma.doctorLeave.findMany({
      where: { doctorId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ leaves });
  } catch (err) {
    next(err);
  }
}

module.exports = { requestLeave, listMyLeaves };
