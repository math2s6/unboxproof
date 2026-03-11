const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { sendWelcomeEmail } = require('../services/emailService');
require('dotenv').config();

function signCompanyToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET + '_company', { expiresIn: '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, website, industry } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Champs manquants' });
    const hash = await bcrypt.hash(password, 10);
    const r = await db.run('INSERT INTO companies (name, email, password_hash, website, industry) VALUES (?, ?, ?, ?, ?)', name, email.toLowerCase(), hash, website || '', industry || '');

    const key = 'sk_live_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    await db.run('INSERT INTO api_keys (company_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?)', r.lastInsertRowid, keyHash, key.slice(0, 12) + '...', 'Production');

    const company = await db.get('SELECT id, name, email, plan, industry FROM companies WHERE id = ?', r.lastInsertRowid);
    res.status(201).json({ token: signCompanyToken(company.id), company, api_key: key, message: 'Sauvegardez votre API key — elle ne sera plus affichée.' });
    sendWelcomeEmail(email, name, key).catch(() => {});
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email déjà utilisé' });
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const company = await db.get('SELECT * FROM companies WHERE email = ? AND is_active = 1', email?.toLowerCase());
    if (!company || !(await bcrypt.compare(password, company.password_hash))) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const { password_hash, ...safe } = company;
    res.json({ token: signCompanyToken(company.id), company: safe });
  } catch (e) { next(e); }
});

router.get('/me', require('../middleware/companyAuth').requireCompanyAuth, (req, res) => {
  res.json(req.company);
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const company = await db.get('SELECT id, name FROM companies WHERE email = ? AND is_active = 1', email.toLowerCase());
    // Always respond 200 to avoid email enumeration
    if (!company) return res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

    await db.run('DELETE FROM company_password_resets WHERE company_id = ?', company.id);
    await db.run('INSERT INTO company_password_resets (company_id, token_hash, expires_at) VALUES (?, ?, ?)', company.id, tokenHash, expiresAt);

    const appUrl = process.env.APP_URL || 'https://unboxproof.io';
    const resetUrl = `${appUrl}/company/reset-password.html?token=${token}`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,sans-serif;background:#f1f5f9;padding:24px}
.c{max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;text-align:center}
.h h1{color:white;font-size:18px;margin:0}.b{padding:28px 32px}
.b p{font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px}
.warn{background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e;margin:16px 0}
.footer{padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8}
</style></head><body><div class="c">
<div class="h"><h1>🔐 Réinitialisation de mot de passe</h1></div>
<div class="b">
<p>Bonjour <strong>${company.name}</strong>,</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe UnboxProof. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
<p style="text-align:center"><a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:13px 28px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">Réinitialiser mon mot de passe →</a></p>
<div class="warn">⚠️ Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas fait cette demande, ignorez cet email.</div>
</div>
<div class="footer">© 2025 UnboxProof — <a href="${appUrl}" style="color:#4f46e5">unboxproof.io</a></div>
</div></body></html>`;

    const { sendEmail } = require('../services/emailService');
    await sendEmail(email, '🔐 Réinitialisation de votre mot de passe UnboxProof', html);
    res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
  } catch(e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });
    if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.)' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const reset = await db.get(
      "SELECT * FROM company_password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')",
      tokenHash
    );
    if (!reset) return res.status(400).json({ error: 'Lien invalide ou expiré. Recommencez la procédure.' });

    const hash = await bcrypt.hash(password, 10);
    await db.run('UPDATE companies SET password_hash = ? WHERE id = ?', hash, reset.company_id);
    await db.run('UPDATE company_password_resets SET used = 1 WHERE id = ?', reset.id);

    res.json({ message: 'Mot de passe mis à jour. Vous pouvez maintenant vous connecter.' });
  } catch(e) { next(e); }
});

module.exports = router;
