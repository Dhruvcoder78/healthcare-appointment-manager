import { Card, Badge } from '../../components/ui';
import { DAY_LABELS, formatDate } from '../../utils/format';

// Read-only directory of approved doctors. Doctors are onboarded only via
// self-registration + approval (see the Notifications & Approvals tab) —
// admins cannot create or edit doctor records here.
export default function DoctorsList({ doctors }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Doctor Directory ({doctors.length})</h2>
      {doctors.length === 0 ? (
        <p className="text-sm text-slate-500">No approved doctors yet.</p>
      ) : (
        <div className="space-y-3">
          {doctors.map((doc) => (
            <div key={doc.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{doc.name}</p>
                  <p className="text-sm text-slate-500">
                    {doc.doctorProfile?.specialization} · {doc.email}
                  </p>
                </div>
                <Badge tone="blue">{doc.doctorProfile?.slotDurationMinutes} min slots</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {doc.doctorProfile?.workingHoursStart}–{doc.doctorProfile?.workingHoursEnd} ·{' '}
                {(doc.doctorProfile?.workingDays || []).map((d) => DAY_LABELS[d]).join(', ')}
              </p>
              {doc.doctorProfile?.leaves?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {doc.doctorProfile.leaves.map((leave) => (
                    <Badge key={leave.id} tone={leave.status === 'APPROVED' ? 'red' : 'slate'}>
                      {leave.status === 'APPROVED' ? 'Leave' : leave.status}: {formatDate(leave.startDate)}–
                      {formatDate(leave.endDate)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
