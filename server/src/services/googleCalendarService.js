const { google } = require('googleapis');
const prisma = require('../config/prisma');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(state) {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

// Builds an authorized client for a user who has connected their Google
// account; returns null if they haven't (calendar sync is then just skipped
// everywhere it's used — never a hard failure). Refreshed access tokens are
// persisted back to the user record automatically.
async function getClientForUser(user) {
  if (!user || !user.googleRefreshToken) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: user.googleAccessToken || undefined,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry ? user.googleTokenExpiry.getTime() : undefined,
  });

  client.on('tokens', (tokens) => {
    const data = {};
    if (tokens.access_token) data.googleAccessToken = tokens.access_token;
    if (tokens.refresh_token) data.googleRefreshToken = tokens.refresh_token;
    if (tokens.expiry_date) data.googleTokenExpiry = new Date(tokens.expiry_date);
    if (Object.keys(data).length > 0) {
      prisma.user
        .update({ where: { id: user.id }, data })
        .catch((err) => console.error('[googleCalendar] failed to persist refreshed tokens:', err.message));
    }
  });

  return client;
}

function calendarClient(authClient) {
  return google.calendar({ version: 'v3', auth: authClient });
}

// Every function below is deliberately non-throwing: a user not having
// connected Google Calendar, an expired/revoked token, or a transient API
// error must never break booking/cancelling/rescheduling an appointment.
async function createEventForUser(user, { summary, description, startTime, endTime }) {
  try {
    const authClient = await getClientForUser(user);
    if (!authClient) return { success: false, skipped: true };

    const { data } = await calendarClient(authClient).events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
    });
    return { success: true, eventId: data.id };
  } catch (err) {
    console.error(`[googleCalendar] failed to create event for user ${user.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function updateEventForUser(user, eventId, { summary, description, startTime, endTime }) {
  if (!eventId) return { success: false, skipped: true };
  try {
    const authClient = await getClientForUser(user);
    if (!authClient) return { success: false, skipped: true };

    await calendarClient(authClient).events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: {
        ...(summary && { summary }),
        ...(description !== undefined && { description }),
        ...(startTime && { start: { dateTime: startTime.toISOString() } }),
        ...(endTime && { end: { dateTime: endTime.toISOString() } }),
      },
    });
    return { success: true, eventId };
  } catch (err) {
    console.error(`[googleCalendar] failed to update event ${eventId} for user ${user.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function deleteEventForUser(user, eventId) {
  if (!eventId) return { success: true, skipped: true };
  try {
    const authClient = await getClientForUser(user);
    if (!authClient) return { success: false, skipped: true };

    await calendarClient(authClient).events.delete({ calendarId: 'primary', eventId });
    return { success: true };
  } catch (err) {
    // Already gone — treat as success, nothing left to clean up.
    if (err.code === 404 || err.code === 410) return { success: true };
    console.error(`[googleCalendar] failed to delete event ${eventId} for user ${user.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

// High-level helper used by the appointment controller: creates (or, on
// reschedule, updates) both the patient's and doctor's calendar events and
// returns only the fields that actually changed, ready to persist.
async function syncEventsForAppointment(appointment, patientUser, doctorUser) {
  const startTime = new Date(appointment.scheduledAt);
  const endTime = new Date(startTime.getTime() + appointment.durationMinutes * 60000);

  const patientPayload = {
    summary: `Appointment with Dr. ${doctorUser.name}`,
    description: appointment.symptoms || undefined,
    startTime,
    endTime,
  };
  const doctorPayload = {
    summary: `Appointment with ${patientUser.name}`,
    description: appointment.symptoms || undefined,
    startTime,
    endTime,
  };

  const [patientResult, doctorResult] = await Promise.all([
    appointment.patientCalendarEventId
      ? updateEventForUser(patientUser, appointment.patientCalendarEventId, patientPayload)
      : createEventForUser(patientUser, patientPayload),
    appointment.doctorCalendarEventId
      ? updateEventForUser(doctorUser, appointment.doctorCalendarEventId, doctorPayload)
      : createEventForUser(doctorUser, doctorPayload),
  ]);

  const changes = {};
  if (patientResult.success && patientResult.eventId) changes.patientCalendarEventId = patientResult.eventId;
  if (doctorResult.success && doctorResult.eventId) changes.doctorCalendarEventId = doctorResult.eventId;
  return changes;
}

async function deleteEventsForAppointment(appointment, patientUser, doctorUser) {
  await Promise.all([
    deleteEventForUser(patientUser, appointment.patientCalendarEventId),
    deleteEventForUser(doctorUser, appointment.doctorCalendarEventId),
  ]);
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  createEventForUser,
  updateEventForUser,
  deleteEventForUser,
  syncEventsForAppointment,
  deleteEventsForAppointment,
};
