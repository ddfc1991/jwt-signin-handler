// src/services/auth.js
// JWT token helpers for agent authentication

const jwt = require('jsonwebtoken');

const SECRET = process.env.AGENT_JWT_SECRET || 'change_me_secret';

function signToken(payload, opts) {
  const options = Object.assign({ expiresIn: '24h' }, opts || {});
  return jwt.sign(payload, SECRET, options);
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = { signToken, verifyToken };
