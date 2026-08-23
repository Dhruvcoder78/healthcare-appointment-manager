const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { AppError } = require('../utils/errors');
const { withSerializableRetry } = require('../utils/withRetry');
const { isWithinWorkingHours, isAlignedToSlotGrid } = require('../utils/scheduling');
const { generatePreVisitSummary, generatePostVisitSummary } = require('../services/llmService');
const { sendBookingConfirmation, sendCancellationNotice, sendRescheduleNotice } = require('../services/notificationService');
const { syncEventsForAppointment, deleteEventsForAppointment } = require('../services/googleCalendarService');

const BLOCKING_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED'];
const RESCHEDULABLE_STATUSES = ['PENDING', 'CONFIRMED'];

// Books an appointment for the authenticated patient, guaranteeing that two
// concurrent requests for the same doctor + timestamp can never both succeed.
//
// Two layers enforce this:
//   1. The transaction runs at Serializable isolation, so Postgres itself
//      detects a conflicting concurrent read/write and aborts the loser with
//      a P2034 error — the classic "check-then-insert" race is not possible.
//   2. The (doctorId, scheduledAt) unique index on Appointment is a hard
//      backstop in case anything ever bypasses the transaction.
// A cancelled/no-show appointment already occupies that unique slot, so a
// rebooking of a freed slot reuses (updates) that row instead of inserting
// a new one — otherwise the unique index would reject it.
async function bookAppointment(req, res, next) {
  try {
    const { doctorId, scheduledAt, symptoms } = req.body;

    if (!doctorId || !scheduledAt) {
      return res.status(400).json({ error: 'doctorId and scheduledAt are required' });
    }

    const parsedDate = new Date(scheduledAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'scheduledAt must be a valid ISO date string' });
    }
    if (parsedDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'scheduledAt must be in the future' });
    }

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: 'DOCTOR' },
      include: { doctorProfile: true },
    });
    if (!doctor || !doctor.doctorProfile) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    if (!isWithinWorkingHours(parsedDate, doctor.doctorProfile)) {
      return res.status(400).json({ error: 'Requested time is outside the doctor\'s working hours' });
    }
    if (!isAlignedToSlotGrid(parsedDate, doctor.doctorProfile)) {
      return res
        .status(400)
        .json({ error: `Requested time must align to ${doctor.doctorProfile.slotDurationMinutes}-minute slots` });
    }

    const onLeave = await prisma.doctorLeave.findFirst({
      where: {
        doctorId: doctor.doctorProfile.id,
        status: 'APPROVED',
        startDate: { lte: parsedDate },
        endDate: { gte: parsedDate },
      },
    });
    if (onLeave) {
      return res.status(409).json({ error: 'Doctor is on leave at the requested time' });
    }

    const appointment = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const existing = await tx.appointment.findUnique({
            where: { doctorId_scheduledAt: { doctorId, scheduledAt: parsedDate } },
          });

          if (existing && BLOCKING_STATUSES.includes(existing.status)) {
            throw new AppError(409, 'This time slot is already booked');
          }

          if (existing) {
            // Slot was previously cancelled/no-show — reuse the row.
            return tx.appointment.update({
              where: { id: existing.id },
              data: {
                patientId: req.user.id,
                status: 'PENDING',
                symptoms: symptoms || null,
                triageLevel: null,
                aiPreVisitSummary: null,
                doctorNotes: null,
                aiPostVisitSummary: null,
                followUpInDays: null,
                followUpDate: null,
                durationMinutes: doctor.doctorProfile.slotDurationMinutes,
              },
            });
          }

          return tx.appointment.create({
            data: {
              patientId: req.user.id,
              doctorId,
              scheduledAt: parsedDate,
              durationMinutes: doctor.doctorProfile.slotDurationMinutes,
              symptoms: symptoms || null,
              status: 'PENDING',
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );

    const patientUser = await prisma.user.findUnique({ where: { id: req.user.id } });

    // Best-effort side effects: email delivery, calendar sync, and the AI
    // pre-visit analysis must never fail the booking itself.
    await sendBookingConfirmation(appointment, patientUser, doctor);

    const calendarChanges = await syncEventsForAppointment(appointment, patientUser, doctor);
    let finalAppointment = Object.keys(calendarChanges).length
      ? await prisma.appointment.update({ where: { id: appointment.id }, data: calendarChanges })
      : appointment;

    if (appointment.symptoms) {
      try {
        const aiResult = await generatePreVisitSummary(appointment.symptoms);
        finalAppointment = await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            triageLevel: aiResult.data.urgencyLevel,
            aiPreVisitSummary: JSON.stringify(aiResult.data),
          },
        });
      } catch (aiErr) {
        console.error('[bookAppointment] AI pre-visit analysis failed:', aiErr.message);
      }
    }

    res.status(201).json({ appointment: finalAppointment });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    // Unique constraint backstop, or a serializable conflict that survived retries.
    if (err.code === 'P2002' || err.code === 'P2034') {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }
    next(err);
  }
}

