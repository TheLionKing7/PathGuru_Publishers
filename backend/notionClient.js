/**
 * DigiFusion Intelligence Network — Notion Client
 * =================================================
 * Lightweight wrapper around the Notion REST API (no npm package required).
 *
 * Requires:
 *   NOTION_API_KEY          — Integration token from notion.so/my-integrations
 *   NOTION_LEADS_DB_ID      — Database for leads / intake submissions
 *   NOTION_CLIENTS_DB_ID    — Database for active client projects
 *   NOTION_EVALUATIONS_DB_ID — Database for post-service evaluations
 *   NOTION_TASKS_DB_ID      — Database for agent task log (optional)
 *
 * Usage:
 *   import { notion } from './notionClient.js';
 *   await notion.createLead({ name, company, challenge, track, score, intake });
 *   await notion.createEvaluation({ clientName, track, responses });
 *   await notion.updateClientStatus(pageId, status);
 */

const NOTION_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';

function headers() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

async function notionFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: headers(),
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Property builders ──────────────────────────────────────────────────────

function title(text)         { return { title: [{ text: { content: String(text || '').slice(0, 2000) } }] }; }
function richText(text)      { return { rich_text: [{ text: { content: String(text || '').slice(0, 2000) } }] }; }
function select(name)        { return { select: { name: String(name || 'Unknown') } }; }
function multiSelect(names)  { return { multi_select: (names || []).map(n => ({ name: String(n) })) }; }
function number(val)         { return { number: typeof val === 'number' ? val : null }; }
function date(d)             { return { date: { start: d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10) } }; }
function checkbox(val)       { return { checkbox: Boolean(val) }; }
function url(href)           { return { url: href || null }; }
function email(addr)         { return { email: addr || null }; }
function phone(num)          { return { phone_number: num || null }; }

// ── Page content helpers ───────────────────────────────────────────────────

function paragraphBlock(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }] },
  };
}

function headingBlock(text, level = 2) {
  const type = `heading_${level}`;
  return {
    object: 'block',
    type,
    [type]: { rich_text: [{ type: 'text', text: { content: String(text).slice(0, 2000) } }] },
  };
}

function dividerBlock() {
  return { object: 'block', type: 'divider', divider: {} };
}

function bulletBlock(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }] },
  };
}

function calloutBlock(text, emoji = '📌') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [{ type: 'text', text: { content: String(text || '').slice(0, 2000) } }],
      icon: { type: 'emoji', emoji },
    },
  };
}

// ── Notion is not configured? return graceful no-op ───────────────────────

