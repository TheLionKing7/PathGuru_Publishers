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

    // Combine all three sections into a single markdown document
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

    // Parse zones textarea: "Country=rate" per line → ShippingRule array
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
          price_usd: Math.round(rate * 100),  // convert to cents
          eta:       `${leadTime || 3}–${(leadTime || 3) + 2} days`,
        };
      });

    // Add a flat-rate default rule if no zones defined
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

      const revEl    = document.getElementById('shopStatRevenue');
      const ordEl    = document.getElementById('shopStatOrders');
      const aovEl    = document.getElementById('shopStatAov');
      const convEl   = document.getElementById('shopStatConv');

      if (revEl) revEl.textContent = `$${esc(d.revenue_usd || '0.00')}`;
      if (ordEl) ordEl.textContent = String(d.orders_paid || 0);
      if (aovEl) aovEl.textContent = `$${esc(d.aov_usd || '0.00')}`;
      if (convEl) convEl.textContent = '—'; // Not computed server-side yet

      // Show per-currency breakdown if mixed currencies
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
    const p = product.price_usd != null ? (product.price_usd / 100) : (product.price || 0);
    const currency = product.currency || 'USD';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(p); }
    catch { return `${currency} ${Number(p).toFixed(2)}`; }
  }

  async function loadProducts () {
    const wrap   = document.getElementById('shopProductsTable');ById('shopProductSearch');
    const typeFilter   = document.getElementById('shopProductType');
    const statusFilter = document.getElementById('shopProductStatus');

    const searchVal = search?.value?.trim().toLowerCase() || '';
    const typeVal   = typeFilter?.value  || '';
    const statusVal = statusFilter?.value || '';

    try {
      const params = new URLSearchParams();
      if (typeVal)   params.set('type',   typeVal);
      if (statusVal) params.set('active', statusVal === 'active' ? 'true' : 'false');
      const res  = await fetch(`${getBackendUrl()}/api/shop/products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      allProducts = (data.data || data.products || data || []);

      const filtered = allProducts.filter(p => {
        if (searchVal && !(p.name || '').toLowerCase().includes(searchVal)) return false;
        if (statusVal === 'active'   && p.status === 'archived') return false;
        if (statusVal === 'archived' && p.status !== 'archived') return false;
        return true;
      });

      if (wrap) renderProductsTable(filtered, wrap);
    } catch (e) {
      shopToast(e.message, 'error');
      if (wrap) wrap.innerHTML = `<div class="shop-empty"><p style="color:var(--red)">Error: ${esc(e.message)}</p></div>`;
    }
  }

  function renderProductsTable (products, wrap) {
    if (!products.length) {
      wrap.innerHTML = '<div class="shop-empty"><p>No products found. Click <strong>+ Add Product</strong> to create one.</p></div>';
      return;
    }
    const typeLabel = { ebook: '📗 eBook', paperback: '📘 Paperback', saas: '☁️ SaaS', course: '🎓 Course', extension: '🔌 Extension', bundle: '📦 Bundle' };
    wrap.innerHTML = products.map(p => {
      const badge   = typeLabel[p.type] || p.type || '—';
      const price   = fmtPrice(p);
      const status  = p.status || 'active';
      const isArch  = status === 'archived';
      return `<div class="prod-row" data-id="${esc(p.id)}">
        <span class="prod-type-badge">${badge}</span>
        <div class="prod-name">
          <span>${esc(p.name || 'Untitled')}</span>
          ${p.slug ? `<span class="prod-meta">/${esc(p.slug)}</span>` : ''}
        </div>
        <span class="prod-price">${price}</span>
        <span class="prod-status-pill ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
        <div style="display:flex;gap:6px;align-items:center">
          ${!isArch ? `<button class="btn-sm btn-secondary prod-edit-btn" data-id="${esc(p.id)}">Edit</button>` : ''}
          ${!isArch ? `<button class="btn-sm btn-danger prod-archive-btn" data-id="${esc(p.id)}">Archive</button>` : ''}
        </div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.prod-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = allProducts.find(p => p.id === btn.dataset.id);
        if (prod) openProductForm(prod);
      });
    });
    wrap.querySelectorAll('.prod-archive-btn').forEach(btn => {
      btn.addEventListener('click', () => archiveProduct(btn.dataset.id));
    });
  }

  let editingProductId = null;

  function openProductForm (product = null) {
    editingProductId = product?.id || null;
    const overlay = document.getElementById('prodFormOverlay');
    const panel   = document.getElementById('prodFormPanel');
    const title   = document.getElementById('prodFormTitle');
    if (!overlay || !panel) return;

    document.getElementById('prodFormName')?.value !== undefined &&
      (document.getElementById('prodFormName').value     = product?.name     || '');
    document.getElementById('prodFormSlug') &&
      (document.getElementById('prodFormSlug').value     = product?.slug     || '');
    document.getElementById('prodFormType') &&
      (document.getElementById('prodFormType').value     = product?.type     || 'ebook');
    document.getElementById('prodFormStatus') &&
      (document.getElementById('prodFormStatus').value   = product?.status   || 'active');
    document.getElementById('prodFormPrice') &&
      (document.getElementById('prodFormPrice').value    = product?.price_usd != null ? (product.price_usd / 100).toFixed(2) : (product?.price || ''));
    document.getElementById('prodFormCurrency') &&
      (document.getElementById('prodFormCurrency').value = product?.currency  || 'USD');
    document.getElementById('prodFormDesc') &&
      (document.getElementById('prodFormDesc').value     = product?.description || '');
    document.getElementById('prodFormVariants') &&
      (document.getElementById('prodFormVariants').value = product?.variants
        ? JSON.stringify(product.variants, null, 2)
        : '');
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
    const errEl = document.getElementById('prodFormError');
    const saveBtn = document.getElementById('prodFormSave');
    const name    = document.getElementById('prodFormName')?.value.trim();
    const slug    = document.getElementById('prodFormSlug')?.value.trim();
    const type    = document.getElementById('prodFormType')?.value;
    const status  = document.getElementById('prodFormStatus')?.value || 'active';
    const priceRaw = parseFloat(document.getElementById('prodFormPrice')?.value || '0');
    const currency = document.getElementById('prodFormCurrency')?.value || 'USD';
    const desc     = document.getElementById('prodFormDesc')?.value.trim() || '';
    const varStr   = document.getElementById('prodFormVariants')?.value.trim();

    if (!name) {
      if (errEl) { errEl.textContent = 'Product name is required.'; errEl.hidden = false; }
      return;
    }

    let variants = null;
    if (varStr) {
      try { variants = JSON.parse(varStr); }
      catch { if (errEl) { errEl.textContent = 'Variants must be valid JSON.'; errEl.hidden = false; } return; }
    }

    const payload = {
      name, slug: slug || slugify(name), type, status,
      price_usd: Math.round(priceRaw * 100), currency,
      description: desc,
      ...(variants ? { variants } : {}),
    };

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    if (errEl) { errEl.textContent = ''; errEl.hidden = true; }

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

  function wireProducts () {
    const addBtn = document.getElementById('shopProductAddBtn');
    if (addBtn) addBtn.addEventListener('click', () => openProductForm());

    const overlay = document.getElementById('prodFormOverlay');
    const cancel  = document.getElementById('prodFormCancel');
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProductForm(); });
    if (cancel)  cancel.addEventListener('click', closeProductForm);

    const form = document.getElementById('prodFormEl');
    if (form) form.addEventListener('submit', saveProduct);

    const nameEl = document.getElementById('prodFormName');
    const slugEl = document.getElementById('prodFormSlug');
    if (nameEl && slugEl) {
      nameEl.addEventListener('input', () => {
        if (!editingProductId) slugEl.value = slugify(nameEl.value);
      });
    }

    ['shopProductSearch', 'shopProductType', 'shopProductStatus'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const ev = id === 'shopProductSearch' ? 'input' : 'change';
        el.addEventListener(ev, debounceShop(loadProducts, 300));
      }
    });

    const refreshBtn = document.getElementById('shopProductRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadProducts);

    loadProducts();
  }

  /* ── SITE TRAFFIC ANALYTICS ──────────────────────────────────── */
  async function loadTrafficAnalytics () {
    const range   = document.getElementById('shopTrafficRange')?.value || '30d';
    const btn     = document.getElementById('shopTrafficRefresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

    try {
      const res  = await fetch(`${getBackendUrl()}/api/shop/analytics/pageviews?range=${range}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d    = await res.json();

      const viewEl = document.getElementById('shopStatViews');
      const sessEl = document.getElementById('shopStatSessions');
      if (viewEl) viewEl.textContent = String(d.total_views   || 0);
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
        const days  = d.daily_views || [];
        const max   = Math.max(...days.map(d => d.views), 1);
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

  /* ── DEBOUNCE ─────────────────────────────────────────────────── */
  function debounceShop (fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* ── WIRE SHOP ──────────────────────────────────────────────────
     Called once on DOMContentLoaded.  Each tab lazily loads its
     data the first time it is activated.
  ──────────────────────────────────────────────────────────────── */
  function wireShop () {
    // Module-level tab switching (module-tab buttons inside module-shop)
    const shopShell = document.getElementById('module-shop');
    if (!shopShell) return;

    // Wires sub-tab switching for all .shop-tab elements
    shopShell.querySelectorAll('.shop-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        shopShell.querySelectorAll('.shop-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const target = btn.dataset.subtab;
        shopShell.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`tab-shop-${target}`);
        if (panel) panel.classList.add('active');
        // Lazy-load on first activation
        if (target === 'subs')       loadSubscriptions();
        if (target === 'bookings')   loadBookings();
        if (target === 'payments')   loadPayments();
        if (target === 'analytics')  loadAnalytics();
        if (target === 'products')   { wireProducts(); }
      });
    });

    // Analytics sub-tabs (Sales vs Site Traffic)
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

    // Traffic range + refresh
    document.getElementById('shopTrafficRange')?.addEventListener('change', loadTrafficAnalytics);
    document.getElementById('shopTrafficRefresh')?.addEventListener('click', loadTrafficAnalytics);

    // Refresh buttons wired statically
    document.getElementById('shopSubsRefresh')?.addEventListener('click', loadSubscriptions);
    document.getElementById('shopBookingsRefresh')?.addEventListener('click', loadBookings);
    document.getElementById('shopPaymentsRefresh')?.addEventListener('click', loadPayments);
    document.getElementById('shopAnalyticsRefresh')?.addEventListener('click', loadAnalytics);

    // T&C save
    document.getElementById('shopTcSave')?.addEventListener('click', saveTerms);

    // Shipping save
    document.getElementById('shopShippingSave')?.addEventListener('click', saveShipping);

    // Wire products tab if it starts active
    const activeTab = shopShell.querySelector('.shop-tab.active');
    if (activeTab?.dataset?.subtab === 'products') wireProducts();
  }

  /* ── esc helper ───────────────────────────────────────────────── */
  function esc (s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireShop);
  else wireShop();
})();
