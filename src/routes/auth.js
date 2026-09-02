// src/routes/auth.js
// Simple route to mint agent tokens. Protected by ADMIN_KEY header (set ADMIN_KEY in env).

const express = require('express');
const router = express.Router();
const { signToken } = require('../services/auth');

router.post('/token', (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (!process.env.ADMIN_KEY) return res.status(500).json({ error: 'server not configured with ADMIN_KEY' });
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });

  const { deviceId, expiresIn } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

  const token = signToken({ deviceId }, expiresIn ? { expiresIn } : undefined);
  res.json({ token });
});

module.exports = router;
