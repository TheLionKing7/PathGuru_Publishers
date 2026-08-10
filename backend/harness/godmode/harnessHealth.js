/**
 * DigiFusion Agent Harness — Phase 4, Piece 1: Harness Health Diagnostic
 * =======================================================================
 * Scores an agent estate across 4 dimensions (0–100).
 * Clients pay to move from Opaque to Engineered. This IS the product.
 */
import { getSupabase } from '../../supabaseClient.js';
import { getPerimeterMap, agentsShareNamespace } from '../perimeter.js';

const D = 25; // max per dimension
const BANDS = [
  { id: 'engineered', min: 85, label: 'Engineered', verdict: 'Fully auditable.' },
  { id: 'legible', min: 65, label: 'Legible', verdict: 'Governable, not yet governed.' },
  { id: 'approaching', min: 40, label: 'Approaching', verdict: 'Partial coverage.' },
  { id: 'opaque', min: 0, label: 'Opaque', verdict: 'No governance. 60% column.' },
];

async function scoreTrace() {
  const db = getSupabase();
  if (!db) return { score: 0, max: D, detail: 'No DB' };
  const [t, k] = await Promise.all([
    db.from('agent_traces').select('id', { count: 'exact', head: true }),
    db.from('tasks').select('id', { count: 'exact', head: true }),
  ]);
  const tc = t.count ?? 0, kc = k.count ?? 0;
  if (tc === 0) return { score: 0, max: D, detail: `No traces. ${kc} tasks with zero observability.` };
  const ratio = kc > 0 ? Math.min(tc / kc, 2) : 1;
  return { score: Math.round(Math.min(ratio, 1) * D), max: D, detail: `${tc} traces / ${kc} tasks` };
}

async function scoreVerify() {
  const db = getSupabase();
  if (!db) return { score: 0, max: D, detail: 'No DB' };
  const { data } = await db.from('agent_traces').select('verified').limit(200);
  if (!data?.length) return { score: 0, max: D, detail: 'No trace data.' };
  const v = data.filter(r => r.verified).length, ratio = v / data.length;
  return { score: Math.round(ratio * D), max: D, detail: `${v}/${data.length} verified (${(ratio*100).toFixed(0)}%)` };
}

async function scoreBudget() {
  const db = getSupabase();
  if (!db) return { score: 0, max: D, detail: 'No DB' };
  const { data } = await db.from('agent_budgets').select('status').limit(100);
  if (!data?.length) return { score: 0, max: D, detail: 'No budget records.' };
  const ex = data.filter(r => r.status === 'exceeded').length;
  return { score: Math.round((1 - ex / data.length) * D), max: D, detail: `${data.length} runs, ${ex} exceeded` };
}

async function scorePerimeter() {
  const db = getSupabase();
  if (!db) return { score: 0, max: D, detail: 'No DB' };
  const p = await getPerimeterMap();
  const ids = Object.keys(p);
  if (ids.length < 3) return { score: 0, max: D, detail: `${ids.length} agents — decorrelation impossible.` };
  let shared = 0, total = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) { total++; if (await agentsShareNamespace(ids[i], ids[j])) shared++; }
  const ratio = total > 0 ? 1 - shared / total : 0;
  return { score: Math.round(ratio * D), max: D, detail: `${ids.length} agents, ${shared}/${total} pairs share namespaces` };
}

export async function scoreHarnessHealth() {
  const [trace, verification, budget, perimeter] = await Promise.all([
    scoreTrace(), scoreVerify(), scoreBudget(), scorePerimeter(),
  ]);
  const total = trace.score + verification.score + budget.score + perimeter.score;
  const band = BANDS.find(b => total >= b.min) || BANDS[BANDS.length - 1];
  const dims = { trace, verification, budget, perimeter };
  const blocked = Object.entries(dims).filter(([, d]) => d.score === 0).map(([n]) => n);
  return { total, max: 100, band, dimensions: dims, blocked, capped: blocked.length > 0 && band.id !== 'opaque', summary: band.verdict };
}

export async function getHarnessHealthBand() {
  const h = await scoreHarnessHealth();
  return { total: h.total, band: h.band, capped: h.capped, blocked: h.blocked };
}
