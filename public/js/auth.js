document.addEventListener('DOMContentLoaded', async () => {
  const user = getCurrentUser();
  renderNav(user);
  if (user && API.token) loadNotifBadge();

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block"></span> Connexion...';
      try {
        const data = await API.post('/api/auth/login', {
          email: document.getElementById('email').value,
          password: document.getElementById('password').value
        });
        API.setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('Connexion réussie !');
        setTimeout(() => window.location.href = '/dashboard.html', 600);
      } catch (e) {
        showToast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Se connecter';
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block"></span> Inscription...';
      try {
        const data = await API.post('/api/auth/register', {
          email: document.getElementById('email').value,
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        });
        API.setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('Compte créé avec succès !');
        setTimeout(() => window.location.href = '/dashboard.html', 600);
      } catch (e) {
        showToast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = "S'inscrire";
      }
    });
  }

  // Nav dropdown
  const userBtn = document.getElementById('nav-username-btn');
  const userDropdown = document.getElementById('user-dropdown');
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { if (userDropdown) userDropdown.style.display = 'none'; });
  }

  // Notif bell
  const notifBtn = document.getElementById('notif-btn');
  const notifPanel = document.getElementById('notif-panel');
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const visible = notifPanel.style.display === 'block';
      notifPanel.style.display = visible ? 'none' : 'block';
      if (!visible) await loadNotifPanel();
    });
    document.addEventListener('click', () => { if (notifPanel) notifPanel.style.display = 'none'; });
  }
});

async function loadNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:1rem;text-align:center"><div class="spinner" style="margin:auto"></div></div>';
  try {
    const data = await API.get('/api/notifications');
    await API.put('/api/notifications/read-all');
    const badge = document.getElementById('notif-badge');
    if (badge) badge.style.display = 'none';

    if (data.notifications.length === 0) {
      panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.9rem">Aucune notification</div>';
      return;
    }

    panel.innerHTML = `
      <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);font-weight:700;font-size:0.9rem">Notifications</div>
      ${data.notifications.map(n => {
        const lbl = NOTIF_LABELS[n.type] || { icon: '🔔', text: n.type };
        return `<div class="notif-item ${n.is_read ? '' : 'unread'}">
          <div class="notif-item-title">${lbl.icon} ${lbl.text}</div>
          <div class="notif-item-time">${formatDateTime(n.created_at)}</div>
        </div>`;
      }).join('')}
    `;
  } catch (e) {
    panel.innerHTML = '<div style="padding:1rem;color:var(--danger);font-size:0.85rem">Erreur de chargement</div>';
  }
}

async function refreshUser() {
  try {
    const user = await API.get('/api/auth/me');
    localStorage.setItem('user', JSON.stringify(user));
    const balanceEl = document.getElementById('nav-balance');
    if (balanceEl) balanceEl.textContent = formatPrice(user.balance);
    return user;
  } catch (e) { return null; }
}
