import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Spinner } from '../../components/ui';
import { getErrorMessage } from '../../api/client';
import { formatDate } from '../../utils/format';
import {
  listPendingDoctors,
  approveDoctor,
  rejectDoctor,
  listPendingLeaves,
  approveLeave,
  rejectLeave,
} from '../../api/admin';

function PendingDoctorRow({ doctor, onResolved }) {
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  async function handle(action, fn) {
    setError('');
    setLoading(action);
    try {
      await fn(doctor.id);
      onResolved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">{doctor.name}</p>
          <p className="text-sm text-slate-500">
            {doctor.doctorProfile?.specialization} · {doctor.email}
          </p>
          <p className="mt-1 text-xs text-slate-400">Registered {formatDate(doctor.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button loading={loading === 'approve'} onClick={() => handle('approve', approveDoctor)}>
            Approve
          </Button>
          <Button variant="danger" loading={loading === 'reject'} onClick={() => handle('reject', rejectDoctor)}>
            Reject
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </div>
  );
}

function PendingLeaveRow({ leave, onResolved }) {
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Approving fetches back an "affected appointments" summary that the admin
  // needs to actually read — so unlike reject, it does NOT immediately tell
  // the parent to refetch (which would remove this row from the pending list
  // before the summary was ever shown). The refetch happens once the admin
  // dismisses the summary.
  async function handleApprove() {
    setError('');
    setLoading('approve');
    try {
      const response = await approveLeave(leave.id);
      setResult(response);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading('');
    }
  }

  async function handleReject() {
    setError('');
    setLoading('reject');
    try {
      await rejectLeave(leave.id);
      onResolved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">Dr. {leave.doctor.user.name}</p>
          <p className="text-sm text-slate-500">{leave.doctor.user.email}</p>
          <p className="mt-1 text-sm text-slate-700">
            {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
          </p>
          {leave.reason && <p className="mt-1 text-xs text-slate-500">Reason: {leave.reason}</p>}
        </div>
        {!result && (
          <div className="flex gap-2">
            <Button loading={loading === 'approve'} onClick={handleApprove}>
              Approve
            </Button>
            <Button variant="danger" loading={loading === 'reject'} onClick={handleReject}>
              Reject
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
      {result && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-800">
          <span>
            Leave approved.{' '}
            {result.affectedPatients.length > 0
              ? `${result.affectedPatients.length} existing appointment(s) were cancelled and patients notified.`
              : 'No existing appointments were affected.'}
          </span>
          <Button variant="secondary" onClick={onResolved}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export default function NotificationsTab() {
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setError('');
    try {
      const [doctors, leaves] = await Promise.all([listPendingDoctors(), listPendingLeaves()]);
      setPendingDoctors(doctors);
      setPendingLeaves(leaves);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="h-6 w-6 text-blue-600" />
      </div>
    );
  }

  if (error) {
    return <Alert>{error}</Alert>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Pending Doctor Registrations</h2>
          <Badge tone="amber">{pendingDoctors.length}</Badge>
        </div>
        {pendingDoctors.length === 0 ? (
          <p className="text-sm text-slate-500">No pending doctor registrations.</p>
        ) : (
          <div className="space-y-3">
            {pendingDoctors.map((doc) => (
              <PendingDoctorRow key={doc.id} doctor={doc} onResolved={fetchAll} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Pending Leave Requests</h2>
          <Badge tone="amber">{pendingLeaves.length}</Badge>
        </div>
        {pendingLeaves.length === 0 ? (
          <p className="text-sm text-slate-500">No pending leave requests.</p>
        ) : (
          <div className="space-y-3">
            {pendingLeaves.map((leave) => (
              <PendingLeaveRow key={leave.id} leave={leave} onResolved={fetchAll} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
