import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { Alert, Button, Card, Input } from '../components/ui';

const ROLE_TABS = [
  { value: 'PATIENT', label: 'Patient' },
  { value: 'DOCTOR', label: 'Doctor' },
];

const HEADING_BY_ROLE = {
  PATIENT: 'Patient registration',
  DOCTOR: 'Doctor registration',
};

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('PATIENT');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', specialization: '' });
  const [error, setError] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/patient" replace />;
  }

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setPendingMessage('');
    setLoading(true);
    try {
      const response = await register({ ...form, role });
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
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
                <Input
                  label="Specialization"
                  value={form.specialization}
                  onChange={update('specialization')}
                  placeholder="e.g. Cardiology"
                  required
                />
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
                Doctor accounts require admin approval before you can log in.
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
