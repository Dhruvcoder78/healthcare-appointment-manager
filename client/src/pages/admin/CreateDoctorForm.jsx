import { useState } from 'react';
import { createDoctor } from '../../api/admin';
import { getErrorMessage } from '../../api/client';
import { Alert, Button, Card, Input, Textarea } from '../../components/ui';
import { DAY_LABELS } from '../../utils/format';

const DEFAULT_FORM = {
  name: '',
  email: '',
  password: '',
  phone: '',
  specialization: '',
  bio: '',
  workingHoursStart: '09:00',
  workingHoursEnd: '17:00',
  slotDurationMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
};

export default function CreateDoctorForm({ onCreated }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day)
        ? f.workingDays.filter((d) => d !== day)
        : [...f.workingDays, day].sort(),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const doctor = await createDoctor({
        ...form,
        slotDurationMinutes: Number(form.slotDurationMinutes),
      });
      setSuccess(`Doctor profile created for ${doctor.name}.`);
      setForm(DEFAULT_FORM);
      onCreated?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Create doctor profile</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full name" value={form.name} onChange={update('name')} required />
          <Input label="Specialization" value={form.specialization} onChange={update('specialization')} required />
          <Input label="Email" type="email" value={form.email} onChange={update('email')} required />
          <Input
            label="Password"
            type="password"
            minLength={8}
            value={form.password}
            onChange={update('password')}
            required
          />
          <Input label="Phone (optional)" value={form.phone} onChange={update('phone')} />
          <Input
            label="Slot duration (minutes)"
            type="number"
            min={5}
            step={5}
            value={form.slotDurationMinutes}
            onChange={update('slotDurationMinutes')}
            required
          />
          <Input
            label="Working hours start"
            type="time"
            value={form.workingHoursStart}
            onChange={update('workingHoursStart')}
            required
          />
          <Input
            label="Working hours end"
            type="time"
            value={form.workingHoursEnd}
            onChange={update('workingHoursEnd')}
            required
          />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Working days</span>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <button
                type="button"
                key={label}
                onClick={() => toggleDay(day)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  form.workingDays.includes(day)
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Textarea label="Bio (optional)" rows={2} value={form.bio} onChange={update('bio')} />

        <Alert>{error}</Alert>
        <Alert type="success">{success}</Alert>

        <Button type="submit" loading={loading}>
          Create doctor
        </Button>
      </form>
    </Card>
  );
}
