const express = require('express');
const { bookAppointment } = require('../controllers/appointmentController');
const { authenticate, isPatient } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, isPatient, bookAppointment);

module.exports = router;
