import { useState } from 'react';
import {
  cancelAppointment,
  generatePreVisitSummary,
  rescheduleAppointment,
} from '../../api/appointments';
import { getErrorMessage } from '../../api/client';
import { Alert, Badge, Button, Card, Input } from '../../components/ui';
import { formatDateTime, safeParseJSON, STATUS_TONE, URGENCY_TONE } from '../../utils/format';

function RescheduleForm({ appointment, onDone }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00.000+05:30`).toISOString();
      await rescheduleAppointment(appointment.id, scheduledAt);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-end gap-2">
      <Input label="New date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label="New time (IST)" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      <Button type="submit" loading={loading} className="mb-0.5">
        Confirm
      </Button>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function AppointmentCard({ appointment, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const preVisit = safeParseJSON(appointment.aiPreVisitSummary);
  const postVisit = safeParseJSON(appointment.aiPostVisitSummary);
  const canModify = ['PENDING', 'CONFIRMED'].includes(appointment.status);

  async function handleGenerateSummary() {
    setError('');
    setBusy(true);
    try {
      await generatePreVisitSummary(appointment.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setError('');
    setBusy(true);
    try {
      await cancelAppointment(appointment.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-slate-900">Dr. {appointment.doctor.name}</p>
          <p className="text-sm text-slate-500">{appointment.doctor.doctorProfile?.specialization}</p>
          <p className="mt-1 text-sm text-slate-700">{formatDateTime(appointment.scheduledAt)}</p>
        </div>
        <Badge tone={STATUS_TONE[appointment.status]}>{appointment.status}</Badge>
      </div>

      {appointment.symptoms && (
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium">Symptoms:</span> {appointment.symptoms}
        </p>
      )}

      {appointment.aiPreVisitSummary && preVisit && (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-slate-700">AI pre-visit summary</span>
            <Badge tone={URGENCY_TONE[appointment.triageLevel] || 'slate'}>{appointment.triageLevel}</Badge>
          </div>
          <p className="text-slate-600">{preVisit.chiefComplaint}</p>
          {preVisit.suggestedQuestions?.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-slate-500">
              {preVisit.suggestedQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {appointment.status === 'COMPLETED' &&
        (appointment.aiPostVisitSummary && postVisit ? (
          <div className="mt-3 rounded-md bg-green-50 p-3 text-sm">
            <p className="mb-1 font-medium text-green-800">Post-visit summary</p>
            <p className="text-green-700">{postVisit.patientSummary}</p>
            {postVisit.medicationSchedule?.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-green-700">
                {postVisit.medicationSchedule.map((m, i) => (
                  <li key={i}>
                    {m.medication} {m.dosage && `(${m.dosage})`} — {m.schedule}
                  </li>
                ))}
              </ul>
            )}
            {postVisit.followUpSteps && <p className="mt-2 text-green-700">{postVisit.followUpSteps}</p>}
            {appointment.followUpDate && (
              <p className="mt-1 text-xs text-green-600">Follow up by {formatDateTime(appointment.followUpDate)}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No post-visit summary available yet.</p>
        ))}

      <Alert>{error}</Alert>

      {canModify && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!preVisit && appointment.symptoms && (
            <Button variant="secondary" loading={busy} onClick={handleGenerateSummary}>
              Generate AI pre-visit summary
            </Button>
          )}
          <Button variant="secondary" onClick={() => setRescheduling((r) => !r)}>
            {rescheduling ? 'Close' : 'Reschedule'}
          </Button>
          <Button variant="danger" loading={busy} onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}

      {rescheduling && (
        <RescheduleForm
          appointment={appointment}
          onDone={() => {
            setRescheduling(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export default function PatientAppointments({ appointments, onChanged }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">My appointments</h2>
      {appointments.length === 0 ? (
        <p className="text-sm text-slate-500">You haven&apos;t booked any appointments yet.</p>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <AppointmentCard key={appt.id} appointment={appt} onChanged={onChanged} />
          ))}
        </div>
      )}
    </Card>
  );
}
