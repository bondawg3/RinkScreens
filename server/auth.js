const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

function getJwtSecret() {
  const settings = db.getSettings();
  if (settings.jwt_secret) return settings.jwt_secret;
  const secret = crypto.randomBytes(32).toString('hex');
  db.setSetting('jwt_secret', secret);
  return secret;
}

// Invalidates all previously issued tokens (called when the password changes)
function rotateJwtSecret() {
  const secret = crypto.randomBytes(32).toString('hex');
  db.setSetting('jwt_secret', secret);
  return secret;
}

function signToken() {
  return jwt.sign({ sub: 'admin' }, getJwtSecret(), { expiresIn: '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.admin = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = { getJwtSecret, rotateJwtSecret, signToken, verifyToken, requireAuth };
