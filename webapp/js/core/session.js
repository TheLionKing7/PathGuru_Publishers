/**
 * The operator login gate.
 *
 * The PathGuru API now denies everything under /api/ without a session, which
 * means the console needs a door. This is it: an overlay that appears when the
 * server says we are not authenticated, and disappears when we are.
 *
 * ── THREE BEHAVIOURS WORTH DEFENDING ──────────────────────────────────────
 *
 * IT DISTINGUISHES "LOCKED" FROM "NOT CONFIGURED". A 401 means wrong password.
 * A 503 means PATHGURU_OPERATOR_PASSWORD was never set on the server, and no
 * password on earth will work until somebody sets it. Showing the same "access
 * denied" for both would send an operator hunting for a password that does not
 * exist.
 *
 * IT REACTS TO EXPIRY, NOT ONLY TO BOOT. Sessions last twelve hours. A console
 * left open overnight will start failing mid-click, and the honest response is
 * to raise the door again rather than to render an error into a table cell.
 * backend.js dispatches pg:unauthorized from any call; this listens.
 *
 * IT DOES NOT STORE THE PASSWORD. Not in localStorage, not in a variable that
 * outlives the submit. The cookie is httpOnly and the server owns the session.
 * A console that keeps the password around to "re-authenticate silently" has
 * just written the password to disk.
 */
(function () {
  'use strict';

  let _shown = false;

  function overlay() {
    return document.getElementById('pgAuthOverlay');
  }

  function show(reason) {
    const el = overlay();
    if (!el) return;
    _shown = true;
    el.hidden = false;
    document.documentElement.classList.add('pg-auth-locked');

    const note = document.getElementById('pgAuthNote');
    if (note) {
      if (reason === 'unconfigured') {
        note.textContent =
          'No operator password is set on the server. Set PATHGURU_OPERATOR_PASSWORD ' +
          '(24+ random characters) and restart — until then the API is closed to everyone, ' +
          'including you. That is the correct failure: this register holds prospect names, ' +
          'emails and phone numbers.';
        note.hidden = false;
      } else if (reason === 'expired') {
        note.textContent = 'Your session expired. Sign in again to continue.';
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    }

    const input = document.getElementById('pgAuthPassword');
    const btn = document.getElementById('pgAuthSubmit');
    const unconfigured = reason === 'unconfigured';
    if (input) { input.disabled = unconfigured; if (!unconfigured) setTimeout(() => input.focus(), 50); }
    if (btn) btn.disabled = unconfigured;
  }

  function hide() {
    const el = overlay();
    if (!el) return;
    _shown = false;
    el.hidden = true;
    document.documentElement.classList.remove('pg-auth-locked');
    const input = document.getElementById('pgAuthPassword');
    if (input) input.value = '';
  }

  function setError(message) {
    const el = document.getElementById('pgAuthError');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  async function submit() {
    const input = document.getElementById('pgAuthPassword');
    const btn = document.getElementById('pgAuthSubmit');
    const password = input?.value || '';
    if (!password) { setError('Enter the operator password.'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    setError('');

    try {
      await window.PathGuruBackend.postJson('/api/auth/login', { password });
      hide();
      // Tell every module to load now that it can. Cheaper and more reliable
      // than each module discovering its own authorisation independently.
      document.dispatchEvent(new CustomEvent('pg:authenticated'));
    } catch (e) {
      setError(e.status === 503
        ? 'The server has no operator password configured.'
        : 'Incorrect password.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    }
  }

  async function checkStatus() {
    try {
      const s = await window.PathGuruBackend.apiFetch('/api/auth/status', { timeoutMs: 8000 });
      if (!s.configured) { show('unconfigured'); return false; }
      if (!s.authenticated) { show(); return false; }
      hide();
      return true;
    } catch {
      // The status endpoint is public, so a failure here means the backend is
      // unreachable — a different problem from being logged out, and worth
      // saying so rather than presenting a password box that cannot work.
      show();
      setError('Cannot reach the backend. Check the Backend URL in Settings.');
      return false;
    }
  }

  function init() {
    document.getElementById('pgAuthSubmit')?.addEventListener('click', submit);
    document.getElementById('pgAuthPassword')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    document.getElementById('pgAuthLogout')?.addEventListener('click', async () => {
      try { await window.PathGuruBackend.postJson('/api/auth/logout', {}); } catch { /* ignore */ }
      show();
    });

    document.addEventListener('pg:unauthorized', (e) => {
      if (_shown) return;
      show(e.detail?.status === 503 ? 'unconfigured' : 'expired');
    });

    checkStatus();
  }

  window.PathGuruSession = { checkStatus, show, hide };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
