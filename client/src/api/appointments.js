import client from './client';

export const listMyAppointments = (date) =>
  client.get('/appointments', { params: date ? { date } : {} }).then((r) => r.data.appointments);

export const getAppointment = (id) => client.get(`/appointments/${id}`).then((r) => r.data.appointment);

export const bookAppointment = (payload) => client.post('/appointments', payload).then((r) => r.data.appointment);

export const generatePreVisitSummary = (id, payload) =>
  client.post(`/appointments/${id}/pre-visit-summary`, payload || {}).then((r) => r.data);

export const submitPostVisitSummary = (id, payload) =>
  client.post(`/appointments/${id}/post-visit-summary`, payload).then((r) => r.data);

export const cancelAppointment = (id, reason) =>
  client.patch(`/appointments/${id}/cancel`, { reason }).then((r) => r.data.appointment);

export const rescheduleAppointment = (id, scheduledAt) =>
  client.patch(`/appointments/${id}/reschedule`, { scheduledAt }).then((r) => r.data.appointment);
