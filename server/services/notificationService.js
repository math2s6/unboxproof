const db = require('../db');

function notify(userId, type, payload = {}) {
  try {
    db.prepare(`INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)`).run(userId, type, JSON.stringify(payload));
  } catch (e) {
    console.error('Notification error:', e.message);
  }
}

module.exports = { notify };
