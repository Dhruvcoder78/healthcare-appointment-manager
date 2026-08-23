import client from './client';

export const searchDoctors = (specialization) =>
  client.get('/doctors/search', { params: specialization ? { specialization } : {} }).then((r) => r.data.doctors);
