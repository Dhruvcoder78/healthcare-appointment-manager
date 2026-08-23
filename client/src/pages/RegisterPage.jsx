import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { Alert, Button, Card, Input } from '../components/ui';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
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
    setLoading(true);
    try {
      await register(form);
      navigate('/patient', { replace: true });
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
        <p className="mb-4 text-sm text-slate-500">Patient registration</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Full name" value={form.name} onChange={update('name')} required />
          <Input label="Email" type="email" value={form.email} onChange={update('email')} required />
          <Input label="Phone (optional)" value={form.phone} onChange={update('phone')} />
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
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
