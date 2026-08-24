require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const leaveRoutes = require('./routes/leaveRoutes');

const app = express();

// .trim() guards against a stray trailing newline/whitespace in the
// platform env var (e.g. pasted from a browser address bar into a hosting
// dashboard), which otherwise crashes every request with
// ERR_INVALID_CHAR when `cors` tries to set the Access-Control-Allow-Origin
// header.
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').trim();
app.use(cors({ origin: clientUrl }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/leaves', leaveRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