function isConfigured() {
  return Boolean(process.env.NOTION_API_KEY);
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════

export const notion = {

  // ── Health check ──────────────────────────────────────────────────────

  async ping() {
    if (!isConfigured()) return { ok: false, reason: 'NOTION_API_KEY not set' };
    try {
      const me = await notionFetch('/users/me');
      const tasksOk = !!process.env.NOTION_TASKS_DB_ID;
      const leadsOk = !!process.env.NOTION_LEADS_DB_ID;
      return {
        ok: true,
        workspace: process.env.NOTION_WORKSPACE_ID || me?.bot?.workspace_name || 'connected',
        tasksDb:  tasksOk,
        leadsDb:  leadsOk,
        clientsDb: !!process.env.NOTION_CLIENTS_DB_ID,
      };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  },

  // ── LEADS & INTAKE ─────────────────────────────────────────────────────

  /**
   * Create or update a lead / intake record in the Notion Leads DB.
   * @param {object} p
   * @param {string} p.name
   * @param {string} p.email
   * @param {string} p.company
   * @param {string} p.track — 'bd' | 'automation' | 'digital_media' | 'general'
   * @param {number} p.score — 0–5 qualification score
   * @param {string} p.status — 'cold' | 'warm' | 'qualified'
   * @param {string} p.challenge
   * @param {string} p.sourceUrl
   * @param {object} p.intake — full intake question/answer map
   * @param {string} p.sessionId
   * @returns {string|null} — Notion page ID of the created record
   */
  async createLead({ name, email, company, track, score, status, challenge, sourceUrl, intake = {}, sessionId } = {}) {
    if (!isConfigured() || !process.env.NOTION_LEADS_DB_ID) return null;

    const trackLabel = { bd: 'Business Development', automation: 'AI Automation & SaaS', digital_media: 'Digital Media', general: 'General Enquiry' }[track] || 'General Enquiry';
    const pageTitle = `${company || name || 'Unknown'} — ${trackLabel}`;

    const intakeSections = Object.entries(intake).map(([q, a]) => [
      headingBlock(q, 3),
      paragraphBlock(a || '—'),
    ]).flat();

    const children = [
      calloutBlock(`Qualification score: ${score || 0}/5 · Status: ${status || 'cold'} · Track: ${trackLabel}`, '🎯'),
      dividerBlock(),
      headingBlock('Business Challenge'),
      paragraphBlock(challenge || '—'),
      dividerBlock(),
      ...(intakeSections.length ? [headingBlock('Intake Responses'), ...intakeSections, dividerBlock()] : []),
      headingBlock('Source'),
      paragraphBlock(sourceUrl || '—'),
    ];

    const trackProp = { BD: 'Business Development', automation: 'AI Automation & SaaS', digital_media: 'Digital Media', general: 'General Enquiry' }[track] || 'General Enquiry';

    try {
      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_LEADS_DB_ID },
        properties: {
          'Name':       title(pageTitle),
          'Company':    richText(company || ''),
          'Email':      email ? { email: email } : richText(''),
          'Track':      select(trackLabel),
          'Score':      number(score || 0),
          'Status':     select(status || 'cold'),
          'Source URL': richText(sourceUrl || ''),
          'Date':       date(new Date()),
        },
        children,
      });
      console.log(`[Notion] Lead created: ${page.id} — ${pageTitle}`);
      return page.id;
    } catch (e) {
      console.error('[Notion] createLead error:', e.message);
      return null;
    }
  },

  // ── POST-SERVICE EVALUATIONS ───────────────────────────────────────────

  /**
   * Save a post-service evaluation to Notion.
   * @param {object} p
   * @param {string} p.clientName
   * @param {string} p.clientId
   * @param {string} p.track — 'bd' | 'automation' | 'digital_media'
   * @param {string} p.evaluatorName
   * @param {string} p.deploymentDate
   * @param {object} p.responses — question → answer map
   * @param {number} p.nps — 0–10
   * @param {string} p.nextBottleneck
   * @param {boolean} p.caseStudyPermission
   */
  async createEvaluation({ clientName, clientId, track, evaluatorName, deploymentDate, responses = {}, nps, nextBottleneck, caseStudyPermission } = {}) {
    if (!isConfigured() || !process.env.NOTION_EVALUATIONS_DB_ID) return null;

    const trackLabel = { bd: 'Business Development', automation: 'AI Automation & SaaS', digital_media: 'Digital Media' }[track] || track;
    const pageTitle = `Evaluation — ${clientName || 'Unknown'} (${trackLabel})`;

    const responseSections = Object.entries(responses).map(([q, a]) => [
      headingBlock(q, 3),
      paragraphBlock(String(a) || '—'),
    ]).flat();

    const children = [
      calloutBlock(`NPS: ${nps ?? '—'}/10 · Track: ${trackLabel} · Case Study: ${caseStudyPermission ? 'Yes' : 'No'}`, '📊'),
      dividerBlock(),
      ...(responseSections.length ? [headingBlock('Evaluation Responses'), ...responseSections, dividerBlock()] : []),
      headingBlock('Next Bottleneck Identified'),
      paragraphBlock(nextBottleneck || '—'),
      dividerBlock(),
      headingBlock('Evaluator'),
      paragraphBlock(evaluatorName || '—'),
    ];

    try {
      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_EVALUATIONS_DB_ID },
        properties: {
          'Name':          title(pageTitle),
          'Client':        richText(clientName || ''),
          'Track':         select(trackLabel),
          'NPS':           number(nps ?? null),
          'Case Study':    checkbox(caseStudyPermission || false),
          'Date':          date(deploymentDate || new Date()),
        },
        children,
      });
      console.log(`[Notion] Evaluation created: ${page.id} — ${pageTitle}`);
      return page.id;
    } catch (e) {
      console.error('[Notion] createEvaluation error:', e.message);
      return null;
    }
  },

  // ── AGENT TASK LOG ─────────────────────────────────────────────────────

  /**
   * Log a completed agent task to Notion (optional audit trail).
   */
  async logTask({ agentId, agentName, taskTitle, taskType, outcome, duration, notes } = {}) {
    if (!isConfigured() || !process.env.NOTION_TASKS_DB_ID) return null;

    try {
      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_TASKS_DB_ID },
        properties: {
          'Name':     title(`[${agentName || agentId}] ${taskTitle || 'Task'}`),
          'Agent':    select(agentName || agentId || 'Unknown'),
          'Type':     select(taskType || 'general'),
          'Outcome':  select(outcome || 'completed'),
          'Date':     date(new Date()),
        },
        children: notes ? [paragraphBlock(notes)] : [],
      });
      return page.id;
    } catch (e) {
      console.warn('[Notion] logTask error (non-critical):', e.message);
      return null;
    }
  },

  // ── CLIENTS ────────────────────────────────────────────────────────────

  /**
   * Create a client project record in Notion when intake is complete and
   * the lead has been passed to a specialist agent.
   */
  async createClientProject({ clientName, company, track, intakePageId, leadId, assignedAgent, status = 'Discovery' } = {}) {
    if (!isConfigured() || !process.env.NOTION_CLIENTS_DB_ID) return null;

    const trackLabel = { bd: 'Business Development', automation: 'AI Automation & SaaS', digital_media: 'Digital Media' }[track] || track;
    const pageTitle = `${company || clientName || 'New Client'} — ${trackLabel}`;

    try {
      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_CLIENTS_DB_ID },
        properties: {
          'Name':           title(pageTitle),
          'Company':        richText(company || ''),
          'Track':          select(trackLabel),
          'Assigned Agent': select(assignedAgent || 'TBD'),
          'Status':         select(status),
          'Date':           date(new Date()),
        },
        children: intakePageId ? [
          calloutBlock(`Intake record: ${intakePageId}`, '📋'),
        ] : [],
      });
      console.log(`[Notion] Client project created: ${page.id} — ${pageTitle}`);
      return page.id;
    } catch (e) {
      console.error('[Notion] createClientProject error:', e.message);
      return null;
    }
  },

  // ── GENERIC QUERY ──────────────────────────────────────────────────────

  async queryDatabase(databaseId, filter = {}, sorts = []) {
    if (!isConfigured() || !databaseId) return [];
    try {
      const body = { page_size: 50 };
      if (Object.keys(filter).length) body.filter = filter;
      if (sorts.length) body.sorts = sorts;
      const result = await notionFetch(`/databases/${databaseId}/query`, 'POST', body);
      return result.results || [];
    } catch (e) {
      console.error('[Notion] queryDatabase error:', e.message);
      return [];
    }
  },

  /** Summarize a Notion DB page for ops dashboards */
  summarizePage (page) {
    const props = page?.properties || {};
    const read = (names) => {
      for (const n of names) {
        const p = props[n];
        if (!p) continue;
        if (p.type === 'title') return p.title?.[0]?.plain_text || '';
        if (p.type === 'rich_text') return p.rich_text?.[0]?.plain_text || '';
        if (p.type === 'select') return p.select?.name || '';
        if (p.type === 'email') return p.email || '';
        if (p.type === 'number') return p.number;
        if (p.type === 'date') return p.date?.start || '';
      }
      return '';
    };
    return {
      id:      page.id,
      url:     page.url,
      name:    read(['Name', 'Title']),
      company: read(['Company']),
      email:   read(['Email']),
      track:   read(['Track']),
      status:  read(['Status']),
      score:   read(['Score']),
      agent:   read(['Assigned Agent']),
      updated: page.last_edited_time,
    };
  },

  async listWorkspaceRecords () {
    if (!isConfigured()) {
      return { configured: false, leads: [], clients: [], reason: 'NOTION_API_KEY not set' };
    }
    const [leadPages, clientPages] = await Promise.all([
      this.queryDatabase(process.env.NOTION_LEADS_DB_ID, {}, [{ timestamp: 'last_edited_time', direction: 'descending' }]),
      this.queryDatabase(process.env.NOTION_CLIENTS_DB_ID, {}, [{ timestamp: 'last_edited_time', direction: 'descending' }]),
    ]);
    return {
      configured: true,
      leads:    leadPages.map(p => this.summarizePage(p)),
      clients:  clientPages.map(p => this.summarizePage(p)),
    };
  },

  async updatePage(pageId, properties = {}) {
    if (!isConfigured()) return null;
    try {
      return await notionFetch(`/pages/${pageId}`, 'PATCH', { properties });
    } catch (e) {
      console.error('[Notion] updatePage error:', e.message);
      return null;
    }
  },
};
