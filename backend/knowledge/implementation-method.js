/* ══════════════════════════════════════════════════════════════════════════
   CURATED KNOWLEDGE — running an AI implementation
   ══════════════════════════════════════════════════════════════════════════

   The Synthesizer normally ingests PDFs from R2. This is the other kind of
   source: something read, judged worth keeping, and written down deliberately
   rather than extracted in bulk. It goes in the same table so Nova and every
   other agent reach it through the same query.

   ── WHY IT IS WRITTEN RATHER THAN EXTRACTED ────────────────────────────────

   An LLM pass over the original would produce fluent paraphrase and lose the
   thing that matters: which of these claims is a mechanism we can adopt and
   which is a number from somebody else's market. Every unit below is a
   synthesis in our own words, with `status` on it — `mechanism` for a way of
   working we can use tomorrow, `prior` for a figure that is evidence about the
   author's clients and an assumption about ours.

   ── PROVENANCE ─────────────────────────────────────────────────────────────

   Luke Pierce, founder of Boom Automations: "How to Run the Perfect AI
   Implementation". Four years, 90+ automation and AI implementations, clients
   from $2M service businesses to $100M+ operations. Supplied as text, August
   2026. That n is far larger than ours, which is why it is worth encoding —
   and its market is not ours, which is why nothing here is a fact yet.

   ── HOW AN AGENT SHOULD USE THIS ───────────────────────────────────────────

   Mechanisms may be applied and recommended. Priors may be quoted only with
   their source and their n, and must never be presented as our result. Ten
   completed rows in our own register replace any prior below with a
   measurement; until then they are somebody else's experience, honestly
   labelled.
   ══════════════════════════════════════════════════════════════════════════ */

export const SOURCE_KEY = 'curated/implementation-method-boom-automations';
export const SOURCE_NAME = 'How to Run the Perfect AI Implementation — Luke Pierce (Boom Automations)';
export const DOMAIN = 'automation';

/** Shared provenance, merged into every unit's metadata. */
const PROV = {
  author: 'Luke Pierce',
  org: 'Boom Automations',
  basis: '90+ automation and AI implementations over four years',
  market: 'service businesses from $2M to $100M+ revenue',
  captured: '2026-08-30',
  audited: false,
};

