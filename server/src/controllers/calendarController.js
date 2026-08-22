const prisma = require('../config/prisma');
const { signState, verifyState } = require('../utils/jwt');
const { getAuthUrl, exchangeCodeForTokens } = require('../services/googleCalendarService');

function getOAuthUrl(req, res) {
  const state = signState(req.user.id);
  res.json({ url: getAuthUrl(state) });
}

// Public: Google redirects the user's browser here directly, with no
// Authorization header — the authenticated identity travels via `state`.
async function oauthCallback(req, res) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const { code, state } = req.query;

  if (!code || !state) {
    return res.redirect(`${clientUrl}/settings?calendar=error`);
  }

  let userId;
  try {
    userId = verifyState(state);
  } catch {
    return res.redirect(`${clientUrl}/settings?calendar=error`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(tokens.access_token && { googleAccessToken: tokens.access_token }),
        ...(tokens.refresh_token && { googleRefreshToken: tokens.refresh_token }),
        ...(tokens.expiry_date && { googleTokenExpiry: new Date(tokens.expiry_date) }),
      },
    });
    res.redirect(`${clientUrl}/settings?calendar=connected`);
  } catch (err) {
    console.error('[calendar] OAuth callback failed:', err.message);
    res.redirect(`${clientUrl}/settings?calendar=error`);
  }
}

module.exports = { getOAuthUrl, oauthCallback };
