const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { lockFunds } = require('../services/escrowService');
const { notify } = require('../services/notificationService');
const { generateVerificationCode } = require('../services/tokenService');
require('dotenv').config();

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { listingId } = req.body;
    const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").get(listingId);
    if (!listing) return res.status(404).json({ error: 'Annonce introuvable ou déjà vendue' });
    if (listing.seller_id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas acheter votre propre annonce' });

    const feePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || 5) / 100;
    const platformFee = parseFloat((listing.price * feePercent).toFixed(2));
    const sellerPayout = parseFloat((listing.price - platformFee).toFixed(2));

    const { code, hash } = generateVerificationCode(Date.now());

    const createOrder = db.transaction(() => {
      const r = db.prepare(`INSERT INTO orders (listing_id, buyer_id, seller_id, amount, platform_fee, seller_payout, status, verification_code, verification_code_hash) VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, ?)`).run(listingId, req.user.id, listing.seller_id, listing.price, platformFee, sellerPayout, code, hash);
      lockFunds(req.user.id, listing.seller_id, r.lastInsertRowid, listing.price, platformFee, sellerPayout);
      db.prepare("UPDATE listings SET status = 'reserved' WHERE id = ?").run(listingId);
      notify(listing.seller_id, 'order_placed', { orderId: r.lastInsertRowid, title: listing.title, amount: listing.price });
      return r.lastInsertRowid;
    });

    const orderId = createOrder();
    res.status(201).json({ orderId, message: 'Commande passée avec succès. Fonds en séquestre.' });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, (req, res) => {
  const { role } = req.query;
  let sql = `
    SELECT o.*, l.title, l.category,
           (SELECT url FROM listing_images WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as thumbnail,
           b.username as buyer_name, s.username as seller_name
    FROM orders o
    JOIN listings l ON l.id = o.listing_id
    JOIN users b ON b.id = o.buyer_id
    JOIN users s ON s.id = o.seller_id
    WHERE `;

  if (role === 'buyer') sql += 'o.buyer_id = ?';
  else if (role === 'seller') sql += 'o.seller_id = ?';
  else sql += '(o.buyer_id = ? OR o.seller_id = ?)';

  sql += ' ORDER BY o.created_at DESC';
  const params = role ? [req.user.id] : [req.user.id, req.user.id];
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, l.title, l.description, l.category, l.condition,
           (SELECT url FROM listing_images WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as thumbnail,
           b.username as buyer_name, b.avatar_url as buyer_avatar,
           s.username as seller_name, s.avatar_url as seller_avatar
    FROM orders o
    JOIN listings l ON l.id = o.listing_id
    JOIN users b ON b.id = o.buyer_id
    JOIN users s ON s.id = o.seller_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.buyer_id !== req.user.id && order.seller_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  const unboxing = db.prepare('SELECT * FROM unboxing_submissions WHERE order_id = ?').get(order.id);
  const dispute = db.prepare('SELECT * FROM disputes WHERE order_id = ?').get(order.id);
  res.json({ ...order, unboxing, dispute });
});

router.post('/:id/ship', requireAuth, (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.seller_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    if (order.status !== 'paid') return res.status(400).json({ error: `Statut invalide: ${order.status}` });
    const { tracking_number, carrier } = req.body;
    if (!tracking_number) return res.status(400).json({ error: 'Numéro de suivi requis' });
    db.prepare("UPDATE orders SET status='shipped', tracking_number=?, carrier=?, shipped_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(tracking_number, carrier || 'Autre', order.id);
    notify(order.buyer_id, 'order_shipped', { orderId: order.id, tracking: tracking_number, carrier: carrier || 'Autre' });
    res.json({ message: 'Expédition confirmée' });
  } catch (e) { next(e); }
});

router.post('/:id/confirm-delivery', requireAuth, (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.buyer_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    if (order.status !== 'shipped') return res.status(400).json({ error: `Statut invalide: ${order.status}` });
    db.prepare("UPDATE orders SET status='unboxing_pending', delivered_at=datetime('now'), unboxing_deadline=datetime('now', '+48 hours'), updated_at=datetime('now') WHERE id=?").run(order.id);
    notify(order.buyer_id, 'unboxing_reminder', { orderId: order.id });
    notify(order.seller_id, 'delivery_confirmed', { orderId: order.id });
    res.json({ message: 'Réception confirmée. Vous avez 48h pour faire l\'unboxing.' });
  } catch (e) { next(e); }
});

router.post('/:id/cancel', requireAuth, (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.buyer_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    if (!['paid'].includes(order.status)) return res.status(400).json({ error: 'Annulation impossible à ce stade' });
    const { refundFunds } = require('../services/escrowService');
    const cancelTx = db.transaction(() => {
      refundFunds(order.id, 'Annulation acheteur');
      db.prepare("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(order.id);
      db.prepare("UPDATE listings SET status='active' WHERE id=?").run(order.listing_id);
    });
    cancelTx();
    res.json({ message: 'Commande annulée et remboursée' });
  } catch (e) { next(e); }
});

module.exports = router;
