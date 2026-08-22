const express = require('express');
const { createDoctor } = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/doctors', authenticate, isAdmin, createDoctor);

module.exports = router;
