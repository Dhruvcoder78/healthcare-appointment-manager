import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { Alert, Spinner } from '../../components/ui';
import { getErrorMessage } from '../../api/client';
import { listDoctors } from '../../api/admin';
import CreateDoctorForm from './CreateDoctorForm';
import MarkLeaveForm from './MarkLeaveForm';
import DoctorsList from './DoctorsList';

export default function AdminDashboard() {
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

  return (
    <Layout>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <CreateDoctorForm onCreated={fetchDoctors} />
          <MarkLeaveForm doctors={doctors} onLeaveMarked={fetchDoctors} />
        </div>
        <div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-blue-600" />
            </div>
          ) : error ? (
            <Alert>{error}</Alert>
          ) : (
            <DoctorsList doctors={doctors} onChanged={fetchDoctors} />
          )}
        </div>
      </div>
    </Layout>
  );
}
