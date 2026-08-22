const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// Short-lived, signed token used as the OAuth `state` param: Google's redirect
// back to our callback is an unauthenticated browser navigation (no Bearer
// header), so the authenticated user's id has to travel in `state` instead.
function signState(userId) {
  return jwt.sign({ sub: userId, purpose: 'calendar_oauth_state' }, process.env.JWT_SECRET, {
    expiresIn: '10m',
  });
}

function verifyState(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== 'calendar_oauth_state') {
    throw new Error('Invalid state token');
  }
  return payload.sub;
}

module.exports = { signToken, verifyToken, signState, verifyState };
