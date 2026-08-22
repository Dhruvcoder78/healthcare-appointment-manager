const express = require('express');
const { createDoctor, markDoctorLeave } = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/doctors', authenticate, isAdmin, createDoctor);
router.post('/doctors/:doctorId/leaves', authenticate, isAdmin, markDoctorLeave);

module.exports = router;
