const cron = require('node-cron');
const { processDueReminders, retryFailedReminders } = require('./medicationReminders');
const { sendUpcomingReminders } = require('./appointmentReminders');

function startJobs() {
  const reminderSchedule = process.env.MEDICATION_REMINDER_CRON || '*/15 * * * *';
  const retrySchedule = process.env.EMAIL_RETRY_CRON || '*/10 * * * *';
  const appointmentReminderSchedule = process.env.APPOINTMENT_REMINDER_CRON || '0 * * * *';

  cron.schedule(reminderSchedule, async () => {
    try {
      const { checked } = await processDueReminders();
      if (checked > 0) console.log(`[medication-reminders] processed ${checked} due reminder(s)`);
    } catch (err) {
      console.error('[medication-reminders] job failed:', err);
    }
  });

  cron.schedule(retrySchedule, async () => {
    try {
      const { retried } = await retryFailedReminders();
      if (retried > 0) console.log(`[email-retry] retried ${retried} failed reminder(s)`);
    } catch (err) {
      console.error('[email-retry] job failed:', err);
    }
  });

  cron.schedule(appointmentReminderSchedule, async () => {
    try {
      const { reminded } = await sendUpcomingReminders();
      if (reminded > 0) console.log(`[appointment-reminders] reminded ${reminded} upcoming appointment(s)`);
    } catch (err) {
      console.error('[appointment-reminders] job failed:', err);
    }
  });

  console.log(
    `Background jobs scheduled (reminders: "${reminderSchedule}", retry: "${retrySchedule}", appointment reminders: "${appointmentReminderSchedule}")`
  );
}

module.exports = { startJobs };
