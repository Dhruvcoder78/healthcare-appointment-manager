import client from './client';

export const requestLeave = (payload) => client.post('/leaves', payload).then((r) => r.data.leave);
export const listMyLeaves = () => client.get('/leaves').then((r) => r.data.leaves);
