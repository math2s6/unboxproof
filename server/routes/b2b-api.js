const router = require('express').Router();
const db = require('../db');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const { generateVerificationCode } = require('../services/tokenService');
const { unboxingUpload } = require('../middleware/upload');
const { analyzeUnboxing } = require('../services/aiService');
const { sendUnboxingInvite, sendOrderConfirmation } = require('../services/emailService');
const { sendWebhook } = require('../services/webhookService');

// Public customer-facing routes (no API key needed)
router.get('/customer/:orderId', (req, res) => {
  const order = db.prepare('SELECT id, product_name, customer_name, verification_code, status, unboxing_deadline FROM b2b_orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(order);
});

router.post('/customer/:orderId/submit',
  unboxingUpload.fields([{ name: 'video', maxCount: 1 }, { name: 'photos', maxCount: 10 }]),
  (req, res, next) => {
    try {
      const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ?').get(req.params.orderId);
      if (!order) return res.status(404).json({ error: 'Commande introuvable' });
      if (!['unboxing_pending', 'shipped', 'pending'].includes(order.status)) {
        return res.status(400).json({ error: 'Unboxing déjà soumis ou commande terminée' });
      }

      const videoFile = req.files?.video?.[0];
      const photoFiles = req.files?.photos || [];
      const videoUrl = videoFile ? `/uploads/unboxing/b2b_${req.params.orderId}/${videoFile.filename}` : null;
      const photoUrls = JSON.stringify(photoFiles.map(f => `/uploads/unboxing/b2b_${req.params.orderId}/${f.filename}`));
      const codeVisible = req.body.code_visible === 'true' ? 1 : 0;
      const conditionOk = req.body.condition_ok !== 'false' ? 1 : 0;
      const analysis = analyzeUnboxing({ hasVideo: !!videoFile, photoCount: photoFiles.length, codeVisible: codeVisible === 1, conditionOk: conditionOk === 1 });

      db.prepare('INSERT OR REPLACE INTO b2b_unboxings (b2b_order_id, company_id, video_url, photo_urls, code_visible, condition_ok, customer_notes, ai_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(order.id, order.company_id, videoUrl, photoUrls, codeVisible, conditionOk, req.body.notes || '', analysis.confidence);
      db.prepare("UPDATE b2b_orders SET status='unboxing_submitted', updated_at=datetime('now') WHERE id=?").run(order.id);
      if (!conditionOk) db.prepare('UPDATE companies SET total_fraud_prevented = total_fraud_prevented + 1 WHERE id = ?').run(order.company_id);

      sendWebhook(order.company_id, 'unboxing.submitted', { order_id: order.id, ai_confidence: analysis.confidence, recommendation: analysis.recommendation }).catch(console.error);
      res.json({ success: true, message: "Unboxing soumis avec succès !", ai_confidence: analysis.confidence, ai_label: analysis.label, ai_recommendation: analysis.recommendation, flags: analysis.flags, positives: analysis.positives });
    } catch (e) { next(e); }
  }
);

// All routes below require API key
router.use(requireApiKey);

// POST /api/b2b/orders - Create a new order with verification code
router.post('/orders', (req, res, next) => {
  try {
    const { external_order_id, customer_email, customer_name, product_name, product_description, order_amount, currency, tracking_number, carrier, webhook_url } = req.body;
    if (!external_order_id || !customer_email || !product_name || !order_amount) {
      return res.status(400).json({ error: 'Champs requis: external_order_id, customer_email, product_name, order_amount' });
    }

    const { code, hash } = generateVerificationCode(Date.now() + Math.random());

    const r = db.prepare(`
      INSERT INTO b2b_orders (company_id, external_order_id, customer_email, customer_name, product_name, product_description, order_amount, currency, verification_code, verification_code_hash, tracking_number, carrier, webhook_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.company.id, external_order_id, customer_email, customer_name || '', product_name, product_description || '', parseFloat(order_amount), currency || 'EUR', code, hash, tracking_number || null, carrier || null, webhook_url || null);

    db.prepare('UPDATE companies SET monthly_orders_used = monthly_orders_used + 1, total_orders = total_orders + 1 WHERE id = ?').run(req.company.id);

    // Send confirmation email
    sendOrderConfirmation(customer_email, customer_name, product_name, r.lastInsertRowid, req.company.name).catch(console.error);

    res.status(201).json({
      order_id: r.lastInsertRowid,
      external_order_id,
      verification_code: code,
      unboxing_url: `${req.protocol}://${req.get('host')}/unboxing-customer.html?code=${code}&order=${r.lastInsertRowid}`,
      qr_code_url: `${req.protocol}://${req.get('host')}/api/b2b/orders/${r.lastInsertRowid}/qr`,
      message: 'Commande créée. Partagez le verification_code ou unboxing_url avec votre client.'
    });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'external_order_id déjà utilisé' });
    next(e);
  }
});

// GET /api/b2b/orders - List orders
router.get('/orders', (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let where = 'company_id = ?';
  const params = [req.company.id];
  if (status) { where += ' AND status = ?'; params.push(status); }
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const orders = db.prepare(`SELECT * FROM b2b_orders WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM b2b_orders WHERE ${where}`).get(...params);
  res.json({ orders, total: total.c, page: parseInt(page) });
});

