/**
 * Nexus-only Notion bridge.
 *
 * Research deliverables and CEO ops sync go through here. Orion and other agents
 * do not write research to Notion directly — Nexus orchestrates and logs proof.
 */

import { notion } from '../notionClient.js';
import { isNotionConfigured } from './truthGuard.js';
import { getSupabase } from '../supabaseClient.js';

const NEXUS_AGENT_NAME = 'Nexus (Digital CEO)';

/** Log Orion research to Notion Tasks DB (Nexus attribution). */
export async function logResearchDeliverableToNotion({
  taskId,
  instruction,
  brief,
  sources = [],
  gaps = [],
  qualityScore = null,
  depth = 'standard',
  forAgent = 'nexus',
} = {}) {
  if (!isNotionConfigured()) {
    return { ok: false, pageId: null, reason: 'notion_not_configured' };
  }

  const pageId = await notion.logResearchDeliverable({
    taskId,
    instruction,
    brief,
    sources,
    gaps,
    qualityScore,
    depth,
    forAgent,
  });

  if (!pageId) {
    return { ok: false, pageId: null, reason: 'notion_write_failed' };
  }

  console.log(`[Nexus→Notion] Research deliverable logged — task ${taskId}, page ${pageId.slice(0, 8)}…`);
  return { ok: true, pageId, reason: null };
}

/** Attach verified Notion pageId to task output after persist. */
export async function attachNotionPageToResearchTask(taskId, pageId) {
  const db = getSupabase();
  if (!db || !taskId || !pageId) return false;

  const { data } = await db.from('tasks').select('output').eq('id', taskId).maybeSingle();
  const out = data?.output || {};

  await db.from('tasks').update({
    output: {
      ...out,
      notionPageId: pageId,
      deliverable: {
        ...(out.deliverable || {}),
        notionPageId: pageId,
      },
    },
    updated_at: new Date().toISOString(),
  }).eq('id', taskId);

  return true;
}

/**
 * Backfill Notion logs for completed research missing notionPageId.
 * Safe to run on a schedule — processes a small batch per pass.
 */
export async function backfillResearchNotionLogs({ limit = 5 } = {}) {
  if (!isNotionConfigured()) return { synced: 0, skipped: 0, reason: 'notion_not_configured' };

  const db = getSupabase();
  if (!db) return { synced: 0, skipped: 0, reason: 'no_db' };

  const { data: rows } = await db
    .from('tasks')
    .select('id, title, description, output')
    .eq('type', 'research')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(40);

  const missing = (rows || []).filter((r) => {
    const brief = r.output?.brief;
    const hasPage = r.output?.notionPageId || r.output?.deliverable?.notionPageId;
    return brief && String(brief).trim().length >= 20 && !hasPage;
  }).slice(0, limit);

  let synced = 0;
  let skipped = 0;

  for (const row of missing) {
    const out = row.output || {};
    const result = await logResearchDeliverableToNotion({
      taskId:       row.id,
      instruction:  out.instruction || row.description || row.title,
      brief:        out.brief,
      sources:      out.sources || [],
      gaps:         out.gaps || [],
      qualityScore: out.qualityScore || null,
      depth:        out.depth || 'standard',
      forAgent:     out.forAgent || 'nexus',
    });

    if (result.ok && result.pageId) {
      await attachNotionPageToResearchTask(row.id, result.pageId);
      synced++;
    } else {
      skipped++;
    }
  }

  return { synced, skipped, batch: missing.length };
}

export function getNexusNotionAccessSummary() {
  if (!isNotionConfigured()) {
    return 'Notion is not configured on this server (NOTION_API_KEY + NOTION_TASKS_DB_ID).';
  }
  return `Notion is connected. **Only Nexus** logs Orion research deliverables to the Tasks DB (${NEXUS_AGENT_NAME}). Other agents use PathGuru storage; Boss finds research in Notion under Type = research_deliverable.`;
}
