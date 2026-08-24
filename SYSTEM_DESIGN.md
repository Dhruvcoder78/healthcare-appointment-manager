# System Design

Five mechanisms that needed careful concurrency/reliability/correctness
thinking: double-booking prevention, doctor-leave conflict handling, slot
holding, notification failure handling, and timezone handling. Full
API/schema reference: [README.md](./README.md).

## 1. Double-booking prevention

Booking and rescheduling both write to `Appointment` under Postgres
**Serializable** isolation (`prisma.$transaction(..., { isolationLevel: Serializable })`).
Inside the transaction we read the row for `(doctorId, scheduledAt)`, decide
whether it's free, then write. Serializable isolation means Postgres itself
detects if a concurrent transaction touched the same data mid-flight and
aborts the loser with a `P2034` error — the classic check-then-insert race
is impossible by construction, not by convention. A `withSerializableRetry`
helper retries a losing transaction up to 3 times (the standard pattern for
serializable conflicts, which are expected to happen occasionally under
contention) before surfacing `409 Conflict`.

As a second, independent layer, `Appointment` has a database-level
`@@unique([doctorId, scheduledAt])` constraint. Even if application logic
were ever bypassed, Postgres itself refuses two rows at the same doctor+slot
— we catch `P2002` as a backstop and also return `409`. This was
load-tested: five concurrent booking requests for the identical doctor/slot
produced exactly one `201` and four `409`s, with one row in the database.

A cancelled row still occupies that unique key (its status changed, not its
identity), so rebooking a freed slot **updates** the existing cancelled row
back to `PENDING` rather than inserting a new one — otherwise the unique
index would reject the rebooking. Reschedule follows the same shape: if the
destination slot is occupied by an active appointment, `409`; if occupied by
a stale cancelled row, that row is deleted inside the same transaction and
the appointment moves.

## 2. Doctor leave conflict handling

