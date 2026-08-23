import client from './client';

export const listDoctors = () => client.get('/admin/doctors').then((r) => r.data.doctors);
export const markDoctorLeave = (doctorId, payload) =>
  client.post(`/admin/doctors/${doctorId}/leaves`, payload).then((r) => r.data);

export const listPendingDoctors = () => client.get('/admin/doctors/pending').then((r) => r.data.doctors);
export const approveDoctor = (doctorId) =>
  client.post(`/admin/doctors/${doctorId}/approve`).then((r) => r.data.doctor);
export const rejectDoctor = (doctorId) =>
  client.post(`/admin/doctors/${doctorId}/reject`).then((r) => r.data.doctor);

export const listPendingLeaves = () => client.get('/admin/leaves/pending').then((r) => r.data.leaves);
export const approveLeave = (leaveId) => client.post(`/admin/leaves/${leaveId}/approve`).then((r) => r.data);
export const rejectLeave = (leaveId) => client.post(`/admin/leaves/${leaveId}/reject`).then((r) => r.data.leave);