// Generates the pre-visit AI summary for the authenticated patient's own
// appointment. The LLM call can never crash this endpoint: llmService always
// resolves with either a real result or a safe fallback, which is stored
// either way so the appointment record always reflects what was returned.
async function preVisitSummary(req, res, next) {
  try {
    const { id } = req.params;
    const { symptoms } = req.body;

    const appointment = await prisma.appointment.findUnique({ where: { id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (appointment.patientId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const symptomsText = symptoms || appointment.symptoms;
    if (!symptomsText) {
      return res.status(400).json({ error: 'symptoms are required (either in the request body or already on the appointment)' });
    }

    const result = await generatePreVisitSummary(symptomsText);

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        symptoms: symptomsText,
        triageLevel: result.data.urgencyLevel,
        aiPreVisitSummary: JSON.stringify(result.data),
      },
    });

    res.json({
      appointment: updated,
      generatedByAI: result.success,
      ...(result.success ? {} : { warning: 'AI summary generation failed; fallback data was stored.' }),
    });
  } catch (err) {
    next(err);
  }
}

// Generates the post-visit AI summary for the assigned doctor's appointment,
// including extraction of followUpInDays which is used to compute an exact
// followUpDate (scheduledAt + followUpInDays).
async function postVisitSummary(req, res, next) {
  try {
    const { id } = req.params;
    const { doctorNotes } = req.body;

    if (!doctorNotes) {
      return res.status(400).json({ error: 'doctorNotes are required' });
    }

    const appointment = await prisma.appointment.findUnique({ where: { id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (appointment.doctorId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await generatePostVisitSummary(doctorNotes);

    let followUpDate = null;
    if (Number.isInteger(result.data.followUpInDays)) {
      followUpDate = new Date(appointment.scheduledAt);
      followUpDate.setDate(followUpDate.getDate() + result.data.followUpInDays);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        doctorNotes,
        aiPostVisitSummary: JSON.stringify(result.data),
        followUpInDays: result.data.followUpInDays,
        followUpDate,
        status: 'COMPLETED',
      },
    });

    res.json({
      appointment: updated,
      generatedByAI: result.success,
      ...(result.success ? {} : { warning: 'AI summary generation failed; fallback data was stored.' }),
    });
  } catch (err) {
    next(err);
  }
}

// Cancels an appointment: the owning patient, the assigned doctor, or an
// admin may cancel. Deletes both calendar events and emails both parties —
// neither can fail the cancellation itself.
async function cancelAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, doctor: true },
    });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const isOwner = req.user.id === appointment.patientId || req.user.id === appointment.doctorId;
    if (!isOwner && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
      return res.status(400).json({ error: `Cannot cancel a ${appointment.status.toLowerCase()} appointment` });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await deleteEventsForAppointment(appointment, appointment.patient, appointment.doctor);
    await sendCancellationNotice(updated, appointment.patient, appointment.doctor, reason);

    res.json({ appointment: updated });
  } catch (err) {
    next(err);
  }
}

