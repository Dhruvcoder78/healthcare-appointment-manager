import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { Alert, Button, Card, Input, Select } from '../components/ui';
import { DAY_LABELS } from '../utils/format';

const ROLE_TABS = [
  { value: 'PATIENT', label: 'Patient' },
  { value: 'DOCTOR', label: 'Doctor' },
];

const HEADING_BY_ROLE = {
  PATIENT: 'Patient registration',
  DOCTOR: 'Doctor registration',
};

const SLOT_DURATION_OPTIONS = [15, 30, 45, 60];

const DEFAULT_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  specialization: '',
  workingDays: [1, 2, 3, 4, 5],
  workingHoursStart: '09:00',
  workingHoursEnd: '17:00',
  slotDurationMinutes: 30,
};

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('PATIENT');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/patient" replace />;
  }

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
    setPendingMessage('');
    setLoading(true);
    try {
      const payload =
        role === 'DOCTOR' ? { ...form, slotDurationMinutes: Number(form.slotDurationMinutes) } : form;
      const response = await register({ ...payload, role });
      if (response.pendingApproval) {
        setPendingMessage(response.message);
      } else {
        navigate('/patient', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Create your account</h1>
        <p className="mb-4 text-sm text-slate-500">{HEADING_BY_ROLE[role]}</p>

        {pendingMessage ? (
          <div className="space-y-4">
            <Alert type="success">{pendingMessage}</Alert>
            <Link to="/login" className="block text-center text-sm text-blue-600 hover:underline">
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex rounded-md border border-slate-300 p-1 text-sm">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setRole(tab.value)}
                  className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
                    role === tab.value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Full name" value={form.name} onChange={update('name')} required />
              <Input label="Email" type="email" value={form.email} onChange={update('email')} required />
              <Input label="Phone (optional)" value={form.phone} onChange={update('phone')} />

              {role === 'DOCTOR' && (
                <>
                  <Input
                    label="Specialization"
                    value={form.specialization}
                    onChange={update('specialization')}
                    placeholder="e.g. Cardiology"
                    required
                  />

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

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Working hours start (IST)"
                      type="time"
                      value={form.workingHoursStart}
                      onChange={update('workingHoursStart')}
                      required
                    />
                    <Input
                      label="Working hours end (IST)"
                      type="time"
                      value={form.workingHoursEnd}
                      onChange={update('workingHoursEnd')}
                      required
                    />
                  </div>

                  <Select label="Slot duration" value={form.slotDurationMinutes} onChange={update('slotDurationMinutes')}>
                    {SLOT_DURATION_OPTIONS.map((mins) => (
                      <option key={mins} value={mins}>
                        {mins} minutes
                      </option>
                    ))}
                  </Select>
                </>
              )}

              <Input
                label="Password"
                type="password"
                minLength={8}
                value={form.password}
                onChange={update('password')}
                required
              />
              <Alert>{error}</Alert>
              <Button type="submit" loading={loading} className="w-full">
                Sign up
              </Button>
            </form>

            {role === 'DOCTOR' && (
              <p className="mt-3 text-xs text-slate-400">
                Doctor accounts require admin approval before you can log in. You can change your schedule any time
                from the Doctor Portal.
              </p>
            )}

            <p className="mt-4 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
