// Working hours ("HH:MM") and workingDays (0=Sun..6=Sat) are interpreted in
// IST (Asia/Kolkata, UTC+5:30 — no DST), the app's single canonical
// timezone. scheduledAt is stored as an absolute UTC instant (Prisma
// DateTime), so it's shifted to IST wall-clock before extracting the day/
// hour/minute components used for comparison.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const IST_OFFSET_SUFFIX = '+05:30';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Shifts a UTC instant so that its getUTC* components read as IST wall-clock
// values — a standard trick for timezone math without a library.
function istParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    day: shifted.getUTCDay(),
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function isWithinWorkingHours(scheduledAt, doctorProfile) {
  const { day, minutesOfDay } = istParts(scheduledAt);
  if (!doctorProfile.workingDays.includes(day)) {
    return false;
  }

  const slotEnd = minutesOfDay + doctorProfile.slotDurationMinutes;

  return (
    minutesOfDay >= toMinutes(doctorProfile.workingHoursStart) &&
    slotEnd <= toMinutes(doctorProfile.workingHoursEnd)
  );
}

// A booked slot must fall on the doctor's configured cadence, e.g. slots at
// :00/:20/:40 for a 20-minute duration, anchored to the start of the working day.
function isAlignedToSlotGrid(scheduledAt, doctorProfile) {
  const { minutesOfDay } = istParts(scheduledAt);
  const gridStart = toMinutes(doctorProfile.workingHoursStart);
  return (minutesOfDay - gridStart) % doctorProfile.slotDurationMinutes === 0;
}

// A bare "YYYY-MM-DD" date has no time component; it's interpreted as an IST
// calendar day. When it marks the end of a date range we want it to cover
// the whole day, so push it to 23:59:59.999 IST.
function parseDateBoundary(value, isEnd) {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDateOnly
    ? new Date(`${value}T${isEnd ? '23:59:59.999' : '00:00:00.000'}${IST_OFFSET_SUFFIX}`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Validates the subset of schedule fields present in `input` (all optional —
// only what's provided is checked), so it works both for a full registration
// payload and a partial PUT .../schedule update. Returns an error message
// string, or null if everything present is valid. Cross-field checks (start
// before end) only run when both fields are present together.
function validateScheduleFields({ workingHoursStart, workingHoursEnd, workingDays, slotDurationMinutes }) {
  if (workingHoursStart !== undefined && !HHMM_RE.test(workingHoursStart)) {
    return 'workingHoursStart must be in HH:MM format';
  }
  if (workingHoursEnd !== undefined && !HHMM_RE.test(workingHoursEnd)) {
    return 'workingHoursEnd must be in HH:MM format';
  }
  if (
    workingHoursStart !== undefined &&
    workingHoursEnd !== undefined &&
    toMinutes(workingHoursEnd) <= toMinutes(workingHoursStart)
  ) {
    return 'workingHoursEnd must be after workingHoursStart';
  }
  if (
    workingDays !== undefined &&
    (!Array.isArray(workingDays) ||
      workingDays.length === 0 ||
      !workingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  ) {
    return 'workingDays must be a non-empty array of integers 0-6 (0=Sunday)';
  }
  if (
    slotDurationMinutes !== undefined &&
    (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0)
  ) {
    return 'slotDurationMinutes must be a positive integer';
  }
  return null;
}

module.exports = {
  isWithinWorkingHours,
  isAlignedToSlotGrid,
  parseDateBoundary,
  validateScheduleFields,
};
