import { useCallback, useEffect, useState } from 'react';
import { requestLeave, listMyLeaves } from '../../api/leaves';
import { getErrorMessage } from '../../api/client';
import { Alert, Badge, Button, Card, Input, Textarea } from '../../components/ui';
import { formatDate } from '../../utils/format';

const LEAVE_STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

export default function RequestLeaveForm() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [myLeaves, setMyLeaves] = useState([]);

  const fetchLeaves = useCallback(async () => {
    try {
      const data = await listMyLeaves();
      setMyLeaves(data);
    } catch {
      // Non-critical: the request form still works even if this list fails to load.
    }
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestLeave({ startDate, endDate, reason });
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchLeaves();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Request leave</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
        <Textarea label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Alert>{error}</Alert>
        <Button type="submit" loading={loading}>
          Submit request
        </Button>
      </form>

      {myLeaves.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700">Your leave requests</p>
          {myLeaves.map((leave) => (
            <div key={leave.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
              </span>
              <Badge tone={LEAVE_STATUS_TONE[leave.status] || 'slate'}>{leave.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
