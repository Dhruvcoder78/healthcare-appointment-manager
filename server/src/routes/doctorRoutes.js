const express = require('express');
const { searchDoctors } = require('../controllers/doctorController');
const { authenticate, isPatient } = require('../middleware/auth');

const router = express.Router();

router.get('/search', authenticate, isPatient, searchDoctors);

module.exports = router;
