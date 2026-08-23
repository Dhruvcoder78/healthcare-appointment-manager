const express = require('express');
const { searchDoctors, updateMySchedule } = require('../controllers/doctorController');
const { authenticate, isPatient, isDoctor } = require('../middleware/auth');

const router = express.Router();

router.get('/search', authenticate, isPatient, searchDoctors);
router.put('/me/schedule', authenticate, isDoctor, updateMySchedule);

module.exports = router;
