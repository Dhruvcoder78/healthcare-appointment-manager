// Generates the list of valid slot start times ("HH:MM", UTC) for a given
// date and doctor profile, purely from workingDays/workingHoursStart/
// workingHoursEnd/slotDurationMinutes. This mirrors the backend's
// isWithinWorkingHours/isAlignedToSlotGrid logic so the picker only ever
// offers times the server will actually accept — the server remains the
// source of truth for conflicts (already-booked slots, leave) via its own
// validation on submit.
export function generateSlotsForDate(dateStr, doctorProfile) {
  if (!dateStr || !doctorProfile) return [];

  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  if (!doctorProfile.workingDays.includes(day)) return [];

  const [startH, startM] = doctorProfile.workingHoursStart.split(':').map(Number);
  const [endH, endM] = doctorProfile.workingHoursEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const duration = doctorProfile.slotDurationMinutes;

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const slots = [];
  for (let t = startMinutes; t + duration <= endMinutes; t += duration) {
    if (isToday && t <= nowMinutes) continue;
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
}
