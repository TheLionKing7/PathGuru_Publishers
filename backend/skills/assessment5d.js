/**
 * The five-day assessment — PathGuru's side.
 *
 * The register lives in `assessment_5d` in the shared Supabase project, written
 * originally by the digifusion console. This module is the same instrument
 * reached from the operator console people actually sit in, so the two must
 * agree exactly — which is why the reckoning below is a port of
 * digifusion/lib/frictioniq/assessment5d.ts and not a second opinion about it.
 *
 * If you change a rule here, change it there in the same commit. Two
 * implementations of one instrument is how an assessment starts giving two
 * answers depending on which console you opened.
 */

import { getSupabase } from '../supabaseClient.js';
import { routeEngagement } from './engagementRouting.js';

export const STAGES = [
  { id: 'observe', day: 'Day 1', label: 'Observe',
    blurb: 'One recorded call with the person who does the work. Open with "walk me through yesterday" — asking what their problems are gets answered with policy.',
    prompts: [
      'Walk me through yesterday, start to finish.',
      'Which part of that would you not miss?',
      'What have you already tried to automate, and what stopped it?',
      'Who else touches this before it is done?',
      'What happens when it goes wrong?',
    ] },
  { id: 'analyse', day: 'Day 2', label: 'Analyse',
    blurb: 'Every candidate listed, no target count, each through three tests. The number that survives is the finding, not a quota.',
    prompts: [
      'REPEATABLE — weekly or more, on a schedule or a clear trigger?',
      'LEGIBLE — could the rules fit on one page a competent new hire could follow?',
      'BOUNDED — is a wrong output caught before a customer, a regulator or a ledger?',
    ] },
  { id: 'price', day: 'Day 3', label: 'Price the friction',
    blurb: 'Frequency × duration × loaded rate, on the survivors only. Elapsed time, not touch time — the waiting is the cost nobody counts.',
    prompts: [
      'Show the arithmetic in full — a client who can reproduce it will defend it when you are not in the room.',
      'State a range. A point estimate invites an argument about the third decimal that you will lose.',
    ] },
  { id: 'report', day: 'Day 4', label: 'The report',
    blurb: 'Five pages. What we saw in your words, what survived and what did not, ONE first build, what comes after, what to commit.',
    prompts: [
      'Page one is quoted from the transcript. It is the page they believe, because they said it.',
      'Name wave two as the place the curve flattens — in advance.',
      'Tools named last, and only for steps that passed all three tests.',
    ] },
  { id: 'decide', day: 'Day 5', label: 'Decide',
    blurb: 'Thirty minutes, live, screen shared. Never send the pack ahead — a report read alone converts at a fraction of one walked through.',
    prompts: [
      'Which of these is most urgent for you?',
      'Do you want to build it yourselves, or have it built?',
      'What is your timeline?',
      'Then stop talking. The silence after the third question is doing work.',
    ] },
  { id: 'closed', day: '—', label: 'Closed',
    blurb: 'Outcome recorded at day 90. The field everybody skips and the only one that compounds.',
    prompts: ['Ten of these and you can say what happened in eleven engagements like theirs.'] },
];

export const VERDICTS = [
  { id: 'pass',             label: 'Pass',             meaning: 'Repeatable, legible and bounded. Buildable.' },
  { id: 'fails-repeatable', label: 'Fails repeatable', meaning: 'Noise. Leave it — however annoying it is.' },
  { id: 'fails-legible',    label: 'Fails legible',    meaning: 'Knowledge capture first. Automating a rule that lives in someone’s head encodes a guess and hides it.' },
  { id: 'fails-bounded',    label: 'Fails bounded',    meaning: 'Buildable, but the review step gets designed and priced rather than wished away.' },
  { id: 'unknown',          label: 'Unknown',          meaning: 'The transcript does not say. Name the question to ask — do not guess to complete the table.' },
];

const STAGE_IDS = new Set(STAGES.map((s) => s.id));
const DECISIONS = new Set(['proceed', 'later', 'declined']);

