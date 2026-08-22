const express = require('express');
const { bookAppointment, preVisitSummary, postVisitSummary } = require('../controllers/appointmentController');
const { authenticate, isPatient, isDoctor } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, isPatient, bookAppointment);
router.post('/:id/pre-visit-summary', authenticate, isPatient, preVisitSummary);
router.post('/:id/post-visit-summary', authenticate, isDoctor, postVisitSummary);

module.exports = router;
