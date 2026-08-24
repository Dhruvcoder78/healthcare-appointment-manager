# Healthcare Appointment & Follow-up Manager

A full-stack appointment booking and follow-up system with role-based access
(Admin / Doctor / Patient), AI-generated clinical summaries, email
notifications, Google Calendar sync, and background reminder jobs.

- **Backend:** Node.js, Express.js, Prisma ORM, PostgreSQL
- **Frontend:** React (Vite), Tailwind CSS
- **Auth:** JWT with Role-Based Access Control (ADMIN, DOCTOR, PATIENT)
- **AI:** OpenAI API (or any OpenAI-compatible LLM — e.g. Groq) for clinical summaries
- **Notifications:** Brevo (HTTP API — not SMTP; see §2) + node-cron background jobs
- **Calendar:** Google Calendar API (OAuth 2.0)
- **Timezone:** the whole app treats IST (Asia/Kolkata, UTC+5:30) as its
  single canonical timezone — doctor working hours, booking/reschedule
  input, and every displayed timestamp are all IST, regardless of the
  server's or viewer's own local timezone (see `server/src/utils/scheduling.js`)

See [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for the design rationale behind
double-booking prevention, leave-conflict handling, and notification failure
handling.

---

## 1. Local setup

### Prerequisites

- Node.js 20+
- A PostgreSQL 14+ instance (local install, or Docker — see below)
- (Optional) an OpenAI API key, a Brevo API key, and Google OAuth
  credentials — the app degrades gracefully without them (see
  [§4 graceful degradation](#4-graceful-degradation))

### Quick start

```bash
# 1. Install all workspace dependencies (root, server, client) from the repo root
npm install

# 2. Start a local Postgres instance (skip if you already have one)
docker run --name ham-postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=healthcare_appointments -p 5432:5432 -d postgres:16-alpine

# 3. Configure environment variables
cp server/.env.example server/.env
cp client/.env.example client/.env
# edit server/.env — at minimum set DATABASE_URL and JWT_SECRET (see §2)

# 4. Apply the committed database migrations
cd server
npx prisma migrate deploy
cd ..

# 5. Run both apps (two terminals), or use the root scripts:
npm run dev:server   # http://localhost:5000
npm run dev:client   # http://localhost:5173
```

The client's Vite dev server proxies `/api` requests to
`http://localhost:5000` (see `client/vite.config.js`), so
`VITE_API_URL=http://localhost:5000/api` in `client/.env` works out of the box.

### Seeding the first admin account

There is no public admin-registration endpoint by design (`POST /api/auth/register`
always creates a `PATIENT`). Create the first admin directly:

```bash
cd server
node -e "
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./src/config/prisma');
(async () => {
  const hashed = await bcrypt.hash('changeme123', 10);
  await prisma.user.create({
    data: { email: 'admin@example.com', password: hashed, name: 'Admin', role: 'ADMIN' },
  });
  await prisma.\$disconnect();
})();
"
```

Patients and doctors both self-register from `/register`. A doctor
self-registration is created `PENDING` and can't log in until that admin
approves them from the Admin Portal's "Notifications & Approvals" tab (or
`POST /api/admin/doctors/:doctorId/approve`) — admins never create doctor
accounts directly.

### Useful scripts

| Command (from repo root)     | Description                              |
|-------------------------------|-------------------------------------------|
| `npm run dev:server`          | Start the Express API with nodemon        |
| `npm run dev:client`          | Start the Vite dev server                 |
| `npm run prisma:generate`     | Regenerate the Prisma client              |
| `npm run prisma:migrate`      | Run `prisma migrate dev` in `/server`     |
| `npx prisma studio` (in `/server`) | Browse the database visually          |

---

## 2. Environment variables (`.env.example` guidance)

### `server/.env.example`

| Variable | Required? | Notes |
|---|---|---|
| `PORT` | No (default `5000`) | API port |
| `NODE_ENV` | No | `development` / `production` |
| `CLIENT_URL` | Yes | Used for CORS and for OAuth/callback redirects back to the frontend |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/healthcare_appointments?schema=public` |
| `JWT_SECRET` | **Yes** | Long random string; signs both login tokens and the short-lived Google OAuth `state` token |
| `JWT_EXPIRES_IN` | No (default `7d`) | Login token lifetime |
| `OPENAI_API_KEY` | No | Without it, pre/post-visit summary endpoints still work — they return a safe fallback (see §5 and §4) |
| `OPENAI_BASE_URL` | No (default `https://api.openai.com/v1`) | Point this at any OpenAI-compatible endpoint — Azure OpenAI, a local proxy, or a free alternative like Groq (`https://api.groq.com/openai/v1`) |
| `OPENAI_MODEL` | No (default `gpt-4o-mini`) | Any chat-completion model that supports `response_format: json_object`, available on whichever `OPENAI_BASE_URL` you're pointed at (e.g. `openai/gpt-oss-20b` on Groq) — check your provider's current model list, since model names get deprecated |
| `BREVO_API_KEY` / `BREVO_FROM` / `BREVO_FROM_NAME` | No | Without a valid key, emails fail silently (logged, never crash a request) — see §4. Uses [Brevo](https://www.brevo.com)'s HTTP API deliberately, not SMTP — many hosts (Render included) block outbound SMTP ports (25/465/587) to prevent spam abuse, which makes any SMTP provider (Gmail, etc.) time out from a deployed server regardless of credentials; an HTTPS API call is unaffected. `BREVO_FROM` must be a sender verified in Brevo's dashboard (Settings → Senders, Domains & Dedicated IPs) — unlike Resend, this only requires verifying a single email address (a confirmation-link click), not a whole domain, and doesn't restrict which recipients you can send to |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | No | Needed only for Google Calendar sync — see §6 for setup |
| `MEDICATION_REMINDER_CRON` | No (default `*/15 * * * *`) | How often the medication-reminder job checks for due reminders |
| `EMAIL_RETRY_CRON` | No (default `*/10 * * * *`) | How often failed reminder emails are retried |
| `APPOINTMENT_REMINDER_CRON` | No (default `0 * * * *`) | How often the upcoming-appointment reminder job checks for appointments starting within the next 24 hours. Sends a one-time reminder email to both parties, gated by `reminderSentAt` so it's never sent twice |

### `client/.env.example`

| Variable | Required? | Notes |
|---|---|---|
| `VITE_API_URL` | No (default `http://localhost:5000/api`) | Base URL the frontend calls |

---

## 3. API documentation

Base URL: `http://localhost:5000/api`. All endpoints except `POST /auth/register`,
`POST /auth/login`, and `GET /calendar/oauth/callback` require
`Authorization: Bearer <token>`.

### Auth — `/api/auth`

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/register` | Public | Self-registration for **PATIENT** or **DOCTOR** only — `ADMIN` can never self-register (the only admin-creation path is the seed script above). Body: `{ email, password (min 8 chars), name, phone?, role? ("PATIENT" default \| "DOCTOR") }`. If `role: "DOCTOR"`, also requires `specialization`, and accepts optional `workingHoursStart` ("HH:MM", IST), `workingHoursEnd`, `workingDays` (int[] 0-6), `slotDurationMinutes`. A doctor registration is created `PENDING` and returns `{ user, pendingApproval: true }` with **no token** — they can't log in until an admin approves them |
| POST | `/login` | Public | Body: `{ email, password }` → `{ token, user }`. A `PENDING`/`REJECTED` doctor gets `403` instead of a token |
| GET | `/me` | Any | Returns the authenticated user, including `googleCalendarConnected: boolean` |

### Admin — `/api/admin` (role: `ADMIN`)

Admins never create or directly edit an unapproved doctor — the only path onto
the platform is doctor self-registration + admin approval below.

| Method | Path | Description |
|---|---|---|
| GET | `/doctors` | Lists all **approved** doctors with their profile and leave history |
| GET | `/doctors/pending` | Lists doctors awaiting approval (`doctorProfile.status: PENDING`) |
| POST | `/doctors/:doctorId/approve` | Approves a pending doctor — they can now log in and appear in patient search |
| POST | `/doctors/:doctorId/reject` | Rejects a pending doctor — permanent, no retry path |
| PUT | `/doctors/:doctorId/schedule` | Edits an **already-approved** doctor's working hours/days/slot duration (`400` if not yet approved). Body: `{ workingHoursStart? ("HH:MM", IST), workingHoursEnd?, workingDays? (int[] 0-6), slotDurationMinutes? }` — all optional, only what's provided changes. This is the only way to change a doctor's schedule after registration; doctors have no self-service access to it |
| POST | `/doctors/:doctorId/leaves` | Marks a doctor on leave for a date range, created already `APPROVED` (the admin is the approver). Body: `{ startDate, endDate, reason? }` (dates as `YYYY-MM-DD`, interpreted as IST calendar days, or full ISO). Cancels all `PENDING`/`CONFIRMED` appointments in range, deletes their calendar events, emails both parties, and returns `{ leave, affectedPatients: [{ appointmentId, scheduledAt, patient }] }` |
| GET | `/leaves/pending` | Lists doctor-submitted leave requests awaiting approval |
| POST | `/leaves/:leaveId/approve` | Approves a doctor-requested leave — same cancellation/notification side effects as above |
| POST | `/leaves/:leaveId/reject` | Rejects a doctor-requested leave — no side effects |

### Doctors — `/api/doctors` (role: `PATIENT`)

| Method | Path | Description |
|---|---|---|
| GET | `/search?specialization=&name=` | Case-insensitive partial match on specialization and/or doctor name (combinable with AND); omit both to list all approved doctors |

### Leaves — `/api/leaves` (role: `DOCTOR`)

| Method | Path | Description |
|---|---|---|
| POST | `/` | Requests leave for the authenticated doctor, created `PENDING`. Body: `{ startDate, endDate, reason? }`. Does **not** block bookings or cancel anything until an admin approves it |
| GET | `/` | Lists the authenticated doctor's own leave requests (any status) |

### Appointments — `/api/appointments`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any | Lists the caller's own appointments (patient → their bookings, doctor → their schedule only — never another doctor's). `?date=YYYY-MM-DD` narrows a doctor's results to one IST calendar day (the daily queue view) |
| GET | `/:id` | Owner (patient/doctor) or admin | Fetch a single appointment |
| POST | `/` | `PATIENT` | Books an appointment. Body: `{ doctorId, scheduledAt (ISO, future), symptoms? }`. Validates working hours/day (IST) and slot-duration alignment, rejects if the doctor is on leave, and is race-safe against double-booking (see SYSTEM_DESIGN.md). Triggers a booking-confirmation email and calendar sync for both parties, and — if `symptoms` was given — automatically runs the pre-visit AI analysis (§5) before returning |
| PATCH | `/:id/cancel` | Owning patient, assigned doctor, or admin | Body: `{ reason? }`. Deletes both calendar events and emails both parties |
| PATCH | `/:id/reschedule` | Owning patient or assigned doctor | Body: `{ scheduledAt }`. Same conflict-safety as booking; updates (not recreates) existing calendar events |
| POST | `/:id/pre-visit-summary` | Owning patient | Body: `{ symptoms? }` (defaults to the appointment's stored symptoms). Calls the LLM with the exact pre-visit prompt (§5) and stores `triageLevel` + `aiPreVisitSummary` |
| POST | `/:id/post-visit-summary` | Assigned doctor | Body: `{ doctorNotes }`. Calls the LLM with the exact post-visit prompt (§5), stores `doctorNotes` + `aiPostVisitSummary`, computes `followUpDate`, marks the appointment `COMPLETED`, and emails the patient their prescription/follow-up schedule |

### Calendar — `/api/calendar`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/oauth/url` | Any authenticated user | Returns `{ url }` — the Google consent screen URL for the caller to connect their calendar. The frontend's `/settings` page (linked from the header for patients/doctors) drives this flow |
| GET | `/oauth/callback` | Public (Google redirects the browser here) | Exchanges the auth code for tokens and stores them on the user; redirects to `${CLIENT_URL}/settings?calendar=connected\|error` |

### Error format

All errors return `{ "error": "<message>" }` with an appropriate HTTP status
(`400` validation, `401` auth, `403` forbidden, `404` not found, `409`
conflict/double-booking, `500` unexpected).

---

## 4. Graceful degradation

The system is designed to keep working when third-party services are
unavailable or unconfigured:

- **No/invalid `OPENAI_API_KEY`:** pre/post-visit summary endpoints still
  return `200`/`201` with a safe fallback payload and `generatedByAI: false`.
- **No/invalid `BREVO_API_KEY`:** notification emails fail silently (logged
  server-side); booking, cancelling, and rescheduling still succeed.
- **No connected Google Calendar:** calendar sync is skipped per-user
  (checked independently for patient and doctor); the appointment is still
  created/updated/cancelled normally.

---

## 5. Exact LLM prompts

Defined in `server/src/services/llmService.js`. The user-facing prompt text
below is sent verbatim (with the symptoms/notes appended); a system message
additionally constrains the model to return strict JSON so the response can
be parsed reliably.

**Pre-visit prompt** (`POST /appointments/:id/pre-visit-summary`):

```
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>
```

Expected JSON shape: `{ urgencyLevel: "Low"|"Medium"|"High", chiefComplaint: string, suggestedQuestions: [string, string, string] }`

Run automatically at booking time if `symptoms` was provided (in addition to
being triggerable standalone via the endpoint above).

**Post-visit prompt** (`POST /appointments/:id/post-visit-summary`):

```
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>
```

Expected JSON shape: `{ patientSummary: string, medicationSchedule: [{ medication, dosage, schedule }], followUpSteps: string, followUpInDays: integer|null }`

`followUpInDays` is used to compute `Appointment.followUpDate = scheduledAt + followUpInDays days`.
The resulting `patientSummary`, medication schedule, and follow-up
date/steps are also emailed directly to the patient once the doctor submits
this endpoint (see `notificationService.sendPostVisitSummary`).

On any failure (network error, bad key, malformed JSON), both endpoints
store a fallback object instead of throwing — see `PRE_VISIT_FALLBACK` /
`POST_VISIT_FALLBACK` in `llmService.js`.

---

## 6. Google Calendar setup (OAuth 2.0)

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   (or select) a project, then enable the **Google Calendar API**
   (APIs & Services → Library).
2. Configure the **OAuth consent screen** (APIs & Services → OAuth consent
   screen). For local development, "External" + Testing mode with your own
   Google account added as a test user is sufficient.
3. Create an **OAuth client ID** (APIs & Services → Credentials → Create
   Credentials → OAuth client ID → Web application).
4. Add an **Authorized redirect URI** matching `GOOGLE_REDIRECT_URI`, e.g.:
   ```
   http://localhost:5000/api/calendar/oauth/callback
   ```
5. Copy the generated **Client ID** and **Client Secret** into
   `server/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar/oauth/callback
   ```
6. In the app, an authenticated user connects their calendar from the
   **Settings** page (`/settings`, linked from the header for patients and
   doctors), which calls `GET /api/calendar/oauth/url` and redirects the
   browser there. This is a per-user, opt-in connection for both patients
   and doctors — each side's calendar event is created independently, so a
   booking only appears on the calendars of parties who've connected. The
   requested scope is `https://www.googleapis.com/auth/calendar.events`,
   requested with `access_type=offline&prompt=consent` so a refresh token is
   issued and access tokens can be silently renewed thereafter.

### Troubleshooting

- **`Error 400: redirect_uri_mismatch`** — the URI Google receives must
  match an entry in the client's **Authorized redirect URIs** list
  character-for-character (scheme, host, port, and path), or the request is
  rejected before the consent screen even loads. Re-check step 4 above.
- **`Error 403: access_denied` / "has not completed the Google verification
  process"** — while the OAuth consent screen is in **Testing** mode (the
  default, and the right choice for local dev), only Google accounts
  explicitly added under **OAuth consent screen → Test users** can complete
  the flow — every patient/doctor account you test with needs to be added
  individually (up to 100). Publishing to "In production" removes this
  allowlist but triggers Google's verification review for the Calendar
  scope, which is unnecessary overhead for local development.

---

## 7. Database schema

PostgreSQL via Prisma. Full source: `server/prisma/schema.prisma`; migrations
live in `server/prisma/migrations/`.

### Enums

```prisma
enum Role              { ADMIN DOCTOR PATIENT }
enum AppointmentStatus { PENDING CONFIRMED CANCELLED COMPLETED NO_SHOW }
enum ReminderStatus    { PENDING SENT FAILED }
enum ApprovalStatus    { PENDING APPROVED REJECTED }
```

### `User` (`users`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | string | unique |
| password | string | bcrypt hash |
| name | string | |
| phone | string? | |
| role | Role | default `PATIENT` |
| googleAccessToken / googleRefreshToken / googleTokenExpiry | string? / string? / datetime? | Google Calendar OAuth tokens |
| createdAt / updatedAt | datetime | |

Relations: one `DoctorProfile` (if role `DOCTOR`), many `Appointment` as
patient and as doctor, many `MedicationReminder`.

### `DoctorProfile` (`doctor_profiles`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid | unique FK → `User.id`, cascade delete |
| specialization | string | |
| bio | string? | |
| workingHoursStart / workingHoursEnd | string | `"HH:MM"`, **IST**, default `09:00`/`17:00` |
| workingDays | int[] | `0`=Sun..`6`=Sat, default `[1,2,3,4,5]` |
| slotDurationMinutes | int | default `30` |
| status | ApprovalStatus | default `PENDING`. `PENDING` doctors can't log in and don't appear in search; only an admin can move this to `APPROVED`/`REJECTED`. Working hours/days/slot duration can only be edited by an admin, and only once `APPROVED` — doctors have no self-service schedule access |
| createdAt / updatedAt | datetime | |

Relations: many `DoctorLeave`.

### `DoctorLeave` (`doctor_leaves`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| doctorId | uuid | FK → `DoctorProfile.id`, cascade delete, indexed |
| startDate / endDate | datetime | inclusive range, interpreted as IST calendar days when given as `YYYY-MM-DD` |
| reason | string? | |
| status | ApprovalStatus | default `PENDING`. Admin-logged leave (`POST /admin/doctors/:id/leaves`) is created `APPROVED` directly; doctor-requested leave (`POST /leaves`) starts `PENDING` and only blocks bookings / cancels conflicting appointments once an admin approves it. Indexed |
| createdAt | datetime | |

### `Appointment` (`appointments`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| patientId / doctorId | uuid | FK → `User.id` (both), cascade delete |
| scheduledAt | datetime | stored as an absolute UTC instant; interpreted/displayed everywhere as IST |
| durationMinutes | int | default `30`, copied from the doctor's `slotDurationMinutes` at booking time |
| status | AppointmentStatus | default `PENDING` |
| symptoms | string? | patient-entered |
| triageLevel | string? | AI-derived urgency (`LOW`\|`MEDIUM`\|`HIGH`) from the pre-visit LLM call |
| aiPreVisitSummary | string? | raw JSON from the pre-visit LLM call (chief complaint + suggested questions) |
| doctorNotes | string? | raw clinical notes entered by the doctor |
| aiPostVisitSummary | string? | raw JSON from the post-visit LLM call (patient-friendly summary + medication schedule + follow-up steps) |
| followUpInDays | int? | extracted by the post-visit LLM call |
| followUpDate | datetime? | `scheduledAt + followUpInDays` |
| patientCalendarEventId / doctorCalendarEventId | string? | Google Calendar event ids, one per connected party |
| reminderSentAt | datetime? | set once the 1-day-before appointment reminder has been sent, so it's never sent twice (see `APPOINTMENT_REMINDER_CRON` in §2) |
| createdAt / updatedAt | datetime | |

Indexes: `[doctorId, scheduledAt]`, `[patientId]`.
**Unique constraint:** `[doctorId, scheduledAt]` — the hard backstop behind
double-booking prevention (see SYSTEM_DESIGN.md).

### `MedicationReminder` (`medication_reminders`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| appointmentId | uuid | FK → `Appointment.id`, cascade delete |
| patientId | uuid | FK → `User.id`, cascade delete |
| medicationName | string | |
| dosage | string? | |
| intervalHours | int | default `24` |
| startDate / endDate | datetime / datetime? | |
| lastSentAt / nextSendAt | datetime? | |
| status | ReminderStatus | default `PENDING` |
| retryCount | int | default `0` |
| createdAt / updatedAt | datetime | |

Indexes: `[patientId]`, `[nextSendAt]`.
