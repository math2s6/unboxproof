const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const CODE_SECRET = process.env.VERIFICATION_CODE_SECRET || 'code_secret';

function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function signRefresh(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

function verifyAccess(token) {
  return jwt.verify(token, JWT_SECRET);
}

function generateVerificationCode(orderId) {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const hash = crypto.createHmac('sha256', CODE_SECRET + orderId).update(code).digest('hex');
  return { code, hash };
}

module.exports = { signAccess, signRefresh, verifyAccess, generateVerificationCode };
