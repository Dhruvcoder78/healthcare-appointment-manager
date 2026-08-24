import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { Alert, Spinner } from '../../components/ui';
import { getErrorMessage } from '../../api/client';
import { listDoctors } from '../../api/admin';
import MarkLeaveForm from './MarkLeaveForm';
import DoctorsList from './DoctorsList';
import NotificationsTab from './NotificationsTab';

const TABS = [
  { key: 'directory', label: 'Doctor Directory' },
  { key: 'leave', label: 'Leave Management' },
  { key: 'notifications', label: 'Notifications & Approvals' },
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('directory');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDoctors = useCallback(async () => {
    setError('');
    try {
      const data = await listDoctors();
      setDoctors(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  function handleDoctorUpdated(doctorId, updatedProfile) {
    setDoctors((prev) =>
      prev.map((doc) => (doc.id === doctorId ? { ...doc, doctorProfile: updatedProfile } : doc))
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex gap-1 rounded-md border border-slate-200 bg-white p-1 text-sm">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded px-3 py-2 font-medium transition-colors ${
              activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'directory' &&
        (loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-blue-600" />
          </div>
        ) : error ? (
          <Alert>{error}</Alert>
        ) : (
          <DoctorsList doctors={doctors} onDoctorUpdated={handleDoctorUpdated} />
        ))}

      {activeTab === 'leave' && <MarkLeaveForm doctors={doctors} onLeaveMarked={fetchDoctors} />}

      {activeTab === 'notifications' && <NotificationsTab />}
    </Layout>
  );
}
