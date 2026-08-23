import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { updateMySchedule } from '../../api/doctors';
import { getErrorMessage } from '../../api/client';
import { Alert, Button, Card, Input, Select } from '../../components/ui';
import { DAY_LABELS } from '../../utils/format';

const SLOT_DURATION_OPTIONS = [15, 30, 45, 60];

export default function ScheduleForm() {
  const { user, updateUser } = useAuth();
  const profile = user?.doctorProfile;

  const [workingDays, setWorkingDays] = useState(profile?.workingDays || [1, 2, 3, 4, 5]);
  const [workingHoursStart, setWorkingHoursStart] = useState(profile?.workingHoursStart || '09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState(profile?.workingHoursEnd || '17:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(profile?.slotDurationMinutes || 30);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleDay(day) {
    setWorkingDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (workingDays.length === 0) {
      setError('Select at least one working day');
      return;
    }

    setLoading(true);
    try {
      const updated = await updateMySchedule({
        workingHoursStart,
        workingHoursEnd,
        workingDays,
        slotDurationMinutes: Number(slotDurationMinutes),
      });
      updateUser({ doctorProfile: updated });
      setSuccess('Schedule updated successfully.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">My Working Schedule</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Working days</span>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <button
                type="button"
                key={label}
                onClick={() => toggleDay(day)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  workingDays.includes(day)
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Working hours start"
            type="time"
            value={workingHoursStart}
            onChange={(e) => setWorkingHoursStart(e.target.value)}
            required
          />
          <Input
            label="Working hours end"
            type="time"
            value={workingHoursEnd}
            onChange={(e) => setWorkingHoursEnd(e.target.value)}
            required
          />
        </div>

        <Select
          label="Slot duration"
          value={slotDurationMinutes}
          onChange={(e) => setSlotDurationMinutes(e.target.value)}
        >
          {SLOT_DURATION_OPTIONS.map((mins) => (
            <option key={mins} value={mins}>
              {mins} minutes
            </option>
          ))}
        </Select>

        <Alert>{error}</Alert>
        <Alert type="success">{success}</Alert>

        <Button type="submit" loading={loading}>
          Save Changes
        </Button>
      </form>
    </Card>
  );
}
