const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

function requireCompanyAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET + '_company');
    const company = db.prepare('SELECT id, name, email, logo_url, industry, plan, is_active, monthly_orders_used, total_orders, total_fraud_prevented FROM companies WHERE id = ? AND is_active = 1').get(payload.id);
    if (!company) return res.status(401).json({ error: 'Entreprise introuvable' });
    req.company = company;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

module.exports = { requireCompanyAuth };
