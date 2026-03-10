const db = require('../db');
const { notify } = require('./notificationService');

function lockFunds(buyerId, sellerId, orderId, amount, platformFee, sellerPayout) {
  const buyer = db.prepare('SELECT balance, escrow_balance FROM users WHERE id = ?').get(buyerId);
  if (!buyer || buyer.balance < amount) throw new Error('Solde insuffisant');

  const lockTx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ?, escrow_balance = escrow_balance + ? WHERE id = ?').run(amount, amount, buyerId);
    db.prepare('INSERT INTO ledger (order_id, user_id, type, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?)').run(
      orderId, buyerId, 'escrow_in', amount,
      buyer.balance - amount, 'Achat - fonds en séquestre'
    );
  });
  lockTx();
}

function releaseFunds(orderId, note = '') {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Commande introuvable');

  const releaseTx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance + ?, escrow_balance = escrow_balance - ? WHERE id = ?').run(order.seller_payout, order.amount, order.seller_id);
    db.prepare('UPDATE users SET escrow_balance = escrow_balance - ? WHERE id = ?').run(order.amount, order.buyer_id);
    const seller = db.prepare('SELECT balance FROM users WHERE id = ?').get(order.seller_id);
    db.prepare('INSERT INTO ledger (order_id, user_id, type, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?)').run(
      orderId, order.seller_id, 'escrow_release', order.seller_payout, seller.balance, note || 'Libération des fonds'
    );
    notify(order.seller_id, 'funds_released', { orderId, amount: order.seller_payout });
    notify(order.buyer_id, 'order_completed', { orderId });
  });
  releaseTx();
}

function refundFunds(orderId, note = '') {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Commande introuvable');

  const refundTx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance + ?, escrow_balance = escrow_balance - ? WHERE id = ?').run(order.amount, order.amount, order.buyer_id);
    const buyer = db.prepare('SELECT balance FROM users WHERE id = ?').get(order.buyer_id);
    db.prepare('INSERT INTO ledger (order_id, user_id, type, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?)').run(
      orderId, order.buyer_id, 'escrow_refund', order.amount, buyer.balance, note || 'Remboursement'
    );
    notify(order.buyer_id, 'order_refunded', { orderId, amount: order.amount });
    notify(order.seller_id, 'order_refunded_seller', { orderId });
  });
  refundTx();
}

module.exports = { lockFunds, releaseFunds, refundFunds };