/** Annual cost of one candidate. Zero when any term is missing — never guessed. */
export function annualCost(c) {
  const f = Number(c.frequency_per_week), m = Number(c.minutes_each), r = Number(c.loaded_rate);
  if (![f, m, r].every(Number.isFinite)) return 0;
  if (f <= 0 || m <= 0 || r <= 0) return 0;
  return f * 52 * (m / 60) * r;
}

/** The finding. Port of reckon() in the digifusion lib — keep them identical. */
export function reckon(a) {
  const list = Array.isArray(a.candidates) ? a.candidates : [];
  const survivors = list.filter((c) => c.verdict === 'pass');
  const unknown = list.filter((c) => c.verdict === 'unknown');
  const killed = list.filter((c) => c.verdict !== 'pass' && c.verdict !== 'unknown');

  /* Killed, not merely unasked. `unknown` is excluded deliberately: it means
     the transcript did not say, which is a question to put to the client — and
     rendering it under "killed by" would report a gap in the interview as a
     property of the candidate. */
  const byTest = VERDICTS.filter((v) => v.id !== 'pass' && v.id !== 'unknown')
    .map((v) => ({ verdict: v.id, label: v.label, count: list.filter((c) => c.verdict === v.id).length }))
    .filter((r) => r.count > 0);

  const unpriced = survivors.filter((c) => annualCost(c) === 0);
  const point = survivors.reduce((s, c) => s + annualCost(c), 0);
  const band = Math.min(90, Math.max(0, Number(a.band_pct) || 0)) / 100;

  return {
    listed: list.length,
    survived: survivors.length,
    killed: killed.length,
    unknown: unknown.length,
    byTest,
    low: Math.round(point * (1 - band)),
    high: Math.round(point * (1 + band)),
    priced: survivors.length > 0 && unpriced.length === 0,
    unpriced: unpriced.length,
    /* Null, not zero, when nothing is priced. A ceiling of zero reads as advice;
       "we cannot compute this yet" is a different statement. */
    suggestedCeiling: point > 0 ? Math.round(point * 0.25) : null,
  };
}

/**
 * The verdict is DERIVED from the three tests, in order — the first failure
 * decides it. Never accepted from the caller: a candidate marked Pass with a
 * failed test underneath is the difference between an instrument and a form.
 */
export function verdictFor({ repeatable, legible, bounded }) {
  if (repeatable === false) return 'fails-repeatable';
  if (legible === false) return 'fails-legible';
  if (bounded === false) return 'fails-bounded';
  if (repeatable === null || legible === null || bounded === null) return 'unknown';
  return 'pass';
}

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

export async function listAssessments(limit = 200) {
  const { data, error } = await db()
    .from('assessment_5d').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(normalise);
}

export async function loadAssessment(id) {
  const { data, error } = await db()
    .from('assessment_5d').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalise(data) : null;
}

export async function createAssessment(input) {
  const name = String(input.client_name || '').trim();
  if (!name) throw new Error('a client name is required');
  const { data, error } = await db().from('assessment_5d').insert({
    client_name: name.slice(0, 200),
    sector: input.sector || null,
    headcount_band: input.headcount_band || null,
    revenue_band: input.revenue_band || null,
    country: input.country || null,
    currency: input.currency || 'USD',
    gate_token: input.gate_token || null,
    session_token: input.session_token || null,
    created_by: input.created_by || 'pathguru',
    /* Operating envelope (0027). Spread-not-null so a create survives
       before the migration is applied. */
    ...(input.assigned_agent ? { assigned_agent: input.assigned_agent } : {}),
    ...(input.framework_id ? { framework_id: input.framework_id } : {}),
    ...(input.recommendation ? { recommendation: input.recommendation } : {}),
    ...(input.next_stage ? { next_stage: input.next_stage } : {}),
    ...(input.service_amount === undefined ? {} : { service_amount: input.service_amount }),
    ...(input.service_currency ? { service_currency: input.service_currency } : {}),
  }).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id || null;
}

const PRACTICE_TRACKS = new Set(['ai-automation', 'business-development', 'digital-media']);

function parseWorkstreams(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback ?? [];
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(String(v));
    return Array.isArray(p) ? p : (fallback ?? []);
  } catch { return fallback ?? []; }
}

