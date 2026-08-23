import client from './client';

export const listDoctors = () => client.get('/admin/doctors').then((r) => r.data.doctors);
export const createDoctor = (payload) => client.post('/admin/doctors', payload).then((r) => r.data.user);
export const markDoctorLeave = (doctorId, payload) =>
  client.post(`/admin/doctors/${doctorId}/leaves`, payload).then((r) => r.data);
