const API = (window.YUXORO_API_URL || window.location.origin).replace(/\/$/, '');
const TOKEN_KEY = 'yuxoro_admin_token';
let authToken = sessionStorage.getItem(TOKEN_KEY);
let requests = [];
let maintenanceMode = false;

const loginPanel = document.getElementById('login-panel');
const adminPanel = document.getElementById('admin-panel');
const loginError = document.getElementById('login-error');
const adminError = document.getElementById('admin-error');

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers['x-admin-token'] = authToken;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('The admin API returned a web page instead of JSON. Check the backend URL in api-config.js and deploy the Node server.');
  }
  if (!response.ok) {
    if (response.status === 401 && authToken) {
      authToken = null;
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin();
    }
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

function showLogin() {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
}

function showAdmin() {
  loginPanel.hidden = true;
  adminPanel.hidden = false;
}

document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const data = await apiRequest('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('admin-email').value.trim(),
        password: document.getElementById('admin-password').value
      })
    });
    authToken = data.token;
    sessionStorage.setItem(TOKEN_KEY, authToken);
    document.getElementById('admin-password').value = '';
    showAdmin();
    await refreshAdmin();
  } catch (error) {
    loginError.textContent = error.message || 'Unable to sign in.';
  } finally {
    button.disabled = false;
    button.textContent = 'Login';
  }
});

function createCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value == null ? '' : String(value);
  return cell;
}

function renderRequests() {
  const tbody = document.getElementById('requests-tbody');
  tbody.replaceChildren();
  if (!requests.length) {
    const row = document.createElement('tr');
    const cell = createCell('No customer requests yet.');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }
  requests.forEach(request => {
    const row = document.createElement('tr');
    const when = request.createdAt ? new Date(request.createdAt).toLocaleString() : '—';
    const planName = [request.plan, ...(request.addons || []).map(addon => addon.name)].filter(Boolean).join(' · ');
    [when, `${request.firstName || ''} ${request.lastName || ''}`.trim(), request.email,
      request.phone, planName, `${request.currency || 'EGP'} ${Number(request.amount || 0).toLocaleString()}`,
      request.status || 'received', request.emailStatus || 'unknown'].forEach(value => row.appendChild(createCell(value)));
    tbody.appendChild(row);
  });
  filterRequests();
}

function filterRequests() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  document.querySelectorAll('#requests-tbody tr').forEach(row => {
    row.hidden = query.length > 0 && !row.textContent.toLowerCase().includes(query);
  });
}

function renderMaintenance() {
  const button = document.getElementById('maintenance-button');
  document.getElementById('maintenance-status').textContent = maintenanceMode
    ? 'Maintenance mode is ON. The public site is blocked for visitors.'
    : 'Maintenance mode is OFF. The public site is available.';
  button.textContent = maintenanceMode ? 'Turn Maintenance Off' : 'Turn Maintenance On';
  button.classList.toggle('danger-button', maintenanceMode);
  button.disabled = false;
}

async function refreshAdmin() {
  adminError.textContent = '';
  try {
    const [stats, loadedRequests] = await Promise.all([
      apiRequest('/api/admin/stats'),
      apiRequest('/api/admin/requests')
    ]);
    requests = loadedRequests;
    document.getElementById('total-requests').textContent = Number(stats.totalRequests || 0).toLocaleString();
    document.getElementById('emails-sent').textContent = Number(stats.emailsSent || 0).toLocaleString();
    document.getElementById('requested-total').textContent = `EGP ${Number(stats.requestedTotal || 0).toLocaleString()}`;
    maintenanceMode = Boolean(stats.maintenanceMode);
    renderMaintenance();
    renderRequests();
  } catch (error) {
    adminError.textContent = error.message || 'Could not load admin data.';
  }
}

document.getElementById('search-input').addEventListener('input', filterRequests);
document.getElementById('refresh-button').addEventListener('click', refreshAdmin);
document.getElementById('maintenance-button').addEventListener('click', async () => {
  const button = document.getElementById('maintenance-button');
  button.disabled = true;
  adminError.textContent = '';
  try {
    const result = await apiRequest('/api/admin/maintenance', {
      method: 'POST',
      body: JSON.stringify({ maintenanceMode: !maintenanceMode })
    });
    maintenanceMode = Boolean(result.maintenanceMode);
    renderMaintenance();
  } catch (error) {
    button.disabled = false;
    adminError.textContent = error.message || 'Could not change maintenance mode.';
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try { await apiRequest('/api/admin/logout', { method: 'POST' }); } catch { /* Clear local session even if offline. */ }
  authToken = null;
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
});

if (authToken) {
  showAdmin();
  refreshAdmin();
  window.setInterval(refreshAdmin, 15000);
} else {
  showLogin();
}
