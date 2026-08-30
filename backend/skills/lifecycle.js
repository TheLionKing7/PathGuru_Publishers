/**
 * The small-business lifecycle — one row per business, gate to outcome.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Every stage of the small-business path had a register and none of them had
 * each other. The gate wrote to `readiness_gate`, the booking form to
 * `intake_submission` and `booking`, the assessment to `assessment_5d` — three
 * tables, three screens, and no way to answer the only question that matters
 * about a funnel: of the people who passed the gate, how many booked, how many
 * were assessed, and how many bought.
 *
 * So this stitches the chain that was already there:
 *
 *     readiness_gate.token
 *       → intake_submission.gate_token   (carried through the booking links)
 *         → booking.intake_id            (stamped by the Calendly receiver)
 *       → assessment_5d.gate_token       (pasted when the assessment starts)
 *
 * ── SMALL BUSINESSES ONLY, BY CONSTRUCTION ──────────────────────────────────
 *
 * The spine is `readiness_gate`, and the gate is only ever served to firms
 * under ten staff — /diagnostic routes everyone else into the twelve-question
 * FrictionIQ instrument instead. So this register cannot accidentally fill up
 * with mid-market prospects; they are a different instrument with a different
 * register, and mixing them would make both counts meaningless.
 *
 * An assessment with no gate token still appears — a client who arrived by
 * introduction rather than through the website is a real small business, and
 * dropping them because the funnel did not produce them would understate the
 * work. They are marked as having entered directly.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 *
 * It does not guess. A row shows what each table actually holds; where a stage
 * has not happened there is a null, not an inference. In particular a gate with
 * no booking is not "lost" — it may be three days old — so nothing here labels
 * an outcome that has not been recorded.
 */

import { getSupabase } from '../supabaseClient.js';
import { reckon } from './assessment5d.js';

const db = () => {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured');
  return c;
};

/** Stages a business can be at, in order. The furthest reached is the stage. */
export const LIFECYCLE = [
  { id: 'declined',  label: 'Declined at the gate', blurb: 'One of the three was missing. The first step was named; they may come back.' },
  { id: 'gated',     label: 'Passed the gate',      blurb: 'Qualified and not yet booked. This is the queue worth working.' },
  { id: 'intake',    label: 'Intake started',       blurb: 'Began the form after the gate — not yet booked.' },
  { id: 'booked',    label: 'Session booked',       blurb: 'A call in the calendar, attributed back to the gate that produced it.' },
  { id: 'assessing', label: 'Assessment running',   blurb: 'Somewhere between Step 1 and Step 5.' },
  { id: 'decided',   label: 'Decided',              blurb: 'Proceed, later, or declined — recorded with the date.' },
  { id: 'outcome',   label: 'Outcome recorded',     blurb: 'Day 90. The field everybody skips and the only one that compounds.' },
];

const ORDER = LIFECYCLE.map((s) => s.id);

