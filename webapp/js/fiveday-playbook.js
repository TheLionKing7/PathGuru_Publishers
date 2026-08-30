/* ══════════════════════════════════════════════════════════════════════════
   THE FIVE-DAY AI ASSESSMENT — the playbook, as data.
   ══════════════════════════════════════════════════════════════════════════

   Verbatim from the published board. Kept as data rather than markup so the
   room can render each band beside the client it is being run on: Step 2's
   card shows the three tests AND that client's candidate list, in one place.

   DO NOT PARAPHRASE WHEN EDITING. The wording is the method — "walk me through
   yesterday" gets behaviour where "what are your problems" gets policy, and
   the difference is the sentence, not the idea. If the board changes, change
   this file to match it and say so in the commit.

   The prices are a starting structure, not a recommendation. The naira column
   is deliberately blank; see the ladder's own note on why.
   ══════════════════════════════════════════════════════════════════════════ */

window.FIVE_DAY_PLAYBOOK = {
  title: 'The Five-Day AI Assessment',

  guarantee: {
    label: 'The guarantee',
    body: "You keep the report either way. If it wasn't worth it, don't pay.",
  },

  lede: 'A paid assessment that is built to be able to find nothing — which is the only reason to believe it when it finds something. One recorded call, three tests, one recommendation, and one number to commit. The assessment is the door; implementation is the room.',

  attribution: "Refined from Corey Ganim's $999 AI Tools Assessment — the four-phase rhythm, the recorded call and the upsell ladder are his. What changed, and why, is on the last band.",

  /* ── The arc ─────────────────────────────────────────────────────────────
     `stage` maps a step onto assessment_5d.stage so the room can show the
     client's own work inside the step card. Step 0 has no stage: the gate is
     its own register (readiness_gate) and is read via gate_token. */
  arc: {
    label: 'The arc',
    sub: 'Six steps · one week elapsed · about six working hours',
    steps: [
      {
        n: 'Step 0', time: '15 min · free', title: 'The Gate', stage: null,
        line: 'Qualify or decline before anyone pays.',
        blocks: [
          { label: 'Ask', items: [
            'One process, weekly, more than one person touching it?',
            'One number that moves if it gets faster or cheaper?',
            'Who signs — and are they on this call?',
          ] },
          { label: 'Out', text: 'A yes, or a named reason for no.' },
          { label: 'Watch', text: 'No process → sell mapping. No number → nobody can tell if you succeeded. No signer → free education.' },
        ],
      },
      {
        n: 'Step 1', time: '45–60 min', title: 'Observe', stage: 'observe',
        line: 'Find out what actually happens, not what the org chart says.',
        blocks: [
          { label: 'Do', items: [
            'Record it — consent asked at the top',
            'Interview the doer, not only the owner',
            'Never both in the room together',
            'Open: “Walk me through yesterday.”',
            'Then: done twice? waited? re-typed? dread on Monday?',
            'Best question: what did you already try, and what stopped it?',
          ] },
          { label: 'Out', text: 'A full recording and transcript.' },
          { label: 'Watch', text: 'Do not pitch. Name a tool and they start performing for it — the rest of the hour is wasted.' },
        ],
      },
      {
        n: 'Step 2', time: '2–3 hrs', title: 'Analyse', stage: 'analyse',
        line: 'List everything, then kill most of it — on the record.',
        blocks: [
          { label: 'Do', items: [
            'Read the transcript yourself first',
            'Then model-assist: list every candidate, no target number',
            'Run each through the three tests',
            'Record which test killed each one',
          ] },
          { label: 'Out', text: 'Two lists: survived, and killed-with-reason.' },
          { label: 'Watch', text: 'If nothing survives, say so. That is a finding, not a failed engagement.' },
        ],
      },
      {
        n: 'Step 3', time: '1 hr', title: 'Price It', stage: 'price',
        line: 'Put a defensible number on the cost of doing nothing.',
        blocks: [
          { label: 'Collect per survivor', items: [
            'Frequency — per week or month',
            'Duration — elapsed, not touch time',
            'Loaded rate — salary + on-costs ÷ productive hours',
          ] },
          { label: 'Formula', formula: 'freq × duration × rate = annual cost of doing nothing' },
          { label: 'Out', text: 'A range, never a point. Arithmetic shown.' },
          { label: 'Watch', text: 'A point estimate invites an argument about the third decimal, and you will lose it.' },
        ],
      },
      {
        n: 'Step 4', time: '2–3 hrs', title: 'The Report', stage: 'report',
        line: 'Five pages. Tools are named last, or not at all.',
        blocks: [
          { label: 'Pages', items: [
            'What we saw — quoted from the transcript',
            'Survived / killed, with the test each failed',
            'Effort × impact matrix — how the one gets chosen',
            'The first build, plus a 4-day quick start',
            'Waves two and three, and where the curve flattens',
            'What to commit — the ceiling',
          ] },
          { label: 'Out', text: 'A document they keep whatever they decide.' },
          { label: 'Watch', text: "Can't pick one first build? Step 2 isn't finished." },
        ],
      },
      {
        n: 'Step 5', time: '30 min', title: 'Decide', stage: 'decide',
        line: 'Live, screen-shared. Never send the pack ahead.',
        blocks: [
          { label: 'Close with three', items: [
            'Which of these is most urgent for you?',
            'Build it yourselves, or have it built?',
            "What's your timeline?",
          ] },
          { label: 'Out', text: "A decision, or a dated reason there isn't one." },
          { label: 'Watch', text: 'After the third question, stop talking. The silence is doing work.' },
        ],
      },
    ],
  },

  /* ── The filter ─────────────────────────────────────────────────────────
     `id` matches the boolean on a candidate, so a failed test in the register
     can be shown against the test that killed it. */
  filter: {
    label: 'The filter',
    sub: 'Every candidate must pass all three. This is what turns an opinion into an assessment.',
    tests: [
      { id: 'repeatable', n: 'Test 1', name: 'Repeatable',
        q: 'Does it run on a schedule or a trigger, at least weekly?',
        fail: "It is noise. Twice a year isn't worth building for, however annoying it is." },
      { id: 'legible', n: 'Test 2', name: 'Legible',
        q: 'Could you write the rules on one page, well enough for a competent new hire to follow?',
        fail: "Knowledge capture first. Automating a rule that lives in one person's head encodes a guess and then hides it." },
      { id: 'bounded', n: 'Test 3', name: 'Bounded',
        q: 'If it produces a wrong output, is that caught before it reaches a customer or a ledger?',
        fail: 'Buildable — but only with a human review step, and you must price the review step rather than wish it away.' },
    ],
  },

  toolchain: {
    label: "The operator's toolchain",
    sub: 'What you run the engagement on — not what you recommend to the client',
    items: [
      { phase: 'Capture', step: 'Step 1', name: 'An AI note-taker',
        line: 'Fathom, or any recorder that produces a clean transcript.',
        note: 'You are buying the transcript, not the summary. Read the transcript; the summary has already thrown away the sentence you needed.' },
      { phase: 'Analyse', step: 'Step 2', name: 'A frontier model',
        line: 'Transcript in, candidate list out — then you run the three tests.',
        watch: 'Never ask it for a fixed number of findings. Ask it to list every candidate and to say plainly when there are few.' },
      { phase: 'Produce', step: 'Step 4', name: 'A report template',
        line: 'One layout you reuse every time, so the work is the thinking, not the formatting.',
        note: 'Same five pages, same order, every engagement. Familiarity is what makes the report readable in ten minutes.' },
      { phase: 'Build', step: 'Upsell', name: 'Connectors & assistants',
        line: 'Zapier or Make for flows; a custom assistant trained on their own material for knowledge work.',
        watch: 'These are named to the client last, and only for steps that passed all three tests.' },
    ],
  },

  commit: {
    label: 'How much to commit',
    sub: 'The page nobody else in this market writes',
    cards: [
      { kicker: 'The rule', title: 'A quarter, and a cap',
        body: "Commit a quarter of your best estimate, and never more than a small stated share of the year's discretionary budget on a first build." },
      { kicker: 'Why', title: "The loss isn't symmetric",
        body: 'Committing too little costs time — gentle, roughly linear. Committing too much costs the programme — and at about twice the right size, more than half of otherwise-sound bets end below where they started.' },
      { kicker: 'The zero', title: 'Missing prerequisite → nothing',
        body: 'No owner, no data, nobody who can decide: the recommended commitment is zero, whatever the arithmetic returns. Telling a client to spend less than they offered is the most persuasive thing in this method.' },
    ],
  },

  ladder: {
    label: 'The ladder',
    sub: 'Each rung is sold by the rung beneath it — never pitched cold',
    head: ['Rung', 'Sold when', 'What it is', 'USD', 'NGN'],
    rows: [
      ['The gate', 'Always', '15 minutes, three questions, qualifies or declines', 'free', 'free'],
      ['Assessment', 'Passed the gate', 'Five days, one recommendation, the matrix, a 4-day quick start', '$999', ''],
      ['Knowledge capture', 'Candidates failed legible', "Get the rules out of people's heads and onto a page", '$1,500 – 3,000', ''],
      ['Process redesign', 'The process is the problem', 'Map current to future, remove the waste before automating it', '$3,000 – 6,000', ''],
      ['First build', 'All three tests passed', 'One workflow end to end, with its review step priced in', '$2,000 – 8,000', ''],
      ['Retainer', 'They want capability, not a project', 'The concierge — standing access, see below', '$1,200 – 2,000 / mo', ''],
    ],
    cards: [
      { kicker: 'Pricing anchor', title: 'Less than one month of the friction it finds',
        body: 'Self-justifying in any currency. If five days cost more than a month of the waste they measure, the client is right to refuse — and you should want them to.' },
      { kicker: 'Why NGN is blank', title: "Don't convert — choose",
        body: 'A converted price is wrong within a month and nobody remembers it was converted. Set round local figures against the anchor, and write the date you set them.' },
      { kicker: 'First three', title: 'Before you have a friction number',
        body: "You can't apply the anchor until you've run one. Price the first three at what you'd be content to receive for five days of your own work, then revise once three real numbers exist." },
    ],
  },

  retainer: {
    label: 'The retainer',
    sub: 'Done-with-you — where the revenue stops being lumpy',
    cards: [
      { kicker: 'The offer', title: 'Standing access, not a project',
        items: [
          'Two 45-minute working calls a month',
          'Async access between calls — voice notes, not a ticket queue',
          'A capped number of business hours, stated in the agreement',
        ],
        note: 'Two calls a month at this price is a high effective hourly rate — and the client pays for availability, which costs you far less than delivery.' },
      { kicker: 'In session', title: 'What you actually do',
        items: [
          'Set up their working environment properly, once',
          'Build one reusable asset per business function',
          "Convert the month's recurring questions into templates",
          "Re-run the three tests on whatever they've since tried",
        ],
        watch: 'Without a standing agenda this becomes unpaid support. Every session must leave an asset behind.' },
      { kicker: 'Feel', title: 'What makes it premium',
        items: [
          'A short onboarding form before call one, so you never spend a paid session on basics',
          'A named shared folder with every recording in it',
          'A one-pager after each call: top three actions before the next',
        ],
        note: 'The one-pager is what gets forwarded internally — and it is what renews the retainer.' },
    ],
  },

  demand: {
    label: 'Where the work comes from',
    sub: 'Ranked by leverage, not by effort',
    rows: [
      { rank: '01', tier: 'Highest', name: 'Advisers & intermediaries',
        line: 'Accountants, auditors, industry bodies, grant-funded advisory programmes.',
        body: "An organisation that advises businesses but doesn't sell to them is a channel, not a client. One conversation reaches every firm on their books — and almost nobody works this channel." },
      { rank: '02', tier: 'Highest', name: 'The gate call as the offer',
        line: 'Advertise the fifteen minutes, not the assessment.',
        body: 'Low commitment to accept, and it does the qualifying for you. The offer and the filter are the same object.' },
      { rank: '03', tier: 'Compounding', name: 'One published assessment',
        line: 'Anonymised, arithmetic shown, killed candidates included.',
        body: 'Showing what you declined is what makes the rest credible. One good one outperforms thirty posts.' },
      { rank: '04', tier: 'Compounding', name: 'Post every finished build',
        line: 'The figure and the period — not the tooling, not the demo.',
        body: 'One a month keeps you in mind without needing a content strategy.' },
      { rank: '05', tier: 'Compounding', name: 'Your network, capped at three',
        line: 'Free, to build the portfolio and find where the method breaks.',
        body: 'Cap it — after the third, charge. A permanently free offer teaches the market what it’s worth.' },
      { rank: '06', tier: 'Direct', name: 'Owners, 10–60 staff',
        line: 'Big enough to have real process, small enough that the person who feels the pain also signs.',
        body: "Ask about the pain, don't pitch. In markets where turning up in person works, it beats email." },
      { rank: '07', tier: 'Direct', name: 'Be the expert in the room',
        line: 'Host a local session, or standing open hours at a co-working space.',
        body: 'Cheap, slow, and it works — but only if you run it on a schedule for a quarter, not once.' },
      { rank: '—', tier: 'Beware', name: 'Volume outreach', beware: true,
        line: 'Mass DMs and cold lists.',
        body: 'It fills the calendar with people who fail the gate. You then either decline them — which teaches you nothing — or take the money and regret it.' },
    ],
  },

  record: {
    label: 'The record',
    sub: 'One row per engagement — or you do your first assessment thirty times',
    head: ['Field', 'Captured', 'What it eventually tells you'],
    rows: [
      ['Sector & headcount', 'Step 0', 'Who this method actually works for'],
      ['Candidates listed / survived / killed', 'Step 2', 'Whether you are filtering or just producing findings'],
      ['Which test killed each one', 'Step 2', 'The most common blocker in your market — and your next product'],
      ['Annual friction, low and high', 'Step 3', 'What to price the assessment at'],
      ['Recommendation and ceiling', 'Step 4', 'Whether your ceilings are too cautious or not cautious enough'],
      ['Bought the next rung?', 'Step 5 + 14d', 'Your real conversion rate. The source quotes ~50% — that is his number, on his market, unaudited. Treat it as a prior until ten of your own rows disagree or confirm it.'],
      ['What was built, and its cost', 'On delivery', 'Whether your build estimates are honest'],
      ['Realised return', 'Day 90', 'Everything. This is the field everyone skips.'],
    ],
    cards: [
      { kicker: 'Threshold', title: 'Ten rows',
        body: 'Below ten it is a sample and should be called one. At ten it starts correcting your own assumptions — including the ones on this board.' },
      { kicker: 'The payoff', title: 'One sentence nobody else can say',
        body: '“In eleven engagements like yours, this is what happened.” Almost nobody in this market can say that honestly. It is worth more than any case study.' },
      { kicker: 'Tooling', title: 'A spreadsheet is enough',
        body: 'Eight columns. Do not build a system for this before you have ten rows in it — that is the same mistake the method exists to stop clients making.' },
    ],
  },

  changed: {
    label: 'Changed from the source model',
    sub: 'The rhythm is theirs · the epistemics are what moved',
    rows: [
      { kind: 'Cut', title: '“identify 5–7 opportunities”',
        body: 'An instrument that always returns five to seven findings is producing, not measuring. The count has to be free to come out at zero.' },
      { kind: 'Cut', title: '“5+ hrs/wk or full refund”',
        body: "A promise about a result you haven't measured, on a business you haven't seen — and it trains you to hunt for hours rather than value. You will always find five hours somewhere." },
      { kind: 'Cut', title: 'tools as the deliverable',
        body: '“3–7 tools” recommends the answer before diagnosing the problem. Tools moved to the last page, and only for steps that passed all three tests.' },
      { kind: 'Added', title: 'the gate',
        body: 'The source starts at the paid call. Most money lost in this business is lost on engagements that should have been declined in the first fifteen minutes.' },
      { kind: 'Added', title: 'the three tests',
        body: 'With a named reason for every candidate killed. The killed list is the most credible page in the report.' },
      { kind: 'Added', title: 'the commitment ceiling',
        body: 'The source says what to do and never how much to commit. That second question is where clients actually lose money.' },
      { kind: 'Added', title: 'the record',
        body: 'Without it, engagement thirty is as uninformed as engagement one, and no claim you make about past results is checkable.' },
      { kind: 'Kept', title: 'the rhythm',
        body: 'Four phases, a recorded call, transcript analysis, the report-then-live-review structure, never sending the pack ahead, and the ladder — the assessment as the door rather than the room.' },
      { kind: 'Kept', title: '“walk me through yesterday”',
        body: 'The best line in the original. It gets behaviour where “what are your problems” gets policy.' },
    ],
  },

  footer: [
    'A five-day engagement method for assessing and implementing AI in an operating business.',
    'Prices are a starting structure, not a recommendation — set the naira column deliberately and date it.',
    'Ten completed records replace every assumption on this board with a measurement. Until then, they are assumptions.',
  ],
};
