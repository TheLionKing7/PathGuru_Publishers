/**
 * Nexus ↔ Orion research pipeline — grounded status (no LLM required).
 */

import { getSupabase } from '../supabaseClient.js';
import { listResearchDeliverables } from '../lib/researchDeliverables.js';
import { isNotionConfigured } from './truthGuard.js';

const RESEARCH_QUERY =
  /orion|researcher|nocopo|research\s+(result|report|brief|deliverable|output)|where\s+(is|are)\s+(the\s+)?(research|report|result|brief)|what about the research|research you|deliverable|orion'?s research/i;

const RESEARCH_ACTION =
  /^(?:(?:hey\s+)?(?:nexus|orion)[,:\s-]*)?(?:i\s+(?:want|need)\s+you\s+to|please|can\s+you|could\s+you|go\s+ahead\s+and|have\s+(?:orion|the\s+research\s+agent|the\s+researcher)|let\s+(?:orion|the\s+research\s+agent|the\s+researcher))\b[\s\S]*\b(research|investigate|look\s+into|look\s+up|study|analy[sz]e|compile|gather)\b|^(?:(?:hey\s+)?(?:nexus|orion)[,:\s-]*)?(?:research|investigate|look\s+into|look\s+up|study|analy[sz]e|compile|gather)\b/i;

/** Explicit human instruction to start research, distinct from asking its status. */
export function isResearchActionRequest(text) {
  const raw = String(text || '').trim();
  return Boolean(raw && RESEARCH_ACTION.test(raw));
}

/** Boss asking about Orion research output — not blog approval status. */
export function isResearchStatusQuery(text) {
  const raw = (text || '').trim();
  if (!raw) return false;
  if (isResearchActionRequest(raw)) return false;
  if (RESEARCH_QUERY.test(raw)) return true;
  if (/still waiting/i.test(raw) && /research|orion|report|brief|nocopo|deliverable/i.test(raw)) return true;
  if (/can'?t find/i.test(raw) && /notion/i.test(raw) && /research|orion|report/i.test(raw)) return true;
  return false;
}

async function getPendingResearchTasks(limit = 5) {
  const db = getSupabase();
  if (!db) return [];

  const { data } = await db
    .from('tasks')
    .select('id, title, status, created_at, agent_id, error')
    .eq('type', 'research')
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Grounded research status for Nexus chat.
 */
export async function buildResearchStatusReply(message = '') {
  const lower = (message || '').toLowerCase();
  const [{ items }, pending] = await Promise.all([
    listResearchDeliverables({ limit: 10 }),
    getPendingResearchTasks(),
  ]);

  const withBrief = items.filter((i) => i.brief && String(i.brief).trim().length > 20);
  const ghostComplete = items.filter((i) => i.status === 'completed' && !i.brief);
  const latest = withBrief[0] || null;

  const lines = [];

  if (latest) {
    const excerpt = String(latest.brief).replace(/\s+/g, ' ').slice(0, 400);
    lines.push(`**Latest Orion deliverable** (${latest.qualityGrade || 'n/a'}): *${latest.title?.slice(0, 80) || 'Research'}*`);
    lines.push(`Task \`${String(latest.taskId).slice(0, 8)}…\` — ${latest.completedAt ? new Date(latest.completedAt).toLocaleString() : 'completed'}`);
    lines.push(`Preview: ${excerpt}${latest.brief.length > 400 ? '…' : ''}`);
    if (latest.notionPageId) {
      lines.push(`**Notion:** logged by Nexus — page \`${String(latest.notionPageId).slice(0, 8)}…\` (Tasks DB, Type: research_deliverable).`);
    } else if (isNotionConfigured()) {
      lines.push('**Notion:** brief exists in PathGuru but no Notion pageId yet — backfill runs on hygiene pass.');
    }
    lines.push('Full brief: Agent Console → Orion → Deliverables, or `GET /api/agents/research/deliverables`.');
  } else if (ghostComplete.length) {
    lines.push(`⚠️ ${ghostComplete.length} research task(s) marked **completed** but have **no brief in Supabase** — likely a wiring gap. I will not claim the research is done.`);
    lines.push(`Most recent: "${ghostComplete[0].title?.slice(0, 80)}" (\`${String(ghostComplete[0].taskId).slice(0, 8)}…\`).`);
  } else {
    lines.push('No completed Orion deliverable with a brief in PathGuru right now.');
  }

  if (pending.length) {
    lines.push('');
    lines.push(`**In flight** (${pending.length}):`);
    for (const t of pending.slice(0, 3)) {
      const ageMin = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
      lines.push(`• ${t.title?.slice(0, 70)} — ${t.status} (${ageMin}m) → ${t.agent_id}`);
    }
  }

  if (/notion/i.test(lower)) {
    lines.push('');
    const { getNexusNotionAccessSummary } = await import('./nexusNotionOps.js');
    lines.push(getNexusNotionAccessSummary());
    if (latest?.notionPageId) {
      lines.push(`Latest deliverable Notion page: \`${String(latest.notionPageId).slice(0, 8)}…\``);
    } else if (withBrief.length && isNotionConfigured()) {
      lines.push('Some briefs may not be in Notion yet — hygiene backfill will sync missing entries.');
    }
  }

  return lines.join('\n');
}

/** Compact block for CEO briefings and LIVE SYSTEM STATE. */
export async function buildResearchPipelineBlock() {
  const [{ items }, pending] = await Promise.all([
    listResearchDeliverables({ limit: 8 }),
    getPendingResearchTasks(8),
  ]);

  const withBrief = items.filter((i) => i.brief && String(i.brief).trim().length > 20);
  const withNotion = withBrief.filter((i) => i.notionPageId);
  const ghost = items.filter((i) => i.status === 'completed' && !i.brief);

  const lines = [
    `Deliverables with brief: ${withBrief.length}`,
    `Logged to Notion (Nexus): ${withNotion.length}`,
    `Pending/in-progress research: ${pending.length}`,
    `Ghost completed (no brief): ${ghost.length}`,
  ];

  if (withBrief[0]) {
    lines.push(`Latest: "${withBrief[0].title?.slice(0, 60)}" [${withBrief[0].qualityGrade || 'n/a'}]`);
  }
  if (pending[0]) {
    lines.push(`Oldest pending: "${pending[0].title?.slice(0, 60)}" (${pending[0].status})`);
  }

  return {
    deliverableCount: withBrief.length,
    pendingCount:     pending.length,
    ghostCount:       ghost.length,
    latestTitle:      withBrief[0]?.title || null,
    textBlock:        lines.join(' | '),
  };
}
