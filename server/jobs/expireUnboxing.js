const cron = require('node-cron');
const db = require('../db');
const { releaseFunds } = require('../services/escrowService');
const { notify } = require('../services/notificationService');

function runExpiry() {
  const expired = db.prepare(`
    SELECT * FROM orders
    WHERE status = 'unboxing_pending'
    AND unboxing_deadline < datetime('now')
    AND unboxing_auto_release = 0
  `).all();

  for (const order of expired) {
    try {
      const expireTx = db.transaction(() => {
        releaseFunds(order.id, 'Libération auto - délai 48h expiré');
        db.prepare("UPDATE orders SET status='completed', unboxing_auto_release=1, updated_at=datetime('now') WHERE id=?").run(order.id);
        db.prepare("UPDATE listings SET status='sold' WHERE id=?").run(order.listing_id);
        notify(order.seller_id, 'funds_auto_released', { orderId: order.id });
        notify(order.buyer_id, 'unboxing_expired', { orderId: order.id });
      });
      expireTx();
      console.log(`[CRON] Commande #${order.id} - fonds libérés (48h expirés)`);
    } catch (e) {
      console.error(`[CRON] Erreur commande #${order.id}:`, e.message);
    }
  }
}

function startCron() {
  cron.schedule('*/15 * * * *', runExpiry);
  console.log('[CRON] Vérification expiration unboxing démarrée (toutes les 15min)');
  runExpiry(); // run once at startup
}

module.exports = { startCron };
