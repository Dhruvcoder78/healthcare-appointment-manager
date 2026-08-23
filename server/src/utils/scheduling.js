// Working hours ("HH:MM") and workingDays (0=Sun..6=Sat) are interpreted in
// UTC, matching how scheduledAt (an ISO timestamp) is stored and compared.

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isWithinWorkingHours(scheduledAt, doctorProfile) {
  const day = scheduledAt.getUTCDay();
  if (!doctorProfile.workingDays.includes(day)) {
    return false;
  }

  const slotStart = scheduledAt.getUTCHours() * 60 + scheduledAt.getUTCMinutes();
  const slotEnd = slotStart + doctorProfile.slotDurationMinutes;

  return (
    slotStart >= toMinutes(doctorProfile.workingHoursStart) &&
    slotEnd <= toMinutes(doctorProfile.workingHoursEnd)
  );
}

// A booked slot must fall on the doctor's configured cadence, e.g. slots at
// :00/:20/:40 for a 20-minute duration, anchored to the start of the working day.
function isAlignedToSlotGrid(scheduledAt, doctorProfile) {
  const slotStart = scheduledAt.getUTCHours() * 60 + scheduledAt.getUTCMinutes();
  const gridStart = toMinutes(doctorProfile.workingHoursStart);
  return (slotStart - gridStart) % doctorProfile.slotDurationMinutes === 0;
}

// A bare "YYYY-MM-DD" date has no time component; when it marks the end of
// a date range we want it to cover the whole day, so push it to 23:59:59.999.
function parseDateBoundary(value, isEnd) {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isDateOnly && isEnd) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

module.exports = { isWithinWorkingHours, isAlignedToSlotGrid, parseDateBoundary };
