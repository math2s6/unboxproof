const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { releaseFunds, refundFunds } = require('../services/escrowService');
const { notify } = require('../services/notificationService');

router.get('/stats', requireAdmin, (req, res) => {
  res.json({
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    listings: db.prepare("SELECT COUNT(*) as c FROM listings WHERE status = 'active'").get().c,
    orders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    completed: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'completed'").get().c,
    disputed: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'disputed'").get().c,
    revenue: db.prepare("SELECT COALESCE(SUM(platform_fee),0) as r FROM orders WHERE status = 'completed'").get().r,
    unboxingPending: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'unboxing_pending'").get().c,
  });
});

router.get('/disputes', requireAdmin, (req, res) => {
  const disputes = db.prepare(`
    SELECT d.*, o.amount, o.verification_code,
           b.username as buyer_name, s.username as seller_name, l.title
    FROM disputes d JOIN orders o ON o.id = d.order_id
    JOIN users b ON b.id = d.buyer_id JOIN users s ON s.id = d.seller_id
    JOIN listings l ON l.id = o.listing_id
    WHERE d.status = 'open' ORDER BY d.created_at
  `).all();
  res.json(disputes);
});

router.post('/disputes/:id/resolve', requireAdmin, (req, res, next) => {
  try {
    const { resolution, admin_notes } = req.body;
    if (!['buyer', 'seller'].includes(resolution)) return res.status(400).json({ error: 'Resolution: buyer ou seller' });
    const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(req.params.id);
    if (!dispute || dispute.status !== 'open') return res.status(404).json({ error: 'Litige introuvable ou déjà résolu' });

    const resolveTx = db.transaction(() => {
      if (resolution === 'buyer') {
        refundFunds(dispute.order_id, 'Litige: remboursement acheteur');
        db.prepare("UPDATE orders SET status='refunded', updated_at=datetime('now') WHERE id=?").run(dispute.order_id);
      } else {
        releaseFunds(dispute.order_id, 'Litige: libération vendeur');
        db.prepare("UPDATE orders SET status='completed', updated_at=datetime('now') WHERE id=?").run(dispute.order_id);
        db.prepare("UPDATE listings SET status='sold' WHERE id = (SELECT listing_id FROM orders WHERE id = ?)").run(dispute.order_id);
      }
      db.prepare(`UPDATE disputes SET status=?, admin_notes=?, resolved_by=?, resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(resolution === 'buyer' ? 'resolved_buyer' : 'resolved_seller', admin_notes || '', req.user.id, dispute.id);
      notify(dispute.buyer_id, 'dispute_resolved', { disputeId: dispute.id, resolution });
      notify(dispute.seller_id, 'dispute_resolved', { disputeId: dispute.id, resolution });
    });
    resolveTx();
    res.json({ message: `Litige résolu en faveur du ${resolution === 'buyer' ? 'acheteur' : 'vendeur'}` });
  } catch (e) { next(e); }
});

router.get('/unboxing/pending', requireAdmin, (req, res) => {
  const submissions = db.prepare(`
    SELECT us.*, o.verification_code, o.amount,
           b.username as buyer_name, s.username as seller_name, l.title
    FROM unboxing_submissions us
    JOIN orders o ON o.id = us.order_id
    JOIN users b ON b.id = us.buyer_id
    JOIN users s ON s.id = o.seller_id
    JOIN listings l ON l.id = o.listing_id
    WHERE us.admin_code_verified IS NULL ORDER BY us.submitted_at
  `).all();
  res.json(submissions.map(s => ({ ...s, photo_urls: JSON.parse(s.photo_urls) })));
});

router.post('/unboxing/:id/verify', requireAdmin, (req, res, next) => {
  try {
    const { verified } = req.body;
    db.prepare('UPDATE unboxing_submissions SET admin_code_verified = ?, reviewed_at = datetime(\'now\'), reviewed_by = ? WHERE id = ?').run(verified ? 1 : 0, req.user.id, req.params.id);
    res.json({ message: 'Vérification enregistrée' });
  } catch (e) { next(e); }
});

router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, username, role, balance, escrow_balance, rating_avg, rating_count, is_banned, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

router.put('/users/:id/ban', requireAdmin, (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(user.is_banned ? 0 : 1, user.id);
    res.json({ message: user.is_banned ? 'Utilisateur débanné' : 'Utilisateur banni' });
  } catch (e) { next(e); }
});

module.exports = router;
