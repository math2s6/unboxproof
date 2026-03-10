const API = {
  token: localStorage.getItem('token'),

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  },

  async request(method, url, data, isFormData = false) {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (!isFormData && data) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined)
    });

    if (res.status === 401) {
      this.setToken(null);
      localStorage.removeItem('user');
      window.location.href = '/login.html';
      return;
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erreur serveur');
    return json;
  },

  get: (url) => API.request('GET', url),
  post: (url, data) => API.request('POST', url, data),
  put: (url, data) => API.request('PUT', url, data),
  delete: (url) => API.request('DELETE', url),
  postForm: (url, formData) => API.request('POST', url, formData, true),
};

function getCurrentUser() {
  const stored = localStorage.getItem('user');
  return stored ? JSON.parse(stored) : null;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatPrice(price) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(price);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  if (diff <= 0) return 'Expiré';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function starsHtml(rating, max = 5) {
  const full = Math.round(rating);
  let html = '';
  for (let i = 1; i <= max; i++) {
    html += `<span style="color:${i <= full ? '#f59e0b' : '#cbd5e1'}">★</span>`;
  }
  return html;
}

const STATUS_LABELS = {
  paid: { label: 'Payé — En attente expédition', class: 'badge-info' },
  shipped: { label: 'Expédié', class: 'badge-warning' },
  unboxing_pending: { label: 'Unboxing requis', class: 'badge-danger' },
  unboxing_uploaded: { label: 'Unboxing soumis', class: 'badge-warning' },
  completed: { label: 'Terminé', class: 'badge-success' },
  disputed: { label: 'En litige', class: 'badge-danger' },
  refunded: { label: 'Remboursé', class: 'badge-info' },
  cancelled: { label: 'Annulé', class: 'badge-secondary' },
};

const CONDITION_LABELS = {
  new: { label: 'Neuf', class: 'badge-success' },
  like_new: { label: 'Comme neuf', class: 'badge-success' },
  good: { label: 'Bon état', class: 'badge-info' },
  fair: { label: 'État correct', class: 'badge-warning' },
  poor: { label: 'Mauvais état', class: 'badge-danger' },
};

const NOTIF_LABELS = {
  order_placed: { icon: '🛒', text: 'Nouvelle commande reçue' },
  order_shipped: { icon: '📦', text: 'Votre colis a été expédié' },
  delivery_confirmed: { icon: '✅', text: 'Livraison confirmée par l\'acheteur' },
  unboxing_reminder: { icon: '🎬', text: 'Faites votre unboxing maintenant' },
  unboxing_submitted: { icon: '📹', text: 'Unboxing soumis par l\'acheteur' },
  unboxing_uploaded: { icon: '📤', text: 'Votre unboxing a été soumis' },
  unboxing_expired: { icon: '⏰', text: 'Délai unboxing expiré' },
  funds_released: { icon: '💰', text: 'Fonds libérés sur votre compte' },
  funds_auto_released: { icon: '💰', text: 'Fonds libérés automatiquement' },
  order_completed: { icon: '🎉', text: 'Commande complétée' },
  order_refunded: { icon: '↩️', text: 'Remboursement reçu' },
  order_refunded_seller: { icon: '↩️', text: 'Commande remboursée à l\'acheteur' },
  dispute_opened: { icon: '⚠️', text: 'Un litige a été ouvert' },
  dispute_opened_admin: { icon: '🚨', text: 'Nouveau litige à traiter' },
  dispute_resolved: { icon: '⚖️', text: 'Litige résolu' },
};

function getStatusBadge(status) {
  const s = STATUS_LABELS[status] || { label: status, class: 'badge-secondary' };
  return `<span class="badge ${s.class}">${s.label}</span>`;
}

function getConditionBadge(condition) {
  const c = CONDITION_LABELS[condition] || { label: condition, class: 'badge-secondary' };
  return `<span class="badge ${c.class}">${c.label}</span>`;
}

function renderNav(user) {
  const navAuth = document.getElementById('nav-auth');
  const navUser = document.getElementById('nav-user');
  const navAdmin = document.getElementById('nav-admin');

  if (user && API.token) {
    if (navAuth) navAuth.style.display = 'none';
    if (navUser) {
      navUser.style.display = 'flex';
      const nameEl = document.getElementById('nav-username');
      const balEl = document.getElementById('nav-balance');
      if (nameEl) nameEl.textContent = user.username;
      if (balEl) balEl.textContent = formatPrice(user.balance);
    }
    if (navAdmin && user.role === 'admin') navAdmin.style.display = 'inline-flex';
  } else {
    if (navAuth) navAuth.style.display = 'flex';
    if (navUser) navUser.style.display = 'none';
    if (navAdmin) navAdmin.style.display = 'none';
  }
}

async function loadNotifBadge() {
  if (!API.token) return;
  try {
    const data = await API.get('/api/notifications');
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = data.unread;
      badge.style.display = data.unread > 0 ? 'flex' : 'none';
    }
  } catch (e) {}
}

function logout() {
  API.setToken(null);
  localStorage.removeItem('user');
  window.location.href = '/';
}
