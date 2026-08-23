import { useState } from 'react';
import { markDoctorLeave } from '../../api/admin';
import { getErrorMessage } from '../../api/client';
import { Alert, Button, Card, Input, Select, Textarea } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function MarkLeaveForm({ doctors, onLeaveMarked }) {
  const [doctorId, setDoctorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!doctorId) {
      setError('Select a doctor');
      return;
    }
    setLoading(true);
    try {
      const response = await markDoctorLeave(doctorId, { startDate, endDate, reason });
      setResult(response);
      onLeaveMarked?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Mark doctor leave</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
          <option value="">Select a doctor</option>
          {doctors.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.name} — {doc.doctorProfile?.specialization}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
        <Textarea label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />

        <Alert>{error}</Alert>

        <Button type="submit" loading={loading} variant="danger">
          Mark on leave
        </Button>
      </form>

      {result && (
        <div className="mt-4 space-y-2">
          <Alert type="success">Leave recorded.</Alert>
          {result.affectedPatients.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="mb-2 font-medium text-amber-800">
                {result.affectedPatients.length} existing appointment(s) were cancelled and patients notified:
              </p>
              <ul className="space-y-1 text-amber-700">
                {result.affectedPatients.map((ap) => (
                  <li key={ap.appointmentId}>
                    {ap.patient.name} ({ap.patient.email}) — {formatDateTime(ap.scheduledAt)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Alert type="info">No existing appointments were affected.</Alert>
          )}
        </div>
      )}
    </Card>
  );
}
