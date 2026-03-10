const db = require('../db');

// Add webhook_url column if missing
try { db.prepare('ALTER TABLE companies ADD COLUMN webhook_url TEXT').run(); } catch(e) {}

async function sendWebhook(companyId, event, data) {
  try {
    const company = db.prepare('SELECT webhook_url, name FROM companies WHERE id = ?').get(companyId);
    if (!company?.webhook_url) return;

    const payload = {
      event,
      company: company.name,
      timestamp: new Date().toISOString(),
      data
    };

    const res = await fetch(company.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SafeTrade-Event': event, 'X-SafeTrade-Version': '1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    console.log(`🔔 Webhook [${event}] → ${company.webhook_url} (${res.status})`);
  } catch(e) {
    console.error(`🔔 Webhook error [${event}]:`, e.message);
  }
}

module.exports = { sendWebhook };