export const UNITS = [
  {
    title: 'Classify every piece of work before automating it: deterministic, judgment, or decision',
    status: 'mechanism',
    relevance_score: 5,
    content: `The failure pattern is adding AI indiscriminately. The remedy is that every piece of work in a future-state design gets classified into exactly one of three categories, and the category decides what builds it.

DETERMINISTIC WORK GETS AN AUTOMATION, WITH NO AI IN IT. If the rule can be written down completely — when a form arrives, create the record, assign the owner, notify the channel — it belongs in a plain automation. Putting a model inside it buys nothing and costs two things: money per run, and unpredictability in something whose whole value is that it runs identically every time. A deterministic step that "usually" produces the same output is a worse step than the one it replaced.

JUDGMENT WORK GETS AN AGENT. Reading an inbound message and working out what kind of request it is, drafting a document from context, answering a question against a knowledge base — anything requiring interpretation or generation. This is where a model earns its cost, because the rule genuinely cannot be written down in advance.

DECISION WORK STAYS WITH A HUMAN, AND THE SYSTEM PREPARES IT. Approving a quote, accepting a client, pricing an exception. The system assembles everything the decision needs and presents it, turning a forty-minute research exercise into a one-minute review. The leverage is in the preparation, not in the decision.

THE PRACTICAL CONSEQUENCE: a meaningful share of what a client assumes needs AI turns out to be deterministic. Discovering that routinely cuts projected build complexity, and it is one of the few findings that makes an engagement cheaper rather than larger.

RELATION TO OUR OWN INSTRUMENTS: this is the same three-way split as our three-ink classifier (green / blue / red). Ours goes further in one respect — it records the reclassification rate, the share of the agent's proposals a human changed — and this source is independent confirmation of the split from a much larger sample.`,
    concepts: ['work classification', 'deterministic automation', 'agent scope', 'human decision rights', 'three-ink map'],
    frameworks: ['Deterministic / judgment / decision', 'Three-ink classification'],
  },

  {
    title: 'Data silos, and why AI makes them more dangerous rather than less',
    status: 'mechanism',
    relevance_score: 5,
    content: `A data silo is any place operational information lives that other systems cannot see: a CRM, a project tool, a shared drive, an inbox used as a database, and most often the spreadsheet one person built years ago that the company quietly depends on.

Silos are not the result of bad decisions. Each department solved its own problem with its own tool at a different point in the company's growth, every purchase made sense in isolation, and years later the same client exists in six systems with six slightly different versions of the truth. Nobody chose that.

THE COST SHOWS UP IN FOUR PATTERNS, and they are worth naming separately because each is measured differently:
  1. RE-ENTRY — the same information typed by hand into two, three or four systems. Every entry is an opportunity for a typo that becomes an hour of untangling downstream.
  2. VERSION CONFLICT — two systems disagree, so a person stops work to determine which is right. That reconciliation repeats per client, per week.
  3. REPORTING LAG — a question that should take thirty seconds takes two days, because answering it means pulling from four sources and reconciling them.
  4. TRIBAL KNOWLEDGE — the most important system is the memory of a few tenured people. The operation stalls when they are away and breaks when they leave.

WHY THIS MATTERS FOR AI SPECIFICALLY: an agent operating on partial context does not announce that it only has a third of the picture. It produces a fluent, confident answer built on a third of the picture. Fragmented data fed into AI generates polished mistakes at scale, which is worse than the manual chaos it replaced, because the manual version at least announced itself.

THEREFORE: silos are found, mapped and consolidated before any interesting AI work. This is the argument for an investigation phase existing at all.`,
    concepts: ['data silos', 'reconciliation cost', 'tribal knowledge', 'context fragmentation', 'confident wrong answers'],
    frameworks: ['Four silo cost patterns'],
  },

  {
    title: 'The founder’s map and the floor map',
    status: 'mechanism',
    relevance_score: 5,
    content: `Every business has two maps. The FOUNDER'S MAP describes how the business is supposed to run. The FLOOR MAP describes how the work actually gets done — including every workaround, every unofficial spreadsheet, and every extra step that exists because of something that broke years ago.

No founder fully understands their own operation. This is not a criticism; it holds at every company assessed.

Systems designed from the founder's map struggle with adoption, because the team feels the mismatch immediately and routes around it. Systems designed from the floor map get used, because they match the work as it happens.

The only way to get the floor map is to go and collect it, which is what an investigation phase is for. Interview the people who DO the work, not only the people who manage it: an ops manager and the coordinator beneath them will describe the same process differently, and the coordinator's version is the accurate one.

RELATION TO OUR OWN INSTRUMENTS: our five-day method already says "interview the doer, not only the owner" and "never both in the room together". This names why, and supplies the vocabulary — founder's map versus floor map — that makes the reason sayable to a client.`,
    concepts: ['floor map', 'founder’s map', 'adoption', 'interview the doer', 'process mapping'],
    frameworks: ['Founder’s map vs floor map'],
  },

  {
    title: 'The investigation interview: a walkthrough, not a survey',
    status: 'mechanism',
    relevance_score: 4,
    content: `Sixty to ninety minutes per person, at least one person per function, run as a walkthrough rather than a questionnaire. The working questions:

  - Walk me through this process from the very beginning to the very end, including the steps that feel too small to mention.
  - Where does information come from when you start, and where does it go when you are done?
  - What do you type or copy by hand more than once?
  - Where does work sit and wait, and who is it waiting on?
  - What do you double-check before you trust a number in a system?
  - What workaround have you built that nobody officially knows about?
  - If volume doubled next quarter, what would break first?

THE LAST QUESTION CONSISTENTLY PRODUCES THE MOST VALUABLE ANSWER of the interview. People know precisely what would break first — they work next to that weakness every day — and in most cases nobody has ever asked them.

FOLLOW UP ASYNCHRONOUSLY TWO DAYS LATER. People reliably remember the important detail afterwards: the step they forgot, the spreadsheet they did not mention, the exception that happens "only sometimes" and turns out to be a fifth of cases. A method built on a single conversation has no other defence against this.

RELATION TO OUR OWN INSTRUMENTS: our five-day Observe step opens with "walk me through yesterday", which this source also keeps as the strongest opening line — it gets behaviour where "what are your problems" gets policy. The volume-doubling question and the 48-hour follow-up are additions worth making.`,
    concepts: ['stakeholder interview', 'walkthrough', 'volume doubling question', 'asynchronous follow-up', 'hidden exceptions'],
    frameworks: ['Seven-question process walkthrough'],
  },

  {
    title: 'Quantify every bottleneck in the client’s own numbers, never an industry average',
    status: 'mechanism',
    relevance_score: 5,
    content: `Every bottleneck identified gets a figure attached, computed from the client's operation rather than from a benchmark. Three terms:

  LABOUR — hours per week on the manual work × the loaded cost of the people doing it × 52.
  ERROR — what a mistake costs when it happens × how often it happens.
  THROUGHPUT — deals that stalled, projects delayed, capacity the team could not take on.

Once a bottleneck carries a verified figure, prioritisation stops being a debate: leadership seeing that one re-entry loop costs tens of thousands a year resolves the argument about what to fix first without anyone having to win it.

RELATION TO OUR OWN INSTRUMENTS: our five-day arithmetic is frequency × duration × loaded rate, which is the labour term alone. The error and throughput terms are missing, and so is the tool-spend term below. Our Friction Tax on the mid-market side already carries four terms with per-term uncertainty, so the gap is on the small-business instrument, not the large one.`,
    concepts: ['pain quantification', 'loaded rate', 'error cost', 'throughput cost', 'prioritisation'],
    frameworks: ['Labour + error + throughput'],
  },

  {
    title: 'The silo inventory and the absorb / keep / kill decision tree',
    status: 'mechanism',
    relevance_score: 5,
    content: `In parallel with interviews, catalogue every place data lives: every tool, spreadsheet, shared-drive folder and inbox acting as a database. For each one record what it holds, who writes to it, who reads from it, what it overlaps with, and what it costs per month.

Then run every item through a three-outcome tree:

  ABSORB — the tool performs a function the new system should own. Rebuild the function, cancel the tool. Project management tools, form builders, internal trackers and reporting add-ons usually land here, and this is where most of the software saving comes from.
  KEEP — the tool is genuinely excellent and worth connecting to rather than replacing. Accounting, email, calendars and regulated industry systems almost always stay. The new system integrates and becomes the layer that makes them behave as one.
  KILL — redundant, barely used, or duplicating something else. Cancel with no rebuild.

Running the tree scopes the build on its own, and it frequently deletes more than it creates, which is not the answer most clients expect.

WHY THIS MATTERS COMMERCIALLY: it produces a quantified saving that does not come from labour hours at all, and it lands next month rather than at day ninety. For a small firm, cancelling three subscriptions is the fastest proof of value available.`,
    concepts: ['silo inventory', 'SaaS consolidation', 'absorb keep kill', 'tool spend', 'scoping'],
    frameworks: ['Absorb / keep / kill'],
  },

  {
    title: 'One write path per entity',
    status: 'mechanism',
    relevance_score: 5,
    content: `Design the schema before screens, automations or agents: identify the core entities of the business — clients, projects, orders, jobs, properties, patients — define the fields each carries and how they relate.

Then the rule that eliminates silos permanently: EVERY PIECE OF DATA HAS EXACTLY ONE PLACE WHERE IT IS CREATED AND ONE PATH THROUGH WHICH IT IS UPDATED. Everything else reads from that source. The moment two systems can both write the same record, the original problem has been rebuilt on newer software.

Enforce it in code rather than in documentation: every automation that writes validates against the schema, so bad data is rejected at the point of entry instead of discovered at the point of reporting.

A NOTE ON WHERE THIS BELONGS: this is a rule for how a system is built, not a filter for deciding what to automate. It should not be added as a fourth test alongside repeatable / legible / bounded — three tests that must all pass is a filter, four is a checklist.`,
    concepts: ['data model', 'single source of truth', 'write path', 'schema validation'],
    frameworks: ['One write path per entity'],
  },

  {
    title: 'Order of operations: data, then workflows, then intelligence',
    status: 'mechanism',
    relevance_score: 5,
    content: `Foundations first. The opening weeks belong to the database — tables, relationships, permissions, views, the single source of truth. It is the least visually impressive stretch of a project and the one everything else depends on. Clients want to see agents in week one; durable systems begin with schema in week one.

Workflows next: intake, routing, approvals, notifications, status changes — the plumbing that moves information without a human touching it.

Agents last, deployed on top of clean workflows and clean data. An agent reading a well-structured database with defined workflows behaves reliably. The same agent on a disorganised operation produces fluent output built on incomplete information, which is harder to catch than an obvious failure.

SEQUENCING IS GATED. Each phase has a defined completion standard and the next does not begin until it is met: no automations layered on an unstable schema, no agents live until the workflows beneath them run cleanly. This looks slower on paper and is dramatically faster in practice, because nobody builds on top of something that is still moving.`,
    concepts: ['order of operations', 'gated sequencing', 'foundations first', 'agents last'],
    frameworks: ['Data → workflows → intelligence'],
  },

  {
    title: 'Migration: three paths, and the two variables that choose between them',
    status: 'mechanism',
    relevance_score: 4,
    content: `The switch from the old way of working to the new one ends more implementations than any technical problem. Companies fail in one of two directions: a heroic full migration nobody needed, or never committing to a date and running two systems indefinitely.

  FULL MIGRATION — historical data cleaned, mapped and backfilled; both systems run in parallel for about a week; a dated cutover; then read-only access before retirement. Right when historical data is operationally critical: client history a support team uses daily, records feeding compliance, financials driving reporting. It is the most expensive path and it is chosen by default far more often than it should be.
  CUTOVER DATE — no mass migration. From a chosen date, every new project, client or order lives in the new system; everything already in motion finishes in the old one, which empties itself and is then cancelled. If the average project runs sixty days, the migration completes itself within one cycle while everyone simply does their jobs.
  HYBRID — what most companies actually need. Reference data migrates (clients, contacts, vendors, catalogues, which have long useful lives); transactional history does not (old projects, tickets, orders finish out or are archived read-only).

THE CHOICE FOLLOWS TWO VARIABLES: how long work cycles run, and how often the team genuinely reaches into historical records during daily work. Short cycles plus rare lookups point to the cutover date; long-lived records plus daily lookups point to full or hybrid.

TWO RULES HOLD WHICHEVER PATH APPLIES. The switch date is communicated weeks ahead with training delivered before it arrives. And the old tools are actually cancelled on schedule — a backup spreadsheet left alive becomes a competing system within a month.

The path is chosen in writing during architecture, never improvised mid-build.`,
    concepts: ['migration', 'cutover date', 'hybrid migration', 'parallel running', 'decommissioning'],
    frameworks: ['Full / cutover / hybrid'],
  },

  {
    title: 'Adoption Rate, and the shadow spreadsheet',
    status: 'mechanism',
    relevance_score: 5,
    content: `A system nobody uses is worth nothing regardless of how well it was built, so handoff gets the same rigour as the build: role-based training so nobody sits through two hours of features they will never touch, sessions recorded so the training survives turnover, and documentation written for someone who has never seen the system.

ADOPTION RATE is the share of mapped workflows actually running through the new system, with the team working inside it rather than around it. It is the metric tracked above all others.

HIGH ADOPTION has a recognisable character: data flows without chasing, old spreadsheets fade from neglect, and people begin trusting the system's answers — they check it, find it accurate, and check it again.

LOW ADOPTION has an equally recognisable signature, and the first thirty days after launch are when to watch: THE SHADOW SPREADSHEET. Someone quietly maintains their old tracker as insurance. Left alone, within a quarter it becomes the real system again and the build is an expensive interface sitting on top of it. Treat every shadow system as diagnostic rather than disciplinary: it means either the person was not adequately trained, or the system genuinely does not handle their case. Both resolve quickly when caught in the first month, which is why the team stays actively involved through it rather than disappearing after training.

WHERE LOW ADOPTION COMES FROM: it almost always traces upstream to a skipped or rushed investigation. A system designed from an assumption about how the business works produces a mismatch the team feels immediately.

RELATION TO OUR OWN INSTRUMENTS: our record's day-90 field is realised return, which our own material calls the field everybody skips — money is the hardest thing to collect. Adoption at day 30 is cheaper to collect and leads the money. Add it; do not replace the day-90 field with it.`,
    concepts: ['adoption rate', 'shadow spreadsheet', 'handoff', 'role-based training', 'leading indicator'],
    frameworks: ['Adoption Rate'],
  },

  {
    title: 'Engagement signal: client behaviour during the assessment predicts adoption',
    status: 'mechanism',
    relevance_score: 5,
    content: `How a company behaves during the assessment is how it will behave during the build, and this is treated as a disqualifier rather than an inconvenience.

  STRONG SIGNAL — stakeholders arrive at interviews prepared, follow-ups answered within a day, people volunteering pain points without prompting.
  WEAK SIGNAL — rescheduled interviews, one-line answers, a founder who wants to skip ahead to a demo.

The claim: engagement during the assessment is the single best predictor of whether a company will adopt what gets built. A company treating the assessment as a formality will let an expensive system sit unused regardless of how well it is engineered.

The implication is uncomfortable and worth keeping: adoption is decided in the first two weeks of an engagement, long before handoff, when the team either becomes invested or does not.

RELATION TO OUR OWN INSTRUMENTS: our readiness gate measures the shape of the process — is it repeatable, is there a number, is there a signer — and measures nothing about the client's behaviour. This is a new predictor and it is exactly the kind our register is built to settle: record it per engagement, then check it against realised outcome once there are ten rows.`,
    concepts: ['engagement signal', 'qualification', 'disqualification', 'adoption prediction'],
    frameworks: ['Engagement signal'],
  },

  {
    title: 'The five ways implementations fail — none of them technical',
    status: 'mechanism',
    relevance_score: 5,
    content: `From 90+ builds and post-mortems on other providers' projects, the failures cluster into five patterns:

  1. THE ASSESSMENT WAS SKIPPED OR SUPERFICIAL. The system was designed from the founder's map, the people doing the work rejected it, adoption never materialised. The most common cause, and it is decided before anything is built.
  2. A BROKEN PROCESS GOT AUTOMATED. Nobody fixed the underlying workflow first, so the new system executes the dysfunction faster.
  3. TOOLS WERE SELECTED BEFORE ANY ARCHITECTURE EXISTED. Someone chose the stack first and bent the business to fit it. Tools should be the last decision in the sequence, not the first.
  4. THE AI WENT IN FIRST INSTEAD OF LAST. Agents deployed onto fragmented data with no workflow layer beneath them produce impressive demonstrations alongside unreliable work, and the team loses faith in the whole initiative.
  5. NOBODY OWNED THE SWITCH. No migration strategy, no cutover date, no accountable owner on the client side. The new system launched into a vacuum, the old tools stayed alive, and inertia did the rest.

None of the five is technical. The technology has never been more capable or more accessible; implementations fail on process, sequencing and adoption. That is the argument for the process being the product.`,
    concepts: ['failure patterns', 'post-mortem', 'automating a broken process', 'tool-first design', 'ownership of the switch'],
    frameworks: ['Five failure patterns'],
  },

  {
    title: 'Four feedback loops that keep a system alive after launch',
    status: 'mechanism',
    relevance_score: 4,
    content: `An operating system is a living thing: the business changes, volume grows, edge cases emerge, people turn over. Four loops separate systems that last years from systems that quietly deteriorate.

  1. USAGE DATA. The system logs everything, so which workflows run cleanly, which produce errors, and which features are ignored is observable. Ignored features carry information: anything the team routes around does not fit how they actually work, and the data surfaces that long before anyone complains. Usage is a more reliable guide to improvement than opinion.
  2. ERROR MONITORING. Every automation writes a log and fails visibly — an alert fires, a human sees it, it is fixed, usually before anyone notices. The dangerous failure is the silent one: the automation that stopped three weeks ago while everybody assumed it was working. Logged, monitored systems do not produce silent failures.
  3. THE REVIEW CYCLE. A recurring structured review, monthly or quarterly, with a standing agenda: what ran cleanly, what errored, what changed in the business, what to build next. This is where expansion originates — the first system proves itself in one department and the review scopes the next.
  4. TEAM FEEDBACK. The people inside the system notice friction before any dashboard does. A standing channel for small annoyances, fixed quickly, is what keeps adoption high in month eight when the energy of launch has gone.

ON SELLING MAINTENANCE: it is not sold on day one. The system goes live, adoption climbs, the numbers appear, and then the client asks what comes next. A provider pushing a substantial retainer before delivering anything is showing where its incentives sit. This matches our own ladder rule that each rung is sold by the rung beneath it and none is pitched cold.`,
    concepts: ['feedback loops', 'usage telemetry', 'silent failure', 'review cadence', 'retainer earned not sold'],
    frameworks: ['Four optimisation loops'],
  },

  {
    title: 'Priors from this source — unaudited, from another market',
    status: 'prior',
    relevance_score: 3,
    content: `These are figures, not mechanisms. They come from one provider's clients — service businesses from $2M to $100M+ — and none has been independently audited. They are useful as starting assumptions and as questions to ask, and they must never be quoted as our own result or presented to a client as a benchmark.

  - A company of this size runs 15 to 25 software tools, with monthly spend routinely in the thousands and a meaningful share going to software used by one person or nobody.
  - Best people spend 8 to 15 hours a week re-entering data, chasing statuses and rebuilding the same reports.
  - A single re-entry loop can cost around $40,000 a year in labour.
  - A CRM in this state is roughly 60% accurate.
  - The exception a respondent describes as happening "only sometimes" turns out to represent about 20% of cases.
  - A meaningful share of what companies assume requires AI is deterministic; discovering this can cut projected build complexity by about a third.
  - A typical engagement runs about 90 days: two weeks assessment, two weeks architecture and foundations, four weeks workflows, two weeks intelligence, two weeks migration and launch, then a 30-day adoption watch.
  - A meaningful assessment cannot be completed in a single 45-minute call.

HOW TO HANDLE THESE: treat each as a prior to be confirmed or contradicted by our own register. Ten completed records replace any of them with a measurement. Until then, when one is used in a document it carries its source and its n, in the same way we handle every other borrowed figure.`,
    concepts: ['priors', 'unaudited figures', 'benchmark hygiene', 'calibration'],
    frameworks: [],
    statistics: [
      { stat: '15–25 software tools per company', source: 'Boom Automations, 90+ implementations', year: 2026 },
      { stat: '8–15 hours per week lost to re-entry and status chasing', source: 'Boom Automations, 90+ implementations', year: 2026 },
      { stat: 'One re-entry loop ≈ $40,000/year in labour', source: 'Boom Automations, 90+ implementations', year: 2026 },
      { stat: 'CRM accuracy ≈ 60%', source: 'Boom Automations, 90+ implementations', year: 2026 },
      { stat: '"Only sometimes" exceptions ≈ 20% of cases', source: 'Boom Automations, 90+ implementations', year: 2026 },
      { stat: 'Deterministic reclassification cuts projected complexity ≈ one third', source: 'Boom Automations, 90+ implementations', year: 2026 },
      { stat: 'Typical engagement ≈ 90 days end to end', source: 'Boom Automations, 90+ implementations', year: 2026 },
    ],
  },
];

/** Rows in the shape `knowledge_base` expects. */
export function knowledgeRows() {
  return UNITS.map((u) => ({
    title: u.title,
    domain: DOMAIN,
    source_type: 'article',
    source_key: SOURCE_KEY,
    source_name: SOURCE_NAME,
    content: u.content,
    frameworks: u.frameworks || [],
    concepts: u.concepts || [],
    entities: ['Boom Automations', 'Luke Pierce'],
    statistics: u.statistics || [],
    /* `status` is a tag as well as metadata so an agent filtering by tag can
       exclude priors without having to parse jsonb. */
    tags: [DOMAIN, 'implementation', 'curated', u.status, ...(u.concepts || []).slice(0, 4)],
    relevance_score: u.relevance_score ?? 3,
    processed_by: 'curated',
    metadata: { ...PROV, status: u.status },
  }));
}
