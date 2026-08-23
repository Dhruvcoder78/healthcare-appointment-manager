const prisma = require('../config/prisma');
const { sanitizeUser } = require('./authController');
const { sendCancellationNotice } = require('../services/notificationService');
const { deleteEventsForAppointment } = require('../services/googleCalendarService');
const { parseDateBoundary } = require('../utils/scheduling');

const ACTIVE_APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED'];

// Shared by admin-logged leave (already APPROVED) and doctor-requested leave
// once an admin approves it: cancels every conflicting appointment, cleans
// up calendar events, and emails both parties. Best-effort — neither
// calendar cleanup nor notification failure should fail the caller.
async function cancelConflictingAppointments(doctorUser, doctorProfileId, start, end, reason) {
  const affectedAppointments = await prisma.$transaction(async (tx) => {
    const appointmentsToCancel = await tx.appointment.findMany({
      where: {
        doctorId: doctorUser.id,
        scheduledAt: { gte: start, lte: end },
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
      },
      include: { patient: true },
    });

    if (appointmentsToCancel.length > 0) {
      await tx.appointment.updateMany({
        where: { id: { in: appointmentsToCancel.map((a) => a.id) } },
        data: { status: 'CANCELLED' },
      });
    }

    return appointmentsToCancel;
  });

  await Promise.all(
    affectedAppointments.map(async (appt) => {
      await deleteEventsForAppointment(appt, appt.patient, doctorUser);
      await sendCancellationNotice(appt, appt.patient, doctorUser, reason || 'Doctor is on leave');
    })
  );

  return affectedAppointments.map((appt) => ({
    appointmentId: appt.id,
    scheduledAt: appt.scheduledAt,
    patient: sanitizeUser(appt.patient),
  }));
}

// Logs leave directly on a doctor's behalf, effective immediately (created
// as APPROVED — the admin is the approver). Cancels every existing
// PENDING/CONFIRMED appointment in range and returns the affected patients
// so they can be notified.
async function markDoctorLeave(req, res, next) {
  try {
    const { doctorId } = req.params;
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = parseDateBoundary(startDate, false);
    const end = parseDateBoundary(endDate, true);
    if (!start || !end) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
    }
    if (end < start) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: 'DOCTOR' },
      include: { doctorProfile: true },
    });
    if (!doctor || !doctor.doctorProfile) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const leave = await prisma.doctorLeave.create({
      data: {
        doctorId: doctor.doctorProfile.id,
        startDate: start,
        endDate: end,
        reason,
        status: 'APPROVED',
      },
    });

    const affectedPatients = await cancelConflictingAppointments(doctor, doctor.doctorProfile.id, start, end, reason);

    res.status(201).json({ leave, affectedPatients });
  } catch (err) {
    next(err);
  }
}

// Read-only doctor directory: only APPROVED doctors, with their leave
// history.
async function listDoctors(req, res, next) {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR', doctorProfile: { status: 'APPROVED' } },
      include: { doctorProfile: { include: { leaves: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ doctors: doctors.map(sanitizeUser) });
  } catch (err) {
    next(err);
  }
}

async function listPendingDoctors(req, res, next) {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR', doctorProfile: { status: 'PENDING' } },
      include: { doctorProfile: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ doctors: doctors.map(sanitizeUser) });
  } catch (err) {
    next(err);
  }
}

// Approves a self-registered doctor account, letting them log in and
// making them visible in patient search.
async function approveDoctor(req, res, next) {
  try {
    const { doctorId } = req.params;

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: 'DOCTOR' },
      include: { doctorProfile: true },
    });
    if (!doctor || !doctor.doctorProfile) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    if (doctor.doctorProfile.status !== 'PENDING') {
      return res.status(400).json({ error: 'Doctor is not pending approval' });
    }

    const updatedProfile = await prisma.doctorProfile.update({
      where: { id: doctor.doctorProfile.id },
      data: { status: 'APPROVED' },
    });

    res.json({ doctor: sanitizeUser({ ...doctor, doctorProfile: updatedProfile }) });
  } catch (err) {
    next(err);
  }
}

// Rejects a self-registered doctor account. They remain unable to log in
// permanently (no retry path in this endpoint set).
async function rejectDoctor(req, res, next) {
  try {
    const { doctorId } = req.params;

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: 'DOCTOR' },
      include: { doctorProfile: true },
    });
    if (!doctor || !doctor.doctorProfile) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    if (doctor.doctorProfile.status !== 'PENDING') {
      return res.status(400).json({ error: 'Doctor is not pending approval' });
    }

    const updatedProfile = await prisma.doctorProfile.update({
      where: { id: doctor.doctorProfile.id },
      data: { status: 'REJECTED' },
    });

    res.json({ doctor: sanitizeUser({ ...doctor, doctorProfile: updatedProfile }) });
  } catch (err) {
    next(err);
  }
}

async function listPendingLeaves(req, res, next) {
  try {
    const leaves = await prisma.doctorLeave.findMany({
      where: { status: 'PENDING' },
      include: {
        doctor: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ leaves });
  } catch (err) {
    next(err);
  }
}

// Approves a doctor-requested leave: from this point it blocks new bookings,
// and every conflicting existing appointment is cancelled (same side
// effects as an admin-logged leave).
async function approveLeaveRequest(req, res, next) {
  try {
    const { leaveId } = req.params;

    const leave = await prisma.doctorLeave.findUnique({
      where: { id: leaveId },
      include: { doctor: { include: { user: true } } },
    });
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ error: 'Leave request is not pending' });
    }

    const updatedLeave = await prisma.doctorLeave.update({
      where: { id: leaveId },
      data: { status: 'APPROVED' },
    });

    const affectedPatients = await cancelConflictingAppointments(
      leave.doctor.user,
      leave.doctorId,
      leave.startDate,
      leave.endDate,
      leave.reason
    );

    res.json({ leave: updatedLeave, affectedPatients });
  } catch (err) {
    next(err);
  }
}

async function rejectLeaveRequest(req, res, next) {
  try {
    const { leaveId } = req.params;

    const leave = await prisma.doctorLeave.findUnique({ where: { id: leaveId } });
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ error: 'Leave request is not pending' });
    }

    const updatedLeave = await prisma.doctorLeave.update({
      where: { id: leaveId },
      data: { status: 'REJECTED' },
    });

    res.json({ leave: updatedLeave });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  markDoctorLeave,
  listDoctors,
  listPendingDoctors,
  approveDoctor,
  rejectDoctor,
  listPendingLeaves,
  approveLeaveRequest,
  rejectLeaveRequest,
};
