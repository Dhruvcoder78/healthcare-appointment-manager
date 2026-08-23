import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

const HOME_BY_ROLE = {
  ADMIN: '/admin',
  DOCTOR: '/doctor',
  PATIENT: '/patient',
};

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={HOME_BY_ROLE[user.role] || '/login'} replace />;
  }

  return children;
}
