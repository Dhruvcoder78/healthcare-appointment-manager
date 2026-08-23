import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import { Alert, Card, Input, Spinner } from '../../components/ui';
import { getErrorMessage } from '../../api/client';
import { listMyAppointments } from '../../api/appointments';
import DoctorQueue from './DoctorQueue';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function DoctorDashboard() {
  const [date, setDate] = useState(todayISODate());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Guards against an older request (e.g. the initial "today" fetch) resolving
  // after a newer one and clobbering it with stale/out-of-order data.
  const requestIdRef = useRef(0);

  const fetchQueue = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError('');
    setLoading(true);
    try {
      const data = await listMyAppointments(date);
      if (requestId === requestIdRef.current) {
        setAppointments(data);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [date]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Card>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-blue-600" />
          </div>
        ) : error ? (
          <Alert>{error}</Alert>
        ) : (
          <DoctorQueue appointments={appointments} onChanged={fetchQueue} />
        )}
      </div>
    </Layout>
  );
}
