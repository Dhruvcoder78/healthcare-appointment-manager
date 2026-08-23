const express = require('express');
const {
  bookAppointment,
  preVisitSummary,
  postVisitSummary,
  cancelAppointment,
  rescheduleAppointment,
  listMyAppointments,
  getAppointmentById,
} = require('../controllers/appointmentController');
const { authenticate, isPatient, isDoctor } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, listMyAppointments);
router.post('/', authenticate, isPatient, bookAppointment);
router.get('/:id', authenticate, getAppointmentById);
router.post('/:id/pre-visit-summary', authenticate, isPatient, preVisitSummary);
router.post('/:id/post-visit-summary', authenticate, isDoctor, postVisitSummary);
router.patch('/:id/cancel', authenticate, cancelAppointment);
router.patch('/:id/reschedule', authenticate, rescheduleAppointment);

module.exports = router;
