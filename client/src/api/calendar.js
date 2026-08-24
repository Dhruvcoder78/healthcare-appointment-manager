import client from './client';

export const getGoogleAuthUrl = () => client.get('/calendar/oauth/url').then((r) => r.data.url);
