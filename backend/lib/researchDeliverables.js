/**
 * Orion research deliverables — persist briefs to Supabase tasks.output + R2.
 *
 * R2 layout:
 *   research_deliverables/manifest.json
 *   research_deliverables/{taskId}.json
 *   research_deliverables/{taskId}-{slug}.md
 */

import { getSupabase } from '../supabaseClient.js';
import { isR2Enabled } from '../cloudflareR2.js';

const MANIFEST_KEY = 'research_deliverables/manifest.json';
const MAX_MANIFEST = 200;

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'research';
}

async function r2Put(key, body, contentType) {
  if (!isR2Enabled()) return null;
  const { uploadResearchAsset } = await import('../cloudflareR2.js');
  return uploadResearchAsset(key, body, contentType);
}

async function r2GetJson(key) {
  if (!isR2Enabled()) return null;
  const { fetchResearchAsset } = await import('../cloudflareR2.js');
  return fetchResearchAsset(key);
}

function buildMarkdown({ instruction, brief, sources, gaps, qualityScore, depth, taskId }) {
  const lines = [
    `# Orion Research Deliverable`,
    ``,
    `**Task ID:** ${taskId}`,
    `**Depth:** ${depth || 'standard'}`,
    qualityScore ? `**Quality:** ${qualityScore.grade} (${qualityScore.score}/100)` : '',
    ``,
    `## Instruction`,
    instruction,
    ``,
    `## Brief`,
    brief || '_No brief generated._',
  ];

  if (sources?.length) {
    lines.push('', '## Sources');
    for (const s of sources) {
      lines.push(`- [${s.title || s.url}](${s.url})`);
    }
  }

  if (gaps?.length) {
    lines.push('', '## Gaps');
    for (const g of gaps) lines.push(`- ${g}`);
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Persist Orion output after research completes.
 * @returns {Promise<{ r2Key?: string, markdownKey?: string }|null>}
 */
export async function persistResearchDeliverable({
  taskId,
  instruction,
  brief,
  rawBrief = null,
  briefGated = false,
  sources = [],
  gaps = [],
  qualityScore = null,
  depth = 'standard',
  forAgent = 'nexus',
  mergedWithKB = false,
  nextSteps = null,
  qualityBadge = null,
  campaign = null,
  workflowSignals = null,
}) {
  const db = getSupabase();
  const slug = slugify(instruction);
  const now = new Date().toISOString();

  const record = {
    taskId,
    slug,
    title: instruction.slice(0, 120),
    instruction,
    brief,
    sources,
    gaps,
    qualityScore,
    depth,
    forAgent,
    mergedWithKB,
    createdAt: now,
  };

  const jsonKey = `research_deliverables/${taskId}.json`;
  const mdKey   = `research_deliverables/${taskId}-${slug}.md`;

  let r2Saved = false;
  try {
    await r2Put(jsonKey, JSON.stringify(record, null, 2), 'application/json');
    await r2Put(mdKey, buildMarkdown({ ...record, taskId }), 'text/markdown');

    const manifest = (await r2GetJson(MANIFEST_KEY)) || [];
    const entry = {
      taskId,
      slug,
      title: record.title,
      depth,
      forAgent,
      qualityGrade: qualityScore?.grade || null,
      createdAt: now,
      jsonKey,
      markdownKey: mdKey,
    };
    const filtered = [entry, ...manifest.filter((m) => m.taskId !== taskId)].slice(0, MAX_MANIFEST);
    await r2Put(MANIFEST_KEY, JSON.stringify(filtered, null, 2), 'application/json');
    r2Saved = true;
  } catch (e) {
    console.warn('[researchDeliverables] R2 save failed:', e.message);
  }

  if (db && taskId) {
    await db.from('tasks').update({
      output: {
        type: 'research_complete',
        brief,
        rawBrief: rawBrief || brief,
        briefGated,
        sources,
        gaps,
        qualityScore,
        qualityBadge,
        nextSteps,
        depth,
        forAgent,
        mergedWithKB,
        instruction,
        campaign,
        workflowSignals,
        deliverable: { jsonKey, markdownKey: mdKey, r2Saved },
      },
      status: 'completed',
      completed_at: now,
    }).eq('id', taskId);
  }

  return { jsonKey, markdownKey: mdKey, r2Saved };
}

/**
 * Persist deliverable + log to Notion via Nexus bridge (verified pageId).
 * Use this instead of persistResearchDeliverable at all completion paths.
 */
export async function completeResearchDeliverable(params) {
  const stored = await persistResearchDeliverable(params);

  if (!params.brief || String(params.brief).trim().length < 20) {
    return { ...stored, notionPageId: null, notionOk: false };
  }

  const { logResearchDeliverableToNotion, attachNotionPageToResearchTask } =
    await import('../skills/nexusNotionOps.js');

  const notionResult = await logResearchDeliverableToNotion({
    taskId:       params.taskId,
    instruction:  params.instruction,
    brief:        params.brief,
    sources:      params.sources,
    gaps:         params.gaps,
    qualityScore: params.qualityScore,
    depth:        params.depth,
    forAgent:     params.forAgent,
  });

  if (notionResult.ok && notionResult.pageId && params.taskId) {
    await attachNotionPageToResearchTask(params.taskId, notionResult.pageId);
  }

  return {
    ...stored,
    notionPageId: notionResult.pageId || null,
    notionOk:     notionResult.ok,
    notionReason: notionResult.reason || null,
  };
}

/** List deliverables from tasks table (primary) with optional R2 manifest merge. */
export async function listResearchDeliverables({ limit = 30, offset = 0 } = {}) {
  const db = getSupabase();
  const items = [];

  if (db) {
    const { data } = await db
      .from('tasks')
      .select('id, title, description, status, output, created_at, completed_at, agent_id')
      .eq('agent_id', 'researcher')
      .eq('type', 'research')
      .in('status', ['completed', 'in_progress', 'failed', 'pending', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    for (const row of data || []) {
      const out = row.output || {};
      items.push({
        taskId:       row.id,
        title:        row.title || out.instruction?.slice(0, 120) || 'Research',
        instruction:  row.description || out.instruction || '',
        status:       row.status,
        brief:        out.brief || null,
        sources:      out.sources || [],
        qualityGrade: out.qualityScore?.grade || null,
        depth:        out.depth || 'standard',
        notionPageId: out.notionPageId || out.deliverable?.notionPageId || null,
        createdAt:    row.created_at,
        completedAt:  row.completed_at,
        deliverable:  out.deliverable || null,
      });
    }
  }

  return { items, total: items.length };
}

/** Fetch a single deliverable by task ID. */
export async function getResearchDeliverable(taskId) {
  const db = getSupabase();
  if (!db) return null;

  const { data } = await db
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('type', 'research')
    .maybeSingle();

  if (!data) return null;

  const out = data.output || {};
  let r2Record = null;
  if (out.deliverable?.jsonKey) {
    try { r2Record = await r2GetJson(out.deliverable.jsonKey); } catch { /* ignore */ }
  }

  return {
    task: data,
    brief:        out.brief || r2Record?.brief || null,
    sources:      out.sources || r2Record?.sources || [],
    gaps:         out.gaps || r2Record?.gaps || [],
    qualityScore: out.qualityScore || r2Record?.qualityScore || null,
    notionPageId: out.notionPageId || out.deliverable?.notionPageId || null,
    deliverable:  out.deliverable || null,
    r2Record,
  };
}
