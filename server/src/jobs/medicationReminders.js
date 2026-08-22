const prisma = require('../config/prisma');
const { sendMail } = require('../services/emailService');

const MAX_RETRIES = 5;

function computeNextSendAt(from, intervalHours) {
  return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
}

function sendReminderEmail(reminder) {
  return sendMail({
    to: reminder.patient.email,
    subject: `Medication reminder: ${reminder.medicationName}`,
    text: `Hi ${reminder.patient.name}, this is a reminder to take your medication: ${reminder.medicationName}${
      reminder.dosage ? ` (${reminder.dosage})` : ''
    }.`,
  });
}

// Shared by both jobs: attempts to send, then updates status/retryCount/nextSendAt
// accordingly. A course that has passed its endDate is marked SENT (done)
// instead of being rescheduled again.
async function attemptSendAndUpdate(reminder) {
  const result = await sendReminderEmail(reminder);
  const now = new Date();
  const courseEnded = reminder.endDate && now >= reminder.endDate;

  if (result.success) {
    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: {
        lastSentAt: now,
        retryCount: 0,
        status: courseEnded ? 'SENT' : 'PENDING',
        nextSendAt: courseEnded ? null : computeNextSendAt(now, reminder.intervalHours),
      },
    });
  } else {
    console.error(`[medication-reminders] send failed for reminder ${reminder.id}:`, result.error);
    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: { status: 'FAILED', retryCount: { increment: 1 } },
    });
  }

  return result.success;
}

// Periodically checks for reminders that are due to be sent.
async function processDueReminders() {
  const now = new Date();
  const due = await prisma.medicationReminder.findMany({
    where: {
      status: 'PENDING',
      OR: [{ nextSendAt: { lte: now } }, { nextSendAt: null, startDate: { lte: now } }],
    },
    include: { patient: true },
  });

  for (const reminder of due) {
    await attemptSendAndUpdate(reminder);
  }

  return { checked: due.length };
}

// Periodically retries reminders whose last delivery attempt failed, up to
// MAX_RETRIES; beyond that the reminder is left FAILED for manual review.
async function retryFailedReminders() {
  const failed = await prisma.medicationReminder.findMany({
    where: { status: 'FAILED', retryCount: { lt: MAX_RETRIES } },
    include: { patient: true },
  });

  for (const reminder of failed) {
    await attemptSendAndUpdate(reminder);
  }

  return { retried: failed.length };
}

module.exports = { processDueReminders, retryFailedReminders, MAX_RETRIES };
