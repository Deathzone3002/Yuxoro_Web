const API = (window.YUXORO_API_URL || window.location.origin).replace(/\/$/, '');
let authToken = sessionStorage.getItem('yuxoro_token');
let revenueChart = null;

// ── INIT ────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (!authToken) {
    const email = prompt('Admin Email:');
    const password = prompt('Admin Password:');
    
    if (email && password) {
      loginAdmin(email, password);
    } else {
      alert('Authentication required');
      window.location.href = '/';
    }
  } else {
    loadDashboard();
  }
});

// ── LOGIN ────────────────────────────────────────────────────────
async function loginAdmin(email, password) {
  try {
    const res = await fetch(API + '/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      sessionStorage.setItem('yuxoro_token', authToken);
      loadDashboard();
    } else {
      alert('Invalid credentials');
      window.location.href = '/';
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Login failed');
  }
}

// ── SWITCH TAB ──────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
  
  document.getElementById(tabName).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  if (tabName === 'orders') loadOrders();
  if (tabName === 'overview') loadStats();
}

// ── LOAD DASHBOARD ──────────────────────────────────────────────
async function loadDashboard() {
  loadStats();
  loadOrders();
  setInterval(loadStats, 15000);
  setInterval(loadOrders, 15000);
}

// ── LOAD STATS ──────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(API + '/stats', {
      headers: { 'x-admin-token': authToken }
    });
    
    if (res.ok) {
      const stats = await res.json();
      document.getElementById('total-orders').textContent = stats.totalOrders;
      document.getElementById('paid-orders').textContent = stats.paidOrders;
      document.getElementById('total-revenue').textContent = '$' + stats.totalRevenue.toLocaleString();
      document.getElementById('conversion-rate').textContent = stats.conversionRate;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ── LOAD ORDERS ─────────────────────────────────────────────────
async function loadOrders() {
  try {
    const res = await fetch(API + '/orders', {
      headers: { 'x-admin-token': authToken }
    });
    
    if (res.ok) {
      const orders = await res.json();
      const tbody = document.getElementById('orders-tbody');
      tbody.innerHTML = '';
      
      orders.forEach(order => {
        const row = document.createElement('tr');
        const statusClass = `status-${order.status}`;
        row.innerHTML = `
          <td>${order.email}</td>
          <td>${order.firstName} ${order.lastName}</td>
          <td>${order.plan}</td>
          <td>${order.currency} ${order.amount}</td>
          <td><span class="status-badge ${statusClass}">${order.status}</span></td>
          <td>${new Date(order.date).toLocaleDateString()}</td>
        `;
        tbody.appendChild(row);
      });
    }
  } catch (err) {
    console.error('Orders error:', err);
  }
}

// ── FILTER ORDERS ───────────────────────────────────────────────
function filterOrders() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const rows = document.querySelectorAll('#orders-tbody tr');
  
  rows.forEach(row => {
    const email = row.cells[0].textContent.toLowerCase();
    row.style.display = email.includes(query) ? '' : 'none';
  });
}

// ── TOGGLE MAINTENANCE ──────────────────────────────────────────
async function toggleMaintenance() {
  try {
    const res = await fetch(API + '/admin/toggle-maintenance', {
      method: 'POST',
      headers: { 'x-admin-token': authToken }
    });
    
    if (res.ok) {
      const data = await res.json();
      alert(`Maintenance mode: ${data.maintenanceMode ? 'ON' : 'OFF'}`);
    }
  } catch (err) {
    console.error('Toggle error:', err);
  }
}

// ── LOGOUT ──────────────────────────────────────────────────────
function logout() {
  sessionStorage.removeItem('yuxoro_token');
  window.location.href = '/';
}
