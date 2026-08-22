const cron = require('node-cron');
const { processDueReminders, retryFailedReminders } = require('./medicationReminders');

function startJobs() {
  const reminderSchedule = process.env.MEDICATION_REMINDER_CRON || '*/15 * * * *';
  const retrySchedule = process.env.EMAIL_RETRY_CRON || '*/10 * * * *';

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

  console.log(`Background jobs scheduled (reminders: "${reminderSchedule}", retry: "${retrySchedule}")`);
}

module.exports = { startJobs };
