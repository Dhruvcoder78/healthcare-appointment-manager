const express = require('express');
const { getOAuthUrl, oauthCallback } = require('../controllers/calendarController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/oauth/url', authenticate, getOAuthUrl);
router.get('/oauth/callback', oauthCallback);

module.exports = router;
