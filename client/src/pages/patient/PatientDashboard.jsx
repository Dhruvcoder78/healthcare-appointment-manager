import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { Alert, Spinner } from '../../components/ui';
import { getErrorMessage } from '../../api/client';
import { listMyAppointments } from '../../api/appointments';
import DoctorSearch from './DoctorSearch';
import PatientAppointments from './PatientAppointments';

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAppointments = useCallback(async () => {
    setError('');
    try {
      const data = await listMyAppointments();
      setAppointments(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return (
    <Layout>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DoctorSearch onBooked={fetchAppointments} />
        <div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-blue-600" />
            </div>
          ) : error ? (
            <Alert>{error}</Alert>
          ) : (
            <PatientAppointments appointments={appointments} onChanged={fetchAppointments} />
          )}
        </div>
      </div>
    </Layout>
  );
}
