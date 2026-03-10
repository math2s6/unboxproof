const { verifyAccess } = require('../services/tokenService');
const db = require('../db');

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  try {
    const payload = verifyAccess(auth.slice(7));
    const user = db.prepare('SELECT id, email, username, role, balance, escrow_balance, avatar_url, rating_avg, rating_count FROM users WHERE id = ? AND is_banned = 0').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
