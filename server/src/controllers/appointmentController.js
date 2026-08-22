const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { AppError } = require('../utils/errors');
const { withSerializableRetry } = require('../utils/withRetry');
const { isWithinWorkingHours, isAlignedToSlotGrid } = require('../utils/scheduling');
const { generatePreVisitSummary, generatePostVisitSummary } = require('../services/llmService');

const BLOCKING_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED'];

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
                urgencyLevel: null,
                preVisitSummary: null,
                postVisitNotes: null,
                postVisitSummary: null,
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

    res.status(201).json({ appointment });
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
        urgencyLevel: result.data.urgencyLevel,
        preVisitSummary: JSON.stringify(result.data),
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
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({ error: 'notes are required' });
    }

    const appointment = await prisma.appointment.findUnique({ where: { id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (appointment.doctorId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await generatePostVisitSummary(notes);

    let followUpDate = null;
    if (Number.isInteger(result.data.followUpInDays)) {
      followUpDate = new Date(appointment.scheduledAt);
      followUpDate.setDate(followUpDate.getDate() + result.data.followUpInDays);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        postVisitNotes: notes,
        postVisitSummary: JSON.stringify(result.data),
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

module.exports = { bookAppointment, preVisitSummary, postVisitSummary };
