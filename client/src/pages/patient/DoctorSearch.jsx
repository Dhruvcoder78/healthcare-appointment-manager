import { useMemo, useState } from 'react';
import { searchDoctors } from '../../api/doctors';
import { bookAppointment } from '../../api/appointments';
import { getErrorMessage } from '../../api/client';
import { Alert, Button, Card, Input, Select, Textarea } from '../../components/ui';
import { DAY_LABELS } from '../../utils/format';
import { generateSlotsForDate } from '../../utils/slots';

function BookingForm({ doctor, onBooked }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Slots are generated purely from the doctor's current schedule
  // (workingDays/workingHours/slotDurationMinutes), so the picker always
  // reflects their latest settings. The server remains the source of truth
  // for conflicts (already-booked slots, leave) at submit time.
  const availableSlots = useMemo(() => generateSlotsForDate(date, doctor.doctorProfile), [date, doctor]);

  function handleDateChange(e) {
    setDate(e.target.value);
    setTime('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!date || !time) {
      setError('Choose a date and time');
      return;
    }
    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00.000+05:30`).toISOString();
      await bookAppointment({ doctorId: doctor.id, scheduledAt, symptoms });
      setDate('');
      setTime('');
      setSymptoms('');
      onBooked?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={date} onChange={handleDateChange} required />
        <Select
          label="Time (IST)"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!date || availableSlots.length === 0}
          required
        >
          <option value="">{date ? 'Select a time' : 'Choose a date first'}</option>
          {availableSlots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </Select>
      </div>
      {date && availableSlots.length === 0 && (
        <p className="text-xs text-amber-600">
          Dr. {doctor.name} doesn&apos;t have any working hours on this day — choose another date.
        </p>
      )}
      <Textarea
        label="Describe your symptoms"
        rows={3}
        value={symptoms}
        onChange={(e) => setSymptoms(e.target.value)}
        placeholder="e.g. persistent headache and mild fever for 3 days"
        required
      />
      <Alert>{error}</Alert>
      <Button type="submit" loading={loading}>
        Confirm booking
      </Button>
    </form>
  );
}

export default function DoctorSearch({ onBooked }) {
  const [specialization, setSpecialization] = useState('');
  const [name, setName] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const results = await searchDoctors({ specialization, name });
      setDoctors(results);
      setSearched(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Find a doctor</h2>
      <form onSubmit={handleSearch} className="mb-4 flex flex-wrap gap-2">
        <Input
          className="flex-1"
          placeholder="Doctor name (e.g. Dr. Sunil Kumar)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          className="flex-1"
          placeholder="Specialization (e.g. Cardiology)"
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
        />
        <Button type="submit" loading={loading}>
          Search
        </Button>
      </form>

      <Alert>{error}</Alert>

      {searched && !loading && doctors.length === 0 && (
        <p className="text-sm text-slate-500">No doctors found for that specialization.</p>
      )}

      <div className="space-y-3">
        {doctors.map((doc) => (
          <div key={doc.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">{doc.name}</p>
                <p className="text-sm text-slate-500">{doc.doctorProfile.specialization}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {doc.doctorProfile.workingHoursStart}–{doc.doctorProfile.workingHoursEnd} (IST) ·{' '}
                  {doc.doctorProfile.workingDays.map((d) => DAY_LABELS[d]).join(', ')} ·{' '}
                  {doc.doctorProfile.slotDurationMinutes} min slots
                </p>
              </div>
              <Button variant="secondary" onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}>
                {expanded === doc.id ? 'Cancel' : 'Book'}
              </Button>
            </div>
            {expanded === doc.id && (
              <BookingForm
                doctor={doc}
                onBooked={() => {
                  setExpanded(null);
                  onBooked?.();
                }}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
