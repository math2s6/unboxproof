const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/conversations', requireAuth, (req, res) => {
  const convos = db.prepare(`
    SELECT DISTINCT
      CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as other_id,
      u.username as other_name, u.avatar_url as other_avatar,
      (SELECT body FROM messages WHERE (sender_id = ? AND recipient_id = other_id) OR (sender_id = other_id AND recipient_id = ?) ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM messages WHERE recipient_id = ? AND sender_id = other_id AND is_read = 0) as unread
    FROM messages m
    JOIN users u ON u.id = (CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END)
    WHERE m.sender_id = ? OR m.recipient_id = ?
    GROUP BY other_id ORDER BY (SELECT created_at FROM messages WHERE (sender_id = ? AND recipient_id = other_id) OR (sender_id = other_id AND recipient_id = ?) ORDER BY created_at DESC LIMIT 1) DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(convos);
});

router.get('/with/:userId', requireAuth, (req, res) => {
  const msgs = db.prepare(`SELECT m.*, u.username FROM messages m JOIN users u ON u.id = m.sender_id WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?) ORDER BY m.created_at`).all(req.user.id, req.params.userId, req.params.userId, req.user.id);
  db.prepare('UPDATE messages SET is_read = 1 WHERE recipient_id = ? AND sender_id = ?').run(req.user.id, req.params.userId);
  res.json(msgs);
});

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { recipientId, body, listingId } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Message vide' });
    db.prepare('INSERT INTO messages (sender_id, recipient_id, body, listing_id) VALUES (?, ?, ?, ?)').run(req.user.id, recipientId, body, listingId || null);
    res.json({ message: 'Message envoyé' });
  } catch (e) { next(e); }
});

module.exports = router;
