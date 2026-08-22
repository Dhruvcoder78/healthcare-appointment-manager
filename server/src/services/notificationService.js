const { sendMail } = require('./emailService');

function formatWhen(date) {
  return new Date(date).toUTCString();
}

// sendMail already never throws (returns {success, error}), so a failure to
// reach one recipient never blocks the other or the caller's flow.
async function notifyBoth({ patient, doctor, subject, patientText, doctorText }) {
  const [patientResult, doctorResult] = await Promise.all([
    sendMail({ to: patient.email, subject, text: patientText }),
    sendMail({ to: doctor.email, subject, text: doctorText }),
  ]);

  if (!patientResult.success) {
    console.error(`[notificationService] failed to email patient ${patient.email}:`, patientResult.error);
  }
  if (!doctorResult.success) {
    console.error(`[notificationService] failed to email doctor ${doctor.email}:`, doctorResult.error);
  }

  return { patientResult, doctorResult };
}

function sendBookingConfirmation(appointment, patient, doctor) {
  const when = formatWhen(appointment.scheduledAt);
  return notifyBoth({
    patient,
    doctor,
    subject: 'Appointment Confirmed',
    patientText: `Hi ${patient.name}, your appointment with Dr. ${doctor.name} is confirmed for ${when}.`,
    doctorText: `Hi Dr. ${doctor.name}, you have a new appointment with ${patient.name} on ${when}.`,
  });
}

function sendCancellationNotice(appointment, patient, doctor, reason) {
  const when = formatWhen(appointment.scheduledAt);
  const reasonText = reason ? ` Reason: ${reason}.` : '';
  return notifyBoth({
    patient,
    doctor,
    subject: 'Appointment Cancelled',
    patientText: `Hi ${patient.name}, your appointment with Dr. ${doctor.name} on ${when} has been cancelled.${reasonText}`,
    doctorText: `Hi Dr. ${doctor.name}, the appointment with ${patient.name} on ${when} has been cancelled.${reasonText}`,
  });
}

function sendRescheduleNotice(appointment, patient, doctor, previousScheduledAt) {
  const oldWhen = formatWhen(previousScheduledAt);
  const newWhen = formatWhen(appointment.scheduledAt);
  return notifyBoth({
    patient,
    doctor,
    subject: 'Appointment Rescheduled',
    patientText: `Hi ${patient.name}, your appointment with Dr. ${doctor.name} has been moved from ${oldWhen} to ${newWhen}.`,
    doctorText: `Hi Dr. ${doctor.name}, the appointment with ${patient.name} has been moved from ${oldWhen} to ${newWhen}.`,
  });
}

function sendAppointmentReminder(appointment, patient, doctor) {
  const when = formatWhen(appointment.scheduledAt);
  return notifyBoth({
    patient,
    doctor,
    subject: 'Appointment Reminder',
    patientText: `Hi ${patient.name}, this is a reminder of your upcoming appointment with Dr. ${doctor.name} on ${when}.`,
    doctorText: `Hi Dr. ${doctor.name}, this is a reminder of your upcoming appointment with ${patient.name} on ${when}.`,
  });
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationNotice,
  sendRescheduleNotice,
  sendAppointmentReminder,
};
