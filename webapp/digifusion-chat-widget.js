/**
 * DigiFusion — Assistant Chat Widget
 * ====================================
 * Self-contained embeddable chat widget that connects to the
 * PathGuru backend's DigiFusion Assistant agent.
 *
 * USAGE (vanilla HTML):
 *   <script>
 *     window.DigiFusionChat = { apiBase: 'https://your-pathguru-backend.onrender.com' };
 *   </script>
 *   <script src="digifusion-chat-widget.js" defer></script>
 *
 * USAGE (Next.js): import './digifusion-chat-widget.js' in your _app.js or layout,
 *   OR use the companion DigiFusionChatWidget React component.
 *
 * The widget:
 *  • Floats bottom-right as a chat bubble button
 *  • Opens a full chat panel with conversation history
 *  • Streams messages to/from the Assistant agent
 *  • Shows a Calendly booking button when lead is qualified (score ≥ 4)
 *  • Keeps session state in memory (clears on page refresh — by design)
 */

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const cfg = window.DigiFusionChat || {};
  const API_BASE   = (cfg.apiBase || '').replace(/\/$/, '');
  const CHAT_URL   = `${API_BASE}/api/agents/assistant/chat`;
  const LEAD_URL   = `${API_BASE}/api/agents/assistant/lead`;
  const BRAND_NAME = cfg.brandName || 'DigiFusion';
  const WELCOME    = cfg.welcomeMessage || `Hi there 👋 I'm the ${BRAND_NAME} assistant. What brings you here today?`;

  if (!API_BASE) {
    console.warn('[DigiFusionChat] Set window.DigiFusionChat.apiBase before loading the widget.');
    return;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let isOpen       = false;
  let isLoading    = false;
  let history      = [];           // [{ role: 'user'|'assistant', content }]
  let leadState    = {};
  let sessionId    = `df-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bookingUrl   = null;
  let leadSaved    = false;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const CSS = `
    #df-widget-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 60px; height: 60px; border-radius: 50%;
      background: #0F2460; border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.28);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    #df-widget-btn:hover { transform: scale(1.08); box-shadow: 0 6px 22px rgba(0,0,0,.34); }
    #df-widget-btn svg   { width: 28px; height: 28px; fill: #fff; }

    #df-widget-panel {
      position: fixed; bottom: 96px; right: 24px; z-index: 9999;
      width: 380px; max-width: calc(100vw - 48px);
      height: 520px; max-height: calc(100vh - 120px);
      border-radius: 16px; overflow: hidden;
      background: #fff; display: flex; flex-direction: column;
      box-shadow: 0 8px 40px rgba(0,0,0,.22);
      transform: scale(.9) translateY(16px); opacity: 0;
      pointer-events: none;
      transition: transform .22s cubic-bezier(.34,1.3,.64,1), opacity .18s ease;
    }
    #df-widget-panel.open {
      transform: scale(1) translateY(0); opacity: 1;
      pointer-events: all;
    }

    #df-panel-header {
      background: linear-gradient(135deg, #0F2460 0%, #1A3A8F 100%);
      padding: 16px 18px; display: flex; align-items: center; gap: 12px;
    }
    #df-panel-header .df-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: rgba(255,255,255,.15);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
    }
    #df-panel-header .df-hd-text h4 {
      margin: 0; color: #fff; font-size: 15px; font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #df-panel-header .df-hd-text span {
      font-size: 12px; color: rgba(255,255,255,.7);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #df-close-btn {
      margin-left: auto; background: none; border: none;
      cursor: pointer; color: rgba(255,255,255,.8); font-size: 20px; line-height: 1;
      padding: 4px; border-radius: 6px;
      transition: color .15s, background .15s;
    }
    #df-close-btn:hover { color: #fff; background: rgba(255,255,255,.15); }

    #df-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
      background: #F7F8FC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
    }
    #df-messages::-webkit-scrollbar { width: 4px; }
    #df-messages::-webkit-scrollbar-track { background: transparent; }
    #df-messages::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

    .df-msg { display: flex; flex-direction: column; max-width: 84%; }
    .df-msg.user   { align-self: flex-end; align-items: flex-end; }
    .df-msg.assistant { align-self: flex-start; align-items: flex-start; }

    .df-bubble {
      padding: 10px 14px; border-radius: 16px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
    }
    .df-msg.user .df-bubble {
      background: #0F2460; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .df-msg.assistant .df-bubble {
      background: #fff; color: #1a1a2e;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }

    .df-typing {
      display: flex; align-items: center; gap: 4px;
      padding: 10px 14px; background: #fff;
      border-radius: 16px; border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
      align-self: flex-start;
    }
    .df-typing span {
      width: 7px; height: 7px; background: #aaa; border-radius: 50%;
      animation: df-bounce .9s infinite;
    }
    .df-typing span:nth-child(2) { animation-delay: .15s; }
    .df-typing span:nth-child(3) { animation-delay: .30s; }
    @keyframes df-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

    .df-booking-btn {
      display: inline-flex; align-items: center; gap: 8px;
      margin-top: 8px; padding: 10px 16px;
      background: #F0A500; color: #fff; border: none;
      border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      text-decoration: none;
      transition: background .15s, transform .15s;
    }
    .df-booking-btn:hover { background: #D08F00; transform: translateY(-1px); }

    #df-panel-footer {
      padding: 12px 14px;
      border-top: 1px solid #E8EAF2;
      background: #fff;
      display: flex; gap: 10px; align-items: flex-end;
    }
    #df-input {
      flex: 1; resize: none; border: 1.5px solid #D8DAE8;
      border-radius: 10px; padding: 9px 13px;
      font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      outline: none; max-height: 120px; min-height: 42px;
      transition: border-color .15s;
      line-height: 1.5;
    }
    #df-input:focus { border-color: #0F2460; }
    #df-send-btn {
      width: 42px; height: 42px; border-radius: 10px;
      background: #0F2460; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .15s, transform .15s;
    }
    #df-send-btn:hover { background: #1A3A8F; transform: translateY(-1px); }
    #df-send-btn:disabled { background: #C0C6D8; cursor: not-allowed; transform: none; }
    #df-send-btn svg { width: 18px; height: 18px; fill: #fff; }

    .df-branding {
      text-align: center; font-size: 11px; color: #aaa; padding: 4px 0 2px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .df-branding a { color: inherit; text-decoration: none; }
    .df-branding a:hover { color: #0F2460; }

    @media (max-width: 480px) {
      #df-widget-panel { right: 0; bottom: 0; width: 100vw; height: 100dvh;
        max-width: 100vw; max-height: 100dvh; border-radius: 0; }
      #df-widget-btn   { bottom: 16px; right: 16px; }
    }
  `;

  // ── DOM Builder ────────────────────────────────────────────────────────────

  function buildWidget() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Floating button
    const btn = document.createElement('button');
    btn.id = 'df-widget-btn';
    btn.setAttribute('aria-label', 'Open DigiFusion chat');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 10H6v-2h12v2zm0-3H6V7h12v2z"/>
      </svg>`;
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'df-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `${BRAND_NAME} Assistant`);
    panel.innerHTML = `
      <div id="df-panel-header">
        <div class="df-avatar">🤝</div>
        <div class="df-hd-text">
          <h4>${BRAND_NAME} Assistant</h4>
          <span>Typically replies within seconds</span>
        </div>
        <button id="df-close-btn" aria-label="Close chat">✕</button>
      </div>
      <div id="df-messages"></div>
      <div id="df-panel-footer">
        <textarea id="df-input" placeholder="Type a message…" rows="1"></textarea>
        <button id="df-send-btn" aria-label="Send message">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div class="df-branding">Powered by <a href="https://digifusion.com" target="_blank">${BRAND_NAME}</a></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('df-close-btn').onclick = togglePanel;
    document.getElementById('df-send-btn').onclick  = handleSend;

    const input = document.getElementById('df-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Post welcome message
    appendMessage('assistant', WELCOME);
  }

  // ── Panel toggle ───────────────────────────────────────────────────────────

  function togglePanel() {
    isOpen = !isOpen;
    const panel = document.getElementById('df-widget-panel');
    panel.classList.toggle('open', isOpen);
    if (isOpen) {
      setTimeout(() => document.getElementById('df-input')?.focus(), 250);
      scrollToBottom();
    }
  }

  // ── Message rendering ──────────────────────────────────────────────────────

  function appendMessage(role, text, extras = {}) {
    const container = document.getElementById('df-messages');
    const msg = document.createElement('div');
    msg.className = `df-msg ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'df-bubble';
    bubble.textContent = text;
    msg.appendChild(bubble);

    // Booking button
    if (extras.bookingUrl) {
      const link = document.createElement('a');
      link.className   = 'df-booking-btn';
      link.href        = extras.bookingUrl;
      link.target      = '_blank';
      link.rel         = 'noopener noreferrer';
      link.textContent = '📅 Book a Strategy Session';
      msg.appendChild(link);
    }

    container.appendChild(msg);
    scrollToBottom();
  }

  function showTyping() {
    const container = document.getElementById('df-messages');
    const el = document.createElement('div');
    el.id = 'df-typing';
    el.className = 'df-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(el);
    scrollToBottom();
    return el;
  }

  function removeTyping() {
    document.getElementById('df-typing')?.remove();
  }

  function scrollToBottom() {
    const el = document.getElementById('df-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ── Send handler ───────────────────────────────────────────────────────────

  async function handleSend() {
    if (isLoading) return;
    const input = document.getElementById('df-input');
    const text  = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    appendMessage('user', text);

    history.push({ role: 'user', content: text });
    isLoading = true;

    const sendBtn = document.getElementById('df-send-btn');
    sendBtn.disabled = true;

    const typing = showTyping();

    try {
      const res = await fetch(CHAT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:   text,
          history:   history.slice(-20),  // last 20 turns max
          leadState,
          sessionId,
        }),
      });

      removeTyping();

      if (!res.ok) {
        const e = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${e.slice(0, 100)}`);
      }

      const data = await res.json();

      // Update state
      if (data.leadState)  leadState = data.leadState;
      if (data.bookingUrl) bookingUrl = data.bookingUrl;

      const reply = data.response || '';
      history.push({ role: 'assistant', content: reply });

      // Render reply (with booking button if action is offer_booking)
      appendMessage('assistant', reply, {
        bookingUrl: data.action === 'offer_booking' ? data.bookingUrl : null,
      });

      // Auto-save lead when we have enough info
      if (leadState.email || (data.score >= 2 && !leadSaved)) {
        saveLead();
      }

    } catch (e) {
      removeTyping();
      appendMessage('assistant', "I'm sorry, I'm having a connection issue right now. Please try again in a moment.");
      console.error('[DigiFusionChat] API error:', e.message);
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ── Lead persistence ───────────────────────────────────────────────────────

  function saveLead() {
    if (!LEAD_URL) return;
    fetch(LEAD_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        leadState,
        conversation: history,
        sessionId,
        sourceUrl: window.location.href,
      }),
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.id && !leadState.leadId) {
        leadState = { ...leadState, leadId: data.id };
      }
      leadSaved = true;
    })
    .catch(e => console.warn('[DigiFusionChat] Lead save failed:', e.message));
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }

})();
