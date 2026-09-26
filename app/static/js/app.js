// StockSense - Modular Inventory Management System Frontend Engine
const API_BASE = '/api';

const state = {
  user: null,
  activeView: 'dashboard',
  selectedWarehouseId: '',
  searchQuery: '',
  filterDocType: 'all',
  filterStatus: 'all',
  filterCategory: '',
  categories: [],
  warehouses: [],
  locations: [],
  products: [],
  operations: [],
  ledgerMoves: [],
  kpis: {}
};

// ==========================================
// Initialization & Authentication
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check local storage for session
  const savedUser = localStorage.getItem('stocksense_user');
  if (savedUser) {
    try {
      state.user = JSON.parse(savedUser);
      if (state.user.id === 1 || state.user.name === "Sarah Jenkins") {
        state.user.name = "Praveen Kumar";
        localStorage.setItem('stocksense_user', JSON.stringify(state.user));
      }
      if (state.user.assigned_warehouse_id) {
        state.selectedWarehouseId = state.user.assigned_warehouse_id;
      }
    } catch (e) {
      state.user = null;
    }
  }

  // If no user, show login modal or set default demo user
  if (!state.user) {
    // Default demo user for seamless start
    state.user = {
      id: 1,
      name: "Praveen Kumar",
      email: "manager@stocksense.com",
      role: "Inventory Manager",
      assigned_warehouse_id: 1,
      warehouse_name: "WH1 - Main Warehouse"
    };
    localStorage.setItem('stocksense_user', JSON.stringify(state.user));
    state.selectedWarehouseId = 1;
  }

  updateUserUI();
  await loadMetadata();
  setupEventListeners();
  navigateTo('dashboard');
});

function updateUserUI() {
  const nameEl = document.getElementById('user-name-display');
  const roleEl = document.getElementById('user-role-display');
  const avatarEl = document.getElementById('user-avatar-display');
  if (state.user) {
    if (nameEl) nameEl.textContent = state.user.name;
    if (roleEl) roleEl.textContent = state.user.role;
    if (avatarEl) avatarEl.textContent = state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2);
  }
}

// Load common metadata (warehouses, locations, categories)
async function loadMetadata() {
  try {
    const [whRes, locRes, catRes] = await Promise.all([
      fetch(`${API_BASE}/settings/warehouses`).then(r => r.json()),
      fetch(`${API_BASE}/settings/locations`).then(r => r.json()),
      fetch(`${API_BASE}/settings/categories`).then(r => r.json())
    ]);
    state.warehouses = whRes.warehouses || [];
    state.locations = locRes.locations || [];
    state.categories = catRes.categories || [];

    populateWarehouseSelector();
  } catch (err) {
    console.error("Error loading metadata:", err);
  }
}

function populateWarehouseSelector() {
  const sel = document.getElementById('global-warehouse-selector');
  if (!sel) return;
  sel.innerHTML = '<option value="">All Warehouses</option>';
  state.warehouses.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = `${w.code} - ${w.name}`;
    if (state.selectedWarehouseId == w.id) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ==========================================
// Navigation & Routing
// ==========================================
function setupEventListeners() {
  // Nav links
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      navigateTo(view);
    });
  });

  // Global warehouse selector
  const whSel = document.getElementById('global-warehouse-selector');
  if (whSel) {
    whSel.addEventListener('change', (e) => {
      state.selectedWarehouseId = e.target.value;
      refreshCurrentView();
    });
  }

  // Global search input
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      if (state.activeView === 'products') loadProducts();
      else if (['receipts', 'deliveries', 'transfers', 'adjustments'].includes(state.activeView)) loadOperations();
      else if (state.activeView === 'ledger') loadLedger();
    });
  }
}

function navigateTo(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Update breadcrumb
  const bcActive = document.getElementById('breadcrumb-current');
  const viewTitles = {
    dashboard: 'Dashboard',
    products: 'Products & Inventory',
    receipts: 'Operations / Receipts (Incoming Stock)',
    deliveries: 'Operations / Delivery Orders (Outgoing Goods)',
    transfers: 'Operations / Internal Transfers',
    adjustments: 'Operations / Stock Adjustments',
    ledger: 'Operations / Move History (Stock Ledger)',
    settings: 'Configuration / Multi-Warehouse Settings'
  };
  if (bcActive) bcActive.textContent = viewTitles[viewName] || 'Dashboard';

  refreshCurrentView();
}

function refreshCurrentView() {
  const container = document.getElementById('view-container');
  if (!container) return;

  switch (state.activeView) {
    case 'dashboard':
      renderDashboard(container);
      break;
    case 'products':
      renderProductsView(container);
      break;
    case 'receipts':
      renderOperationsView(container, 'receipt', 'Receipts (Incoming Stock)');
      break;
    case 'deliveries':
      renderOperationsView(container, 'delivery', 'Delivery Orders (Outgoing Goods)');
      break;
    case 'transfers':
      renderTransfersView(container);
      break;
    case 'adjustments':
      renderAdjustmentsView(container);
      break;
    case 'ledger':
      renderLedgerView(container);
      break;
    case 'settings':
      renderSettingsView(container);
      break;
  }
}

// ==========================================
// 1. Dashboard View
// ==========================================
async function renderDashboard(container) {
  container.innerHTML = `
    <div class="scenario-banner">
      <div class="scenario-info">
        <h3>⚡ StockSense Demonstration Scenario (Odoo Hackathon)</h3>
        <p>Interactive 4-Step Flow: Receive 100 kg Steel ➔ Internal Transfer to Production Rack ➔ Deliver 20 Steel ➔ Adjust 3 kg Damaged</p>
      </div>
      <div class="scenario-actions">
        <button class="btn btn-white" onclick="openScenarioModal()">▶ Launch Walkthrough</button>
        <button class="btn btn-secondary" onclick="executeFullScenarioFast()">⚡ 1-Click Fast Run</button>
      </div>
    </div>

    <!-- Quick Action Bar -->
    <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
      <button class="btn btn-primary" onclick="openCreateReceiptModal()">+ New Receipt</button>
      <button class="btn btn-secondary" onclick="openCreateDeliveryModal()">+ New Delivery Order</button>
      <button class="btn btn-outline" onclick="openQuickTransferModal()">🔄 Internal Transfer</button>
      <button class="btn btn-outline" onclick="openStockAdjustmentModal()">⚖️ Stock Adjustment</button>
      <button class="btn btn-outline" onclick="openCreateProductModal()">📦 Add Product</button>
    </div>

    <!-- Top KPI Grid -->
    <div class="kpi-grid" id="kpi-grid">
      <div class="kpi-card" onclick="navigateTo('products')">
        <div class="kpi-header">
          <span class="kpi-title">Total Products in Stock</span>
          <div class="kpi-icon-wrap">📦</div>
        </div>
        <div class="kpi-value" id="kpi-products-qty">--</div>
        <div class="kpi-subtext" id="kpi-valuation">Valuation: --</div>
      </div>

      <div class="kpi-card red" onclick="filterLowStockProducts()">
        <div class="kpi-header">
          <span class="kpi-title">Low / Out of Stock</span>
          <div class="kpi-icon-wrap" style="color: var(--danger);">⚠️</div>
        </div>
        <div class="kpi-value" id="kpi-low-stock">--</div>
        <div class="kpi-subtext" id="kpi-low-sub">Needs attention</div>
      </div>

      <div class="kpi-card teal" onclick="navigateTo('receipts')">
        <div class="kpi-header">
          <span class="kpi-title">Pending Receipts</span>
          <div class="kpi-icon-wrap" style="color: var(--secondary);">📥</div>
        </div>
        <div class="kpi-value" id="kpi-receipts">--</div>
        <div class="kpi-subtext">Incoming stock</div>
      </div>

      <div class="kpi-card amber" onclick="navigateTo('deliveries')">
        <div class="kpi-header">
          <span class="kpi-title">Pending Deliveries</span>
          <div class="kpi-icon-wrap" style="color: var(--warning);">📤</div>
        </div>
        <div class="kpi-value" id="kpi-deliveries">--</div>
        <div class="kpi-subtext">Outgoing goods</div>
      </div>

      <div class="kpi-card blue" onclick="navigateTo('transfers')">
        <div class="kpi-header">
          <span class="kpi-title">Transfers Scheduled</span>
          <div class="kpi-icon-wrap" style="color: var(--info);">🔄</div>
        </div>
        <div class="kpi-value" id="kpi-transfers">--</div>
        <div class="kpi-subtext">Internal movements</div>
      </div>
    </div>

    <!-- Dynamic Filters as per Problem Statement -->
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Document Type:</span>
        <span class="filter-pill ${state.filterDocType === 'all' ? 'active' : ''}" onclick="setDocTypeFilter('all')">All</span>
        <span class="filter-pill ${state.filterDocType === 'receipt' ? 'active' : ''}" onclick="setDocTypeFilter('receipt')">Receipts</span>
        <span class="filter-pill ${state.filterDocType === 'delivery' ? 'active' : ''}" onclick="setDocTypeFilter('delivery')">Delivery</span>
        <span class="filter-pill ${state.filterDocType === 'internal' ? 'active' : ''}" onclick="setDocTypeFilter('internal')">Internal</span>
        <span class="filter-pill ${state.filterDocType === 'adjustment' ? 'active' : ''}" onclick="setDocTypeFilter('adjustment')">Adjustments</span>
      </div>

      <div class="filter-group">
        <span class="filter-label">Status:</span>
        <select class="filter-select" id="dashboard-status-filter" onchange="setDashboardStatus(this.value)">
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Waiting">Waiting</option>
          <option value="Ready">Ready</option>
          <option value="Done">Done</option>
          <option value="Canceled">Canceled</option>
        </select>

        <span class="filter-label">Category:</span>
        <select class="filter-select" id="dashboard-cat-filter" onchange="setDashboardCategory(this.value)">
          <option value="">All Categories</option>
          ${state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Operations Overview & Recent Activity Feed -->
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
      <div class="card">
        <div class="card-header">
          <span class="card-title">📋 Active Operations Stream</span>
          <button class="btn btn-sm btn-outline" onclick="loadDashboardOperations()">Refresh</button>
        </div>
        <div class="card-body" style="padding: 0;">
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Partner / Purpose</th>
                  <th>Source ➔ Destination</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="dashboard-operations-tbody">
                <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading operations...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Recent Ledger Activity Feed -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📜 Real-time Move Ledger</span>
          <button class="btn btn-sm btn-outline" onclick="navigateTo('ledger')">View All</button>
        </div>
        <div class="card-body" style="padding: 12px;" id="dashboard-ledger-feed">
          <div style="text-align: center; color: var(--text-muted); padding: 20px;">Loading ledger moves...</div>
        </div>
      </div>
    </div>
  `;

  await loadDashboardKPIs();
  await loadDashboardOperations();
}

