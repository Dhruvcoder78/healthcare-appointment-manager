import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  ADMIN: 'Admin Portal',
  DOCTOR: 'Doctor Portal',
  PATIENT: 'Patient Portal',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {user ? ROLE_LABELS[user.role] : 'Healthcare Appointment Manager'}
            </h1>
          </div>
          {user && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-600">
                {user.name} <span className="text-slate-400">({user.email})</span>
              </span>
              {(user.role === 'PATIENT' || user.role === 'DOCTOR') && (
                <Link to="/settings" className="text-slate-600 hover:text-slate-900 hover:underline">
                  Settings
                </Link>
              )}
              <button
                onClick={logout}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
