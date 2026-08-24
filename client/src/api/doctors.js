import client from './client';

export const searchDoctors = ({ specialization, name } = {}) =>
  client
    .get('/doctors/search', { params: { ...(specialization && { specialization }), ...(name && { name }) } })
    .then((r) => r.data.doctors);
