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

  /* ── Wire all buttons ─────────────────────────────────────────── */
  function wireShopTab () {
    const on = (id, event, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    };

    on('shopSubsRefresh',     'click', loadSubscriptions);
    on('shopBookingsRefresh', 'click', loadBookings);
    on('shopPaymentsRefresh', 'click', loadOrders);
    on('shopTcSave',          'click', saveTerms);
    on('shopShippingSave',    'click', saveShipping);
    on('shopAnalyticsRefresh','click', loadAnalytics);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireShopTab);
  else wireShopTab();

})();
