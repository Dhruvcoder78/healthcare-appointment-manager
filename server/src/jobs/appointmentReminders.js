const prisma = require('../config/prisma');
const { sendAppointmentReminder } = require('../services/notificationService');

// Runs every 5 minutes (see jobs/index.js). Deliberately repeating, not
// one-time: every PENDING/CONFIRMED appointment that hasn't happened yet
// gets a reminder emailed to both patient and doctor on every run, from the
// moment it's booked right up until its scheduled time passes — at which
// point the `scheduledAt: { gt: now }` filter excludes it and the reminders
// stop on their own (no separate "already reminded" gate).
async function sendUpcomingReminders() {
  const now = new Date();

  const upcoming = await prisma.appointment.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      scheduledAt: { gt: now },
    },
    include: { patient: true, doctor: true },
  });

  for (const appt of upcoming) {
    await sendAppointmentReminder(appt, appt.patient, appt.doctor);
    await prisma.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: new Date() } });
  }

  return { reminded: upcoming.length };
}

module.exports = { sendUpcomingReminders };
