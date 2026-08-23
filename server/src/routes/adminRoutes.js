const express = require('express');
const { createDoctor, markDoctorLeave, listDoctors, approveDoctor } = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/doctors', authenticate, isAdmin, listDoctors);
router.post('/doctors', authenticate, isAdmin, createDoctor);
router.post('/doctors/:doctorId/leaves', authenticate, isAdmin, markDoctorLeave);
router.post('/doctors/:doctorId/approve', authenticate, isAdmin, approveDoctor);

module.exports = router;
