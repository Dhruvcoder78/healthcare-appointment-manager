import { useState } from 'react';
import { submitPostVisitSummary } from '../../api/appointments';
import { getErrorMessage } from '../../api/client';
import { Alert, Button, Textarea } from '../../components/ui';

export default function PostVisitForm({ appointment, onSubmitted }) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!notes.trim()) {
      setError('Enter clinical notes before submitting');
      return;
    }
    setLoading(true);
    try {
      await submitPostVisitSummary(appointment.id, { doctorNotes: notes });
      setNotes('');
      onSubmitted();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <Textarea
        label="Clinical notes & prescription"
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Tension headache with low-grade fever. Prescribed acetaminophen 500mg every 6 hours for 5 days. Follow up in 7 days if symptoms persist."
        required
      />
      <Alert>{error}</Alert>
      <Button type="submit" loading={loading}>
        Submit & generate patient summary
      </Button>
    </form>
  );
}
