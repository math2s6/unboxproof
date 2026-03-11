const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    console.log(`📧 SMTP configuré: ${process.env.SMTP_HOST}`);
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    console.log('📧 Email de test (Ethereal):', testAccount.user);
  }

  return transporter;
}

async function sendEmail(to, subject, html) {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || '"UnboxProof" <noreply@unboxproof.io>',
      to, subject, html
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`📧 Email → ${to}: ${subject}`);
    if (previewUrl) console.log(`   Aperçu: ${previewUrl}`);
    return { success: true, previewUrl };
  } catch (e) {
    console.error('Email error:', e.message);
    return { success: false, error: e.message };
  }
}

async function sendUnboxingInvite(customerEmail, customerName, productName, verificationCode, unboxingUrl, companyName) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px}
.container{max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)}
.header{background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:40px;text-align:center}
.header h1{color:white;margin:0;font-size:28px}.header p{color:rgba(255,255,255,.8);margin:8px 0 0}
.body{padding:40px}
.code-box{background:#f0f0ff;border:2px dashed #4f46e5;border-radius:12px;padding:24px;text-align:center;margin:24px 0}
.code{font-size:36px;font-weight:900;letter-spacing:8px;color:#4f46e5;font-family:monospace}
.code-label{font-size:13px;color:#64748b;margin-top:8px}
.steps{background:#f8fafc;border-radius:12px;padding:24px;margin:24px 0}
.step{display:flex;align-items:flex-start;margin-bottom:16px}
.step-num{background:#4f46e5;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;flex-shrink:0;margin-right:12px;margin-top:2px}
.btn{display:block;background:#4f46e5;color:white;text-decoration:none;padding:16px 32px;border-radius:12px;text-align:center;font-weight:600;font-size:16px;margin:24px 0}
.footer{padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:13px}
</style></head>
<body><div class="container">
  <div class="header"><h1>🛡️ UnboxProof</h1><p>Votre achat est protégé</p></div>
  <div class="body">
    <p>Bonjour <strong>${customerName || 'cher client'}</strong>,</p>
    <p>Votre commande <strong>"${productName}"</strong> chez <strong>${companyName}</strong> est en route ! Pour valider la réception et protéger votre achat, vous devez réaliser un <strong>unboxing sécurisé</strong>.</p>
    <div class="code-box">
      <div class="code">${verificationCode}</div>
      <div class="code-label">⚠️ Notez ce code — vous devrez le montrer dans votre vidéo</div>
    </div>
    <div class="steps">
      <p><strong>Comment faire votre unboxing :</strong></p>
      <div class="step"><div class="step-num">1</div><div>Écrivez le code ci-dessus sur un papier</div></div>
      <div class="step"><div class="step-num">2</div><div>Démarrez l'enregistrement <strong>avant</strong> d'ouvrir le colis</div></div>
      <div class="step"><div class="step-num">3</div><div>Montrez le code au début et à la fin de la vidéo</div></div>
      <div class="step"><div class="step-num">4</div><div>Uploadez votre vidéo via le bouton ci-dessous</div></div>
    </div>
    <a href="${unboxingUrl}" class="btn">🎥 Faire mon unboxing sécurisé →</a>
    <p style="color:#64748b;font-size:14px;">Ce lien est valable 48h après réception.</p>
  </div>
  <div class="footer">Propulsé par <strong>UnboxProof</strong> — <a href="${process.env.APP_URL || 'https://unboxproof.io'}" style="color:#4f46e5">unboxproof.io</a></div>
</div></body></html>`;
  return sendEmail(customerEmail, `🛡️ Votre code unboxing pour "${productName}" — ${companyName}`, html);
}

async function sendOrderConfirmation(customerEmail, customerName, productName, orderId, companyName) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px}
.container{max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)}
.header{background:#059669;padding:32px;text-align:center}.header h1{color:white;margin:0}
.body{padding:40px}
.info-box{background:#f0fdf4;border-left:4px solid #059669;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0}
.footer{padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:13px}
</style></head>
<body><div class="container">
  <div class="header"><h1>✅ Commande confirmée</h1></div>
  <div class="body">
    <p>Bonjour <strong>${customerName || 'cher client'}</strong>,</p>
    <p>Votre commande a bien été enregistrée chez <strong>${companyName}</strong>.</p>
    <div class="info-box">
      <p style="margin:0"><strong>Produit :</strong> ${productName}<br>
      <strong>Référence :</strong> #${orderId}<br>
      <strong>Protection :</strong> 🛡️ UnboxProof Unboxing</p>
    </div>
    <p>Vous recevrez un email avec votre code d'unboxing dès que votre colis sera expédié.</p>
  </div>
  <div class="footer">Propulsé par <strong>UnboxProof</strong></div>
</div></body></html>`;
  return sendEmail(customerEmail, `✅ Commande confirmée — ${productName}`, html);
}

async function sendWelcomeEmail(email, companyName, apiKey) {
  const appUrl = process.env.APP_URL || 'https://unboxproof.io';
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:32px 16px}
.container{max-width:600px;margin:0 auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.header{background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:48px 40px;text-align:center}
.logo{font-size:28px;font-weight:900;color:white;letter-spacing:-0.5px;margin-bottom:8px}
.header-sub{color:rgba(255,255,255,.75);font-size:16px}
.body{padding:40px}
h2{font-size:22px;font-weight:800;color:#0f172a;margin:0 0 8px}
p{color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px}
.api-box{background:#0f172a;border-radius:14px;padding:24px;margin:28px 0}
.api-label{font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px}
.api-key{font-family:'Courier New',monospace;font-size:14px;color:#a5b4fc;word-break:break-all;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:12px 14px}
.api-warning{display:flex;align-items:center;gap:8px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);color:#fbbf24;font-size:13px;padding:10px 14px;border-radius:8px;margin-top:12px}
.steps{background:#f8fafc;border-radius:14px;padding:24px;margin:24px 0}
.step{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px}
.step:last-child{margin-bottom:0}
.step-num{width:28px;height:28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:white;flex-shrink:0;margin-top:1px}
.step-text{font-size:14px;color:#334155;line-height:1.5}
.step-text strong{color:#0f172a}
.btn-row{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0}
.btn-primary{flex:1;min-width:150px;background:#4f46e5;color:white;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700;font-size:15px;text-align:center}
.btn-secondary{flex:1;min-width:150px;background:#f1f5f9;color:#334155;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600;font-size:15px;text-align:center}
.footer{padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:13px}
.footer a{color:#4f46e5;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header">
    <div class="logo">UnboxProof</div>
    <div class="header-sub">Bienvenue dans l'équipe 🎉</div>
  </div>
  <div class="body">
    <h2>Votre compte est prêt, ${companyName} !</h2>
    <p>Merci d'avoir rejoint UnboxProof. Voici votre clé API — <strong>conservez-la précieusement</strong>, elle vous permet d'intégrer notre service à votre boutique.</p>
    <div class="api-box">
      <div class="api-label">Votre clé API de production</div>
      <div class="api-key">${apiKey}</div>
      <div class="api-warning">⚠️ Ne partagez jamais cette clé. Elle donne accès à votre compte.</div>
    </div>
    <div class="steps">
      <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 16px">Pour commencer en 3 étapes :</p>
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text"><strong>Intégrez l'API</strong><br>Appelez notre endpoint à chaque nouvelle commande sur votre boutique. Exemples disponibles pour Node.js, PHP et Python.</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text"><strong>Testez avec la démo</strong><br>Simulez un flux complet (commande → livraison → unboxing → résultat IA) en 60 secondes sans rien coder.</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text"><strong>Suivez vos résultats</strong><br>Votre dashboard temps réel montre toutes vos commandes, unboxings et fraudes évitées.</div>
      </div>
    </div>
    <div class="btn-row">
      <a href="${appUrl}/company/onboarding.html" class="btn-primary">🚀 Démarrer l'intégration →</a>
      <a href="${appUrl}/company/" class="btn-secondary">📊 Mon dashboard</a>
    </div>
    <p style="font-size:13px;color:#94a3b8">Une question ? Répondez directement à cet email ou consultez notre <a href="${appUrl}/company/docs.html" style="color:#4f46e5">documentation API</a>.</p>
  </div>
  <div class="footer">© 2025 <strong>UnboxProof</strong> — <a href="${appUrl}">unboxproof.io</a></div>
</div></body></html>`;
  return sendEmail(email, `🎉 Bienvenue sur UnboxProof — votre clé API est prête`, html);
}

module.exports = { sendEmail, sendUnboxingInvite, sendOrderConfirmation, sendWelcomeEmail };
