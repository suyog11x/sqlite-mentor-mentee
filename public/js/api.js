// ─── API Client ───────────────────────────────────────────────────────────────
const API = {
    base: '/api',
    token: () => localStorage.getItem('mm_token'),

    async request(method, path, body = null, isFormData = false) {
        const headers = {};
        const token = this.token();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (!isFormData && body) headers['Content-Type'] = 'application/json';
        const res = await fetch(this.base + path, {
            method,
            headers,
            body: isFormData ? body : (body ? JSON.stringify(body) : null)
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    },

    get: (path) => API.request('GET', path),
    post: (path, body) => API.request('POST', path, body),
    put: (path, body) => API.request('PUT', path, body),
    delete: (path) => API.request('DELETE', path),
    postForm: (path, formData) => API.request('POST', path, formData, true),
};

// ─── Auth Helpers ──────────────────────────────────────────────────────────────
function getUser() {
    try { return JSON.parse(localStorage.getItem('mm_user')); } catch { return null; }
}
function logout() {
    localStorage.removeItem('mm_token');
    localStorage.removeItem('mm_user');
    window.location.href = '/';
}
function requireAuth(allowedRoles) {
    const user = getUser();
    const token = localStorage.getItem('mm_token');
    if (!user || !token) { window.location.href = '/'; return null; }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        alert('Access denied'); window.location.href = '/'; return null;
    }
    return user;
}
function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function formatDate(dt) {
    if (!dt) return 'N/A';
    return new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
function formatDateOnly(dt) {
    if (!dt) return 'N/A';
    return new Date(dt).toLocaleDateString('en-IN', { dateStyle: 'long' });
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || '📢'}</span><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ─── Modal Helpers ─────────────────────────────────────────────────────────────
function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
    }
    if (e.target.classList.contains('modal-close')) {
        e.target.closest('.modal-overlay')?.classList.remove('show');
    }
});

// ─── Page Navigation ───────────────────────────────────────────────────────────
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');
    const nav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (nav) nav.classList.add('active');
    // Update header
    const title = nav?.querySelector('.nav-label')?.textContent || pageId;
    const subtitle = document.getElementById('header-subtitle');
    if (subtitle) subtitle.textContent = title;
}

// ─── Set current date ──────────────────────────────────────────────────────────
function setCurrentDate() {
    const el = document.getElementById('current-date');
    if (el) el.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function initSidebar(user) {
    const avatar = document.getElementById('sidebar-avatar');
    const name = document.getElementById('sidebar-username');
    const role = document.getElementById('sidebar-role');
    if (avatar) avatar.textContent = initials(user.name);
    if (name) name.textContent = user.name;
    if (role) role.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', () => showPage(item.dataset.page));
    });
    document.getElementById('btn-logout')?.addEventListener('click', logout);
}
