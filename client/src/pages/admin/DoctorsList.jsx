import { useState } from 'react';
import { Card, Badge, Button, Alert } from '../../components/ui';
import { DAY_LABELS, formatDate } from '../../utils/format';
import { approveDoctor } from '../../api/admin';
import { getErrorMessage } from '../../api/client';

function DoctorRow({ doc, onApproved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isPending = doc.doctorProfile && !doc.doctorProfile.approved;

  async function handleApprove() {
    setError('');
    setLoading(true);
    try {
      await approveDoctor(doc.id);
      onApproved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-md border p-3 ${isPending ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">{doc.name}</p>
          <p className="text-sm text-slate-500">
            {doc.doctorProfile?.specialization} · {doc.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPending && <Badge tone="amber">Pending approval</Badge>}
          <Badge tone="blue">{doc.doctorProfile?.slotDurationMinutes} min slots</Badge>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {doc.doctorProfile?.workingHoursStart}–{doc.doctorProfile?.workingHoursEnd} ·{' '}
        {(doc.doctorProfile?.workingDays || []).map((d) => DAY_LABELS[d]).join(', ')}
      </p>
      {doc.doctorProfile?.leaves?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {doc.doctorProfile.leaves.map((leave) => (
            <Badge key={leave.id} tone="red">
              Leave: {formatDate(leave.startDate)}–{formatDate(leave.endDate)}
            </Badge>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
      {isPending && (
        <Button className="mt-3" loading={loading} onClick={handleApprove}>
          Approve doctor
        </Button>
      )}
    </div>
  );
}

export default function DoctorsList({ doctors, onChanged }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Doctors ({doctors.length})</h2>
      {doctors.length === 0 ? (
        <p className="text-sm text-slate-500">No doctors created yet.</p>
      ) : (
        <div className="space-y-3">
          {doctors.map((doc) => (
            <DoctorRow key={doc.id} doc={doc} onApproved={onChanged} />
          ))}
        </div>
      )}
    </Card>
  );
}
