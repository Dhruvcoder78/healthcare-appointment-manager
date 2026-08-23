import { useState } from 'react';
import { searchDoctors } from '../../api/doctors';
import { bookAppointment } from '../../api/appointments';
import { getErrorMessage } from '../../api/client';
import { Alert, Button, Card, Input, Textarea } from '../../components/ui';
import { DAY_LABELS } from '../../utils/format';

function BookingForm({ doctor, onBooked }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!date || !time) {
      setError('Choose a date and time');
      return;
    }
    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00.000Z`).toISOString();
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
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="Time (UTC)" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
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
      const results = await searchDoctors(specialization);
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
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <Input
          className="flex-1"
          placeholder="Search by specialization (e.g. Cardiology)"
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
                  {doc.doctorProfile.workingHoursStart}–{doc.doctorProfile.workingHoursEnd} (UTC) ·{' '}
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
