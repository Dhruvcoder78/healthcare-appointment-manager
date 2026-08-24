import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { Alert, Badge, Button, Card } from '../components/ui';
import { getErrorMessage } from '../api/client';
import { getGoogleAuthUrl } from '../api/calendar';
import { me } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const calendarStatus = searchParams.get('calendar');

  // The OAuth callback redirects back here after Google sends the browser
  // straight to the server (not through this SPA), so the cached session
  // user's googleCalendarConnected flag is stale until we refetch it.
  useEffect(() => {
    if (calendarStatus === 'connected') {
      me()
        .then(({ user: freshUser }) => updateUser(freshUser))
        .catch(() => {});
    }
    if (calendarStatus) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setError('');
    setConnecting(true);
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(getErrorMessage(err));
      setConnecting(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Google Calendar</h2>
          <p className="mb-4 text-sm text-slate-600">
            Connect your Google Calendar so a booked appointment automatically appears on your calendar, and stays
            up to date if it's rescheduled or cancelled.
          </p>

          {calendarStatus === 'connected' && (
            <Alert type="success">Google Calendar connected successfully.</Alert>
          )}
          {calendarStatus === 'error' && <Alert>Something went wrong connecting Google Calendar. Please try again.</Alert>}
          <Alert>{error}</Alert>

          <div className="flex items-center gap-3">
            {user?.googleCalendarConnected ? (
              <>
                <Badge tone="green">Connected</Badge>
                <Button variant="secondary" loading={connecting} onClick={handleConnect}>
                  Reconnect
                </Button>
              </>
            ) : (
              <>
                <Badge tone="slate">Not connected</Badge>
                <Button loading={connecting} onClick={handleConnect}>
                  Connect Google Calendar
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