There are two paths onto a `DoctorLeave` row, sharing one `ApprovalStatus`
field and one cleanup routine: an admin logging leave directly
(`POST /admin/doctors/:id/leaves`) is created `APPROVED` immediately — the
admin *is* the approver — while a doctor requesting their own leave
(`POST /leaves`) is created `PENDING` and has **no effect** (doesn't block
bookings, doesn't cancel anything) until an admin approves it
(`POST /admin/leaves/:leaveId/approve`). This means a doctor can never
unilaterally cancel their own patients' appointments by self-declaring
leave — admin approval is the single gate for that side effect, regardless
of which path created the row.

Whichever path reaches `APPROVED`, the conflict cleanup is identical and
runs in one transaction: create/update the `DoctorLeave` row, then
`findMany` every `PENDING`/`CONFIRMED` appointment whose `scheduledAt` falls
in `[startDate, endDate]` for that doctor, then bulk-`updateMany` them to
`CANCELLED`. Doing this atomically means a leave is never recorded as
approved without its conflicting appointments being resolved (or vice
versa) — the two facts can't diverge.

Symmetrically, `APPROVED` `DoctorLeave` ranges are checked *before* any new
booking or reschedule is allowed to proceed (`409` if the target time falls
inside one) — a `PENDING` leave request has no effect on availability, only
an approved one does — so the two paths, "block new bookings during
approved leave" and "cancel existing bookings when leave is approved", cover
both directions of the conflict.

After the transaction commits, the handler (best-effort, outside the
transaction) deletes both parties' Google Calendar events and emails
patient + doctor for every cancelled appointment, and returns the affected
list to the caller so the admin UI can display exactly who was notified.

## 3. Slot hold mechanism

We deliberately did **not** implement a separate "hold this slot for N
minutes while the patient fills out the form" step. Booking is a single
atomic request: the client collects symptoms and a desired time client-side
(no server state yet), then submits one `POST /appointments` that performs
validation, conflict-checking, and commit inside one short-lived
Serializable transaction. There is no intermediate reserved-but-unconfirmed
state that could leak a slot if a client abandons the flow — the "hold"
window is effectively the transaction's lifetime (milliseconds), not
minutes, so unlike a stateful hold there's nothing to expire or garbage-collect.

This is a conscious trade-off: a UI that shows "5-minute hold" while a
patient reviews details would need extra state (a `HELD` status, an
expiry sweep job, and a way to release an expired hold back to the pool).
Given the actual UX here — search, then book in one form submit — a hold
added complexity without a matching benefit. If multi-step checkout is
added later, the natural extension is a `HELD` `AppointmentStatus` with a
`holdExpiresAt` timestamp, swept by the same cron infrastructure already in
place for reminders.

## 4. Notification failure handling

`emailService.sendMail` never throws — it wraps Nodemailer in try/catch and
always resolves to `{ success, error? }`. `notificationService` sends to
patient and doctor in parallel via `Promise.all` and logs (but does not
propagate) any failure, so one bad address never blocks the other recipient
or the triggering request (booking/cancel/reschedule all return `2xx` even
if SMTP is fully down — verified by testing with an intentionally broken
SMTP host).

For the send-and-forget notifications above, failure is simply logged.
Medication reminders get real retry semantics because they're
recurring and time-sensitive: a failed send sets `status: FAILED` and
increments `retryCount`; a separate `EMAIL_RETRY_CRON` job re-attempts any
`FAILED` reminder with `retryCount < 5`, resetting to `PENDING` and
rescheduling `nextSendAt` on success. Verified end-to-end: a due reminder
failed against a broken SMTP host, was retried and failed again
(`retryCount: 2`), then succeeded once SMTP was restored, resetting
`retryCount` to `0` and correctly advancing `nextSendAt`.

The upcoming-appointment reminder job (`appointmentReminders.js`) is
deliberately **stateless and repeating** rather than a one-time "day
before" notice: every run (`APPOINTMENT_REMINDER_CRON`, default every 5
minutes) simply re-queries every `PENDING`/`CONFIRMED` appointment with
`scheduledAt` still in the future and re-emails both parties — no "already
reminded" flag gates it. This was a deliberate product choice (repeat
reminders right up to the appointment), and it keeps the job trivially
correct: there's no state machine to get wrong, and it naturally stops
emailing the moment `scheduledAt` passes or the appointment is
cancelled/completed, since either removes it from the query.

## 5. Timezone handling (IST)

Every timestamp in the system is stored as an absolute UTC instant
(Postgres/Prisma `DateTime`), but the product is IST-only: doctor working
hours, booking/reschedule input, and every displayed timestamp are all
interpreted and shown in IST (Asia/Kolkata, UTC+5:30, no DST) regardless of
the server's or the viewer's own local timezone. Rather than pull in a
timezone library for a single fixed, DST-free offset, this is done with a
plain arithmetic shift applied consistently in a small number of places:

- **Backend** (`scheduling.js`): `isWithinWorkingHours`/`isAlignedToSlotGrid`
  shift `scheduledAt` by +5:30 before reading day-of-week/hour/minute, so a
  doctor's `"09:00"`–`"17:00"` is genuinely 9am–5pm IST, not UTC.
  `parseDateBoundary` parses bare `YYYY-MM-DD` leave/query dates with an
  explicit `+05:30` suffix so they mean IST calendar days.
- **Frontend**: booking/reschedule forms parse the entered date+time with
  the same `+05:30` suffix before sending `scheduledAt`; `formatDateTime`/
  `formatDate` force `timeZone: 'Asia/Kolkata'` in `toLocaleString` so a
  viewer's device timezone can never produce a different displayed time for
  the same instant; `slots.js` computes "now"/"today" the same way so the
  slot picker never offers a time that's already passed in IST.

Net effect: entering "15:30" as a booking time and later seeing "15:30" on
any dashboard, from any device, are the same instant — verified directly
against the working-hours validator (a 15:30 IST booking against `09:00`–
`17:00` IST hours succeeds; the same clock time as UTC would have been
rejected as outside hours, and was, before this was fixed).
