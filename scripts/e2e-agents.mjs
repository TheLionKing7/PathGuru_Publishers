#!/usr/bin/env node
/**
 * DigiFusion Command — Network / agent coordination E2E
 *
 * API: roster status, task CRUD path, Nexus approval probe, optional chat round-trip
 * UI: Network dept → Roster, Tasks, Console chat
 *
 * Usage:
 *   npm run test:agents
 *   npm run test:agents -- --url https://pathguru-publishers.onrender.com
 *   npm run test:agents -- --chat          # include Nexus chat (slow, needs AI keys)
 *   npm run test:agents -- --headed
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
}

const BASE = (flag('--url') || process.env.PATHGURU_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
const WITH_CHAT = args.includes('--chat');
const HEADLESS = !args.includes('--headed');

const taskTitle = `E2E agent wiring ${new Date().toISOString().slice(0, 19)}`;
let taskId = null;

const results = [];
function pass(step, detail = '') {
  results.push({ step, ok: true, detail });
  console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
}
function fail(step, err) {
  const msg = err?.message || String(err);
  results.push({ step, ok: false, detail: msg });
  console.error(`  ✗ ${step} — ${msg}`);
  throw new Error(`${step}: ${msg}`);
}

async function apiJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function runApiChecks() {
  console.log('\n── Agent API bootstrap ──');
  await apiJson('GET', '/ping');
  pass('ping');

  const status = await apiJson('GET', '/api/agents/status');
  const agents = status.agents || status;
  const keys = typeof agents === 'object' ? Object.keys(agents) : [];
  if (!keys.length && !Array.isArray(status?.roster)) {
    fail('agent roster', new Error('GET /api/agents/status returned no agents'));
  }
  pass('agent roster', `${keys.length || 'ok'} agents`);

  const tasks = await apiJson('GET', '/api/agents/tasks?limit=5');
  pass('task list', `${(tasks.tasks || tasks || []).length} recent`);

  try {
    await apiJson('GET', '/api/agents/nexus/approval-status');
    pass('nexus approval-status');
  } catch (e) {
    if (e.status === 404) pass('nexus approval-status', 'endpoint optional');
    else throw e;
  }

  const created = await apiJson('POST', '/api/agents/tasks', {
    title: taskTitle,
    description: 'Automated wiring test — safe to ignore or delete in Supabase',
    priority: 5,
    type: 'general',
  });
  taskId = created.task?.id || created.id;
  if (!taskId) fail('create task', new Error('no task id in response'));
  pass('create task', taskId);

  const one = await apiJson('GET', `/api/agents/tasks/${taskId}`);
  if (!one.title?.includes('E2E agent wiring')) {
    fail('poll task', new Error('task title mismatch'));
  }
  pass('poll task', one.status || 'pending');

  if (WITH_CHAT) {
    console.log('\n── Assistant chat API (slow) ──');
    const chat = await apiJson('POST', '/api/agents/assistant/chat', {
      message: 'E2E ping: reply with exactly OK if you received this.',
    });
    const reply = chat.reply || chat.message || chat.content || '';
    if (!reply || reply.length < 2) fail('nexus chat', new Error('empty reply'));
    pass('assistant chat', reply.slice(0, 80).replace(/\s+/g, ' '));
  } else {
    console.log('  · nexus chat skipped (use --chat to enable)');
  }
}

async function runUiFlow() {
  console.log('\n── Network department UI ──');
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ backendUrl, productId }) => {
    localStorage.setItem('pg_settings', JSON.stringify({ backendUrl }));
    localStorage.setItem('pg_product', productId);
  }, { backendUrl: BASE, productId: 'digifusion' });

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.click('button[data-dept="network"]');
  await page.waitForSelector('#module-agents.module-shell.active', { timeout: 30_000 });
  pass('Network department active');

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/agents/status') && r.ok(), { timeout: 60_000 }),
    page.click('.module-tab[data-subtab="agents-network"]'),
  ]);
  await page.waitForSelector('#tab-agents-network.active', { timeout: 15_000 });
  pass('Agent roster tab', 'GET /api/agents/status');

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/agents/tasks') && r.request().method() === 'GET' && r.ok(), { timeout: 60_000 }),
    page.evaluate(() => window.__pgSetTab?.('agents-tasks', 'agents')),
  ]);
  await page.waitForSelector('#tab-agents-tasks.active', { timeout: 15_000 });
  await page.click('#tasksRefreshBtn');
  await page.waitForFunction(
    () => {
      const body = document.getElementById('tasksTableBody');
      const text = body?.textContent || '';
      return text.includes('E2E agent wiring') && !text.includes('Loading');
    },
    { timeout: 45_000 },
  );
  pass('task visible in UI');

  await page.click('.module-tab[data-subtab="agents-console"]');
  await page.waitForSelector('#tab-agents-console.active', { timeout: 15_000 });
  await page.waitForSelector('.console-nav-agent[data-agent="nexus"]', { timeout: 15_000 });
  await page.click('.console-nav-agent[data-agent="nexus"]');
  await page.waitForSelector('#nexusGoalInput', { timeout: 15_000 });
  pass('Console → Nexus orchestration panel');

  await page.click('.console-nav-agent[data-agent="assistant"]');
  await page.waitForSelector('#chatInput-assistant', { timeout: 15_000 });
  pass('Console → Assistant chat panel');

  if (WITH_CHAT) {
    const ping = 'E2E UI ping — reply OK.';
    const [chatRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/agents/assistant/chat') && r.request().method() === 'POST',
        { timeout: 90_000 },
      ),
      (async () => {
        await page.fill('#chatInput-assistant', ping);
        await page.click('#chatSend-assistant');
      })(),
    ]);
    if (!chatRes.ok()) fail('assistant chat UI', new Error(`HTTP ${chatRes.status()}`));
    await page.waitForSelector('#chatMessages-assistant .chat-bubble--agent', { timeout: 30_000 });
    pass('assistant chat UI', 'assistant bubble rendered');
  }

  await browser.close();
}

async function main() {
  console.log(`Agent coordination E2E\n  Base: ${BASE}\n  Chat: ${WITH_CHAT ? 'yes' : 'no'}`);
  try {
    await runApiChecks();
    await runUiFlow();
  } catch (e) {
    console.error(`\nE2E FAILED: ${e.message}`);
    process.exit(1);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone — ${results.length - failed.length}/${results.length} steps passed`);
  if (taskId) console.log(`  Test task id: ${taskId} (manual cleanup in Supabase if desired)`);
}

main();
