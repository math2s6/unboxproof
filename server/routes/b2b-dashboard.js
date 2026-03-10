const router = require('express').Router();
const db = require('../db');
const crypto = require('crypto');
const { requireCompanyAuth } = require('../middleware/companyAuth');

router.use(requireCompanyAuth);

router.get('/overview', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.company.id);
  const stats = {
    total_orders: company.total_orders,
    monthly_used: company.monthly_orders_used,
    fraud_prevented: company.total_fraud_prevented,
    pending: db.prepare("SELECT COUNT(*) as c FROM b2b_orders WHERE company_id = ? AND status IN ('pending','shipped','unboxing_pending')").get(req.company.id).c,
    completed: db.prepare("SELECT COUNT(*) as c FROM b2b_orders WHERE company_id = ? AND status = 'completed'").get(req.company.id).c,
    to_review: db.prepare("SELECT COUNT(*) as c FROM b2b_orders WHERE company_id = ? AND status='unboxing_submitted'").get(req.company.id).c,
  };

  const recentOrders = db.prepare('SELECT * FROM b2b_orders WHERE company_id = ? ORDER BY created_at DESC LIMIT 10').all(req.company.id);
  const recentUnboxings = db.prepare('SELECT u.*, o.external_order_id, o.product_name, o.customer_email FROM b2b_unboxings u JOIN b2b_orders o ON o.id = u.b2b_order_id WHERE u.company_id = ? ORDER BY u.submitted_at DESC LIMIT 6').all(req.company.id);

  res.json({ company, stats, recent_orders: recentOrders, recent_unboxings: recentUnboxings.map(u => ({ ...u, photo_urls: JSON.parse(u.photo_urls) })) });
});

router.get('/orders', (req, res) => {
  const { status, page = 1 } = req.query;
  let where = 'o.company_id = ?';
  const params = [req.company.id];
  if (status) { where += ' AND o.status = ?'; params.push(status); }
  const orders = db.prepare(`SELECT o.*, u.ai_confidence, u.code_visible, u.condition_ok FROM b2b_orders o LEFT JOIN b2b_unboxings u ON u.b2b_order_id = o.id WHERE ${where} ORDER BY o.created_at DESC LIMIT 20 OFFSET ?`).all(...params, (parseInt(page) - 1) * 20);
  const total = db.prepare(`SELECT COUNT(*) as c FROM b2b_orders o WHERE ${where}`).get(...params);
  res.json({ orders, total: total.c });
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!order) return res.status(404).json({ error: 'Introuvable' });
  const unboxing = db.prepare('SELECT * FROM b2b_unboxings WHERE b2b_order_id = ?').get(order.id);
  if (unboxing) unboxing.photo_urls = JSON.parse(unboxing.photo_urls);
  res.json({ ...order, unboxing });
});

router.post('/orders/:id/resolve', (req, res, next) => {
  try {
    const { resolution } = req.body;
    if (!['completed', 'refunded'].includes(resolution)) return res.status(400).json({ error: 'completed ou refunded' });
    db.prepare("UPDATE b2b_orders SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(resolution, req.params.id, req.company.id);
    db.prepare('UPDATE b2b_unboxings SET resolution=? WHERE b2b_order_id=?').run(resolution, req.params.id);
    if (resolution === 'refunded') db.prepare('UPDATE companies SET total_fraud_prevented = total_fraud_prevented + 1 WHERE id = ?').run(req.company.id);
    res.json({ message: resolution === 'completed' ? 'Commande complétée' : 'Remboursement validé' });
  } catch (e) { next(e); }
});

router.get('/api-keys', (req, res) => {
  res.json(db.prepare('SELECT id, key_prefix, name, is_active, last_used_at, requests_count, created_at FROM api_keys WHERE company_id = ?').all(req.company.id));
});

router.post('/api-keys', (req, res, next) => {
  try {
    const key = 'sk_live_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    db.prepare('INSERT INTO api_keys (company_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?)').run(req.company.id, keyHash, key.slice(0, 12) + '...', req.body.name || 'New Key');
    res.status(201).json({ api_key: key, message: 'Sauvegardez cette clé — elle ne sera plus affichée.' });
  } catch (e) { next(e); }
});

router.delete('/api-keys/:id', (req, res) => {
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ? AND company_id = ?').run(req.params.id, req.company.id);
  res.json({ message: 'Clé désactivée' });
});

router.post('/orders/:id/send-invite', async (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
    if (!order) return res.status(404).json({ error: 'Introuvable' });
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.company.id);
    const { sendUnboxingInvite } = require('../services/emailService');
    const unboxingUrl = `http://localhost:3000/unboxing-customer.html?order=${order.id}`;
    const result = await sendUnboxingInvite(order.customer_email, order.customer_name, order.product_name, order.verification_code, unboxingUrl, company.name);
    res.json({ message: 'Email envoyé', preview_url: result.previewUrl });
  } catch (e) { next(e); }

});

// Webhooks
router.get('/webhooks', (req, res) => {
  try { db.prepare('ALTER TABLE companies ADD COLUMN webhook_url TEXT').run(); } catch(e) {}
  const company = db.prepare('SELECT webhook_url FROM companies WHERE id = ?').get(req.company.id);
  res.json({ webhook_url: company?.webhook_url || null });
});

router.put('/webhooks', (req, res, next) => {
  try {
    try { db.prepare('ALTER TABLE companies ADD COLUMN webhook_url TEXT').run(); } catch(e) {}
    db.prepare('UPDATE companies SET webhook_url = ? WHERE id = ?').run(req.body.webhook_url || null, req.company.id);
    res.json({ message: 'Webhook URL mis à jour' });
  } catch(e) { next(e); }
});

router.post('/webhooks/test', async (req, res, next) => {
  try {
    try { db.prepare('ALTER TABLE companies ADD COLUMN webhook_url TEXT').run(); } catch(e) {}
    const company = db.prepare('SELECT webhook_url, name FROM companies WHERE id = ?').get(req.company.id);
    if (!company?.webhook_url) return res.status(400).json({ error: 'Aucun webhook URL configuré. Ajoutez-en un d\'abord.' });
    const payload = { event: 'webhook.test', company: company.name, timestamp: new Date().toISOString(), data: { message: 'Test webhook SafeTrade ✅' } };
    const response = await fetch(company.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SafeTrade-Event': 'webhook.test' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) }).catch(e => ({ ok: false, status: 0, statusText: e.message }));
    res.json({ sent: true, url: company.webhook_url, status: response.status, success: response.ok });
  } catch(e) { next(e); }
});

module.exports = router;
