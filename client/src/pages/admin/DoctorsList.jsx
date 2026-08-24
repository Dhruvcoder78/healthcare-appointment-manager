import { useState } from 'react';
import { Alert, Badge, Button, Card, Input, Select } from '../../components/ui';
import { getErrorMessage } from '../../api/client';
import { updateDoctorSchedule } from '../../api/admin';
import { DAY_LABELS, formatDate } from '../../utils/format';

const SLOT_DURATION_OPTIONS = [15, 30, 45, 60];

function EditScheduleForm({ doctor, onDone, onSaved }) {
  const profile = doctor.doctorProfile;
  const [workingDays, setWorkingDays] = useState(profile?.workingDays || [1, 2, 3, 4, 5]);
  const [workingHoursStart, setWorkingHoursStart] = useState(profile?.workingHoursStart || '09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState(profile?.workingHoursEnd || '17:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(profile?.slotDurationMinutes || 30);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleDay(day) {
    setWorkingDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (workingDays.length === 0) {
      setError('Select at least one working day');
      return;
    }

    setLoading(true);
    try {
      const updated = await updateDoctorSchedule(doctor.id, {
        workingHoursStart,
        workingHoursEnd,
        workingDays,
        slotDurationMinutes: Number(slotDurationMinutes),
      });
      onSaved(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-slate-200 pt-3">
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
          label="Working hours start (IST)"
          type="time"
          value={workingHoursStart}
          onChange={(e) => setWorkingHoursStart(e.target.value)}
          required
        />
        <Input
          label="Working hours end (IST)"
          type="time"
          value={workingHoursEnd}
          onChange={(e) => setWorkingHoursEnd(e.target.value)}
          required
        />
      </div>

      <Select label="Slot duration" value={slotDurationMinutes} onChange={(e) => setSlotDurationMinutes(e.target.value)}>
        {SLOT_DURATION_OPTIONS.map((mins) => (
          <option key={mins} value={mins}>
            {mins} minutes
          </option>
        ))}
      </Select>

      <Alert>{error}</Alert>

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          Save changes
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Doctors are onboarded only via self-registration + approval (see the
// Notifications & Approvals tab) — admins can never create a doctor record.
// Once a doctor is approved (every doctor in this list is), the admin is the
// only one who can edit their working hours, working days, and slot
// duration — doctors no longer have self-service access to their own
// schedule.
export default function DoctorsList({ doctors, onDoctorUpdated }) {
  const [editingId, setEditingId] = useState(null);

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Doctor Directory ({doctors.length})</h2>
      {doctors.length === 0 ? (
        <p className="text-sm text-slate-500">No approved doctors yet.</p>
      ) : (
        <div className="space-y-3">
          {doctors.map((doc) => (
            <div key={doc.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{doc.name}</p>
                  <p className="text-sm text-slate-500">
                    {doc.doctorProfile?.specialization} · {doc.email}
                  </p>
                </div>
                <Badge tone="blue">{doc.doctorProfile?.slotDurationMinutes} min slots</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {doc.doctorProfile?.workingHoursStart}–{doc.doctorProfile?.workingHoursEnd} (IST) ·{' '}
                {(doc.doctorProfile?.workingDays || []).map((d) => DAY_LABELS[d]).join(', ')}
              </p>
              {doc.doctorProfile?.leaves?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {doc.doctorProfile.leaves.map((leave) => (
                    <Badge key={leave.id} tone={leave.status === 'APPROVED' ? 'red' : 'slate'}>
                      {leave.status === 'APPROVED' ? 'Leave' : leave.status}: {formatDate(leave.startDate)}–
                      {formatDate(leave.endDate)}
                    </Badge>
                  ))}
                </div>
              )}

              {editingId === doc.id ? (
                <EditScheduleForm
                  doctor={doc}
                  onDone={() => setEditingId(null)}
                  onSaved={(updatedProfile) => {
                    setEditingId(null);
                    onDoctorUpdated?.(doc.id, updatedProfile);
                  }}
                />
              ) : (
                <button
                  className="mt-3 text-sm font-medium text-blue-600 hover:underline"
                  onClick={() => setEditingId(doc.id)}
                >
                  Edit schedule
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