/**
 * Route a concluded five-day assessment to its service-line agent and framework.
 *
 * The register itself holds no service line — only sector and size. The service
 * line is on the intake row that produced this assessment (via gate_token or
 * session_token), so it is resolved here and the lane defaults to automation
 * when the intake is a segment route or missing: the five-day instrument's
 * whole output is ONE automation first-build.
 */
async function routeAssessment(a) {
  // The assessment's own lane, when the operator categorised the first build.
  let lane = PRACTICE_TRACKS.has(a.track) ? a.track : null;

  // Else the intake's service line (a practice area, not a segment route).
  if (!lane) {
    const token = a.gate_token || a.session_token;
    if (token) {
      const col = a.gate_token ? 'gate_token' : 'session_token';
      const { data } = await db().from('intake_submission').select('track').eq(col, token).maybeSingle();
      if (PRACTICE_TRACKS.has(data?.track)) lane = data.track;
    }
  }

  // No lane known → unassigned, never guessed. A segment route ('small-business')
  // does not carry a practice area, and guessing automation would misroute a
  // BD or media first-build.
  if (!lane) return { track: null, assigned_agent: null, framework_id: null };

  return {
    track: lane,
    ...routeEngagement({ track: lane, segment: 'sme', sector: a.sector, headcountBand: a.headcount_band }),
  };
}