export async function loadLifecycle({ limit = 300 } = {}) {
  const c = db();

  /* Four reads, settled rather than chained: a missing or unmigrated table
     should cost that column, not the whole register. */
  const [gates, intakes, bookings, assessments] = await Promise.allSettled([
    c.from('readiness_gate')
      .select('token, created_at, verdict, total, blocked, soft, sector, headcount_band, role, booked_at')
      .order('created_at', { ascending: false }).limit(limit),
    c.from('intake_submission')
      .select('id, gate_token, track, company, contact_name, work_email, lifecycle, booking_ref, booked_at, created_at')
      .not('gate_token', 'is', null).limit(limit),
    c.from('booking')
      .select('intake_id, status, starts_at, event_name').limit(limit),
    c.from('assessment_5d')
      .select('id, gate_token, client_name, sector, country, currency, stage, candidates, band_pct, decision, decided_at, outcome_at, realised_value, created_at')
      .order('created_at', { ascending: false }).limit(limit),
  ]);

  const ok = (r) => (r.status === 'fulfilled' && !r.value.error ? (r.value.data || []) : []);
  const failed = (r) => r.status === 'rejected' || Boolean(r.value?.error);

  const gateRows = ok(gates);
  const intakeRows = ok(intakes);
  const bookingRows = ok(bookings);
  const asmtRows = ok(assessments);

  const intakeByGate = new Map();
  for (const i of intakeRows) if (i.gate_token) intakeByGate.set(i.gate_token, i);
  const bookingByIntake = new Map();
  for (const b of bookingRows) if (b.intake_id) bookingByIntake.set(b.intake_id, b);
  const asmtByGate = new Map();
  for (const a of asmtRows) if (a.gate_token) asmtByGate.set(a.gate_token, a);

  const rows = [];

  for (const g of gateRows) {
    const intake = intakeByGate.get(g.token) || null;
    const booking = intake ? bookingByIntake.get(intake.id) || null : null;
    const asmt = asmtByGate.get(g.token) || null;
    rows.push(rowFor({ gate: g, intake, booking, asmt }));
  }

  /* Assessments that never came through the gate — introductions, referrals,
     the ones you already knew. Real work, and it belongs in the count. */
  for (const a of asmtRows) {
    if (a.gate_token && asmtByGate.get(a.gate_token)) continue;
    rows.push(rowFor({ gate: null, intake: null, booking: null, asmt: a }));
  }

  const byStage = Object.fromEntries(ORDER.map((s) => [s, 0]));
  for (const r of rows) byStage[r.stage] = (byStage[r.stage] || 0) + 1;

  /* The funnel, stated as counts rather than rates. A rate on four rows is
     theatre; the numbers are shown and the reader can divide when there are
     enough of them to mean something. */
  const passed = rows.filter((r) => r.gateVerdict && r.gateVerdict !== 'not-yet').length;
  const booked = rows.filter((r) => r.bookedAt).length;
  const assessed = rows.filter((r) => r.assessmentId).length;
  const proceeded = rows.filter((r) => r.decision === 'proceed').length;

  return {
    rows: rows.sort((x, y) => String(y.lastAt).localeCompare(String(x.lastAt))),
    stages: LIFECYCLE,
    byStage,
    funnel: { took: rows.filter((r) => r.gateVerdict).length, passed, booked, assessed, proceeded },
    /* Ten is the threshold everywhere else in this estate; the client uses it
       to decide whether to show a rate at all. */
    enoughToRate: passed >= 10,
    degraded: {
      gates: failed(gates), intakes: failed(intakes),
      bookings: failed(bookings), assessments: failed(assessments),
    },
  };
}

function rowFor({ gate, intake, booking, asmt }) {
  const finding = asmt ? reckon(asmt) : null;

  const bookedAt = booking?.starts_at || intake?.booked_at || gate?.booked_at || null;

  let stage = 'gated';
  if (gate && gate.verdict === 'not-yet') stage = 'declined';
  if (intake) stage = 'intake';
  if (bookedAt) stage = 'booked';
  if (asmt) stage = 'assessing';
  if (asmt?.decision) stage = 'decided';
  if (asmt?.outcome_at) stage = 'outcome';

  /* A declined gate that later booked anyway is no longer "declined" — the
     furthest stage reached wins, and the verdict stays visible in its own
     column so the decline is not hidden by the progress. */
  if (stage === 'declined' && (intake || bookedAt || asmt)) {
    stage = asmt ? (asmt.outcome_at ? 'outcome' : asmt.decision ? 'decided' : 'assessing')
      : bookedAt ? 'booked' : 'intake';
  }

  const name = asmt?.client_name || intake?.company || intake?.contact_name || null;

  return {
    key: gate?.token || asmt?.id,
    name,
    /* Named only where a person actually gave it. A gate row carries no
       identity at all, by design — see the gate route. */
    anonymous: !name,
    sector: asmt?.sector || gate?.sector || null,
    headcount: gate?.headcount_band || null,
    enteredVia: gate ? 'gate' : 'direct',
    gateToken: gate?.token || asmt?.gate_token || null,
    gateVerdict: gate?.verdict || null,
    gateTotal: gate ? `${gate.total}/6` : null,
    gateBlocked: gate?.blocked || [],
    intakeTrack: intake?.track || null,
    bookedAt,
    bookingStatus: booking?.status || null,
    assessmentId: asmt?.id || null,
    assessmentStage: asmt?.stage || null,
    currency: asmt?.currency || null,
    finding,
    decision: asmt?.decision || null,
    decidedAt: asmt?.decided_at || null,
    outcomeAt: asmt?.outcome_at || null,
    realisedValue: asmt?.realised_value ?? null,
    stage,
    lastAt: asmt?.outcome_at || asmt?.decided_at || asmt?.created_at || bookedAt
      || intake?.created_at || gate?.created_at || null,
  };
}