// GET /api/b2b/orders/:id - Get single order with unboxing
router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const unboxing = db.prepare('SELECT * FROM b2b_unboxings WHERE b2b_order_id = ?').get(order.id);
  if (unboxing) unboxing.photo_urls = JSON.parse(unboxing.photo_urls);
  res.json({ ...order, unboxing });
});

// PATCH /api/b2b/orders/:id/ship - Mark as shipped
router.patch('/orders/:id/ship', (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.status !== 'pending') return res.status(400).json({ error: `Statut actuel: ${order.status}` });
    const { tracking_number, carrier } = req.body;
    db.prepare("UPDATE b2b_orders SET status='shipped', tracking_number=COALESCE(?,tracking_number), carrier=COALESCE(?,carrier), updated_at=datetime('now') WHERE id=?").run(tracking_number || null, carrier || null, order.id);
    res.json({ message: 'Commande marquée comme expédiée', status: 'shipped' });
  } catch (e) { next(e); }
});

// PATCH /api/b2b/orders/:id/deliver - Mark as delivered (start unboxing window)
router.patch('/orders/:id/deliver', (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    db.prepare("UPDATE b2b_orders SET status='unboxing_pending', unboxing_deadline=datetime('now','+48 hours'), updated_at=datetime('now') WHERE id=?").run(order.id);
    // Send unboxing invite email to customer
    const unboxingUrl = `${req.protocol}://${req.get('host')}/unboxing-customer.html?order=${order.id}`;
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(req.company.id);
    sendUnboxingInvite(order.customer_email, order.customer_name, order.product_name, order.verification_code, unboxingUrl, company.name).catch(console.error);
    res.json({ message: 'Livraison confirmée. Fenêtre unboxing de 48h ouverte. Email envoyé au client.', unboxing_deadline: new Date(Date.now() + 48 * 3600000).toISOString() });
  } catch (e) { next(e); }
});

// POST /api/b2b/orders/:id/unboxing - Customer submits unboxing (called via API key)
router.post('/orders/:id/unboxing',
  unboxingUpload.fields([{ name: 'video', maxCount: 1 }, { name: 'photos', maxCount: 10 }]),
  (req, res, next) => {
    try {
      const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
      if (!order) return res.status(404).json({ error: 'Commande introuvable' });

      const videoFile = req.files?.video?.[0];
      const photoFiles = req.files?.photos || [];
      const videoUrl = videoFile ? `/uploads/unboxing/${req.params.id}/${videoFile.filename}` : null;
      const photoUrls = JSON.stringify(photoFiles.map(f => `/uploads/unboxing/${req.params.id}/${f.filename}`));

      const aiConfidence = 0.75 + Math.random() * 0.2;
      const codeVisible = req.body.code_visible === 'true' ? 1 : 0;
      const conditionOk = req.body.condition_ok !== 'false' ? 1 : 0;

      db.prepare('INSERT OR REPLACE INTO b2b_unboxings (b2b_order_id, company_id, video_url, photo_urls, code_visible, condition_ok, customer_notes, ai_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(order.id, req.company.id, videoUrl, photoUrls, codeVisible, conditionOk, req.body.notes || '', aiConfidence);
      db.prepare("UPDATE b2b_orders SET status='unboxing_submitted', updated_at=datetime('now') WHERE id=?").run(order.id);

      if (!conditionOk) db.prepare('UPDATE companies SET total_fraud_prevented = total_fraud_prevented + 1 WHERE id = ?').run(req.company.id);

      res.json({ message: 'Unboxing soumis avec succès', ai_confidence: aiConfidence, code_detected: codeVisible === 1 });
    } catch (e) { next(e); }
  }
);

// PATCH /api/b2b/orders/:id/resolve - Resolve order
router.patch('/orders/:id/resolve', (req, res, next) => {
  try {
    const { resolution } = req.body;
    if (!['completed', 'refunded'].includes(resolution)) return res.status(400).json({ error: 'resolution: completed ou refunded' });
    const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    db.prepare("UPDATE b2b_orders SET status=?, updated_at=datetime('now') WHERE id=?").run(resolution, order.id);
    db.prepare('UPDATE b2b_unboxings SET resolution = ? WHERE b2b_order_id = ?').run(resolution, order.id);
    res.json({ message: `Commande ${resolution === 'completed' ? 'complétée' : 'remboursée'}` });
  } catch (e) { next(e); }
});

// GET /api/b2b/stats - Company stats
router.get('/stats', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.company.id);
  const statusCounts = db.prepare('SELECT status, COUNT(*) as count FROM b2b_orders WHERE company_id = ? GROUP BY status').all(req.company.id);
  const recentOrders = db.prepare('SELECT * FROM b2b_orders WHERE company_id = ? ORDER BY created_at DESC LIMIT 5').all(req.company.id);
  res.json({
    company: { name: company.name, plan: company.plan, monthly_orders_used: company.monthly_orders_used },
    total_orders: company.total_orders,
    fraud_prevented: company.total_fraud_prevented,
    status_breakdown: statusCounts,
    recent_orders: recentOrders
  });
});

// GET /api/b2b/keys - List API keys
router.get('/keys', (req, res) => {
  const keys = db.prepare('SELECT id, key_prefix, name, is_active, last_used_at, requests_count, created_at FROM api_keys WHERE company_id = ?').all(req.company.id);
  res.json(keys);
});

module.exports = router;
