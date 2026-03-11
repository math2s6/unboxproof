const router = require('express').Router();
const { sendEmail } = require('../services/emailService');

router.post('/', async (req, res) => {
  const { firstname, lastname, email, company, sector, volume, message } = req.body;
  if (!email || !firstname) return res.status(400).json({ error: 'Champs manquants' });

  const adminEmail = process.env.SMTP_USER || null;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,sans-serif;background:#f1f5f9;padding:24px}
.c{max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px}
.h h1{color:white;font-size:20px;margin:0}
.b{padding:32px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px}
.row:last-child{border-bottom:none}
.lbl{color:#64748b;font-weight:500}
.val{font-weight:600;color:#0f172a;text-align:right;max-width:60%}
.msg{background:#f8fafc;border-radius:10px;padding:16px;margin-top:20px;font-size:14px;color:#334155;line-height:1.6}
</style></head><body><div class="c">
<div class="h"><h1>📞 Nouvelle demande de démo — UnboxProof</h1></div>
<div class="b">
<div class="row"><span class="lbl">Nom</span><span class="val">${firstname} ${lastname}</span></div>
<div class="row"><span class="lbl">Email</span><span class="val">${email}</span></div>
<div class="row"><span class="lbl">Entreprise</span><span class="val">${company || '—'}</span></div>
<div class="row"><span class="lbl">Secteur</span><span class="val">${sector || '—'}</span></div>
<div class="row"><span class="lbl">Volume</span><span class="val">${volume || '—'} commandes/mois</span></div>
${message ? `<div class="msg"><strong>Message :</strong><br>${message}</div>` : ''}
</div></div></body></html>`;

  const confirmHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,sans-serif;background:#f1f5f9;padding:24px}
.c{max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center}
.h h1{color:white;font-size:22px;margin:0 0 6px}.h p{color:rgba(255,255,255,.75);font-size:14px;margin:0}
.b{padding:32px}
.b p{font-size:15px;color:#334155;line-height:1.7;margin:0 0 16px}
.box{background:#f0f0ff;border-left:4px solid #4f46e5;padding:16px 20px;border-radius:0 10px 10px 0;margin:20px 0;font-size:14px;color:#3730a3}
.footer{padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;font-size:13px;color:#94a3b8}
.footer a{color:#4f46e5;text-decoration:none}
</style></head><body><div class="c">
<div class="h"><h1>✅ Demande reçue !</h1><p>On revient vers vous sous 24h</p></div>
<div class="b">
<p>Bonjour <strong>${firstname}</strong>,</p>
<p>Merci pour votre intérêt pour UnboxProof ! Nous avons bien reçu votre demande de démo.</p>
<div class="box">Notre équipe vous contactera à <strong>${email}</strong> dans les <strong>24 heures ouvrées</strong>.</div>
<p style="text-align:center"><a href="${process.env.APP_URL || 'https://unboxproof.io'}/demo.html" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:10px;font-weight:600;text-decoration:none">🎮 Tester la démo →</a></p>
</div>
<div class="footer">© 2025 <strong>UnboxProof</strong> — <a href="${process.env.APP_URL || 'https://unboxproof.io'}">unboxproof.io</a></div>
</div></body></html>`;

  try {
    if (adminEmail) await sendEmail(adminEmail, `📞 Démo demandée — ${company || firstname} (${volume || '?'} cmd/mois)`, html);
    await sendEmail(email, `✅ Demande de démo reçue — UnboxProof vous contacte sous 24h`, confirmHtml);
  } catch(e) {
    console.error('Contact email error:', e.message);
  }

  console.log(`📞 Demande de démo: ${firstname} ${lastname} (${company}) — ${email}`);
  res.json({ message: 'Demande reçue ! Vous allez recevoir un email de confirmation.' });
});

module.exports = router;
