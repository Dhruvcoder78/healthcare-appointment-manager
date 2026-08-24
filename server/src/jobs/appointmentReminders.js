const prisma = require('../config/prisma');
const { sendAppointmentReminder } = require('../services/notificationService');

const REMINDER_WINDOW_HOURS = 24;

// Periodically checks for appointments happening within the next 24 hours
// that haven't been reminded about yet, and emails both patient and doctor
// once (gated by `reminderSentAt`) — a one-time "1 day before" notice, not a
// repeating nudge.
async function sendUpcomingReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

  const upcoming = await prisma.appointment.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      scheduledAt: { gte: now, lte: windowEnd },
      reminderSentAt: null,
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
