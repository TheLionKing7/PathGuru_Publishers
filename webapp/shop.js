/**
 * PathGuru Publishers — Shop Module
 *
 * Wires all six Shop tab buttons to the PathGuru backend
 * Shop proxy routes (/api/shop/*), which forward to the
 * DigiFusion CMS API server-side (token never touches the browser).
 *
 * Tab coverage:
 *   Subscriptions  — Load subscriptions (MRR, churn, subscriber list)
 *   Bookings       — Load service bookings with status + order info
 *   Payments       — Load orders; mark-paid and refund actions per row
 *   T&C            — Publish refund policy + terms + privacy to /terms
 *   Shipping       — Save carrier, rates, zones to checkout config
 *   Analytics      — Load 30-day revenue stats and populate stat cards
 */
'use strict';
(function () {

  /* ── Helpers ──────────────────────────────────────────────────── */
  function getBackendUrl () {
    try {
      return (JSON.parse(localStorage.getItem('pg_settings') || '{}').backendUrl || window.location.origin).replace(/\/$/, '');
    } catch { return window.location.origin; }
  }

  function shopToast (msg, type = 'info') {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div class="toast-dot"></div><span>${String(msg).replace(/</g, '&lt;')}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  function esc (s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmt (cents, currency = 'USD') {
    const major = (cents || 0) / 100;
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(major); }
    catch { return `${currency} ${major.toFixed(2)}`; }
  }

  function fmtDate (iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  }

  async function shopFetch (method, path, body) {
    const base = getBackendUrl();
    if (!base.startsWith('http')) {
      shopToast('Configure your backend URL in Settings first.', 'error');
      return null;
    }
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await fetch(`${base}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
    return data;
  }

  /* ── SUBSCRIPTIONS ────────────────────────────────────────────── */
  async function loadSubscriptions () {
    const wrap = document.getElementById('shopSubsTable');
    const btn  = document.getElementById('shopSubsRefresh');
    if (!wrap || !btn) return;

    btn.disabled = true;
    btn.textContent = 'Loading…';
    wrap.hidden = true;

    try {
      const data = await shopFetch('GET', '/api/shop/subscriptions');
      if (!data) return;

      const { subscriptions = [], total_active = 0, mrr_usd = '0.00', churn_last_30d = 0 } = data.data || data;

      wrap.innerHTML = `
        <div class="shop-stats-grid" style="margin-bottom:20px">
          <div class="shop-stat-card"><div class="shop-stat-label">Active subscribers</div><div class="shop-stat-value">${total_active}</div></div>
          <div class="shop-stat-card"><div class="shop-stat-label">MRR (USD)</div><div class="shop-stat-value">$${esc(mrr_usd)}</div></div>
          <div class="shop-stat-card"><div class="shop-stat-label">Churn (30d)</div><div class="shop-stat-value">${churn_last_30d}</div></div>
        </div>
        ${subscriptions.length ? `
        <table class="shop-table">
          <thead><tr><th>Customer</th><th>Product</th><th>Plan</th><th>Status</th><th>Since</th></tr></thead>
          <tbody>
            ${subscriptions.map(s => `
              <tr>
                <td>${esc(s.customer_email || s.email || '—')}</td>
                <td>${esc(s.product_id || '—')}</td>
                <td>${esc(s.billing_interval || s.plan || '—')}</td>
                <td><span class="status-pill ${s.status}">${esc(s.status)}</span></td>
                <td>${fmtDate(s.created_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="shop-empty-msg">No active subscriptions yet.</p>'}
      `;
      wrap.hidden = false;
      document.querySelector('#tab-shop-subs .shop-empty')?.remove();
    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Load subscriptions';
    }
  }

  /* ── BOOKINGS ─────────────────────────────────────────────────── */
  async function loadBookings () {
    const wrap = document.getElementById('shopBookingsTable');
    const btn  = document.getElementById('shopBookingsRefresh');
    if (!wrap || !btn) return;

    btn.disabled = true;
    btn.textContent = 'Loading…';
    wrap.hidden = true;

    try {
      const data = await shopFetch('GET', '/api/shop/bookings');
      if (!data) return;

      const bookings = (data.data || data).bookings || [];

      wrap.innerHTML = bookings.length ? `
        <table class="shop-table">
          <thead><tr><th>Service</th><th>Customer</th><th>Status</th><th>Scheduled</th><th>Created</th></tr></thead>
          <tbody>
            ${bookings.map(b => `
              <tr>
                <td>${esc(b.product?.name || '—')}</td>
                <td>${esc(b.order?.customer_name || b.order?.customer_email || '—')}</td>
                <td><span class="status-pill ${b.status?.replace('_','-')}">${esc(b.status || '—')}</span></td>
                <td>${b.scheduled_at ? fmtDate(b.scheduled_at) : '<em>TBD</em>'}</td>
                <td>${fmtDate(b.created_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p class="shop-empty-msg">No bookings yet.</p>';

      wrap.hidden = false;
      document.querySelector('#tab-shop-bookings .shop-empty')?.remove();
    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Load bookings';
    }
  }

  /* ── PAYMENTS / ORDERS ────────────────────────────────────────── */
  async function loadOrders () {
    const wrap = document.getElementById('shopPaymentsTable');
    const btn  = document.getElementById('shopPaymentsRefresh');
    if (!wrap || !btn) return;

    btn.disabled = true;
    btn.textContent = 'Loading…';
    wrap.hidden = true;

    try {
      const data = await shopFetch('GET', '/api/shop/orders');
      if (!data) return;

      const orders = (data.data || data).orders || [];

      wrap.innerHTML = orders.length ? `
        <table class="shop-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Gateway</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr data-order-id="${esc(o.id)}">
                <td class="mono">${esc(o.public_id || o.id?.slice(0,8) || '—')}</td>
                <td>${esc(o.customer_email || '—')}</td>
                <td>${esc(o.gateway || '—')}</td>
                <td>${fmt(o.total, o.currency || 'USD')}</td>
                <td><span class="status-pill ${o.status}">${esc(o.status)}</span></td>
                <td>${fmtDate(o.paid_at || o.created_at)}</td>
                <td class="action-cell">
                  ${o.status !== 'paid' && o.status !== 'refunded' ? `<button class="btn-sm btn-primary mark-paid-btn" data-id="${esc(o.id)}">Mark paid</button>` : ''}
                  ${o.status === 'paid' ? `<button class="btn-sm btn-secondary refund-btn" data-id="${esc(o.id)}">Refund</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p class="shop-empty-msg">No orders found.</p>';

      wrap.hidden = false;
      document.querySelector('#tab-shop-payments .shop-empty')?.remove();

      // Wire mark-paid buttons
      wrap.querySelectorAll('.mark-paid-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = '…';
          try {
            await shopFetch('POST', `/api/shop/orders/${id}/mark-paid`);
            shopToast('Order marked as paid + fulfilled!', 'success');
            loadOrders();
          } catch (e) {
            shopToast(e.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Mark paid';
          }
        });
      });

      // Wire refund buttons
      wrap.querySelectorAll('.refund-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id     = btn.dataset.id;
          const reason = prompt('Refund reason (optional):') ?? '';
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const result = await shopFetch('POST', `/api/shop/orders/${id}/refund`, { reason });
            const d = result?.data || result;
            if (d?.manual) {
              shopToast('OPay — process refund manually in OPay dashboard.', 'info');
            } else {
              shopToast('Refund initiated successfully.', 'success');
            }
            loadOrders();
          } catch (e) {
            shopToast(e.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Refund';
          }
        });
      });

    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Load orders';
    }
  }

  /* ── TERMS & CONDITIONS ───────────────────────────────────────── */
  async function saveTerms () {
    const refund  = document.getElementById('shopTcRefund')?.value?.trim() || '';
    const terms   = document.getElementById('shopTcTerms')?.value?.trim()  || '';
    const privacy = document.getElementById('shopTcPrivacy')?.value?.trim() || '';

    if (!terms && !refund && !privacy) {
      shopToast('Enter at least one section before saving.', 'error');
      return;
    }

    const parts = [];
    if (refund)  parts.push(`## Refund Policy\n\n${refund}`);
    if (terms)   parts.push(`## Terms of Service\n\n${terms}`);
    if (privacy) parts.push(`## Privacy Policy\n\n${privacy}`);
    const content = parts.join('\n\n---\n\n');

    const btn = document.getElementById('shopTcSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await shopFetch('PUT', '/api/shop/settings/terms', { content });
      shopToast('Terms published to DigiFusion /terms ✓', 'success');
    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Publish to DigiFusion /terms'; }
    }
  }

  /* ── SHIPPING ─────────────────────────────────────────────────── */
  async function saveShipping () {
    const method        = document.getElementById('shipMethod')?.value?.trim()        || '';
    const leadTime      = parseInt(document.getElementById('shipLeadTime')?.value || '0', 10);
    const flatRate      = parseFloat(document.getElementById('shipFlatRate')?.value || '0');
    const freeThreshold = parseFloat(document.getElementById('shipFreeThreshold')?.value || '0');
    const zonesRaw      = document.getElementById('shipZones')?.value?.trim()         || '';

    const rules = zonesRaw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const [region, rateStr] = line.split('=').map(s => s.trim());
        const rate = parseFloat(rateStr) || 0;
        return {
          region:    region || 'Unknown',
          method:    method || 'Standard',
          price_usd: Math.round(rate * 100),
          eta:       `${leadTime || 3}–${(leadTime || 3) + 2} days`,
        };
      });

    if (!rules.length && (method || flatRate)) {
      rules.push({
        region:    'Worldwide',
        method:    method || 'Standard',
        price_usd: Math.round(flatRate * 100),
        eta:       `${leadTime || 3}–${(leadTime || 3) + 2} days`,
      });
    }

    const payload = {
      rules,
      free_threshold_usd: Math.round(freeThreshold * 100),
      notes: `Carrier: ${method || 'Standard'}. Lead time: ${leadTime} days. Digital products ship instantly.`,
    };

    const btn = document.getElementById('shopShippingSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await shopFetch('PUT', '/api/shop/settings/shipping', payload);
      shopToast('Shipping rules saved to DigiFusion ✓', 'success');
    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save shipping rules'; }
    }
  }

  /* ── ANALYTICS ────────────────────────────────────────────────── */
  async function loadAnalytics () {
    const btn = document.getElementById('shopAnalyticsRefresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

    try {
      const data = await shopFetch('GET', '/api/shop/analytics?range=30d');
      if (!data) return;

      const d = data.data || data;

      const revEl  = document.getElementById('shopStatRevenue');
      const ordEl  = document.getElementById('shopStatOrders');
      const aovEl  = document.getElementById('shopStatAov');
      const convEl = document.getElementById('shopStatConv');

      if (revEl)  revEl.textContent  = `$${esc(d.revenue_usd || '0.00')}`;
      if (ordEl)  ordEl.textContent  = String(d.orders_paid || 0);
      if (aovEl)  aovEl.textContent  = `$${esc(d.aov_usd || '0.00')}`;
      if (convEl) convEl.textContent = '—';

      const byCurrency = d.revenue_by_currency || {};
      const currencies = Object.keys(byCurrency);
      if (currencies.length > 1) {
        const emptyEl = document.querySelector('#tab-shop-analytics .shop-empty p');
        if (emptyEl) {
          emptyEl.textContent = `Revenue breakdown: ${currencies.map(c => `${c} ${(byCurrency[c] / 100).toFixed(2)}`).join(' · ')}`;
        }
      }

      shopToast('Analytics loaded', 'success');
    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh analytics'; }
    }
  }

  /* ── PRODUCTS & SERVICES ──────────────────────────────────────── */
  let allProducts = [];

  function slugify (s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  }

  function fmtPrice (product) {
    const prices   = product.prices || {};
    const currency = Object.keys(prices)[0] || product.currency || 'USD';
    const minor    = prices[currency] ?? product.price_usd ?? (product.price ? product.price * 100 : 0);
    const major    = minor / 100;
    if (major === 0) return 'Free';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(major); }
    catch { return `${currency} ${Number(major).toFixed(2)}`; }
  }

  async function loadProducts () {
    const wrap           = document.getElementById('shopProductsTable');
    const search         = document.getElementById('shopProductSearch');
    const categoryFilter = document.getElementById('shopProductCategory');
    const statusFilter   = document.getElementById('shopProductStatus');

    const searchVal   = search?.value?.trim().toLowerCase() || '';
    const categoryVal = categoryFilter?.value || '';
    const statusVal   = statusFilter?.value   || '';

    try {
      const params = new URLSearchParams();
      if (categoryVal) params.set('category', categoryVal);
      if (statusVal)   params.set('active', statusVal === 'active' ? 'true' : 'false');
      const res  = await fetch(`${getBackendUrl()}/api/shop/products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw   = data.data?.products ?? data.data ?? data.products ?? data;
      allProducts = Array.isArray(raw) ? raw : [];

      const filtered = allProducts.filter(p => {
        if (searchVal && !(p.name || '').toLowerCase().includes(searchVal)) return false;
        if (statusVal === 'active'   && p.active === false) return false;
        if (statusVal === 'archived' && p.active !== false) return false;
        return true;
      });

      if (wrap) renderProductsTable(filtered, wrap);
    } catch (e) {
      shopToast(e.message, 'error');
      if (wrap) wrap.innerHTML = `<div class="shop-empty"><p style="color:var(--red)">Error: ${esc(e.message)}</p></div>`;
    }
  }

  /* ── Product detail panel ─────────────────────────────────── */
  let detailProduct = null;

  function openProductDetail (product) {
    detailProduct = product;
    const overlay = document.getElementById('prodDetailOverlay');
    const panel   = document.getElementById('prodDetailPanel');
    const nameEl  = document.getElementById('prodDetailName');
    const slugEl  = document.getElementById('prodDetailSlug');
    const badgeEl = document.getElementById('prodDetailBadge');
    const editBtn = document.getElementById('prodDetailEditBtn');
    const bodyEl  = document.getElementById('prodDetailBody');
    if (!overlay || !panel || !bodyEl) return;

    const categoryLabel = {
      'field-guide': '📗 Field Guide', 'playbook': '⚡ Playbook',
      'research': '🔍 Research',       'tool': '🔧 Tool',
      'saas': '☁️ SaaS',               'service': '🤝 Service', 'bundle': '📦 Bundle',
    };
    const typeLabel = {
      'download': '⬇️ Download', 'subscription': '🔄 Subscription',
      'service':  '📞 Service',  'saas': '☁️ SaaS',
    };

    if (nameEl)  nameEl.textContent  = product.name || 'Untitled';
    if (slugEl)  slugEl.textContent  = product.slug ? `/${product.slug}` : '';
    if (badgeEl) badgeEl.textContent = categoryLabel[product.category] || product.category || '';

    const price    = fmtPrice(product);
    const active   = product.active !== false;
    const isVektor = (product.slug || '').toLowerCase().includes('vektor') ||
                     (product.name || '').toLowerCase().includes('vektor');

    const coverHtml      = product.cover_image_url
      ? `<img src="${esc(product.cover_image_url)}" class="prod-detail-cover" alt="Cover">` : '';
    const fulfillmentStr = product.fulfillment && Object.keys(product.fulfillment).length
      ? JSON.stringify(product.fulfillment, null, 2) : null;

    bodyEl.innerHTML = `
      ${coverHtml}
      <div class="prod-detail-meta">
        <div class="prod-detail-field"><label>Price</label><div class="val">${price}</div></div>
        <div class="prod-detail-field"><label>Status</label><div class="val"><span class="prod-status-pill ${active ? 'active' : 'archived'}">${active ? 'Active' : 'Archived'}</span></div></div>
        <div class="prod-detail-field"><label>Type</label><div class="val">${typeLabel[product.type] || product.type || '—'}</div></div>
        <div class="prod-detail-field"><label>Featured</label><div class="val">${product.featured ? 'Yes' : 'No'}</div></div>
      </div>
      ${product.description ? `<div><div class="prod-detail-section-title">Description</div><div class="prod-detail-desc">${esc(product.description)}</div></div>` : ''}
      ${fulfillmentStr ? `<div><div class="prod-detail-section-title">Fulfillment metadata</div><pre class="prod-detail-json">${esc(fulfillmentStr)}</pre></div>` : ''}
      ${isVektor ? `
        <div>
          <div class="prod-detail-section-title" style="display:flex;align-items:center;justify-content:space-between">
            Vektor — User management
            <button class="btn-secondary btn-sm" id="vkDetailRefreshBtn">Refresh</button>
          </div>
          <div class="vk-admin-stats" style="padding:0;margin-bottom:14px;grid-template-columns:repeat(4,1fr)">
            <div class="vk-admin-stat"><div class="vk-admin-stat-val" id="vkDetailTotal">—</div><div class="vk-admin-stat-lbl">Total users</div></div>
            <div class="vk-admin-stat"><div class="vk-admin-stat-val gold" id="vkDetailPaid">—</div><div class="vk-admin-stat-lbl">Paid</div></div>
            <div class="vk-admin-stat"><div class="vk-admin-stat-val" id="vkDetailFree">—</div><div class="vk-admin-stat-lbl">Free</div></div>
            <div class="vk-admin-stat"><div class="vk-admin-stat-val green" id="vkDetailMrr">—</div><div class="vk-admin-stat-lbl">MRR</div></div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input type="search" id="vkDetailSearch" placeholder="Search by email…" style="flex:1;height:32px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text-primary);font-size:12px">
            <select id="vkDetailPlanFilter" style="height:32px;padding:0 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text-primary);font-size:12px">
              <option value="">All plans</option>
              <option value="free">Free</option>
              <option value="solo">Solo</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div id="vkDetailUsersWrap">
            <div class="shop-loading"><div class="shop-spinner"></div><p>Loading users…</p></div>
          </div>
        </div>` : ''}
    `;

    if (editBtn) editBtn.onclick = () => { closeProductDetail(); openProductForm(product); };

    if (isVektor) {
      let vkAllUsers = [];

      function renderVkDetailUsers () {
        const wrap      = document.getElementById('vkDetailUsersWrap');
        const searchVal = (document.getElementById('vkDetailSearch')?.value || '').trim().toLowerCase();
        const planVal   = document.getElementById('vkDetailPlanFilter')?.value || '';
        if (!wrap) return;
        const filtered = vkAllUsers.filter(u => {
          if (searchVal && !(u.email || '').toLowerCase().includes(searchVal)) return false;
          if (planVal && (u.plan || 'free') !== planVal) return false;
          return true;
        });
        if (!filtered.length) {
          wrap.innerHTML = '<div style="padding:12px 0;color:var(--text-muted);font-size:12px">No users match the filter.</div>';
          return;
        }
        wrap.innerHTML = `<table class="shop-table" style="font-size:12px">
          <thead><tr><th>Email</th><th>Plan</th><th>Sweeps used</th><th>Joined</th></tr></thead>
          <tbody>${filtered.map(u => `<tr>
            <td style="color:var(--text-secondary)">${esc(u.email || '—')}</td>
            <td><span class="vk-plan-pill ${esc(u.plan || 'free')}">${(u.plan || 'free').toUpperCase()}</span></td>
            <td>${u.sweeps_this_month ?? 0}</td>
            <td style="color:var(--text-muted)">${fmtDate(u.created_at)}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      }

      async function fetchVkDetailUsers () {
        const wrap       = document.getElementById('vkDetailUsersWrap');
        const refreshBtn = document.getElementById('vkDetailRefreshBtn');
        if (wrap) wrap.innerHTML = '<div class="shop-loading"><div class="shop-spinner"></div><p>Loading users…</p></div>';
        if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = 'Loading…'; }
        try {
          const res = await fetch(`${VEKTOR_API}/admin/users`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          vkAllUsers = data.users || data || [];
          const paid = vkAllUsers.filter(u => u.plan && u.plan !== 'free').length;
          const free = vkAllUsers.filter(u => !u.plan || u.plan === 'free').length;
          const mrr  = vkAllUsers.reduce((s, u) => s + (u.plan === 'solo' ? 19 : u.plan === 'pro' ? 39 : 0), 0);
          const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
          set('vkDetailTotal', String(vkAllUsers.length));
          set('vkDetailPaid',  String(paid));
          set('vkDetailFree',  String(free));
          set('vkDetailMrr',   `$${mrr}`);
          renderVkDetailUsers();
        } catch (e) {
          shopToast(e.message, 'error');
          if (wrap) wrap.innerHTML = `<div style="padding:12px 0;color:var(--red);font-size:12px">Error: ${esc(e.message)}</div>`;
        } finally {
          if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh'; }
        }
      }

      fetchVkDetailUsers();
      document.getElementById('vkDetailSearch')?.addEventListener('input', debounceShop(renderVkDetailUsers, 250));
      document.getElementById('vkDetailPlanFilter')?.addEventListener('change', renderVkDetailUsers);
      document.getElementById('vkDetailRefreshBtn')?.addEventListener('click', fetchVkDetailUsers);
    }

    overlay.classList.add('active');
    panel.classList.add('active');
  }

  function closeProductDetail () {
    const overlay = document.getElementById('prodDetailOverlay');
    const panel   = document.getElementById('prodDetailPanel');
    if (overlay) overlay.classList.remove('active');
    if (panel)   panel.classList.remove('active');
    detailProduct = null;
  }

  function renderProductsTable (products, wrap) {
    if (!products.length) {
      wrap.innerHTML = '<div class="shop-empty"><p>No products found. Click <strong>+ Add Product</strong> to create one.</p></div>';
      return;
    }
    const categoryLabel = {
      'field-guide': '📗 Field Guide', 'playbook': '⚡ Playbook',
      'research':    '🔍 Research',    'tool':     '🔧 Tool',
      'saas':        '☁️ SaaS',        'service':  '🤝 Service', 'bundle': '📦 Bundle',
    };
    const typeLabel = {
      'download': '⬇️ Download', 'subscription': '🔄 Subscription',
      'service':  '📞 Service',  'saas': '☁️ SaaS',
    };
    wrap.innerHTML = products.map(p => {
      const catBadge  = categoryLabel[p.category] || p.category || '—';
      const typeBadge = typeLabel[p.type] || p.type || '—';
      const price     = fmtPrice(p);
      const active    = p.active !== false;
      const statusLbl = active ? 'Active' : 'Archived';
      return `<div class="prod-row" data-id="${esc(p.id)}">
        <div style="display:flex;flex-direction:column;gap:3px">
          <span class="prod-type-badge">${catBadge}</span>
          <span class="prod-type-badge" style="opacity:.65;font-size:10px">${typeBadge}</span>
        </div>
        <div class="prod-name">
          <span>${esc(p.name || 'Untitled')}</span>
          ${p.slug ? `<span class="prod-meta">/${esc(p.slug)}</span>` : ''}
          ${p.description ? `<span class="prod-meta" style="font-style:italic;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.description.slice(0,80))}${p.description.length > 80 ? '…' : ''}</span>` : ''}
        </div>
        <span class="prod-price">${price}</span>
        <span class="prod-status-pill ${active ? 'active' : 'archived'}">${statusLbl}</span>
        <div style="display:flex;gap:6px;align-items:center">
          ${active ? `<button class="btn-sm btn-secondary prod-edit-btn" data-id="${esc(p.id)}">Edit</button>` : ''}
          ${active ? `<button class="btn-sm btn-danger prod-archive-btn" data-id="${esc(p.id)}">Archive</button>` : ''}
        </div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.prod-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prod = allProducts.find(p => p.id === btn.dataset.id);
        if (prod) openProductForm(prod);
      });
    });
    wrap.querySelectorAll('.prod-archive-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        archiveProduct(btn.dataset.id);
      });
    });
    wrap.querySelectorAll('.prod-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const prod = allProducts.find(p => p.id === row.dataset.id);
        if (prod) openProductDetail(prod);
      });
    });
  }

  let editingProductId = null;

  function openProductForm (product = null) {
    editingProductId = product?.id || null;
    const overlay = document.getElementById('prodFormOverlay');
    const panel   = document.getElementById('prodFormPanel');
    const title   = document.getElementById('prodFormTitle');
    if (!overlay || !panel) return;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    set('prodFormName',        product?.name || '');
    set('prodFormSlug',        product?.slug || '');
    set('prodFormCategory',    product?.category || '');
    set('prodFormType',        product?.type || 'download');
    set('prodFormStatus',      product?.active !== false ? 'active' : 'draft');
    set('prodFormFeatured',    product?.featured ? 'true' : 'false');
    set('prodFormPrice',       product?.prices?.USD != null ? (product.prices.USD / 100).toFixed(2)
                                : product?.prices?.NGN != null ? (product.prices.NGN / 100).toFixed(2)
                                : product?.price_usd != null ? (product.price_usd / 100).toFixed(2)
                                : (product?.price || ''));
    const firstCurrency = product?.prices ? Object.keys(product.prices)[0] : null;
    set('prodFormCurrency',    firstCurrency || product?.currency || 'USD');
    set('prodFormDesc',        product?.description || '');
    set('prodFormCoverUrl',    product?.cover_image_url || '');
    set('prodFormFulfillment', product?.fulfillment && Object.keys(product.fulfillment).length
                                ? JSON.stringify(product.fulfillment, null, 2) : '');
    if (title) title.textContent = product ? 'Edit Product' : 'Add Product';
    const errEl = document.getElementById('prodFormError');
    if (errEl) { errEl.textContent = ''; errEl.hidden = true; }

    overlay.classList.add('active');
    panel.classList.add('active');
  }

  function closeProductForm () {
    const overlay = document.getElementById('prodFormOverlay');
    const panel   = document.getElementById('prodFormPanel');
    if (overlay) overlay.classList.remove('active');
    if (panel)   panel.classList.remove('active');
    editingProductId = null;
  }

  async function saveProduct (e) {
    e.preventDefault();
    const errEl    = document.getElementById('prodFormError');
    const saveBtn  = document.getElementById('prodFormSave');
    const name     = document.getElementById('prodFormName')?.value.trim();
    const slug     = document.getElementById('prodFormSlug')?.value.trim();
    const category = document.getElementById('prodFormCategory')?.value || null;
    const type     = document.getElementById('prodFormType')?.value || 'download';
    const statusVal= document.getElementById('prodFormStatus')?.value || 'active';
    const featured = document.getElementById('prodFormFeatured')?.value === 'true';
    const priceRaw = parseFloat(document.getElementById('prodFormPrice')?.value || '0');
    const currency = document.getElementById('prodFormCurrency')?.value || 'USD';
    const desc     = document.getElementById('prodFormDesc')?.value.trim() || '';
    const coverUrl = document.getElementById('prodFormCoverUrl')?.value.trim() || null;
    const fulStr   = document.getElementById('prodFormFulfillment')?.value.trim();

    if (!name) {
      if (errEl) { errEl.textContent = 'Product name is required.'; errEl.hidden = false; }
      return;
    }

    let fulfillment = {};
    if (fulStr) {
      try { fulfillment = JSON.parse(fulStr); }
      catch { if (errEl) { errEl.textContent = 'Fulfillment metadata must be valid JSON.'; errEl.hidden = false; } return; }
    }

    const priceMinor = Math.round(priceRaw * 100);
    const prices = priceMinor > 0 ? { [currency]: priceMinor } : {};

    const payload = {
      name, slug: slug || slugify(name), type,
      active: statusVal === 'active', featured, description: desc, prices, fulfillment,
      ...(category ? { category } : {}),
      ...(coverUrl ? { cover_image_url: coverUrl } : {}),
    };

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    if (errEl)   { errEl.textContent = ''; errEl.hidden = true; }

    try {
      const url    = editingProductId
        ? `${getBackendUrl()}/api/shop/products/${editingProductId}`
        : `${getBackendUrl()}/api/shop/products`;
      const method = editingProductId ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      shopToast(editingProductId ? 'Product updated.' : 'Product created.', 'success');
      closeProductForm();
      loadProducts();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
      shopToast(err.message, 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save product'; }
    }
  }

  async function archiveProduct (id) {
    if (!confirm('Archive this product?')) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/shop/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      shopToast('Product archived.', 'success');
      loadProducts();
    } catch (e) { shopToast(e.message, 'error'); }
  }

  let _productsWired = false;
  function wireProducts () {
    if (_productsWired) { loadProducts(); return; }
    _productsWired = true;

    const addBtn = document.getElementById('shopProductAddBtn');
    if (addBtn) addBtn.addEventListener('click', () => openProductForm());

    const overlay = document.getElementById('prodFormOverlay');
    const cancel  = document.getElementById('prodFormCancel');
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProductForm(); });
    if (cancel)  cancel.addEventListener('click', closeProductForm);

    const detailOverlay = document.getElementById('prodDetailOverlay');
    const detailClose   = document.getElementById('prodDetailClose');
    if (detailOverlay) detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeProductDetail(); });
    if (detailClose)   detailClose.addEventListener('click', closeProductDetail);

    const form = document.getElementById('prodFormEl');
    if (form) form.addEventListener('submit', saveProduct);

    const nameEl = document.getElementById('prodFormName');
    const slugEl = document.getElementById('prodFormSlug');
    if (nameEl && slugEl) {
      nameEl.addEventListener('input', () => {
        if (!editingProductId) slugEl.value = slugify(nameEl.value);
      });
    }

    ['shopProductSearch', 'shopProductCategory', 'shopProductStatus'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(id === 'shopProductSearch' ? 'input' : 'change', debounceShop(loadProducts, 300));
    });

    const refreshBtn = document.getElementById('shopProductRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadProducts);

    loadProducts();
  }

  /* ── SITE TRAFFIC ANALYTICS ──────────────────────────────────── */
  async function loadTrafficAnalytics () {
    const range = document.getElementById('shopTrafficRange')?.value || '30d';
    const btn   = document.getElementById('shopTrafficRefresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

    try {
      const res = await fetch(`${getBackendUrl()}/api/shop/analytics/pageviews?range=${range}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();

      const viewEl = document.getElementById('shopStatViews');
      const sessEl = document.getElementById('shopStatSessions');
      if (viewEl) viewEl.textContent = String(d.total_views    || 0);
      if (sessEl) sessEl.textContent = String(d.unique_sessions || 0);

      const pagesWrap = document.getElementById('shopTopPages');
      if (pagesWrap) {
        const pages = d.top_pages || [];
        pagesWrap.innerHTML = pages.length
          ? pages.map(p => `<div class="shop-table-row"><span class="dash-slug">${esc(p.path)}</span><span>${p.views} views</span></div>`).join('')
          : '<div class="shop-empty-sm">No page data yet.</div>';
      }

      const refWrap = document.getElementById('shopTopReferrers');
      if (refWrap) {
        const refs = d.top_referrers || [];
        refWrap.innerHTML = refs.length
          ? refs.map(r => `<div class="shop-table-row"><span>${esc(r.referrer || '(direct)')}</span><span>${r.views} views</span></div>`).join('')
          : '<div class="shop-empty-sm">No referrer data yet.</div>';
      }

      const chartWrap = document.getElementById('shopDailyChart');
      if (chartWrap) {
        const days = d.daily_views || [];
        const max  = Math.max(...days.map(d => d.views), 1);
        chartWrap.innerHTML = `<div class="spark-chart">${days.map(day => {
          const pct = Math.round((day.views / max) * 100);
          return `<div class="spark-bar" style="height:${pct}%" title="${day.date}: ${day.views} views"></div>`;
        }).join('')}</div>`;
      }

      shopToast('Traffic loaded', 'success');
    } catch (e) {
      shopToast(e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
    }
  }

  /* ── VEKTOR USERS ─────────────────────────────────────────────── */
  const VEKTOR_API = 'https://vektor-xr-1.onrender.com';
  let allVektorUsers = [];

  async function loadVektorUsers () {
    const wrap    = document.getElementById('vektorUsersTable');
    const btn     = document.getElementById('vektorUsersRefresh');
    if (!wrap) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    wrap.innerHTML = '<div class="shop-loading"><div class="shop-spinner"></div><p>Fetching Vektor users…</p></div>';
    try {
      const res = await fetch(`${VEKTOR_API}/admin/users`);
      if (!res.ok) throw new Error(`Vektor API returned ${res.status}`);
      const data = await res.json();
      allVektorUsers = data.users || data || [];
      renderVektorUsers();
    } catch (e) {
      shopToast(e.message, 'error');
      wrap.innerHTML = `<div class="shop-empty"><p style="color:var(--red)">Error: ${esc(e.message)}</p></div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
    }
  }

  function renderVektorUsers () {
    const wrap     = document.getElementById('vektorUsersTable');
    const searchEl = document.getElementById('vektorSearch');
    const planEl   = document.getElementById('vektorPlanFilter');
    if (!wrap) return;

    const searchVal = searchEl?.value?.trim().toLowerCase() || '';
    const planVal   = planEl?.value || '';

    const filtered = allVektorUsers.filter(u => {
      if (searchVal && !(u.email || '').toLowerCase().includes(searchVal)) return false;
      if (planVal && u.plan !== planVal) return false;
      return true;
    });

    const total  = allVektorUsers.length;
    const paid   = allVektorUsers.filter(u => u.plan && u.plan !== 'free').length;
    const free   = allVektorUsers.filter(u => !u.plan || u.plan === 'free').length;
    const mrr    = allVektorUsers.reduce((s, u) => s + (u.plan === 'solo' ? 19 : u.plan === 'pro' ? 39 : 0), 0);
    const sweeps = allVektorUsers.reduce((s, u) => s + (Number(u.sweeps_this_month) || 0), 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('vkStatTotal',  String(total));
    set('vkStatPaid',   String(paid));
    set('vkStatFree',   String(free));
    set('vkStatMrr',    `$${mrr}`);
    set('vkStatSweeps', String(sweeps));

    if (!filtered.length) {
      wrap.innerHTML = '<div class="shop-empty"><p>No users match the current filter.</p></div>';
      return;
    }

    const planLimit = { free: 3, solo: 40, pro: '∞' };
    wrap.innerHTML = `
      <table class="shop-table vk-users-table">
        <thead><tr><th>Email</th><th>Plan</th><th>Sweeps used</th><th>Monthly limit</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(u => {
            const plan  = u.plan || 'free';
            const used  = u.sweeps_this_month ?? 0;
            const limit = planLimit[plan] ?? '—';
            const pct   = typeof limit === 'number' ? Math.min(100, Math.round((used / limit) * 100)) : null;
            return `<tr>
              <td class="mono" style="font-size:12px">${esc(u.email || '—')}</td>
              <td><span class="vk-plan-pill ${esc(plan)}">${esc(plan.toUpperCase())}</span></td>
              <td><div style="display:flex;align-items:center;gap:8px"><span>${used}</span>${pct !== null ? `<div class="vk-sweep-bar"><div class="vk-sweep-fill" style="width:${pct}%;background:${pct >= 90 ? 'var(--red)' : 'var(--gold)'}"></div></div>` : ''}</div></td>
              <td>${limit}</td>
              <td style="font-size:12px;color:var(--text-muted)">${fmtDate(u.created_at)}</td>
              <td class="action-cell">
                ${plan === 'free' ? `<button class="btn-sm btn-primary vk-plan-btn" data-email="${esc(u.email)}" data-plan="solo">→ Solo</button>` : ''}
                ${plan === 'solo' ? `<button class="btn-sm btn-primary vk-plan-btn" data-email="${esc(u.email)}" data-plan="pro">→ Pro</button>` : ''}
                ${plan !== 'free' ? `<button class="btn-sm btn-secondary vk-plan-btn" data-email="${esc(u.email)}" data-plan="free">↓ Free</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('.vk-plan-btn').forEach(b => {
      b.addEventListener('click', async () => {
        const { email, plan } = b.dataset;
        if (!confirm(`Change ${email} → ${plan.toUpperCase()} plan?`)) return;
        b.disabled = true; b.textContent = '…';
        try {
          const r = await fetch(`${VEKTOR_API}/admin/users/plan`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, plan }),
          });
          if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
          shopToast(`${email} moved to ${plan.toUpperCase()} plan.`, 'success');
          const u = allVektorUsers.find(x => x.email === email);
          if (u) u.plan = plan;
          renderVektorUsers();
        } catch (e) {
          shopToast(e.message, 'error');
          b.disabled = false;
          b.textContent = b.dataset.plan === 'free' ? '↓ Free' : `→ ${b.dataset.plan.charAt(0).toUpperCase() + b.dataset.plan.slice(1)}`;
        }
      });
    });
  }

  /* ── DEBOUNCE ─────────────────────────────────────────────────── */
  function debounceShop (fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* ── WIRE SHOP ────────────────────────────────────────────────── */
  function wireShop () {
    const shopShell = document.getElementById('module-shop');
    if (!shopShell) return;

    shopShell.querySelectorAll('.shop-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        shopShell.querySelectorAll('.shop-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const target = btn.dataset.subtab.replace(/^shop-/, '');
        shopShell.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`tab-shop-${target}`);
        if (panel) panel.classList.add('active');
        if (target === 'services')  loadBookings();
        if (target === 'payments')  { loadOrders(); loadSubscriptions(); }
        if (target === 'analytics') loadAnalytics();
        if (target === 'products')  wireProducts();
      });
    });

    document.querySelectorAll('.shop-analytics-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.shop-analytics-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.shop-analytics-pane').forEach(p => p.classList.remove('active'));
        const pane = document.getElementById(`shopAnalyticsPane${btn.dataset.atab.charAt(0).toUpperCase() + btn.dataset.atab.slice(1)}`);
        if (pane) pane.classList.add('active');
        if (btn.dataset.atab === 'traffic') loadTrafficAnalytics();
      });
    });

    document.getElementById('shopTrafficRange')?.addEventListener('change', loadTrafficAnalytics);
    document.getElementById('shopTrafficRefresh')?.addEventListener('click', loadTrafficAnalytics);
    document.getElementById('shopSubsRefresh')?.addEventListener('click', loadSubscriptions);
    document.getElementById('shopBookingsRefresh')?.addEventListener('click', loadBookings);
    document.getElementById('shopPaymentsRefresh')?.addEventListener('click', loadOrders);
    document.getElementById('shopAnalyticsRefresh')?.addEventListener('click', loadAnalytics);
    document.getElementById('shopTcSave')?.addEventListener('click', saveTerms);
    document.getElementById('shopShippingSave')?.addEventListener('click', saveShipping);

    // Wire products on startup — it's the default active tab
    const activeTab  = shopShell.querySelector('.shop-tab.active');
    const initTarget = activeTab?.dataset?.subtab?.replace(/^shop-/, '');
    if (initTarget === 'products') wireProducts();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireShop);
  else wireShop();
})();
