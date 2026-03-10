(function() {
  'use strict';
  const SAFETRADE_URL = 'http://localhost:3000';

  const style = document.createElement('style');
  style.textContent = `
    .safetrade-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;border:none;padding:12px 24px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;font-family:-apple-system,sans-serif;text-decoration:none}
    .safetrade-btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(79,70,229,0.4)}
    .safetrade-badge{display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;color:#059669;padding:4px 12px;border-radius:100px;font-size:13px;font-weight:500;font-family:-apple-system,sans-serif;margin-top:8px}
    .safetrade-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
    .safetrade-modal{background:white;border-radius:20px;padding:40px;max-width:480px;width:90%;box-shadow:0 40px 80px rgba(0,0,0,0.3);animation:st-up .3s ease;position:relative}
    @keyframes st-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    .safetrade-modal h2{font-size:22px;font-weight:800;color:#1e293b;margin:0 0 8px}
    .safetrade-modal p{color:#64748b;font-size:14px;margin:0 0 24px;line-height:1.6}
    .safetrade-code-box{background:#f0f0ff;border:2px dashed #4f46e5;border-radius:12px;padding:20px;text-align:center;margin:20px 0}
    .safetrade-code{font-size:32px;font-weight:900;letter-spacing:8px;color:#4f46e5;font-family:monospace}
    .safetrade-code-label{font-size:12px;color:#64748b;margin-top:6px}
    .safetrade-close{position:absolute;top:14px;right:14px;background:#f1f5f9;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
    .safetrade-open-btn{display:block;width:100%;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:14px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;text-decoration:none;margin-top:16px;box-sizing:border-box}
    .safetrade-powered{text-align:center;font-size:11px;color:#94a3b8;margin-top:16px}
  `;
  document.head.appendChild(style);

  window.SafeTrade = {
    apiKey: null,

    init(config) {
      this.apiKey = config.apiKey || '';
      document.querySelectorAll('[data-safetrade-order]').forEach(el => this.attachButton(el));
    },

    attachButton(container) {
      const orderId = container.dataset.safetradeOrder;
      const wrap = document.createElement('div');

      const btn = document.createElement('button');
      btn.className = 'safetrade-btn';
      btn.innerHTML = '🛡️ Faire mon unboxing sécurisé';
      btn.onclick = () => this.openModal(orderId);

      const badge = document.createElement('div');
      badge.className = 'safetrade-badge';
      badge.innerHTML = '✓ Achat protégé par SafeTrade';

      wrap.appendChild(btn);
      wrap.appendChild(document.createElement('br'));
      wrap.appendChild(badge);
      container.appendChild(wrap);
    },

    openModal(orderId) {
      const overlay = document.createElement('div');
      overlay.className = 'safetrade-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

      overlay.innerHTML = `
        <div class="safetrade-modal">
          <button class="safetrade-close" onclick="this.closest('.safetrade-overlay').remove()">×</button>
          <h2>🛡️ Unboxing SafeTrade</h2>
          <p>Filmez l'ouverture de votre colis avec le code visible pour valider votre réception.</p>
          <div id="st-content-${orderId}"><div style="text-align:center;padding:20px;color:#64748b">Chargement...</div></div>
          <div class="safetrade-powered">Sécurisé par <strong>SafeTrade</strong></div>
        </div>`;
      document.body.appendChild(overlay);

      fetch(`${SAFETRADE_URL}/api/b2b/customer/${orderId}`)
        .then(r => r.json())
        .then(order => {
          document.getElementById(`st-content-${orderId}`).innerHTML = `
            <div class="safetrade-code-box">
              <div class="safetrade-code">${order.verification_code || '----'}</div>
              <div class="safetrade-code-label">⚠️ Notez ce code — montrez-le dans votre vidéo</div>
            </div>
            <a href="${SAFETRADE_URL}/unboxing-customer.html?order=${orderId}" target="_blank" class="safetrade-open-btn">🎥 Ouvrir la page d'unboxing →</a>`;
        })
        .catch(() => {
          document.getElementById(`st-content-${orderId}`).innerHTML = '<p style="color:#dc2626;text-align:center">Erreur de chargement</p>';
        });
    }
  };

  console.log('%c✅ SafeTrade Widget v1.0 chargé', 'color:#4f46e5;font-weight:bold');
})();
