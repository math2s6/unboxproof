const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { orderId, score, comment } = req.body;
    if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'Score entre 1 et 5' });
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'completed'").get(orderId);
    if (!order) return res.status(404).json({ error: 'Commande introuvable ou non complétée' });
    if (order.buyer_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    const existing = db.prepare('SELECT id FROM ratings WHERE order_id = ?').get(orderId);
    if (existing) return res.status(409).json({ error: 'Déjà noté' });
    db.prepare('INSERT INTO ratings (order_id, rater_id, rated_id, score, comment) VALUES (?, ?, ?, ?, ?)').run(orderId, req.user.id, order.seller_id, score, comment || '');
    const avg = db.prepare('SELECT AVG(score) as avg, COUNT(*) as cnt FROM ratings WHERE rated_id = ?').get(order.seller_id);
    db.prepare('UPDATE users SET rating_avg = ?, rating_count = ? WHERE id = ?').run(Math.round(avg.avg * 10) / 10, avg.cnt, order.seller_id);
    res.json({ message: 'Note envoyée' });
  } catch (e) { next(e); }
});

router.get('/user/:userId', (req, res) => {
  const ratings = db.prepare(`SELECT r.*, u.username as rater_name FROM ratings r JOIN users u ON u.id = r.rater_id WHERE r.rated_id = ? ORDER BY r.created_at DESC LIMIT 20`).all(req.params.userId);
  res.json(ratings);
});

module.exports = router;