async function loadDashboardKPIs() {
  try {
    const whParam = state.selectedWarehouseId ? `?warehouse_id=${state.selectedWarehouseId}` : '';
    const res = await fetch(`${API_BASE}/dashboard/kpis${whParam}`);
    const data = await res.json();
    state.kpis = data;

    const elQty = document.getElementById('kpi-products-qty');
    const elVal = document.getElementById('kpi-valuation');
    const elLow = document.getElementById('kpi-low-stock');
    const elRec = document.getElementById('kpi-receipts');
    const elDel = document.getElementById('kpi-deliveries');
    const elTrf = document.getElementById('kpi-transfers');

    if (elQty) elQty.textContent = `${data.total_units_in_stock} Units`;
    if (elVal) elVal.textContent = `Valuation: $${data.total_inventory_valuation.toLocaleString()}`;
    if (elLow) elLow.textContent = `${data.low_stock_count + data.out_of_stock_count} Items`;
    if (elRec) elRec.textContent = data.pending_receipts_count;
    if (elDel) elDel.textContent = data.pending_deliveries_count;
    if (elTrf) elTrf.textContent = data.scheduled_transfers_count;

    // Render Recent Ledger Activity feed
    const feed = document.getElementById('dashboard-ledger-feed');
    if (feed && data.recent_activity) {
      if (data.recent_activity.length === 0) {
        feed.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No move history yet.</div>';
      } else {
        feed.innerHTML = data.recent_activity.slice(0, 6).map(m => `
          <div style="border-bottom: 1px solid var(--border-light); padding: 8px 4px; display: flex; align-items: center; justify-content: space-between; font-size: 12px;">
            <div>
              <div style="font-weight: 600; color: var(--text-main);">${m.product_name}</div>
              <div style="color: var(--text-muted); font-size: 11px;">
                ${m.source_location_name || 'Vendor'} ➔ ${m.dest_location_name || 'Customer'}
              </div>
            </div>
            <div style="text-align: right;">
              <span class="badge ${m.quantity > 0 ? 'badge-done' : 'badge-waiting'}">
                ${m.quantity > 0 ? '+' : ''}${m.quantity} ${m.uom}
              </span>
              <div style="color: var(--text-light); font-size: 10px; margin-top: 2px;">${m.timestamp ? m.timestamp.substring(11, 16) : ''}</div>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.error("Error loading KPIs", e);
  }
}

async function loadDashboardOperations() {
  const tbody = document.getElementById('dashboard-operations-tbody');
  if (!tbody) return;

  try {
    let url = `${API_BASE}/operations?`;
    if (state.filterDocType !== 'all') url += `op_type=${state.filterDocType}&`;
    if (state.filterStatus !== 'all') url += `status=${state.filterStatus}&`;
    if (state.selectedWarehouseId) url += `warehouse_id=${state.selectedWarehouseId}&`;

    const res = await fetch(url);
    const data = await res.json();
    const ops = data.operations || [];

    if (ops.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No operations found matching current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = ops.map(op => `
      <tr>
        <td><strong>${op.reference}</strong></td>
        <td><span class="badge" style="background:#eef2ff; color:#4338ca;">${op.op_type.toUpperCase()}</span></td>
        <td>${op.partner_name || op.notes || '-'}</td>
        <td>${op.source_location_name || 'Vendor'} ➔ ${op.dest_location_name || 'Customer'}</td>
        <td><span class="badge badge-${op.status.toLowerCase()}">${op.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openOperationDetailModal(${op.id})">View Details</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Error loading dashboard operations", e);
  }
}

function setDocTypeFilter(type) {
  state.filterDocType = type;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  loadDashboardOperations();
}

function setDashboardStatus(status) {
  state.filterStatus = status;
  loadDashboardOperations();
}

function setDashboardCategory(catId) {
  state.filterCategory = catId;
  // Can filter products or refresh view
}

function filterLowStockProducts() {
  navigateTo('products');
  setTimeout(() => {
    const sel = document.getElementById('product-status-filter');
    if (sel) {
      sel.value = 'low_stock';
      loadProducts();
    }
  }, 100);
}

// ==========================================
// 2. Products View & Reordering Rules
// ==========================================
function renderProductsView(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 700;">Product Management</h2>
        <p style="font-size: 13px; color: var(--text-muted);">Track catalog items, stock availability per location, and reordering rules.</p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-outline" onclick="openLowStockAlertsModal()">⚠️ Low Stock Alerts</button>
        <button class="btn btn-primary" onclick="openCreateProductModal()">+ Create Product</button>
      </div>
    </div>

    <!-- Filter ribbon -->
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Category:</span>
        <select class="filter-select" id="product-category-filter" onchange="loadProducts()">
          <option value="">All Categories</option>
          ${state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>

        <span class="filter-label">Stock Status:</span>
        <select class="filter-select" id="product-status-filter" onchange="loadProducts()">
          <option value="all">All Products</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock (At/Below Min)</option>
          <option value="out_of_stock">Out of Stock (Zero)</option>
        </select>
      </div>

      <div class="filter-group">
        <span class="filter-label">Quick Search:</span>
        <input type="text" id="product-inline-search" class="filter-select" placeholder="Search Name, SKU, Barcode..." oninput="debounceProductSearch(this.value)" style="width: 220px;" />
      </div>
    </div>

    <!-- Products Table -->
    <div class="card">
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Category</th>
                <th>Unit of Measure</th>
                <th>Cost / Sale</th>
                <th>Total On Hand</th>
                <th>Min / Max Rule</th>
                <th>Stock Per Location Breakdown</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="products-table-tbody">
              <tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading product catalog...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  loadProducts();
}

let productSearchTimeout = null;
function debounceProductSearch(val) {
  clearTimeout(productSearchTimeout);
  productSearchTimeout = setTimeout(() => {
    state.searchQuery = val.trim();
    loadProducts();
  }, 250);
}

async function loadProducts() {
  const tbody = document.getElementById('products-table-tbody');
  if (!tbody) return;

  const catFilter = document.getElementById('product-category-filter');
  const statusFilter = document.getElementById('product-status-filter');
  const catId = catFilter ? catFilter.value : '';
  const status = statusFilter ? statusFilter.value : 'all';

  let url = `${API_BASE}/products?`;
  if (catId) url += `category_id=${catId}&`;
  if (status && status !== 'all') url += `stock_status=${status}&`;
  if (state.searchQuery) url += `search=${encodeURIComponent(state.searchQuery)}&`;
  if (state.selectedWarehouseId) url += `warehouse_id=${state.selectedWarehouseId}&`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    state.products = data.products || [];

    if (state.products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">No products found. Click "+ Create Product" to add one.</td></tr>';
      return;
    }

    tbody.innerHTML = state.products.map(p => {
      const locListHtml = p.locations && p.locations.length > 0
        ? p.locations.map(l => `<span class="loc-stock-item">📍 ${l.warehouse_code || ''}/${l.location_name}: <strong>${l.quantity}</strong></span>`).join(' ')
        : '<span style="color: var(--text-light); font-style: italic;">No stock allocated</span>';

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 14px;">${p.name}</div>
            <div style="font-family: monospace; font-size: 12px; color: var(--primary); font-weight: 600;">SKU: ${p.sku}</div>
            ${p.barcode ? `<div style="font-size: 10.5px; color: var(--text-light);">Barcode: ${p.barcode}</div>` : ''}
          </td>
          <td>
            <span class="badge" style="background-color: ${p.category_color ? p.category_color + '22' : '#f1f5f9'}; color: ${p.category_color || '#333'};">
              ${p.category_name || 'General'}
            </span>
          </td>
          <td><strong>${p.uom}</strong></td>
          <td>
            <div style="font-size: 12.5px;">Cost: <strong>$${p.cost_price.toFixed(2)}</strong></div>
            <div style="font-size: 11.5px; color: var(--text-muted);">Sale: $${p.sale_price.toFixed(2)}</div>
          </td>
          <td>
            <span style="font-size: 15px; font-weight: 700; color: ${p.total_quantity <= 0 ? 'var(--danger)' : p.total_quantity <= p.min_stock ? 'var(--warning)' : 'var(--text-main)'};">
              ${p.total_quantity} ${p.uom}
            </span>
          </td>
          <td>
            <div style="font-size: 12px;">Min: <strong>${p.min_stock}</strong> | Max: ${p.max_stock}</div>
            <div style="font-size: 11px; color: var(--text-muted);">Reorder Qty: ${p.reorder_qty}</div>
          </td>
          <td style="max-width: 280px;">
            ${locListHtml}
          </td>
          <td>
            <span class="badge badge-${p.status}">
              ${p.status === 'in_stock' ? '✓ In Stock' : p.status === 'low_stock' ? '⚠️ Low Stock' : '✕ Out of Stock'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 5px;">
              <button class="btn btn-sm btn-outline" onclick="openProductDetailModal(${p.id})" title="View Details">🔍</button>
              <button class="btn btn-sm btn-outline" onclick="quickReorderProduct(${p.id})" title="Reorder Stock">📥 Restock</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Error loading products", e);
  }
}

// ==========================================
// 3. Operations View (Receipts, Deliveries)
// ==========================================
function renderOperationsView(container, opType, title) {
  const isReceipt = opType === 'receipt';
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 700;">${title}</h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          ${isReceipt ? 'Receive stock from vendors. Validating automatically increments location stock.' : 'Ship items to customers with Pick, Pack, and Validate workflow.'}
        </p>
      </div>
      <div>
        <button class="btn btn-primary" onclick="${isReceipt ? 'openCreateReceiptModal()' : 'openCreateDeliveryModal()'}">
          ${isReceipt ? '+ New Receipt' : '+ New Delivery Order'}
        </button>
      </div>
    </div>

    <!-- Filter ribbon -->
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Filter Status:</span>
        <select class="filter-select" id="op-status-filter" onchange="loadOperations('${opType}')">
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Waiting">Waiting</option>
          <option value="Ready">Ready</option>
          <option value="Done">Done</option>
          <option value="Canceled">Canceled</option>
        </select>
      </div>

      <div class="filter-group">
        <span class="filter-label">Workflow Guide:</span>
        <div class="pipeline-status">
          <div class="pipeline-step completed">1. Draft</div>
          <div class="pipeline-step completed">2. Waiting (${isReceipt ? 'Supplier' : 'Pick'})</div>
          <div class="pipeline-step completed">3. Ready (${isReceipt ? 'Receive' : 'Pack'})</div>
          <div class="pipeline-step active">4. Validate (Done)</div>
        </div>
      </div>
    </div>

    <!-- Operations Table -->
    <div class="card">
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Scheduled Date</th>
                <th>${isReceipt ? 'Supplier' : 'Customer'}</th>
                <th>${isReceipt ? 'Dest. Location (Incoming)' : 'Source Location (Outgoing)'}</th>
                <th>Items & Quantities</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="operations-table-tbody">
              <tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading operations...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  loadOperations(opType);
}

async function loadOperations(opType) {
  const tbody = document.getElementById('operations-table-tbody');
  if (!tbody) return;

  const statusSel = document.getElementById('op-status-filter');
  const status = statusSel ? statusSel.value : 'all';

  let url = `${API_BASE}/operations?op_type=${opType}&`;
  if (status && status !== 'all') url += `status=${status}&`;
  if (state.selectedWarehouseId) url += `warehouse_id=${state.selectedWarehouseId}&`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const ops = data.operations || [];

    if (ops.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No ${opType} operations found.</td></tr>`;
      return;
    }

    tbody.innerHTML = ops.map(op => {
      const locDisplay = opType === 'receipt' ? op.dest_location_name : op.source_location_name;
      const isDone = op.status === 'Done';
      const isCanceled = op.status === 'Canceled';

      return `
        <tr>
          <td><strong style="color: var(--primary); font-family: monospace; font-size: 13.5px;">${op.reference}</strong></td>
          <td>${op.scheduled_date || op.created_at.substring(0, 10)}</td>
          <td><strong>${op.partner_name || '-'}</strong></td>
          <td>📍 ${locDisplay || 'Main Store'}</td>
          <td>
            <strong>${op.item_count} items</strong> (${op.total_demanded_qty} units)
          </td>
          <td>
            <span class="badge badge-${op.status.toLowerCase()}">${op.status}</span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-outline" onclick="openOperationDetailModal(${op.id})">Details</button>
              ${!isDone && !isCanceled ? `
                <button class="btn btn-sm btn-primary" onclick="advanceOperationStatus(${op.id}, '${opType}')">
                  ${op.status === 'Ready' ? '✓ Validate' : 'Next Step ➔'}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Error loading operations", e);
  }
}

// ==========================================
// 4. Internal Transfers View
// ==========================================
function renderTransfersView(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 700;">Internal Transfers</h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          Move stock between internal locations (e.g. Main Store ➔ Production Floor, Rack A ➔ Rack B). Total stock remains unchanged.
        </p>
      </div>
      <div>
        <button class="btn btn-primary" onclick="openQuickTransferModal()">+ New Internal Transfer</button>
      </div>
    </div>

    <!-- Quick Transfer Card for rapid action -->
    <div class="card" style="margin-bottom: 24px; background: #faf9fc; border-color: #d8cfe2;">
      <div class="card-header" style="background: transparent;">
        <span class="card-title" style="color: var(--primary);">⚡ Rapid Transfer Bar</span>
      </div>
      <div class="card-body">
        <form id="quick-transfer-form" onsubmit="handleQuickTransferSubmit(event)" style="display: grid; grid-template-columns: 2fr 2fr 2fr 1fr auto; gap: 12px; align-items: end;">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Product to Move</label>
            <select class="form-control" id="qt-product" required onchange="updateTransferAvailableStock()">
              <option value="">Select Product...</option>
              ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label>Source Location</label>
            <select class="form-control" id="qt-source" required onchange="updateTransferAvailableStock()">
              ${state.locations.filter(l => l.location_type === 'internal').map(l => `<option value="${l.id}">${l.warehouse_code || ''}/${l.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label>Destination Location</label>
            <select class="form-control" id="qt-dest" required>
              ${state.locations.filter(l => l.location_type === 'internal').map((l, i) => `<option value="${l.id}" ${i === 1 ? 'selected' : ''}>${l.warehouse_code || ''}/${l.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label>Quantity</label>
            <input type="number" class="form-control" id="qt-qty" min="1" step="any" required placeholder="Qty" />
          </div>

          <button type="submit" class="btn btn-primary" style="height: 38px;">Transfer Now</button>
        </form>
        <div id="transfer-stock-hint" style="font-size: 11.5px; color: var(--text-muted); margin-top: 6px;"></div>
      </div>
    </div>

    <!-- Transfers List -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Transfer History</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Date</th>
                <th>Source Location</th>
                <th>Destination Location</th>
                <th>Items</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="transfers-table-tbody">
              <tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading internal transfers...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Pre-load products if not yet loaded
  if (state.products.length === 0) {
    loadProducts().then(() => {
      const prodSel = document.getElementById('qt-product');
      if (prodSel) {
        prodSel.innerHTML = '<option value="">Select Product...</option>' + 
          state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
      }
    });
  }

  loadTransfersTable();
}

async function loadTransfersTable() {
  const tbody = document.getElementById('transfers-table-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/operations?op_type=internal`);
    const data = await res.json();
    const ops = data.operations || [];

    if (ops.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No internal transfers logged.</td></tr>';
      return;
    }

    tbody.innerHTML = ops.map(op => `
      <tr>
        <td><strong>${op.reference}</strong></td>
        <td>${op.scheduled_date || op.created_at.substring(0, 10)}</td>
        <td>📍 ${op.source_location_name}</td>
        <td>📍 ${op.dest_location_name}</td>
        <td><strong>${op.total_demanded_qty} units</strong></td>
        <td><span class="badge badge-${op.status.toLowerCase()}">${op.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openOperationDetailModal(${op.id})">Details</button>
          ${op.status !== 'Done' ? `<button class="btn btn-sm btn-primary" onclick="advanceOperationStatus(${op.id}, 'internal')">Validate</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Error loading transfers", e);
  }
}

async function updateTransferAvailableStock() {
  const prodId = document.getElementById('qt-product').value;
  const locId = document.getElementById('qt-source').value;
  const hint = document.getElementById('transfer-stock-hint');
  if (!prodId || !locId || !hint) return;

  try {
    const res = await fetch(`${API_BASE}/products/${prodId}`);
    const prod = await res.json();
    const locMatch = (prod.locations || []).find(l => l.location_id == locId);
    const avail = locMatch ? locMatch.quantity : 0;
    hint.innerHTML = `Available in selected source: <strong style="color: ${avail > 0 ? 'var(--success)' : 'var(--danger)'};">${avail} ${prod.uom}</strong>`;
  } catch (e) {
    hint.textContent = '';
  }
}

async function handleQuickTransferSubmit(e) {
  e.preventDefault();
  const prodId = parseInt(document.getElementById('qt-product').value);
  const srcId = parseInt(document.getElementById('qt-source').value);
  const dstId = parseInt(document.getElementById('qt-dest').value);
  const qty = parseFloat(document.getElementById('qt-qty').value);

  if (srcId === dstId) {
    showToast("Source and destination locations cannot be the same!", "danger");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/operations/quick-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: prodId,
        source_location_id: srcId,
        dest_location_id: dstId,
        quantity: qty,
        notes: "Quick internal transfer"
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, "success");
      document.getElementById('qt-qty').value = '';
      loadTransfersTable();
      loadMetadata();
    } else {
      showToast(result.detail || "Transfer failed", "danger");
    }
  } catch (err) {
    showToast("Network error executing transfer", "danger");
  }
}

// ==========================================
// 5. Stock Adjustments View (Physical vs Recorded)
// ==========================================
function renderAdjustmentsView(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 700;">Stock Adjustments (Physical Counting)</h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          Fix mismatches between recorded stock and physical count (e.g. damaged items, shrinkage, recount).
        </p>
      </div>
      <div>
        <button class="btn btn-primary" onclick="openStockAdjustmentModal()">+ Record New Count / Adjustment</button>
      </div>
    </div>

    <!-- Visual Example matching problem statement -->
    <div style="background: #fdf6e7; border: 1px solid #f9e2b1; border-radius: var(--radius-lg); padding: 14px 18px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <strong style="color: #92400e;">💡 Problem Statement Example: Step 4 - Adjust Damaged Items</strong>
        <p style="font-size: 12.5px; color: #78350f; margin-top: 2px;">
          "3 kg steel damaged ➔ Stock: -3. Everything auto-updates and logs in the Stock Ledger."
        </p>
      </div>
      <button class="btn btn-sm btn-outline" style="background: white;" onclick="presetDamagedSteelAdjustment()">Try This Adjustment Example</button>
    </div>

    <!-- Adjustments Log Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Adjustment Audit Log</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Date</th>
                <th>Product</th>
                <th>Location</th>
                <th>Recorded ➔ Counted</th>
                <th>Difference</th>
                <th>Reason / Notes</th>
              </tr>
            </thead>
            <tbody id="adjustments-table-tbody">
              <tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading adjustments...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  loadAdjustmentsTable();
}

async function loadAdjustmentsTable() {
  const tbody = document.getElementById('adjustments-table-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/operations/ledger/history?op_type=adjustment`);
    const data = await res.json();
    const moves = data.moves || [];

    if (moves.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No adjustments recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = moves.map(m => {
      const diff = m.quantity;
      const diffClass = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';
      const diffSign = diff > 0 ? `+${diff}` : `${diff}`;

      return `
        <tr>
          <td><strong style="color: var(--primary);">${m.reference}</strong></td>
          <td>${m.timestamp ? m.timestamp.substring(0, 16) : '-'}</td>
          <td><strong>${m.product_name}</strong> (${m.product_sku})</td>
          <td>📍 ${m.source_location_name || m.dest_location_name || 'Main Store'}</td>
          <td>Physical Count Adjustment</td>
          <td><span class="${diffClass}">${diffSign} ${m.product_uom}</span></td>
          <td style="color: var(--text-muted);">${m.notes || '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Error loading adjustments", e);
  }
}

// ==========================================
// 6. Move History / Stock Ledger View
// ==========================================
function renderLedgerView(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 700;">Stock Ledger & Move History</h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          Immutable centralized audit trail tracking every single inventory transaction across all locations.
        </p>
      </div>
      <div>
        <button class="btn btn-outline" onclick="exportLedgerCSV()">📥 Export to CSV</button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Operation Type:</span>
        <select class="filter-select" id="ledger-optype-filter" onchange="loadLedger()">
          <option value="all">All Movements</option>
          <option value="receipt">Receipts (Incoming)</option>
          <option value="delivery">Deliveries (Outgoing)</option>
          <option value="internal">Internal Transfers</option>
          <option value="adjustment">Stock Adjustments</option>
        </select>

        <span class="filter-label">Filter Product:</span>
        <select class="filter-select" id="ledger-product-filter" onchange="loadLedger()">
          <option value="">All Products</option>
          ${state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>

      <div class="filter-group">
        <input type="text" id="ledger-search" class="filter-select" placeholder="Search reference, notes..." oninput="debounceLedgerSearch(this.value)" style="width: 220px;" />
      </div>
    </div>

    <!-- Ledger Table -->
    <div class="card">
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Reference</th>
                <th>Operation Type</th>
                <th>Product / SKU</th>
                <th>From (Source)</th>
                <th>To (Destination)</th>
                <th>Quantity Moved</th>
                <th>Handled By</th>
                <th>Notes / Reason</th>
              </tr>
            </thead>
            <tbody id="ledger-table-tbody">
              <tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading Stock Ledger entries...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  loadLedger();
}

let ledgerSearchTimeout = null;
function debounceLedgerSearch(val) {
  clearTimeout(ledgerSearchTimeout);
  ledgerSearchTimeout = setTimeout(() => {
    state.searchQuery = val.trim();
    loadLedger();
  }, 250);
}

async function loadLedger() {
  const tbody = document.getElementById('ledger-table-tbody');
  if (!tbody) return;

  const opSel = document.getElementById('ledger-optype-filter');
  const prodSel = document.getElementById('ledger-product-filter');
  const opType = opSel ? opSel.value : 'all';
  const prodId = prodSel ? prodSel.value : '';

  let url = `${API_BASE}/operations/ledger/history?`;
  if (opType && opType !== 'all') url += `op_type=${opType}&`;
  if (prodId) url += `product_id=${prodId}&`;
  if (state.searchQuery) url += `search=${encodeURIComponent(state.searchQuery)}&`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    state.ledgerMoves = data.moves || [];

    if (state.ledgerMoves.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">No ledger movements recorded matching query.</td></tr>';
      return;
    }

    tbody.innerHTML = state.ledgerMoves.map(m => {
      const isPositive = m.quantity > 0;
      const opBadgeColor = {
        receipt: 'badge-done',
        delivery: 'badge-waiting',
        internal: 'badge-ready',
        adjustment: 'badge-draft'
      }[m.op_type] || 'badge-draft';

      return `
        <tr>
          <td style="white-space: nowrap; font-size: 12px; color: var(--text-muted);">${m.timestamp || '-'}</td>
          <td><strong style="color: var(--primary); font-family: monospace;">${m.reference}</strong></td>
          <td><span class="badge ${opBadgeColor}">${m.op_type.toUpperCase()}</span></td>
          <td>
            <strong>${m.product_name}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">${m.product_sku}</div>
          </td>
          <td>${m.source_location_name || 'Vendor'}</td>
          <td>${m.dest_location_name || 'Customer'}</td>
          <td>
            <span style="font-weight: 700; color: ${isPositive ? 'var(--success)' : 'var(--danger)'};">
              ${isPositive ? '+' : ''}${m.quantity} ${m.product_uom}
            </span>
          </td>
          <td>${m.user_name || 'Praveen Kumar'}</td>
          <td style="max-width: 200px; font-size: 12px; color: var(--text-muted);">${m.notes || '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Error loading ledger", e);
  }
}

function exportLedgerCSV() {
  if (!state.ledgerMoves || state.ledgerMoves.length === 0) {
    showToast("No ledger records to export", "warning");
    return;
  }

  const headers = ["Timestamp", "Reference", "Type", "Product", "SKU", "From Location", "To Location", "Quantity", "UoM", "User", "Notes"];
  const rows = state.ledgerMoves.map(m => [
    `"${m.timestamp || ''}"`,
    `"${m.reference || ''}"`,
    `"${m.op_type || ''}"`,
    `"${m.product_name || ''}"`,
    `"${m.product_sku || ''}"`,
    `"${m.source_location_name || ''}"`,
    `"${m.dest_location_name || ''}"`,
    m.quantity,
    `"${m.product_uom || ''}"`,
    `"${m.user_name || ''}"`,
    `"${(m.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `stocksense_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Stock Ledger exported to CSV!", "success");
}

// ==========================================
// 7. Settings View (Multi-Warehouse & Locations)
// ==========================================
function renderSettingsView(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 700;">Warehouse & Location Settings</h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          Manage Multi-Warehouse architecture, internal racks, shelves, and stock storage zones.
        </p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-outline" onclick="openCreateLocationModal()">+ Add Location / Rack</button>
        <button class="btn btn-primary" onclick="openCreateWarehouseModal()">+ Add Warehouse</button>
      </div>
    </div>

    <!-- Warehouses Grid -->
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-header">
        <span class="card-title">🏢 Configured Warehouses</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Warehouse Name</th>
                <th>Physical Address</th>
                <th>Locations / Racks</th>
                <th>Total Units Stored</th>
              </tr>
            </thead>
            <tbody>
              ${state.warehouses.map(w => `
                <tr>
                  <td><strong style="color: var(--primary); font-family: monospace;">${w.code}</strong></td>
                  <td><strong>${w.name}</strong></td>
                  <td style="color: var(--text-muted);">${w.address || '-'}</td>
                  <td><span class="badge" style="background:#e0e7ff; color:#3730a3;">${w.location_count || 1} zones</span></td>
                  <td><strong>${w.total_units_stored || 0} units</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Locations & Racks Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📍 Internal Locations & Racks</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Location Code</th>
                <th>Location / Rack Name</th>
                <th>Warehouse</th>
                <th>Type</th>
                <th>Current Stored Quantity</th>
                <th>Unique SKUs</th>
              </tr>
            </thead>
            <tbody>
              ${state.locations.map(l => `
                <tr>
                  <td><strong style="font-family: monospace;">${l.code}</strong></td>
                  <td><strong>${l.name}</strong></td>
                  <td>${l.warehouse_name || 'Global / Virtual'}</td>
                  <td><span class="badge ${l.location_type === 'internal' ? 'badge-ready' : 'badge-draft'}">${l.location_type}</span></td>
                  <td><strong>${l.current_quantity || 0} units</strong></td>
                  <td>${l.unique_products || 0} items</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 8. Scenario Walkthrough Modal & Fast Runner
// ==========================================
function openScenarioModal() {
  const modalHtml = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>⚡ StockSense Demonstration Scenario (Odoo Problem Statement)</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 16px;">
          This interactive tour executes the exact 4-step scenario specified on Pages 3 & 4 of the problem statement:
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; background: #fafafa;">
            <strong>Step 1: Receive Goods from Vendor</strong>
            <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 3px;">Receive 100 kg Steel from Tata Steel Ltd ➔ Stock in Main Store: +100</div>
          </div>

          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; background: #fafafa;">
            <strong>Step 2: Move to production rack</strong>
            <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 3px;">Internal transfer: Main Store ➔ Production Rack (50 kg) ➔ Total company stock unchanged (100 kg), new location updated</div>
          </div>

          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; background: #fafafa;">
            <strong>Step 3: Deliver finished goods</strong>
            <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 3px;">Deliver 20 steel to customer Acme Corp ➔ Stock for frames: -20</div>
          </div>

          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; background: #fafafa;">
            <strong>Step 4: Adjust damaged items</strong>
            <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 3px;">3 kg steel damaged during handling ➔ Stock: -3 (Adjusted to 27 kg). Everything logged in Stock Ledger.</div>
          </div>
        </div>

        <div id="scenario-output-box" style="display: none; background: #1e1b2e; color: #a5f3fc; font-family: monospace; font-size: 12px; padding: 16px; border-radius: 8px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" id="btn-run-scenario" onclick="runScenarioWithLogs()">⚡ Run All 4 Steps Now</button>
      </div>
    </div>
  `;
  showModal(modalHtml);
}

async function runScenarioWithLogs() {
  const btn = document.getElementById('btn-run-scenario');
  const box = document.getElementById('scenario-output-box');
  if (btn) btn.disabled = true;
  if (box) {
    box.style.display = 'block';
    box.textContent = "Initiating Problem Statement 4-step execution...\n";
  }

  try {
    const res = await fetch(`${API_BASE}/demo/run-full-scenario`, { method: 'POST' });
    const data = await res.json();

    if (data.success && box) {
      box.textContent += "\n✓ " + (data.steps_executed || []).join("\n✓ ") + "\n\n🎉 Complete scenario successfully executed and logged to Stock Ledger!";
      showToast("Scenario executed successfully!", "success");
      setTimeout(() => {
        closeModal();
        refreshCurrentView();
        loadMetadata();
      }, 2500);
    } else {
      if (box) box.textContent += "\n✕ Error: " + (data.message || "Failed");
    }
  } catch (err) {
    if (box) box.textContent += "\n✕ Network error executing demo.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function executeFullScenarioFast() {
  try {
    const res = await fetch(`${API_BASE}/demo/run-full-scenario`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast("4-Step Demo scenario executed! (Receipt + Transfer + Delivery + Adjustment)", "success");
      refreshCurrentView();
      loadMetadata();
    } else {
      showToast(data.message || "Error running scenario", "danger");
    }
  } catch (e) {
    showToast("Network error running scenario", "danger");
  }
}

// ==========================================
// 9. Modals (Create Product, Receipt, Delivery, Adjustment)
// ==========================================

// Create Product Modal
function openCreateProductModal() {
  const modalHtml = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>Create New Product</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleCreateProductSubmit(event)">
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Product Name *</label>
              <input type="text" class="form-control" id="p-name" required placeholder="e.g. Steel Rods, Office Chair" />
            </div>
            <div class="form-group">
              <label>SKU / Internal Code *</label>
              <input type="text" class="form-control" id="p-sku" required placeholder="e.g. STL-ROD-01" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Category</label>
              <select class="form-control" id="p-category">
                <option value="">Select Category...</option>
                ${state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Unit of Measure (UoM) *</label>
              <select class="form-control" id="p-uom">
                <option value="Units">Units</option>
                <option value="kg">kg (Kilograms)</option>
                <option value="m">m (Meters)</option>
                <option value="Boxes">Boxes</option>
                <option value="Liters">Liters</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Cost Price ($)</label>
              <input type="number" step="0.01" class="form-control" id="p-cost" value="0.00" />
            </div>
            <div class="form-group">
              <label>Sales Price ($)</label>
              <input type="number" step="0.01" class="form-control" id="p-sale" value="0.00" />
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <strong style="font-size: 13px; color: var(--text-main);">Reordering Rules & Stock Limits</strong>
            <div class="form-row" style="margin-top: 10px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label>Min Stock (Alert Trigger)</label>
                <input type="number" class="form-control" id="p-min" value="10" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label>Max Stock</label>
                <input type="number" class="form-control" id="p-max" value="100" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label>Reorder Qty</label>
                <input type="number" class="form-control" id="p-reorder" value="25" />
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Initial Stock (Optional)</label>
              <input type="number" step="any" class="form-control" id="p-init-stock" value="0" />
            </div>
            <div class="form-group">
              <label>Initial Location</label>
              <select class="form-control" id="p-init-loc">
                ${state.locations.filter(l => l.location_type === 'internal').map(l => `<option value="${l.id}">${l.warehouse_code || ''}/${l.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea class="form-control" id="p-desc" rows="2" placeholder="Product details..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Product</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
}

async function handleCreateProductSubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('p-name').value,
    sku: document.getElementById('p-sku').value,
    category_id: document.getElementById('p-category').value ? parseInt(document.getElementById('p-category').value) : null,
    uom: document.getElementById('p-uom').value,
    cost_price: parseFloat(document.getElementById('p-cost').value || 0),
    sale_price: parseFloat(document.getElementById('p-sale').value || 0),
    min_stock: parseFloat(document.getElementById('p-min').value || 10),
    max_stock: parseFloat(document.getElementById('p-max').value || 100),
    reorder_qty: parseFloat(document.getElementById('p-reorder').value || 25),
    initial_stock: parseFloat(document.getElementById('p-init-stock').value || 0),
    initial_location_id: document.getElementById('p-init-loc').value ? parseInt(document.getElementById('p-init-loc').value) : null,
    description: document.getElementById('p-desc').value
  };

  try {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast("Product created successfully!", "success");
      closeModal();
      refreshCurrentView();
      loadMetadata();
    } else {
      showToast(data.detail || "Error creating product", "danger");
    }
  } catch (err) {
    showToast("Network error creating product", "danger");
  }
}

// Create Receipt Modal
function openCreateReceiptModal() {
  const modalHtml = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>Create Stock Receipt (Incoming Goods)</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleCreateReceiptSubmit(event)">
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Supplier *</label>
              <input type="text" class="form-control" id="rec-supplier" required placeholder="e.g. Tata Steel Ltd, Apex Hardware" list="supplier-datalist" />
              <datalist id="supplier-datalist">
                <option value="Tata Steel Ltd" />
                <option value="Apex Hardware Suppliers" />
                <option value="Global Timber & Wood" />
              </datalist>
            </div>
            <div class="form-group">
              <label>Destination Warehouse & Location *</label>
              <select class="form-control" id="rec-dest-loc" required>
                ${state.locations.filter(l => l.location_type === 'internal').map(l => `<option value="${l.id}">${l.warehouse_code || ''}/${l.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Scheduled Date</label>
              <input type="date" class="form-control" id="rec-date" value="${new Date().toISOString().substring(0, 10)}" />
            </div>
            <div class="form-group">
              <label>Notes</label>
              <input type="text" class="form-control" id="rec-notes" placeholder="e.g. Vendor Invoice #8821" />
            </div>
          </div>

          <div style="margin-top: 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 13.5px;">Products to Receive</strong>
            <button type="button" class="btn btn-sm btn-outline" onclick="addReceiptLine()">+ Add Product Line</button>
          </div>

          <div id="receipt-lines-container">
            <div class="form-row receipt-line" style="grid-template-columns: 3fr 1fr auto; align-items: center; margin-bottom: 8px;">
              <select class="form-control line-prod" required>
                <option value="">Select Product...</option>
                ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
              </select>
              <input type="number" step="any" min="1" class="form-control line-qty" placeholder="Qty" value="50" required />
              <button type="button" class="btn btn-sm btn-outline" onclick="this.parentElement.remove()" style="color: var(--danger);">✕</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Draft Receipt</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
}

function addReceiptLine() {
  const container = document.getElementById('receipt-lines-container');
  if (!container) return;
  const line = document.createElement('div');
  line.className = 'form-row receipt-line';
  line.style.cssText = 'grid-template-columns: 3fr 1fr auto; align-items: center; margin-bottom: 8px;';
  line.innerHTML = `
    <select class="form-control line-prod" required>
      <option value="">Select Product...</option>
      ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
    </select>
    <input type="number" step="any" min="1" class="form-control line-qty" placeholder="Qty" value="10" required />
    <button type="button" class="btn btn-sm btn-outline" onclick="this.parentElement.remove()" style="color: var(--danger);">✕</button>
  `;
  container.appendChild(line);
}

async function handleCreateReceiptSubmit(e) {
  e.preventDefault();
  const destLocId = parseInt(document.getElementById('rec-dest-loc').value);
  const supplier = document.getElementById('rec-supplier').value;
  const date = document.getElementById('rec-date').value;
  const notes = document.getElementById('rec-notes').value;

  const lines = [];
  document.querySelectorAll('.receipt-line').forEach(row => {
    const pid = parseInt(row.querySelector('.line-prod').value);
    const qty = parseFloat(row.querySelector('.line-qty').value);
    if (pid && qty > 0) {
      lines.push({ product_id: pid, demanded_qty: qty });
    }
  });

  if (lines.length === 0) {
    showToast("Please add at least one product line", "warning");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op_type: 'receipt',
        partner_name: supplier,
        dest_location_id: destLocId,
        scheduled_date: date,
        notes: notes,
        lines: lines
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Receipt created: ${data.reference}`, "success");
      closeModal();
      navigateTo('receipts');
    } else {
      showToast(data.detail || "Failed to create receipt", "danger");
    }
  } catch (err) {
    showToast("Network error creating receipt", "danger");
  }
}

// Create Delivery Order Modal
function openCreateDeliveryModal() {
  const modalHtml = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>Create Delivery Order (Outgoing Stock)</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleCreateDeliverySubmit(event)">
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Customer *</label>
              <input type="text" class="form-control" id="del-customer" required placeholder="e.g. Acme Industrial Corp, Metro Office" list="cust-datalist" />
              <datalist id="cust-datalist">
                <option value="Acme Industrial Corp" />
                <option value="Metro Office Solutions" />
                <option value="Zenith Constructions" />
              </datalist>
            </div>
            <div class="form-group">
              <label>Source Warehouse & Location *</label>
              <select class="form-control" id="del-src-loc" required>
                ${state.locations.filter(l => l.location_type === 'internal').map(l => `<option value="${l.id}">${l.warehouse_code || ''}/${l.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Scheduled Date</label>
              <input type="date" class="form-control" id="del-date" value="${new Date().toISOString().substring(0, 10)}" />
            </div>
            <div class="form-group">
              <label>Notes</label>
              <input type="text" class="form-control" id="del-notes" placeholder="e.g. Sales Order #SO-1029" />
            </div>
          </div>

          <div style="margin-top: 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 13.5px;">Products to Deliver</strong>
            <button type="button" class="btn btn-sm btn-outline" onclick="addDeliveryLine()">+ Add Product Line</button>
          </div>

          <div id="delivery-lines-container">
            <div class="form-row delivery-line" style="grid-template-columns: 3fr 1fr auto; align-items: center; margin-bottom: 8px;">
              <select class="form-control line-prod" required>
                <option value="">Select Product...</option>
                ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
              </select>
              <input type="number" step="any" min="1" class="form-control line-qty" placeholder="Qty" value="10" required />
              <button type="button" class="btn btn-sm btn-outline" onclick="this.parentElement.remove()" style="color: var(--danger);">✕</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Draft Delivery Order</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
}

function addDeliveryLine() {
  const container = document.getElementById('delivery-lines-container');
  if (!container) return;
  const line = document.createElement('div');
  line.className = 'form-row delivery-line';
  line.style.cssText = 'grid-template-columns: 3fr 1fr auto; align-items: center; margin-bottom: 8px;';
  line.innerHTML = `
    <select class="form-control line-prod" required>
      <option value="">Select Product...</option>
      ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
    </select>
    <input type="number" step="any" min="1" class="form-control line-qty" placeholder="Qty" value="10" required />
    <button type="button" class="btn btn-sm btn-outline" onclick="this.parentElement.remove()" style="color: var(--danger);">✕</button>
  `;
  container.appendChild(line);
}

async function handleCreateDeliverySubmit(e) {
  e.preventDefault();
  const srcLocId = parseInt(document.getElementById('del-src-loc').value);
  const customer = document.getElementById('del-customer').value;
  const date = document.getElementById('del-date').value;
  const notes = document.getElementById('del-notes').value;

  const lines = [];
  document.querySelectorAll('.delivery-line').forEach(row => {
    const pid = parseInt(row.querySelector('.line-prod').value);
    const qty = parseFloat(row.querySelector('.line-qty').value);
    if (pid && qty > 0) {
      lines.push({ product_id: pid, demanded_qty: qty });
    }
  });

  if (lines.length === 0) {
    showToast("Please add at least one product line", "warning");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op_type: 'delivery',
        partner_name: customer,
        source_location_id: srcLocId,
        scheduled_date: date,
        notes: notes,
        lines: lines
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Delivery Order created: ${data.reference}`, "success");
      closeModal();
      navigateTo('deliveries');
    } else {
      showToast(data.detail || "Failed to create delivery", "danger");
    }
  } catch (err) {
    showToast("Network error creating delivery order", "danger");
  }
}

// Quick Internal Transfer Modal
function openQuickTransferModal() {
  const modalHtml = `
    <div class="modal">
      <div class="modal-header">
        <h3>Internal Stock Transfer</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleModalTransferSubmit(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Product to Move *</label>
            <select class="form-control" id="m-trf-product" required onchange="updateModalTransferStock()">
              <option value="">Select Product...</option>
              ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Source Location *</label>
              <select class="form-control" id="m-trf-source" required onchange="updateModalTransferStock()">
                ${state.locations.filter(l => l.location_type === 'internal').map(l => `<option value="${l.id}">${l.warehouse_code || ''}/${l.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Destination Location *</label>
              <select class="form-control" id="m-trf-dest" required>
                ${state.locations.filter(l => l.location_type === 'internal').map((l, i) => `<option value="${l.id}" ${i === 1 ? 'selected' : ''}>${l.warehouse_code || ''}/${l.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Quantity to Transfer *</label>
            <input type="number" step="any" min="0.1" class="form-control" id="m-trf-qty" required placeholder="Quantity" />
            <div id="m-trf-stock-hint" style="font-size: 12px; margin-top: 5px; color: var(--text-muted);"></div>
          </div>

          <div class="form-group">
            <label>Transfer Notes</label>
            <input type="text" class="form-control" id="m-trf-notes" placeholder="e.g. Move to production rack for assembly" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Validate Transfer</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
  updateModalTransferStock();
}

async function updateModalTransferStock() {
  const prodSel = document.getElementById('m-trf-product');
  const srcSel = document.getElementById('m-trf-source');
  const hint = document.getElementById('m-trf-stock-hint');
  if (!prodSel || !srcSel || !hint || !prodSel.value) return;

  try {
    const res = await fetch(`${API_BASE}/products/${prodSel.value}`);
    const prod = await res.json();
    const locMatch = (prod.locations || []).find(l => l.location_id == srcSel.value);
    const avail = locMatch ? locMatch.quantity : 0;
    hint.innerHTML = `Available in Source: <strong style="color: ${avail > 0 ? 'var(--success)' : 'var(--danger)'};">${avail} ${prod.uom}</strong>`;
  } catch (e) {}
}

async function handleModalTransferSubmit(e) {
  e.preventDefault();
  const pid = parseInt(document.getElementById('m-trf-product').value);
  const src = parseInt(document.getElementById('m-trf-source').value);
  const dst = parseInt(document.getElementById('m-trf-dest').value);
  const qty = parseFloat(document.getElementById('m-trf-qty').value);
  const notes = document.getElementById('m-trf-notes').value;

  if (src === dst) {
    showToast("Source and Destination locations must be different", "danger");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/operations/quick-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: pid,
        source_location_id: src,
        dest_location_id: dst,
        quantity: qty,
        notes: notes || "Internal stock relocation"
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      closeModal();
      refreshCurrentView();
      loadMetadata();
    } else {
      showToast(data.detail || "Transfer error", "danger");
    }
  } catch (err) {
    showToast("Network error executing transfer", "danger");
  }
}

// Stock Adjustment Modal (Physical Count)
function openStockAdjustmentModal() {
  const modalHtml = `
    <div class="modal">
      <div class="modal-header">
        <h3>Stock Adjustment (Physical Count)</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleAdjustmentSubmit(event)">
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Product *</label>
              <select class="form-control" id="adj-product" required onchange="calculateAdjustmentDifference()">
                <option value="">Select Product...</option>
                ${state.products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Location *</label>
              <select class="form-control" id="adj-location" required onchange="calculateAdjustmentDifference()">
                ${state.locations.filter(l => l.location_type === 'internal').map(l => `<option value="${l.id}">${l.warehouse_code || ''}/${l.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: var(--text-muted);">Current Recorded Stock:</span>
              <strong id="adj-recorded-display" style="font-size: 15px;">--</strong>
            </div>

            <div class="form-group" style="margin-bottom: 10px;">
              <label>Counted Physical Quantity *</label>
              <input type="number" step="any" class="form-control" id="adj-counted" required placeholder="Enter actual counted units" oninput="calculateAdjustmentDifference()" />
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
              <span style="font-weight: 600;">Calculated Difference:</span>
              <span id="adj-difference-display" style="font-size: 16px; font-weight: 700;">--</span>
            </div>
          </div>

          <div class="form-group">
            <label>Reason for Adjustment *</label>
            <input type="text" class="form-control" id="adj-reason" required placeholder="e.g. 3 kg steel damaged, Physical inventory recount" list="adj-reasons-list" />
            <datalist id="adj-reasons-list">
              <option value="3 kg steel damaged" />
              <option value="Damaged during handling" />
              <option value="Annual physical inventory recount" />
              <option value="Missing items / Shrinkage" />
              <option value="Found extra batch in storage" />
            </datalist>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Apply Stock Adjustment</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
  calculateAdjustmentDifference();
}

let currentRecordedQty = 0;
async function calculateAdjustmentDifference() {
  const prodSel = document.getElementById('adj-product');
  const locSel = document.getElementById('adj-location');
  const recordedEl = document.getElementById('adj-recorded-display');
  const diffEl = document.getElementById('adj-difference-display');
  const countedEl = document.getElementById('adj-counted');

  if (!prodSel || !locSel || !recordedEl || !diffEl) return;
  if (!prodSel.value || !locSel.value) {
    recordedEl.textContent = '--';
    diffEl.textContent = '--';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/products/${prodSel.value}`);
    const prod = await res.json();
    const match = (prod.locations || []).find(l => l.location_id == locSel.value);
    currentRecordedQty = match ? match.quantity : 0;
    recordedEl.textContent = `${currentRecordedQty} ${prod.uom}`;

    const countedVal = parseFloat(countedEl.value);
    if (!isNaN(countedVal)) {
      const diff = countedVal - currentRecordedQty;
      diffEl.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(2)} ${prod.uom}`;
      diffEl.className = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';
    } else {
      diffEl.textContent = '--';
    }
  } catch (e) {
    recordedEl.textContent = '0';
  }
}

async function handleAdjustmentSubmit(e) {
  e.preventDefault();
  const pid = parseInt(document.getElementById('adj-product').value);
  const lid = parseInt(document.getElementById('adj-location').value);
  const counted = parseFloat(document.getElementById('adj-counted').value);
  const reason = document.getElementById('adj-reason').value;

  try {
    const res = await fetch(`${API_BASE}/operations/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: pid,
        location_id: lid,
        counted_quantity: counted,
        reason: reason
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      closeModal();
      refreshCurrentView();
      loadMetadata();
    } else {
      showToast(data.detail || "Error saving adjustment", "danger");
    }
  } catch (err) {
    showToast("Network error saving adjustment", "danger");
  }
}

function presetDamagedSteelAdjustment() {
  closeModal();
  openStockAdjustmentModal();
  setTimeout(() => {
    // Select Steel
    const prodSel = document.getElementById('adj-product');
    const steel = state.products.find(p => p.sku === 'RAW-STL-100');
    if (steel && prodSel) {
      prodSel.value = steel.id;
      calculateAdjustmentDifference();
    }
    const reasonEl = document.getElementById('adj-reason');
    if (reasonEl) reasonEl.value = "3 kg steel damaged";
  }, 150);
}

// Operation Details Modal & Validation Stepper
async function openOperationDetailModal(opId) {
  try {
    const res = await fetch(`${API_BASE}/operations/${opId}`);
    const op = await res.json();

    const isReceipt = op.op_type === 'receipt';
    const isDelivery = op.op_type === 'delivery';
    const isDone = op.status === 'Done';
    const isCanceled = op.status === 'Canceled';

    const steps = isReceipt
      ? ['Draft', 'Waiting', 'Ready', 'Done']
      : isDelivery
      ? ['Draft', 'Waiting (Pick)', 'Ready (Pack)', 'Done']
      : ['Draft', 'Ready', 'Done'];

    const modalHtml = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <div>
            <h3>${op.reference} - ${op.op_type.toUpperCase()}</h3>
            <span style="font-size: 12px; color: var(--text-muted);">Created on ${op.created_at || ''}</span>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <!-- Stepper Header -->
          <div style="margin-bottom: 20px;">
            <div class="pipeline-status">
              ${steps.map(stepName => {
                const pureName = stepName.split(' ')[0];
                const isCurr = op.status.toLowerCase() === pureName.toLowerCase();
                const isPast = isDone || (op.status === 'Ready' && pureName === 'Draft');
                return `<div class="pipeline-step ${isCurr ? 'active' : isPast ? 'completed' : ''}">${stepName}</div>`;
              }).join('')}
            </div>
          </div>

          <div class="form-row" style="margin-bottom: 16px;">
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Partner:</span>
              <div style="font-weight: 700; font-size: 14px;">${op.partner_name || 'N/A'}</div>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Warehouse:</span>
              <div style="font-weight: 600;">${op.warehouse_name || 'Main Warehouse'}</div>
            </div>
          </div>

          <div class="form-row" style="margin-bottom: 20px;">
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Source Location:</span>
              <div>📍 ${op.source_location_name || 'Vendor Location'}</div>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Destination Location:</span>
              <div>📍 ${op.dest_location_name || 'Customer Location'}</div>
            </div>
          </div>

          <!-- Line items table -->
          <strong style="font-size: 13.5px; display: block; margin-bottom: 8px;">Order Line Items</strong>
          <table class="data-table" style="border: 1px solid var(--border-color); border-radius: 6px;">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Demanded Qty</th>
                <th>Done Qty</th>
              </tr>
            </thead>
            <tbody>
              ${(op.lines || []).map(l => `
                <tr>
                  <td><strong>${l.product_name}</strong></td>
                  <td><code>${l.product_sku}</code></td>
                  <td>${l.demanded_qty} ${l.product_uom}</td>
                  <td><strong>${isDone ? l.demanded_qty : l.done_qty} ${l.product_uom}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${op.notes ? `<div style="margin-top: 14px; font-size: 12.5px; color: var(--text-muted);"><strong>Notes:</strong> ${op.notes}</div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Close</button>
          ${!isDone && !isCanceled ? `
            <button class="btn btn-danger btn-sm" onclick="cancelOperationById(${op.id})">Cancel Order</button>
            <button class="btn btn-primary" onclick="advanceOperationStatus(${op.id}, '${op.op_type}')">
              ${op.status === 'Ready' ? '✓ Validate (Update Stock)' : 'Advance to Next Step ➔'}
            </button>
          ` : ''}
        </div>
      </div>
    `;
    showModal(modalHtml);
  } catch (err) {
    showToast("Error loading operation details", "danger");
  }
}

async function advanceOperationStatus(opId, opType) {
  try {
    const res = await fetch(`${API_BASE}/operations/${opId}/advance-status`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      closeModal();
      refreshCurrentView();
      loadMetadata();
    } else {
      showToast(data.message || "Error updating status", "warning");
    }
  } catch (err) {
    showToast("Network error advancing status", "danger");
  }
}

async function cancelOperationById(opId) {
  if (!confirm("Are you sure you want to cancel this operation?")) return;
  try {
    const res = await fetch(`${API_BASE}/operations/${opId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      closeModal();
      refreshCurrentView();
    } else {
      showToast(data.detail || "Error canceling", "danger");
    }
  } catch (err) {
    showToast("Network error canceling operation", "danger");
  }
}

// Low stock alerts drawer/modal
async function openLowStockAlertsModal() {
  try {
    const res = await fetch(`${API_BASE}/products/reordering-rules/alerts`);
    const data = await res.json();
    const alerts = data.alerts || [];

    const modalHtml = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>⚠️ Low Stock & Restock Alerts (${alerts.length})</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="padding: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Current Stock</th>
                <th>Min Threshold</th>
                <th>Deficit</th>
                <th>Reorder Action</th>
              </tr>
            </thead>
            <tbody>
              ${alerts.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">All stock levels are optimal!</td></tr>' : 
                alerts.map(a => `
                  <tr>
                    <td>
                      <strong>${a.name}</strong>
                      <div style="font-size: 11px; color: var(--text-muted);">${a.sku}</div>
                    </td>
                    <td><strong style="color: var(--danger); font-size: 14px;">${a.current_stock} ${a.uom}</strong></td>
                    <td>${a.min_stock} ${a.uom}</td>
                    <td><span class="badge badge-danger">-${a.deficit_qty} ${a.uom}</span></td>
                    <td>
                      <button class="btn btn-sm btn-primary" onclick="createAutoRestockReceipt(${a.id}, ${a.reorder_qty || 25})">
                        + Restock (+${a.reorder_qty || 25} ${a.uom})
                      </button>
                    </td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Close</button>
        </div>
      </div>
    `;
    showModal(modalHtml);
  } catch (err) {
    showToast("Error loading alerts", "danger");
  }
}

async function createAutoRestockReceipt(productId, qty) {
  try {
    const locId = state.locations.find(l => l.location_type === 'internal')?.id || 1;
    const res = await fetch(`${API_BASE}/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op_type: 'receipt',
        partner_name: "Tata Steel Ltd",
        dest_location_id: locId,
        notes: "Automated Reordering Rule trigger",
        lines: [{ product_id: productId, demanded_qty: qty }]
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Restock receipt created: ${data.reference}`, "success");
      closeModal();
      navigateTo('receipts');
    }
  } catch (err) {
    showToast("Failed to create restock receipt", "danger");
  }
}

// Product Detail Modal
async function openProductDetailModal(prodId) {
  try {
    const res = await fetch(`${API_BASE}/products/${prodId}`);
    const p = await res.json();

    const modalHtml = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <div>
            <h3>${p.name}</h3>
            <span style="font-family: monospace; color: var(--primary); font-weight: 600;">SKU: ${p.sku}</span>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row" style="margin-bottom: 16px;">
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Category:</span>
              <div><strong>${p.category_name || 'General'}</strong></div>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Total On Hand:</span>
              <div style="font-size: 18px; font-weight: 700; color: var(--primary);">${p.total_quantity} ${p.uom}</div>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 12px;">Cost / Sale:</span>
              <div>$${p.cost_price} / $${p.sale_price}</div>
            </div>
          </div>

          <strong style="font-size: 13.5px; display: block; margin-bottom: 8px;">Stock Availability Per Location</strong>
          <table class="data-table" style="border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 20px;">
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Location / Rack</th>
                <th>Quantity On Hand</th>
              </tr>
            </thead>
            <tbody>
              ${(p.locations || []).length === 0 ? '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 16px;">No stock in any location</td></tr>' :
                p.locations.map(l => `
                  <tr>
                    <td><strong>${l.warehouse_name || 'Main Warehouse'}</strong> (${l.warehouse_code})</td>
                    <td>📍 ${l.location_name}</td>
                    <td><strong style="color: var(--success); font-size: 14px;">${l.quantity} ${p.uom}</strong></td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>

          <strong style="font-size: 13.5px; display: block; margin-bottom: 8px;">Reordering Rules Configured</strong>
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-size: 13px;">
            Min Stock Threshold: <strong>${p.min_stock} ${p.uom}</strong> | Max Stock Threshold: <strong>${p.max_stock} ${p.uom}</strong> | Reorder Batch Qty: <strong>${p.reorder_qty} ${p.uom}</strong>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Close</button>
        </div>
      </div>
    `;
    showModal(modalHtml);
  } catch (err) {
    showToast("Error loading product details", "danger");
  }
}

// Settings Modals: Create Warehouse & Location
function openCreateWarehouseModal() {
  const modalHtml = `
    <div class="modal">
      <div class="modal-header">
        <h3>Add New Warehouse</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleCreateWarehouseSubmit(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Warehouse Code *</label>
            <input type="text" class="form-control" id="wh-code" required placeholder="e.g. WH3, SOUTH-HUB" />
          </div>
          <div class="form-group">
            <label>Warehouse Name *</label>
            <input type="text" class="form-control" id="wh-name" required placeholder="e.g. South Regional Distribution Hub" />
          </div>
          <div class="form-group">
            <label>Address</label>
            <input type="text" class="form-control" id="wh-address" placeholder="Physical location..." />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Warehouse</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
}

async function handleCreateWarehouseSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('wh-code').value;
  const name = document.getElementById('wh-name').value;
  const address = document.getElementById('wh-address').value;

  try {
    const res = await fetch(`${API_BASE}/settings/warehouses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, address })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Warehouse added successfully!", "success");
      closeModal();
      await loadMetadata();
      refreshCurrentView();
    } else {
      showToast(data.detail || "Error adding warehouse", "danger");
    }
  } catch (err) {
    showToast("Network error adding warehouse", "danger");
  }
}

function openCreateLocationModal() {
  const modalHtml = `
    <div class="modal">
      <div class="modal-header">
        <h3>Add Location / Rack</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <form onsubmit="handleCreateLocationSubmit(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Warehouse *</label>
            <select class="form-control" id="loc-wh" required>
              ${state.warehouses.map(w => `<option value="${w.id}">${w.name} (${w.code})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Location Code *</label>
            <input type="text" class="form-control" id="loc-code" required placeholder="e.g. WH1/RACK-C, PRD/LINE-2" />
          </div>
          <div class="form-group">
            <label>Location / Rack Name *</label>
            <input type="text" class="form-control" id="loc-name" required placeholder="e.g. Rack C - Top Shelf" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Location</button>
        </div>
      </form>
    </div>
  `;
  showModal(modalHtml);
}

async function handleCreateLocationSubmit(e) {
  e.preventDefault();
  const whId = parseInt(document.getElementById('loc-wh').value);
  const code = document.getElementById('loc-code').value;
  const name = document.getElementById('loc-name').value;

  try {
    const res = await fetch(`${API_BASE}/settings/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse_id: whId, code, name, location_type: 'internal' })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Location created successfully!", "success");
      closeModal();
      await loadMetadata();
      refreshCurrentView();
    } else {
      showToast(data.detail || "Error creating location", "danger");
    }
  } catch (err) {
    showToast("Network error creating location", "danger");
  }
}

// User Profile & Authentication Modal
function openProfileModal() {
  const modalHtml = `
    <div class="modal">
      <div class="modal-header">
        <h3>User Profile & Session</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px;">
          <div class="user-avatar" style="width: 52px; height: 52px; font-size: 20px;">
            ${state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 700;">${state.user.name}</div>
            <div style="color: var(--text-muted); font-size: 13px;">${state.user.email}</div>
            <span class="badge" style="background:#eef2ff; color:#4338ca; margin-top: 4px;">${state.user.role}</span>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 16px; margin-bottom: 16px;">
          <strong style="font-size: 13px; display: block; margin-bottom: 8px;">Switch Role for Demo:</strong>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-sm ${state.user.role === 'Inventory Manager' ? 'btn-primary' : 'btn-outline'}" onclick="switchDemoUser('manager')">
              Inventory Manager (Praveen Kumar)
            </button>
            <button class="btn btn-sm ${state.user.role === 'Warehouse Staff' ? 'btn-primary' : 'btn-outline'}" onclick="switchDemoUser('staff')">
              Warehouse Staff (Alex Rivera)
            </button>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
          <strong style="font-size: 13px; display: block; margin-bottom: 8px;">Password Management:</strong>
          <button class="btn btn-sm btn-outline" onclick="openResetPasswordModal()">Request OTP Password Reset</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger btn-sm" onclick="logoutUser()">Log Out</button>
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  showModal(modalHtml);
}

function switchDemoUser(type) {
  if (type === 'manager') {
    state.user = {
      id: 1,
      name: "Praveen Kumar",
      email: "manager@stocksense.com",
      role: "Inventory Manager",
      assigned_warehouse_id: 1,
      warehouse_name: "WH1 - Main Warehouse"
    };
  } else {
    state.user = {
      id: 2,
      name: "Alex Rivera",
      email: "staff@stocksense.com",
      role: "Warehouse Staff",
      assigned_warehouse_id: 1,
      warehouse_name: "WH1 - Main Warehouse"
    };
  }
  localStorage.setItem('stocksense_user', JSON.stringify(state.user));
  updateUserUI();
  closeModal();
  showToast(`Switched active user to ${state.user.name} (${state.user.role})`, "success");
}

function logoutUser() {
  localStorage.removeItem('stocksense_user');
  state.user = null;
  location.reload();
}

// OTP Password Reset Workflow
function openResetPasswordModal() {
  const modalHtml = `
    <div class="modal">
      <div class="modal-header">
        <h3>OTP-based Password Reset</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div id="otp-step-1">
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px;">
            Enter your registered email address to receive a 6-digit one-time verification password (OTP).
          </p>
          <div class="form-group">
            <label>Registered Email</label>
            <input type="email" class="form-control" id="otp-email" value="${state.user ? state.user.email : 'manager@stocksense.com'}" required />
          </div>
          <button class="btn btn-primary" onclick="sendOtpRequest()">Send OTP Code</button>
        </div>

        <div id="otp-step-2" style="display: none;">
          <div id="otp-simulation-alert" style="background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px; color: #0369a1;">
          </div>
          <div class="form-group">
            <label>6-Digit Verification OTP *</label>
            <input type="text" class="form-control" id="otp-code-input" placeholder="e.g. 123456" maxlength="6" style="font-size: 18px; letter-spacing: 4px; text-align: center;" />
          </div>
          <div class="form-group">
            <label>New Password *</label>
            <input type="password" class="form-control" id="otp-new-password" placeholder="Enter new password" />
          </div>
          <button class="btn btn-primary" onclick="confirmPasswordReset()">Confirm & Save New Password</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      </div>
    </div>
  `;
  showModal(modalHtml);
}

let generatedDemoOtp = null;
async function sendOtpRequest() {
  const email = document.getElementById('otp-email').value;
  try {
    const res = await fetch(`${API_BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.success) {
      generatedDemoOtp = data.demo_otp;
      document.getElementById('otp-step-1').style.display = 'none';
      document.getElementById('otp-step-2').style.display = 'block';

      const alertEl = document.getElementById('otp-simulation-alert');
      alertEl.innerHTML = `<strong>📧 Verification OTP Generated:</strong> <span style="font-size: 18px; font-weight: 800; color: #075985;">${data.demo_otp}</span><div style="font-size: 11.5px; margin-top: 4px;">Sent to ${email} (Valid for 10 minutes)</div>`;
      showToast("OTP generated successfully!", "success");
    } else {
      showToast(data.detail || "Error requesting OTP", "danger");
    }
  } catch (err) {
    showToast("Network error requesting OTP", "danger");
  }
}

async function confirmPasswordReset() {
  const email = document.getElementById('otp-email').value;
  const otp = document.getElementById('otp-code-input').value.trim();
  const newPassword = document.getElementById('otp-new-password').value;

  if (!otp || !newPassword) {
    showToast("Please enter both the OTP code and new password", "warning");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, new_password: newPassword })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      closeModal();
    } else {
      showToast(data.detail || "Invalid OTP code", "danger");
    }
  } catch (err) {
    showToast("Network error resetting password", "danger");
  }
}

// Modal Utility functions
function showModal(contentHtml) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.innerHTML = contentHtml;
  overlay.classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.innerHTML = '';
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div>${type === 'success' ? '✓' : type === 'danger' ? '✕' : 'ℹ'}</div>
    <div style="flex: 1;">${message}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// In-app Video Demo Player Modal
function openVideoModal() {
  const modalHtml = `
    <div class="modal modal-xl">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🎬</span>
          <h3 style="margin: 0;">StockSense Full HD Video Walkthrough Demo</h3>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 12px; background: #0b0a12; display: flex; flex-direction: column; align-items: center;">
        <video controls autoplay style="width: 100%; max-height: 70vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
          <source src="/static/StockSense_Demo_Walkthrough.webm" type="video/webm">
          Your browser does not support HTML5 video tag.
        </video>
        <div style="margin-top: 10px; width: 100%; display: flex; justify-content: space-between; align-items: center; color: #cbd5e1; font-size: 12px; padding: 0 8px;">
          <span>High-definition 1080p recording of end-to-end features & 4-step scenario</span>
          <a href="/static/StockSense_Demo_Walkthrough.webm" download="StockSense_Demo_Walkthrough.webm" class="btn btn-sm btn-white">
            📥 Download Video File (8.2 MB)
          </a>
        </div>
      </div>
    </div>
  `;
  showModal(modalHtml);
}