// Reschedules an appointment to a new time, guaranteeing (via the same
// Serializable-transaction + unique-index strategy as booking) that it can
// never collide with another active appointment for that doctor.
async function rescheduleAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required' });
    }

    const newDate = new Date(scheduledAt);
    if (Number.isNaN(newDate.getTime())) {
      return res.status(400).json({ error: 'scheduledAt must be a valid ISO date string' });
    }
    if (newDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'scheduledAt must be in the future' });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, doctor: { include: { doctorProfile: true } } },
    });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const isOwner = req.user.id === appointment.patientId || req.user.id === appointment.doctorId;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!RESCHEDULABLE_STATUSES.includes(appointment.status)) {
      return res.status(400).json({ error: `Cannot reschedule a ${appointment.status.toLowerCase()} appointment` });
    }

    const doctorProfile = appointment.doctor.doctorProfile;
    if (!isWithinWorkingHours(newDate, doctorProfile)) {
      return res.status(400).json({ error: "Requested time is outside the doctor's working hours" });
    }
    if (!isAlignedToSlotGrid(newDate, doctorProfile)) {
      return res.status(400).json({ error: `Requested time must align to ${doctorProfile.slotDurationMinutes}-minute slots` });
    }

    const onLeave = await prisma.doctorLeave.findFirst({
      where: { doctorId: doctorProfile.id, status: 'APPROVED', startDate: { lte: newDate }, endDate: { gte: newDate } },
    });
    if (onLeave) {
      return res.status(409).json({ error: 'Doctor is on leave at the requested time' });
    }

    const previousScheduledAt = appointment.scheduledAt;

    const rescheduled = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const conflict = await tx.appointment.findUnique({
            where: { doctorId_scheduledAt: { doctorId: appointment.doctorId, scheduledAt: newDate } },
          });

          if (conflict && conflict.id !== appointment.id) {
            if (BLOCKING_STATUSES.includes(conflict.status)) {
              throw new AppError(409, 'This time slot is already booked');
            }
            // Stale cancelled/no-show row occupying the target slot — clear it so the move can happen.
            await tx.appointment.delete({ where: { id: conflict.id } });
          }

          return tx.appointment.update({
            where: { id: appointment.id },
            data: { scheduledAt: newDate, status: 'PENDING' },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );

    await sendRescheduleNotice(rescheduled, appointment.patient, appointment.doctor, previousScheduledAt);

    const calendarChanges = await syncEventsForAppointment(rescheduled, appointment.patient, appointment.doctor);
    const finalAppointment = Object.keys(calendarChanges).length
      ? await prisma.appointment.update({ where: { id: rescheduled.id }, data: calendarChanges })
      : rescheduled;

    res.json({ appointment: finalAppointment });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.code === 'P2002' || err.code === 'P2034') {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }
    next(err);
  }
}

// Explicit select (rather than include, which would return every scalar
// implicitly) so the AI-generated fields the Doctor Portal reads —
// aiPreVisitSummary, triageLevel, aiPostVisitSummary — are guaranteed
// present in the response regardless of future schema additions.
const APPOINTMENT_SELECT = {
  id: true,
  patientId: true,
  doctorId: true,
  scheduledAt: true,
  durationMinutes: true,
  status: true,
  symptoms: true,
  triageLevel: true,
  aiPreVisitSummary: true,
  doctorNotes: true,
  aiPostVisitSummary: true,
  followUpInDays: true,
  followUpDate: true,
  patientCalendarEventId: true,
  doctorCalendarEventId: true,
  reminderSentAt: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, name: true, email: true, phone: true } },
  doctor: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      doctorProfile: { select: { specialization: true } },
    },
  },
};

// Lists the authenticated user's own appointments: a patient sees their
// bookings, a doctor sees their schedule. `date` (YYYY-MM-DD) narrows a
// doctor's results to a single day for the daily queue view.
async function listMyAppointments(req, res, next) {
  try {
    const { date } = req.query;
    const where = req.user.role === 'DOCTOR' ? { doctorId: req.user.id } : { patientId: req.user.id };

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      where.scheduledAt = { gte: start, lte: end };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SELECT,
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({ appointments });
  } catch (err) {
    next(err);
  }
}

async function getAppointmentById(req, res, next) {
  try {
    const { id } = req.params;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: APPOINTMENT_SELECT,
    });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const isOwner = req.user.id === appointment.patientId || req.user.id === appointment.doctorId;
    if (!isOwner && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  bookAppointment,
  preVisitSummary,
  postVisitSummary,
  cancelAppointment,
  rescheduleAppointment,
  listMyAppointments,
  getAppointmentById,
};