/** One switch, matching the digifusion route's ops exactly. */
export async function applyOp(id, op, body = {}) {
  const a = await loadAssessment(id);
  if (!a) throw new Error('no such assessment');

  const s = (k, max = 500) => (String(body[k] ?? '').trim().slice(0, max) || null);
  const n = (k) => {
    const v = body[k];
    if (v === undefined || v === null || v === '') return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };
  const bool3 = (k) => (body[k] === true || body[k] === 'yes' ? true
    : body[k] === false || body[k] === 'no' ? false : null);

  let patch = null;

  switch (op) {
    case 'stage': {
      if (!STAGE_IDS.has(String(body.stage))) throw new Error('unknown stage');
      patch = { stage: String(body.stage) };
      break;
    }
    case 'observe':
      patch = {
        interviewee: s('interviewee', 120),
        interviewee_role: s('interviewee_role', 120),
        /* http(s) only — a javascript: URL in a field an operator clicks is
           stored XSS wearing a helpful hat. */
        recording_url: /^https?:\/\//i.test(String(body.recording_url || '')) ? s('recording_url') : null,
        observation_note: s('observation_note', 4000),
        observed_at: new Date().toISOString(),
      };
      break;
    case 'candidate': {
      const name = s('name', 200);
      if (!name) throw new Error('a candidate needs a name');
      const repeatable = bool3('repeatable'), legible = bool3('legible'), bounded = bool3('bounded');
      const candidate = {
        name, quote: s('quote', 1000), who: s('who', 120),
        trigger: s('trigger', 200), output: s('output', 200),
        frequency_per_week: n('frequency_per_week'),
        minutes_each: n('minutes_each'),
        loaded_rate: n('loaded_rate'),
        repeatable, legible, bounded,
        verdict: verdictFor({ repeatable, legible, bounded }),
        note: s('note', 1000),
      };
      /* Read-modify-write the whole array. It is small, one operator edits it
         at a time, and a jsonb append that races another append loses one
         silently — on the page that holds the finding. */
      patch = { candidates: [...a.candidates, candidate] };
      break;
    }
    case 'drop': {
      const i = Number(body.index);
      if (!Number.isInteger(i) || i < 0 || i >= a.candidates.length) throw new Error('no such candidate');
      patch = { candidates: a.candidates.filter((_, k) => k !== i) };
      break;
    }
    case 'price': {
      const band = n('band_pct');
      patch = {
        band_pct: band === null ? 30 : Math.min(90, Math.max(0, Math.round(band))),
        rates_note: s('rates_note', 2000),
      };
      break;
    }
    case 'report':
      patch = {
        first_build: s('first_build', 1000),
        first_build_cost: n('first_build_cost'),
        ceiling: n('ceiling'),
        report_note: s('report_note', 8000),
      };
      break;
    case 'decide': {
      if (!DECISIONS.has(String(body.decision))) throw new Error('unknown decision');
      const decision = String(body.decision);
      const now = new Date().toISOString();
      patch = {
        decision,
        decision_note: s('decision_note', 2000),
        decided_at: now,
        delivered_at: now,
      };
      /* Proceed is the promotion step: the assessment becomes a build, so the
         operating envelope is stamped now — owner, framework, next stage — and
         the recommendation defaults to the first build when not already set. */
      if (decision === 'proceed') {
        const route = await routeAssessment(a);
        patch.next_stage = 'build';
        if (route.assigned_agent) patch.assigned_agent = route.assigned_agent;
        if (route.framework_id) patch.framework_id = route.framework_id;
        if (!a.recommendation && a.first_build) patch.recommendation = a.first_build;
        if (!a.service_amount && a.first_build_cost) patch.service_amount = a.first_build_cost;

        /* Promote to the delivery OS — the amount becomes a real contract_value
           on public.engagements, and the register is linked to it. Idempotent:
           an already-promoted assessment is left alone. */
        if (!a.engagement_id) {
          try {
            const { promoteToDelivery } = await import('./promoteToDelivery.js');
            const promoted = await promoteToDelivery('assessment_5d', { ...a, ...patch }, { track: route.track, segment: 'sme' });
            if (promoted?.engagement_id) patch.engagement_id = promoted.engagement_id;
          } catch (e) {
            console.warn('[FiveDay] promote failed — amount stays a note:', e.message);
          }
        }
      }
      break;
    }
    case 'outcome': {
      const realised = n('realised_value');
      patch = {
        outcome_note: s('outcome_note', 2000),
        realised_value: realised,
        outcome_at: new Date().toISOString(),
      };
      /* Close the loop: write a structured outcome so the calibration engine
         learns from it. Derived honestly — delivered only when a positive value
         was realised, declined when the decision says so, stalled otherwise. */
      try {
        const { recordEngagementOutcome } = await import('../harness/godmode/calibration.js');
        const outcome = a.decision === 'declined' ? 'declined'
          : realised != null && realised > 0 ? 'delivered'
          : 'stalled';
        await recordEngagementOutcome({
          engagementId: `assessment-${a.id}`,
          outcome,
          selfScore: null,
          assessorScore: null,
          actualPaybackMonths: null,
          sector: a.sector,
        });
      } catch (e) {
        console.warn('[FiveDay] outcome persist failed:', e.message);
      }
      break;
    }
    case 'reference': {
      const quote = s('quote', 2000);
      const consented = (body.consent === true || body.consent === '1') && Boolean(quote);
      patch = {
        is_public: body.is_public === true || body.is_public === '1',
        reference_quote: quote,
        reference_person: s('person', 120),
        reference_role: s('role', 120),
        /* Cleared when consent is withdrawn, so unticking one box takes the
           quote off the public site rather than relying on somebody also
           remembering to delete the text. */
        reference_consent_at: consented ? new Date().toISOString() : null,
        reference_consent_by: consented ? s('consent_by', 120) : null,
      };
      break;
    }
    case 'operating':
      patch = {
        assigned_agent: s('assigned_agent', 40),
        framework_id: s('framework_id', 60),
        recommendation: s('recommendation', 4000),
        next_stage: s('next_stage', 120),
        service_amount: n('service_amount'),
        service_currency: s('service_currency', 8) || 'USD',
        track: PRACTICE_TRACKS.has(String(body.track || '')) ? String(body.track) : null,
        workstreams: parseWorkstreams(body.workstreams, a.workstreams),
      };
      break;
    default:
      throw new Error(`unknown op "${op}"`);
  }

  const { error } = await db().from('assessment_5d').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return loadAssessment(id);
}

function normalise(a) {
  return {
    ...a,
    candidates: Array.isArray(a.candidates) ? a.candidates : [],
    band_pct: Number.isFinite(Number(a.band_pct)) ? Number(a.band_pct) : 30,
    is_public: Boolean(a.is_public),
    service_currency: a.service_currency || a.currency || 'USD',
  };
}
