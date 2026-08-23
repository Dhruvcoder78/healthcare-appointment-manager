const express = require('express');
const { requestLeave, listMyLeaves } = require('../controllers/leaveController');
const { authenticate, isDoctor } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, isDoctor, listMyLeaves);
router.post('/', authenticate, isDoctor, requestLeave);

module.exports = router;
