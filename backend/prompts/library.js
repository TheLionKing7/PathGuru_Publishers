/**
 * The operator prompt library — 72 prompts across twelve categories.
 *
 * OPERATOR-FACING, DELIBERATELY AND ONLY.
 *
 * None of this is resolved into any agent's live prompt. Nexus, Aria, Atlas and
 * the rest keep the prompts they were designed with, in their own files, and
 * nothing here can change what they send. This library is for the human at the
 * console: things you run in a chat window while doing consulting work.
 *
 * That separation is the point. An agent prompt is live behaviour and changing
 * one at 6am changes what a prospect reads at 9am. An operator prompt is a note
 * to yourself. Merging the two lanes would mean every edit here needed an
 * approval, and the library would stop being something you reach for.
 *
 * Composition is the same three-part idea used everywhere in this estate: a
 * prompt says WHAT TO DO, an industry block says WHOSE BUSINESS IT IS, and a
 * clause says HOW TO BEHAVE WHEN UNSURE. See compose.js.
 */

export const CATEGORIES = [
  { id: 'assess',   name: 'The Assessment Engine', hue: '#3B4A93' },
  { id: 'discover', name: 'Diagnosis & Discovery', hue: '#1F6E66' },
  { id: 'sales',    name: 'Sales & Pipeline',      hue: '#8A4B7C' },
  { id: 'market',   name: 'Marketing & Content',   hue: '#2F6EA8' },
  { id: 'ops',      name: 'Operations & Process',  hue: '#7A5A16' },
  { id: 'support',  name: 'Customer Support',      hue: '#994336' },
  { id: 'finance',  name: 'Finance & Pricing',     hue: '#3F7A4E' },
  { id: 'people',   name: 'People & Hiring',       hue: '#6A5AA8' },
  { id: 'data',     name: 'Data & Reporting',      hue: '#1C6B7C' },
  { id: 'strategy', name: 'Strategy & Decisions',  hue: '#8A5320' },
  { id: 'build',    name: 'Build & Automation',    hue: '#4A6B25' },
  { id: 'quality',  name: 'Quality Control',       hue: '#7A3E5E' },
];

export const PROMPTS = [

/* ── 1 · THE ASSESSMENT ENGINE ─────────────────────────── */
{
  id: 'assess.transcript-to-candidates',
  category: 'assess',
  title: 'Transcript → candidate list',
  when: 'Step 2 of an assessment. Run this on the raw interview transcript, never on a summary.',
  note: 'Never ask for "5-7 opportunities". A fixed count turns the instrument into a producer.',
  body: `You are analysing a recorded interview with someone who does the work at {{COMPANY}}.

TRANSCRIPT:
{{PASTE FULL TRANSCRIPT}}

List EVERY task, handoff or decision that could conceivably be automated or assisted. There is no target number. If there are three, return three. If there are twenty-two, return twenty-two. If there are none, say so plainly and stop.

For each candidate return:
- Name, in the speaker's own vocabulary
- The exact quote that evidences it, with nothing paraphrased
- Roughly how often it happens, if they said
- Who does it
- What triggers it and what it produces

Do not rank them. Do not recommend tools. Do not judge feasibility. That is the next step and mixing it into this one hides candidates you would otherwise have seen.`,
},
{
  id: 'assess.three-test-filter',
  category: 'assess',
  title: 'The three-test filter',
  when: 'Step 2, immediately after the candidate list. This is what turns an opinion into an assessment.',
  note: 'The UNKNOWN option matters. Without it the model will invent a judgement to fill the cell.',
  body: `Here is a list of automation candidates from {{COMPANY}}:
{{PASTE CANDIDATE LIST}}

Run each candidate through three tests, in order. A candidate must pass all three.

1 REPEATABLE — does it run on a schedule or a clear trigger, at least weekly?
2 LEGIBLE — could the rules be written on one page, well enough for a competent new hire to follow, without the page saying "it depends" and stopping there?
3 BOUNDED — if it produces a wrong output, is that caught before it reaches a customer, a regulator or a ledger?

Return a table: candidate | test 1 | test 2 | test 3 | verdict | the one sentence that decides it.

Verdicts: PASS, or FAILS-REPEATABLE (noise, leave it), FAILS-LEGIBLE (knowledge capture first), FAILS-BOUNDED (buildable, but a human review step must be designed and priced).

Where the transcript does not tell you enough to judge a test, mark it UNKNOWN and name the exact question I should ask. Do not guess in order to complete the table.`,
},
{
  id: 'assess.friction-pricing',
  category: 'assess',
  title: 'Friction pricing worksheet',
  when: 'Step 3. Converts surviving candidates into an annual cost of doing nothing.',
  note: 'A point estimate invites an argument about the third decimal you will lose. Always a range.',
  body: `For each surviving candidate below, build the cost of doing nothing.

{{PASTE SURVIVING CANDIDATES}}
Loaded hourly rates supplied by the client: {{RATES}}
Currency: {{CURRENCY}}

For each: frequency per year, elapsed duration per occurrence (not touch time — waiting is a cost), who performs it, their loaded rate, and the annual figure.

Then give a LOW and a HIGH for each, using the client's own most and least favourable plausible inputs. Show every multiplication. State each assumption on its own line, labelled ASSUMPTION.

Finally: one total range for the whole set, and one sentence naming the single largest contributor.

If a figure is missing, leave it blank and list it under DATA I STILL NEED. Do not substitute an industry benchmark for a number this client has not given me.`,
},
{
  id: 'assess.effort-impact-matrix',
  category: 'assess',
  title: 'Effort × impact matrix',
  when: 'Step 4. How the one recommendation gets chosen defensibly rather than by preference.',
  note: null,
  body: `Place each candidate below on an effort-versus-impact matrix.

{{PASTE CANDIDATES WITH FRICTION FIGURES}}

IMPACT is the annual friction figure, already computed — use it, do not re-estimate.
EFFORT is your estimate in build-days, and you must state what you are assuming about {{COMPANY}}'s data quality, systems access and internal capacity to arrive at it.

Return four quadrants: Do first (high impact, low effort) · Plan (high impact, high effort) · Fill-in (low impact, low effort) · Drop (low impact, high effort).

Then name ONE first build and give three reasons. If two are genuinely tied, say so and name the question whose answer would break the tie — do not pick arbitrarily and present it as analysis.`,
},
{
  id: 'assess.report-draft',
  category: 'assess',
  title: 'The report draft',
  when: 'Step 4. Produces the five pages from the material already gathered.',
  note: null,
  body: `Draft an assessment report for {{COMPANY}}.

Candidate list and verdicts: {{PASTE}}
Friction figures: {{PASTE FIGURES}}
Chosen first build: {{PASTE BUILD}}

Five sections, at most one page each:
1 WHAT WE SAW — five to eight direct quotes from the transcript, grouped, with no commentary between them
2 WHAT SURVIVED AND WHAT DID NOT — every candidate, with the test each failure hit. The killed list appears in full, not summarised
3 THE FIRST BUILD — what it is, the build cost, the annual return, the payback period
4 AFTER IT — waves two and three at lower resolution, and one honest paragraph on where progress will feel slow and why
5 WHAT TO COMMIT — the ceiling and the reasoning

Write for a reader who will read section 1 and section 5 and skim the rest. Name no tools anywhere except section 3, and only for steps that passed all three tests.`,
},
{
  id: 'assess.situation-read',
  category: 'assess',
  title: 'The situation read',
  when: 'Before drafting any reply or report. A private analysis you write FROM, never send.',
  note: 'This is the step that separates a thoughtful reply from a form letter. Do not skip it to save a minute.',
  body: `Read this and tell me what is actually going on. This is for my eyes only — I will write from it, not send it.

{{PASTE THE EMAIL, MESSAGE OR TRANSCRIPT}}

Answer four questions:
1 Who is this person and what do they actually want — as distinct from what they asked for?
2 What kind of relationship is this: buyer, channel, partner, vendor, competitor, or noise? Say which and why. A body that advises businesses but does not sell to them is a channel, not a buyer, and that changes everything downstream.
3 What may we honestly claim here, and what must we explicitly disclaim?
4 What is the single most useful thing we could say to them?

Be concrete. If the message does not support a conclusion, say what you would need to know.`,
},
{
  id: 'assess.gate-call-scorer',
  category: 'assess',
  title: 'Gate-call scorer',
  when: 'Right after a fifteen-minute qualification call, before you quote.',
  note: null,
  body: `I have just run a fifteen-minute qualification call. Score it.

Notes: {{PASTE NOTES}}

Three gates, each pass or fail:
1 Is there one process that runs at least weekly with more than one person touching it?
2 Can they name one number that would move if it got faster or cheaper?
3 Is the person who signs involved?

For each: verdict, the evidence from my notes, and my confidence.

Then a recommendation — PROCEED, PROCEED WITH A NAMED RISK, or DECLINE — and if decline, draft two sentences I can say to them that are honest, specific and leave the door open.`,
},
{
  id: 'assess.outcome-record',
  category: 'assess',
  title: 'Outcome record entry',
  when: 'At day 90. The field everyone skips and the only one that compounds.',
  note: null,
  body: `Turn the following into one structured record row for my engagement register.

{{PASTE ENGAGEMENT NOTES AND OUTCOME}}

Fields: sector · headcount band · candidates listed / passed / killed · which test killed each · annual friction low and high · what was recommended · the commitment ceiling given · did they buy the next rung (yes/no/pending) · what was actually built · actual build cost · realised return at 90 days · what I got wrong.

That last field is compulsory. If I got nothing wrong, say what would have changed the outcome, and mark it as speculation rather than a finding.`,
},

/* ── 2 · DIAGNOSIS & DISCOVERY ─────────────────────────── */
{ id:'discover.interview-question-set', category:'discover', title:'Interview question set',
  when:'Before a discovery call, tailored to the specific business.', note:null,
  body:`Build me a discovery interview for {{COMPANY}}.

What I already know: {{PASTE}}
I have {{MINUTES}} minutes with {{ROLE}}.

Open with "Walk me through yesterday." Then give me twelve follow-up questions in the order I should ask them, each with one sentence on what I am listening for.

Rules the questions must obey: ask about behaviour, never about opinion. Never ask a question answerable with yes or no. At least two questions must probe a previous failed attempt at automation. At least one must find out who actually decides.

Then list three questions I should NOT ask, and why they will produce performance rather than information.` },

{ id:'discover.process-map', category:'discover', title:'Process map from a description',
  when:'When someone describes how work flows and you need it as a structured map.',
  note:'The [INFERRED] tag is the whole value here. Without it a map reads as fact.',
  body:`Turn this description into a process map.

{{PASTE DESCRIPTION OR TRANSCRIPT SECTION}}

For each step: number, name, actor, trigger, input, output, system used, elapsed time, touch time.

Then, separately:
- Every handoff between actors, marked as CONTRACT (a defined interface, a form, a field) or CONVERSATION (a message, a call, a memory)
- Every wait state, with what is being waited for
- Every point where a human re-enters data that already exists elsewhere
- Every exception path they mentioned, and how often they said it fires

Mark anything you inferred rather than heard with [INFERRED]. I need to know which parts of this map are evidence and which are my own reasoning reflected back at me.` },

{ id:'discover.root-cause', category:'discover', title:'Root cause, five whys',
  when:'When a symptom keeps recurring and nobody has named the cause.', note:null,
  body:`Symptom at {{COMPANY}}: {{DESCRIBE}}
What has already been tried: {{PASTE}}

Work backwards five levels. At each level state the cause, the evidence for it, and what would have to be true for it to be wrong.

Then classify the root cause as one of: a process problem, a data problem, an incentive problem, a capability problem, or a tooling problem.

Be sceptical of tooling. Most recurring symptoms are traced to tooling because tooling is the easiest thing to change, and that is a reason to distrust the conclusion, not to accept it. If you land on tooling, argue against yourself for a paragraph before concluding.` },

{ id:'discover.stakeholder-map', category:'discover', title:'Stakeholder map',
  when:'Before a proposal, when more than two people will touch the decision.', note:null,
  body:`Map the people around this decision at {{COMPANY}}.

What I know: {{PASTE}}
The decision: {{DESCRIBE}}

For each person: name or role, what they gain if this goes ahead, what they lose, what they are measured on, and how much they can block it.

Then: who is the economic buyer, who is the technical evaluator, who is the day-to-day user, and who is the person nobody named but who will quietly kill it.

Where I have not given you enough to identify one of those four, say so and give me the question to ask.` },

{ id:'discover.data-readiness', category:'discover', title:'Data readiness check',
  when:'Before promising anything that depends on the client’s own data.', note:null,
  body:`Assess whether {{COMPANY}} has the data to support {{PROPOSED WORK}}.

What they have told me about their systems: {{PASTE}}

For each data object the work needs: where it lives, who owns it, how it is entered, how current it is, whether there is one authoritative copy or several, and what happens today when two copies disagree.

Then a verdict: READY, READY WITH CLEANUP (name the cleanup and estimate it in days), or NOT READY (name the prerequisite).

Do not soften NOT READY. A project built on data that is not ready fails three months in, when it is expensive, rather than now, when it is a conversation.` },

{ id:'discover.failed-attempt-post-mortem', category:'discover', title:'Failed-attempt post mortem',
  when:'When they tried something similar before and it did not stick.', note:null,
  body:`{{COMPANY}} previously tried {{WHAT}} and it did not stick. Here is what they told me:
{{PASTE}}

Work out why, and be specific. Classify the failure as: wrong problem, right problem wrong solution, correct solution never adopted, adopted then abandoned, or blocked by someone.

Then tell me what my proposal must do differently to avoid the same ending — as concrete design constraints, not encouragement.

If their account of the failure is self-serving or incomplete, say which parts you doubt and what I should ask to test it.` },

/* ── 3 · SALES & PIPELINE ──────────────────────────────── */
{ id:'sales.reply-to-inbound', category:'sales', title:'Reply to an inbound enquiry',
  when:'A real person has written in. Draft, never auto-send.',
  note:'Reasoning about the reader is allowed and wanted. Claims about us are not — that is the line.',
  body:`Draft a reply to this enquiry.

{{PASTE THE FULL INBOUND MESSAGE AND ANY EARLIER THREAD}}
We do: {{WHAT WE DO}}
We explicitly do NOT do: {{WHAT WE DO NOT DO}}

First, privately, work out what kind of relationship this is and what they actually want. Then write the reply from that.

Constraints: under 180 words. No pleasantries beyond one line. Make one observation about THEIR situation that they did not state but that follows from what they said — that sentence is the reply. If any part of what they want falls outside what we do, say so in one clear sentence without apologising; declining a scope is a credibility move, not a lost opportunity.

Claim nothing about our capabilities, results or clients that I have not given you above. End with one specific next step.` },

{ id:'sales.objection-handling', category:'sales', title:'Objection handling, prepared',
  when:'Before a pitch, so you are not improvising against a CFO.', note:null,
  body:`I am proposing {{OFFER}} at {{PRICE}} to {{COMPANY}}.

Give me the eight objections most likely to be raised, ranked by probability. For each: the objection in the words they will actually use, what is really being asked underneath it, my best answer in under sixty words, and the evidence I need to have ready.

Then separately: the two objections I cannot answer well, and what I should do about that before the meeting — change the offer, change the price, or accept the risk and say so honestly in the room.` },

{ id:'sales.proposal-from-assessment', category:'sales', title:'Proposal from an assessment',
  when:'Turning a completed assessment into a scoped proposal.', note:null,
  body:`Write a proposal for {{COMPANY}} based on this assessment.

{{PASTE ASSESSMENT FINDINGS}}
Chosen build: {{DESCRIBE}}
My rate or price: {{PRICE}}

Sections: the problem in their words · what we will build · what is explicitly out of scope · what we need from them and by when · timeline with named milestones · price and payment schedule · what success looks like, measured, at 90 days.

The out-of-scope section must be as detailed as the in-scope section. Every dispute in this kind of work starts in the gap between them.

Do not exceed the ceiling I gave in the assessment. If the scope I have described costs more than that ceiling, say so and propose splitting it into waves instead of quietly raising the number.` },

{ id:'sales.follow-up', category:'sales', title:'Follow-up that is not a nudge',
  when:'They went quiet. Most follow-ups add nothing and read as pressure.', note:null,
  body:`{{COMPANY}} has gone quiet after {{WHAT HAPPENED}}, {{DAYS}} days ago.
Last contact: {{PASTE}}

Write a follow-up that gives them something rather than asking for something — a relevant observation, a useful link, an answer to a question they raised and I did not fully answer.

Under 100 words. No "just checking in", no "circling back", no false deadline. One clear line making it easy to say no, because a clean no is worth more to me than a slow maybe.` },

{ id:'sales.discovery-debrief', category:'sales', title:'Discovery-call debrief',
  when:'Straight after a sales call, while it is fresh.', note:null,
  body:`Debrief this call.

{{PASTE NOTES OR TRANSCRIPT}}

Give me: what they said they want · what they appear to actually want · the budget signal and how strong it is · the timeline signal · who else is involved · the strongest reason they will buy · the strongest reason they will not · what I failed to ask.

Then a probability that this closes within 90 days, expressed as a percentage, with the two facts most responsible for that number. Label it clearly as a guess from one conversation, because that is what it is.` },

{ id:'sales.channel-partner-approach', category:'sales', title:'Channel partner approach',
  when:'Reaching an adviser or intermediary who serves your buyers but does not compete.',
  note:'Highest-leverage channel there is, and the one almost nobody works.',
  body:`{{ORGANISATION}} advises businesses in {{SECTOR}} but does not sell what I sell. What I know about them: {{PASTE}}

Write an approach that treats them as a channel rather than a client. It must offer them something that makes them look better to THEIR clients — not a referral fee, which reads as a conflict to a professional adviser and often to a regulated one.

Under 150 words. Name one specific thing about their work that shows I have looked. Propose a single low-commitment first step.` },

{ id:'sales.lost-deal-analysis', category:'sales', title:'Lost-deal analysis',
  when:'After a no. The cheapest research you will ever do.', note:null,
  body:`I lost this. Work out why.

What happened: {{PASTE}}
What they said: {{PASTE THEIR WORDS}}

Separate the stated reason from the likely reason. Classify: wrong fit, wrong timing, wrong price, wrong person, outsold, or my own execution error.

Be blunt about execution errors — that is the only category I can act on. Name the specific moment the deal was lost, if you can identify it, and what I could have said instead.` },

{ id:'sales.reference-story', category:'sales', title:'Reference-story writer',
  when:'Turning a delivered engagement into a case others can check.', note:null,
  body:`Turn this delivered engagement into a reference story.

{{PASTE WHAT WAS DONE AND WHAT RESULTED}}
Anonymity required: {{YES/NO — if yes, how far}}

Structure: the situation · what we found, including what we ruled out · what we built · what it returned, with the arithmetic shown · what we would do differently.

Use only numbers I have given you. If a number would strengthen the story and I have not supplied it, mark it {{NEED FIGURE}} rather than estimating one — an invented figure in a case study is the fastest way to lose a client who checks.` },

/* ── 4 · MARKETING & CONTENT ───────────────────────────── */
{ id:'market.positioning-statement', category:'market', title:'Positioning statement',
  when:'When the business cannot explain itself in one sentence.', note:null,
  body:`{{COMPANY}} does this: {{DESCRIBE}}
Competitors: {{LIST}}

Write five candidate positioning statements in the form: for {who}, who {situation}, {company} is the {category} that {differentiator}, unlike {alternative}.

Then stress-test each: could a competitor claim the same sentence? If yes, it is not positioning, it is description — say so and discard it.

Finish with the one you would defend and the specific evidence needed to make it credible.` },

{ id:'market.content-from-engagement', category:'market', title:'Content from one real engagement',
  when:'Turning delivered work into a series without inventing anything.', note:null,
  body:`Here is a real engagement:
{{PASTE}}

Produce six content pieces from it, each with a distinct angle: the finding that surprised us · the thing we recommended against · the arithmetic behind the decision · what the client did next · the mistake we nearly made · the question we could not answer.

For each: a headline, the opening two sentences, the core point, and the specific detail from the engagement that makes it credible.

Every piece must be traceable to something in the material above. Where an angle has no supporting material, say so and drop it rather than inventing an anecdote.` },

{ id:'market.landing-page-copy', category:'market', title:'Landing page copy',
  when:'A page for one offer, aimed at one buyer.', note:null,
  body:`Write landing page copy for {{OFFER}}.

Buyer: {{WHO}}
The one action: {{WHAT THEY SHOULD DO}}
Proof I actually have: {{PASTE}}

Sections: headline · subhead · the problem in the buyer's own words · what this is · how it works in three steps · what it costs · who it is not for · the action.

The "who it is not for" section is compulsory and must be specific enough to disqualify real people. A page that excludes nobody persuades nobody.

Use no proof beyond what I supplied. No invented testimonials, no invented statistics, no "trusted by hundreds".` },

{ id:'market.email-sequence', category:'market', title:'Email sequence, post-download',
  when:'Someone took the free thing. Five emails that earn a reply.', note:null,
  body:`Write a five-email sequence for someone who has just received {{THE FREE THING}}.

The eventual offer: {{OFFER}}
Days between emails: {{SPACING}}

Email 1 delivers and sets one expectation. Emails 2 to 4 each teach one usable thing — usable meaning they could act on it today without buying anything. Email 5 makes the offer once, plainly, and tells them how to stop hearing from me.

Under 150 words each. No countdown timers, no manufactured scarcity, no "I noticed you didn't...". Subject lines under 45 characters and descriptive rather than clever.` },

{ id:'market.ad-concepts', category:'market', title:'Ad concepts with the losing angle named',
  when:'Paid creative where you also say what you expect to fail.', note:null,
  body:`Give me eight ad concepts for {{OFFER}} on {{PLATFORM}}.

Audience: {{WHO}}
Budget signal: {{SPEND}}

For each: the angle in five words, the hook line, the body, the call to action, and the single assumption about the audience it is betting on.

Then rank them by how likely they are to work, and name the two you expect to lose. Say what each losing one would prove if it lost — a test that cannot fail informatively is not worth its budget.` },

{ id:'market.competitor-teardown', category:'market', title:'Competitor teardown',
  when:'Understanding a rival without repeating their marketing back at yourself.', note:null,
  body:`Analyse {{COMPETITOR}}.

Material I have gathered: {{PASTE THEIR SITE COPY, PRICING, POSTS}}

Separate three things and label them: what they CLAIM, what the evidence SUPPORTS, and what you are INFERRING.

Then: who they are genuinely better for, who they are genuinely worse for, what they appear to be betting on, and the one thing they do that I should copy without embarrassment.

Do not tell me I am better. Tell me where I am not.` },

{ id:'market.seo-brief', category:'market', title:'SEO brief, not an SEO article',
  when:'A brief a writer can execute, rather than filler about a keyword.', note:null,
  body:`Write a content brief for the query {{QUERY}}.

Who is searching this and what has just happened to them: {{DESCRIBE}}

Include: the search intent in one sentence · the question the page must answer in its first 80 words · six subheadings in order · the specific evidence, examples or figures each section needs · what the page should NOT cover · the single next action for a reader who is convinced.

If answering this query properly requires expertise or data I have not given you, say so and list exactly what the writer must obtain first.` },

{ id:'market.social-post-from-build', category:'market', title:'Social post from a finished build',
  when:'One post per delivered result, with the number in it.', note:null,
  body:`Write a short post about this completed piece of work.

{{PASTE WHAT WAS BUILT AND WHAT IT RETURNED}}
Platform: {{PLATFORM}}

Lead with the number and the period. Then in three or four sentences: what the situation was, what we did, what changed. End with one line of what it would take for someone else to do the same thing.

No hooks about mindset, no "here's what nobody tells you", no thread bait. The result is the interesting part; let it be.` },

/* ── 5 · OPERATIONS & PROCESS ──────────────────────────── */
{ id:'ops.sop', category:'ops', title:'Standard operating procedure',
  when:'Turning how one person does something into something anyone can follow.',
  note:'This prompt is also the fix for a candidate that failed the LEGIBLE test.',
  body:`Write an SOP for {{TASK}} at {{COMPANY}}.

How it is done today: {{PASTE DESCRIPTION OR TRANSCRIPT}}

Structure: purpose · trigger · who performs it · prerequisites · numbered steps with the exact system and field at each · decision points with the rule at each · what done looks like · what to do when it goes wrong · who to escalate to.

Every step must be executable by someone who has never done it. Where the current description says "it depends", stop and write down what it depends on — that sentence is the actual procedure and the reason the task cannot currently be delegated.` },

{ id:'ops.handoff-contract', category:'ops', title:'Handoff contract',
  when:'Where work moves between people or teams and keeps going wrong.', note:null,
  body:`Define the contract for this handoff at {{COMPANY}}.

From: {{WHO}} · To: {{TO WHO}} · What moves: {{WHAT}}
How it works today: {{DESCRIBE}}

Specify: the exact fields or artefacts that must be present · the quality bar for each · who checks · what the receiver does when something is missing · the time within which the receiver must acknowledge · where this is recorded.

Then name the three ways this handoff currently fails and what in the contract above prevents each. If the contract does not prevent one of them, say so rather than pretending it does.` },

{ id:'ops.exception-catalogue', category:'ops', title:'Exception catalogue',
  when:'The long tail nobody has written down, which is where automation dies.', note:null,
  body:`Build the exception catalogue for {{PROCESS}} at {{COMPANY}}.

Everything I have on the normal path: {{PASTE}}
Exceptions mentioned so far: {{PASTE EXCEPTIONS}}

For each exception: the trigger, how often it fires, who handles it, how long it takes, whether it is currently written down anywhere, and what it costs.

Then estimate what proportion of total volume runs the exception path rather than the normal path, and say how confident you are.

Finally: which exceptions must be handled by any automation of this process, and which can be routed to a human without the automation being worthless. That distinction is the whole design.` },

{ id:'ops.capacity-bottleneck', category:'ops', title:'Capacity and bottleneck read',
  when:'When the team is busy but throughput has not moved.', note:null,
  body:`{{COMPANY}} has this workload: {{DESCRIBE}}
People and hours: {{PASTE}}

Find the constraint. Show the arithmetic: demand per period against capacity per period at each step.

Name the single binding constraint and what happens to total throughput if it is relieved by 20 percent. Then name the constraint that becomes binding next — relieving one bottleneck usually just moves it, and a plan that does not say where it moves to is not finished.

State every assumption you had to make about utilisation, because that assumption is doing most of the work in this answer.` },

{ id:'ops.meeting-audit', category:'ops', title:'Meeting audit',
  when:'Recurring meetings that exist because the system cannot answer a question.', note:null,
  body:`Audit these recurring meetings at {{COMPANY}}.

{{PASTE LIST WITH ATTENDEES, FREQUENCY, DURATION}}
Loaded rates: {{RATES}}

For each: annual cost in hours and money, its actual purpose (decision, information, coordination, or status), and whether that purpose could be served by an artefact instead of a meeting.

Flag every meeting whose purpose is status, chasing or reconciliation. A meeting that exists because the system cannot answer a question is not a meeting, it is a symptom — name the question it exists to answer.

Then a total: what proportion of these hours are spent moving information that a system could have moved.` },

{ id:'ops.tool-audit', category:'ops', title:'Vendor and tool audit',
  when:'Before adding a tool, work out what the existing ones already do.', note:null,
  body:`Audit {{COMPANY}}'s current tools before we add anything.

{{PASTE TOOL LIST, COSTS, WHO USES WHAT}}
What we are considering adding: {{PROPOSED}}

For each existing tool: what it is for, who actually uses it, annual cost, and whether it already does some part of what the proposed tool would do.

Then: what could be retired, what is duplicated, and — answered honestly — whether the proposed tool is genuinely needed or whether an existing one is simply unconfigured. Most tool problems are configuration problems wearing a purchase order.` },

{ id:'ops.failure-runbook', category:'ops', title:'Runbook for a recurring failure',
  when:'Something breaks regularly and each recovery is improvised.', note:null,
  body:`Write a runbook for this recurring failure at {{COMPANY}}.

Failure: {{DESCRIBE}} · How often: {{FREQUENCY}}
What people currently do: {{PASTE}}

Sections: how to detect it (the signal, not the complaint) · how to confirm it is this and not something that looks like it · immediate containment · full recovery, numbered · how to verify recovery · what to record · who to tell and when.

Then, separately: the permanent fix, and an honest note on why it has not been done — usually it is cost, ownership or fear, and naming which one is what makes it actionable.` },

{ id:'ops.delegation-brief', category:'ops', title:'Delegation brief',
  when:'Handing a responsibility to a person or an agent — the same brief works for both.',
  note:'Works unchanged whether the thing being delegated to is a person or a piece of software.',
  body:`Write a delegation brief for {{RESPONSIBILITY}} at {{COMPANY}}.

Currently held by: {{WHO}}
Going to: {{WHO OR WHAT}}

Specify: the outcome owned (not the tasks performed) · decisions they may take alone · decisions requiring approval, with the threshold · the budget or resource limit · what must be reported, to whom, how often · what would constitute failure · when this brief is reviewed.

The approval thresholds must be numbers, not adjectives. "Significant" is not a threshold and will be interpreted differently by every person who reads it.` },

/* ── 6 · CUSTOMER SUPPORT ──────────────────────────────── */
{ id:'support.triage-rules', category:'support', title:'Ticket triage rules',
  when:'Turning an inbox into a routed queue with written rules.', note:null,
  body:`Build triage rules for {{COMPANY}}'s inbound support.

Sample of real messages: {{PASTE 20-30}}
Teams available to route to: {{LIST}}

Produce: a small set of categories (as few as cover 90 percent), the signals that identify each, the routing destination, the priority, and the target first response.

Then: the messages in my sample that do not fit any category, quoted. Those are the interesting ones — do not force them into a bucket to make the taxonomy look complete.

Finally, for each category, whether a reply could be drafted automatically, drafted for review, or must be written by a person. Justify every "automatically".` },

{ id:'support.kb-only-reply', category:'support', title:'Reply from the knowledge base only',
  when:'Answering a customer using approved material and nothing else.',
  note:'The refusal path is the point. A support bot that always answers is a liability.',
  body:`Answer this customer using ONLY the material provided.

CUSTOMER MESSAGE: {{PASTE}}
APPROVED MATERIAL: {{PASTE KB ARTICLES / DOCS}}
Tone: {{TONE}}

Rules. Every factual statement must be traceable to the approved material — cite which section. If the material does not answer their question, say exactly that and hand off to a person; do not assemble an answer from general knowledge and present it as ours.

If the material partially answers it, answer the part you can, then name the part you cannot and what happens next.` },

{ id:'support.complaint-response', category:'support', title:'Complaint response',
  when:'Something genuinely went wrong and a person is angry.', note:null,
  body:`Draft a response to this complaint.

{{PASTE COMPLAINT}}
What actually happened, internally: {{PASTE INTERNAL}}
What we can offer: {{PASTE OFFER}}

Structure: acknowledge the specific thing that went wrong, in their terms · say what happened, without jargon and without blaming a system as though nobody chose it · say what we are doing about this instance · say what we are changing so it does not recur, or honestly say we are not changing anything · make the offer.

One apology, early, and then stop apologising. Repeated apology reads as management of the complainer rather than of the problem. Do not promise a change I have not told you we are making.` },

{ id:'support.faq-from-tickets', category:'support', title:'FAQ from real tickets',
  when:'Writing documentation from what people actually asked.', note:null,
  body:`Build an FAQ from these real tickets.

{{PASTE TICKETS}}

Group by underlying question, not by wording. For each: the question phrased the way customers phrase it, a direct answer in under 80 words, and the number of tickets in my sample it would have deflected.

Order by deflection count.

Then, separately: the questions that reveal a product or process problem rather than a documentation gap. Those should not be answered in an FAQ, they should be fixed — list them under that heading.` },

{ id:'support.escalation-summary', category:'support', title:'Escalation summary',
  when:'Handing a live issue to someone senior without making them read the thread.', note:null,
  body:`Summarise this for escalation.

{{PASTE FULL THREAD}}

Structure: one line on what the customer wants · one line on why it is escalated · the timeline of what has happened, dated · what has already been tried and the result · the decision needed and from whom · the deadline and what happens if it passes.

Under 200 words total. The receiver must not need to open the thread to act. Any fact you cannot support from the thread, mark UNCONFIRMED.` },

{ id:'support.churn-risk', category:'support', title:'Churn-risk read',
  when:'Reading account signals before the cancellation email arrives.', note:null,
  body:`Assess churn risk for this account.

Account: {{NAME}} · Since: {{DATE}} · Value: {{VALUE}}
Recent interactions: {{PASTE}}
Usage or activity signals: {{PASTE SIGNALS}}

Give: a risk level, the three strongest signals supporting it with the evidence for each, the three strongest counter-signals, and the single most likely reason they would leave.

Then one specific action to take this week, and be clear about whether it is a retention action or a graceful-exit action — some accounts should leave, and pretending otherwise costs more than the revenue.` },

/* ── 7 · FINANCE & PRICING ─────────────────────────────── */
{ id:'finance.price-an-offer', category:'finance', title:'Price an offer from the ground up',
  when:'Setting a price for something new, without copying a competitor.',
  note:'The three-way triangulation is the point. A single method is a guess with a decimal.',
  body:`Help me price {{OFFER}}.

What it costs me to deliver: {{TIME AND COSTS}}
What it is worth to the buyer: {{THEIR NUMBERS, IF KNOWN}}
Currency: {{CURRENCY}}
Comparable offers I know of: {{PASTE}}

Work three ways and show each: cost-plus (floor), value-based (ceiling), and competitive (reference). Give a number for each and say what each assumes.

Then recommend one price and one payment structure, and name the assumption that would most change the answer if it were wrong.

Do not convert prices between currencies. If the buyer's currency differs from mine, price in theirs against a local anchor and say what the anchor is — a converted price is stale within a month and nobody remembers it was converted.` },

{ id:'finance.roi-case', category:'finance', title:'ROI case a CFO will not dismiss',
  when:'When the number has to survive a hostile finance review.', note:null,
  body:`Build the ROI case for {{PROJECT}} at {{COMPANY}}.

Costs: {{PASTE COSTS}} · Expected benefits: {{PASTE BENEFITS}} · Horizon: {{PERIOD}}

Show: total cost of ownership including the internal time nobody counts · benefits split into cash saved, cost avoided, and revenue enabled, kept strictly separate because they are not equally credible · payback period · a conservative, expected and optimistic case.

Then do the thing that makes it survive: write the two paragraphs a hostile CFO would write attacking this case, and answer them. If one of the attacks lands, say so and revise the case rather than defending it.` },

{ id:'finance.cashflow-stress-test', category:'finance', title:'Cashflow stress test',
  when:'Before committing to spend, for a business with lumpy income.', note:null,
  body:`Stress test this decision against cashflow.

Decision: {{DESCRIBE}} · Cost and timing: {{PASTE}}
Current position: {{CASH, RECEIVABLES, COMMITMENTS}}
Typical collection delay: {{DAYS}}

Model month by month for {{MONTHS}}. Then run three shocks: a major client pays 60 days late · revenue falls 30 percent for one quarter · the project overruns by 50 percent.

For each shock: does the business run out of cash, in which month, and by how much. Then name the earliest observable signal that the shock is happening, because a plan without a trigger is a hope.` },

{ id:'finance.commitment-ceiling', category:'finance', title:'Commitment ceiling',
  when:'How much to put on a first build, when the estimate is uncertain.', note:null,
  body:`Set a maximum commitment for {{PROJECT}} at {{COMPANY}}.

Expected return: {{FIGURE}} · Cost: {{COST}} · Currency: {{CURRENCY}}
Discretionary budget available this year: {{BUDGET}}
Confidence in the return estimate, honestly: {{LOW/MEDIUM/HIGH}}
Known prerequisites and whether each is in place: {{PASTE}}

Compute a recommended ceiling. Apply three rules and show each: take a fraction of the mathematically optimal size rather than the whole, because the loss from over-committing is not symmetric with the loss from under-committing · cap at a stated small share of discretionary budget regardless · and if ANY prerequisite is missing, the recommendation is zero, whatever the arithmetic says.

State clearly that the probability input is a judgement, not a measurement, and that the output is a ceiling and a discipline rather than an optimum.` },

{ id:'finance.invoice-terms-review', category:'finance', title:'Invoice and terms review',
  when:'Getting paid, which is a process problem more often than a client problem.', note:null,
  body:`Review how {{COMPANY}} gets paid.

Current terms: {{PASTE}} · Typical days to collect: {{NUMBER}}
What happens today when someone is late: {{DESCRIBE}}

Identify: where the delay actually starts (it is usually before the invoice is sent), what is missing from the invoice that causes queries, and every point where the process waits on a human who has not been told it is waiting on them.

Then propose specific changes to terms, invoice content and the chase sequence — with the exact wording for each chase step and the day it goes out. Say which change you expect to move the number most, and how I would tell.` },

/* ── 8 · PEOPLE & HIRING ───────────────────────────────── */
{ id:'people.role-definition', category:'people', title:'Role definition from the actual gap',
  when:'Before writing a job ad, work out what the role is for.', note:null,
  body:`Define this role at {{COMPANY}}.

The problem I think I am solving by hiring: {{DESCRIBE}}
What the team does today and where it breaks: {{PASTE}}

Produce: the outcome this role owns · the five things they will actually spend time on, with rough proportions · what they decide alone · what good looks like at 90 days and at a year · the three capabilities that genuinely matter and the ones that only sound like they matter.

Then challenge me: is this a hiring problem, a process problem, or a tooling problem? Many roles are created to absorb friction that should have been removed, and the new person then makes the friction permanent because their job depends on it.` },

{ id:'people.interview-guide', category:'people', title:'Structured interview guide',
  when:'Interviewing for evidence rather than for rapport.', note:null,
  body:`Build an interview guide for {{ROLE}} at {{COMPANY}}.

Role definition: {{PASTE}}
Interview length: {{MINUTES}}

For each of the three capabilities that matter: one question asking for a specific past instance, two follow-ups that probe for detail only someone who did it would have, and what a strong answer contains versus what a rehearsed answer contains.

No hypotheticals — "what would you do if" tests imagination, not competence. No brainteasers.

Then a scoring sheet with the evidence required for each score, so two interviewers reach the same number for the same answer.` },

{ id:'people.onboarding-30-days', category:'people', title:'Onboarding plan, first 30 days',
  when:'So a new hire is useful before anyone has time to train them.', note:null,
  body:`Write a 30-day onboarding plan for {{ROLE}} at {{COMPANY}}.

Role: {{PASTE DEFINITION}} · Team: {{DESCRIBE}}

Week by week: what they read, who they meet and what specific question to ask each person, what they observe, what they do themselves.

They must ship something real in week one, however small, and own something by week four. Name both explicitly.

Then: the three things that most often go wrong in the first month here, and what in this plan prevents each.` },

{ id:'people.performance-conversation', category:'people', title:'Performance conversation prep',
  when:'Before a difficult conversation, so it is about behaviour not personality.', note:null,
  body:`Help me prepare a performance conversation.

Person and role: {{DESCRIBE}} · What is happening: {{WHAT}}
Specific instances with dates: {{PASTE}}
What I have already said and when: {{PASTE PRIOR}}

Give me: the pattern in one sentence, stated as behaviour and impact rather than character · the two or three instances that best evidence it · the opening two sentences · the question I ask next, and then genuinely stop talking · the specific change requested, the date it is reviewed, and what happens if it does not change.

Then: three explanations I have not considered, including at least one where the cause is something I did or failed to provide.` },

{ id:'people.knowledge-capture', category:'people', title:'Knowledge capture interview',
  when:'Getting what one expert knows out of their head before they leave.',
  note:'Two hours a day maximum. The fourth hour produces documentation-voice, not knowledge.',
  body:`Design a knowledge capture session with {{PERSON}}, who holds {{WHAT KNOWLEDGE}} at {{COMPANY}}.

Cases or examples available to discuss: {{LIST}}

Structure it around specific cases, never general questions — a general question returns a general answer, and only a specific case reaches the thing only this person knows.

For each case, five moves in order: read the actual case back cold · ask what did you know that the system did not · widen with when else does that apply and when does it not · bound it with what would have to be true for this to be wrong · attribute it with who agreed this, when, and is it still true.

Give me the session plan with timings, and a record template with fields: situation, rule, scope, exceptions, source, date captured, review-by date.` },

/* ── 9 · DATA & REPORTING ──────────────────────────────── */
{ id:'data.define-a-metric', category:'data', title:'Define a metric properly',
  when:'Before anyone reports a number, agree what it means.', note:null,
  body:`Define {{METRIC}} for {{COMPANY}} so two people compute it identically.

How it is currently talked about: {{PASTE}}
Systems it could be pulled from: {{LIST}}

Specify: the plain-English definition · the exact formula · numerator and denominator inclusions and exclusions · the authoritative source system · the time basis and timezone · how restatements are handled · who owns the definition.

Then: three ways this metric can be gamed while technically improving, and the counter-metric that should always be shown beside it.

Finally, the questions I have to settle with the client before this definition can be finalised — do not decide them for me.` },

{ id:'data.weekly-report-spec', category:'data', title:'Weekly operating report spec',
  when:'Designing a report that leads to decisions, not to more reports.', note:null,
  body:`Specify a weekly operating report for {{COMPANY}}.

Who reads it: {{WHO}} · What decisions they make: {{LIST}}
Available data: {{PASTE}}

For each decision, work backwards to the smallest number of figures that inform it. Then produce the report spec: each figure, its definition, its source, its comparison basis, and the threshold at which it demands attention.

Maximum one page. Anything that does not inform a listed decision is cut — say what you cut and why.

Then: what should trigger an alert between reports, so nobody is waiting a week to learn something urgent.` },

{ id:'data.interrogate-dataset', category:'data', title:'Interrogate a dataset',
  when:'When you have been handed a spreadsheet and told to find something.',
  note:'The pre-analysis caveat is not throat-clearing. It is where the false findings get caught.',
  body:`Here is a dataset from {{COMPANY}}:
{{PASTE OR DESCRIBE COLUMNS AND SAMPLE ROWS}}
Question I am trying to answer: {{QUESTION}}

Before analysing, tell me: what this data can and cannot answer · what is missing that I would need · what biases the collection method probably introduces.

Then do the analysis, showing each step, and give the finding with a plain statement of confidence.

Do not produce a finding the data does not support because I asked for one. If the honest answer is that this dataset cannot answer my question, that is the answer I need.` },

{ id:'data.explain-a-move', category:'data', title:'Explain a number that moved',
  when:'Something changed and everyone is guessing why.', note:null,
  body:`{{METRIC}} moved from {{A}} to {{B}} between {{PERIOD}} at {{COMPANY}}.

What else I know happened: {{PASTE}}
Segment or breakdown data available: {{PASTE SEGMENTS}}

Generate the six most plausible explanations. For each: the mechanism, the evidence that would confirm it, the evidence that would rule it out, and whether that evidence exists in what I have given you.

Rank by plausibility given the evidence available, not by how interesting the story is.

Include at least one measurement explanation — a definition change, a collection change, a seasonality artefact. A surprising number of moved numbers are moved rulers.` },

{ id:'data.benchmark-honestly', category:'data', title:'Benchmark honestly',
  when:'Comparing a client to others without pretending to more data than you have.', note:null,
  body:`Compare {{COMPANY}} against relevant benchmarks for {{METRIC}}.

Their figure: {{FIGURE}} · Sector: {{SECTOR}} · Size: {{SIZE}}
Benchmark data I hold: {{PASTE, OR "none"}}

If I have given you benchmark data, use it and state the sample size beside every comparison. A comparison against four companies must say four.

If I have not, say so plainly and do not substitute a remembered industry figure. Instead: explain what would make a valid comparison, what data I would need, and what I can say honestly to the client in the meantime — which is usually more useful than a borrowed number.` },

/* ── 10 · STRATEGY & DECISIONS ─────────────────────────── */
{ id:'strategy.decision-memo', category:'strategy', title:'Decision memo',
  when:'A reversible-looking decision that is actually expensive to unwind.', note:null,
  body:`Write a decision memo.

Decision: {{DESCRIBE}} · Options: {{LIST}}
What I know: {{PASTE}} · Constraints: {{CONSTRAINTS}}

Structure: the decision in one sentence · why now, and what happens if we decide nothing · the options with the case for each · what each assumes · how reversible each is and at what cost · the recommendation · what would change the recommendation · how we will know in 90 days whether it was right.

The reversibility section decides most of this. Treat a cheap, reversible option with a worse expected value as often preferable to an expensive irreversible one with a better expected value, and say so explicitly if that is what you are recommending.` },

{ id:'strategy.pre-mortem', category:'strategy', title:'Pre-mortem',
  when:'Before committing, imagine it has already failed.', note:null,
  body:`It is {{DATE, 12 MONTHS OUT}}. {{PROJECT}} has failed clearly and publicly.

The plan: {{PASTE}}

Write the account of how it failed. Be specific about sequence and dates, not general about risk.

Then produce eight failure modes, ranked by probability × damage. For each: the earliest observable signal, who would see it first, and what we would do.

Then the one thing that, if we did it in the first month, would prevent the most of these — and be honest about whether it is currently in the plan.` },

{ id:'strategy.build-buy-or-leave', category:'strategy', title:'Should we build, buy or leave it',
  when:'The question that gets answered by whoever is most enthusiastic.', note:null,
  body:`{{COMPANY}} needs {{CAPABILITY}}.

Internal capacity: {{DESCRIBE}} · Off-the-shelf options: {{LIST}} · Budget: {{BUDGET}}

Evaluate four options, always including the fourth: build it, buy it, configure something they already own, or do nothing and live with it.

For each: cost over three years including internal time · time to value · what it depends on · what happens when the person who owns it leaves · switching cost later.

Argue the "do nothing" case properly rather than as a formality. It wins more often than anyone admits, particularly where the underlying process has not been fixed.` },

{ id:'strategy.sequence-roadmap', category:'strategy', title:'Sequence a roadmap by dependency',
  when:'Turning a list of wants into an order that survives contact.', note:null,
  body:`Sequence this roadmap for {{COMPANY}}.

Items: {{LIST}}
Constraints: {{TIME, MONEY, PEOPLE}}

Build the dependency graph first — which items require which others to exist. Then sequence by dependency, then by value within each tier.

Mark: which items are prerequisites disguised as features · which can run in parallel · which are on the critical path.

Then name where the curve flattens — the point at which visible progress slows because the remaining work is foundational — and say roughly when that will be, so nobody loses their nerve when it arrives without warning.` },

{ id:'strategy.argue-against-my-plan', category:'strategy', title:'Argue against my own plan',
  when:'Run this on anything you are about to commit to.',
  note:'The most useful prompt in this library. Cheap to run, and it has stopped more bad decisions than any framework.',
  body:`Here is what I intend to do:
{{PASTE PLAN}}

Argue against it as strongly as the evidence allows. Not devil's advocacy for its own sake — the actual best case against.

Cover: the assumption most likely to be wrong · what I am pattern-matching to that may not apply here · what a competent competitor would do in response · what this costs me in things not done · who inside the business will resist it and whether they are right.

Then, having done that, tell me whether the plan survives, and what specifically to change. If it survives intact, say so — but only after you have genuinely tried.` },

/* ── 11 · BUILD & AUTOMATION ───────────────────────────── */
{ id:'build.automation-spec', category:'build', title:'Automation specification',
  when:'Before anything is built. The document a builder works from.', note:null,
  body:`Write a build specification for automating {{PROCESS}} at {{COMPANY}}.

How it works today: {{PASTE PROCESS MAP}}
Systems involved: {{LIST}}

Specify: the trigger · the steps in order, with the system and operation at each · the data written and read at each step, with field names · every decision point and its rule · what happens on each failure mode · what is logged · who is notified when · the human review step, if the process failed the BOUNDED test.

Then: the exceptions this build does NOT handle and what happens to them instead — that list is what the client is actually agreeing to.

Finally, what must be true before build starts: access, credentials, data cleanup, a named owner.` },

{ id:'build.test-cases', category:'build', title:'Test cases before you build',
  when:'Written before the build, from the process map, not after.', note:null,
  body:`Write test cases for this automation before it is built.

Specification: {{PASTE}}

Produce: the happy path, step by step with expected values · one case per named exception · boundary cases (empty, maximum, duplicate, out of order, arriving twice) · failure cases where an external system is slow, down, or returns something unexpected.

For each: preconditions, inputs, expected result, and how I verify it.

Then the cases I cannot test without production data, and what safe substitute exists. Anything untestable before launch is a risk to be stated, not a gap to be quietly ignored.` },

{ id:'build.handover-documentation', category:'build', title:'Handover documentation',
  when:'So the build survives the person who built it.', note:null,
  body:`Write handover documentation for this automation.

What was built: {{DESCRIBE}} · Specification: {{PASTE}}

Sections: what it does in one paragraph a non-technical owner understands · how to tell it is working · how to tell it is broken, with the specific signals · what to do for each failure mode · how to turn it off safely, and what happens to in-flight work when you do · every credential and where it lives, named but never valued · what to review quarterly and against what · who to contact.

Write for someone who was not here when it was built and has a problem right now.` },

{ id:'build.agent-charter', category:'build', title:'Agent or assistant charter',
  when:'Before delegating anything to software that acts on its own.',
  note:'Same document whether the thing acting is software or a junior hire. That is the point.',
  body:`Write a charter for {{AGENT OR ASSISTANT}} at {{COMPANY}}.

Purpose: {{DESCRIBE}} · Systems it can reach: {{LIST}}

Specify: the single outcome it owns · the tools it may use, each justified individually · what it may do without approval · what requires approval and from whom · what it may never do under any circumstances · the budget or rate ceiling per period · what it logs · how a human stops it, and how many seconds that takes · who reviews its output, how often, and against what · the date this charter is reviewed.

Every irreversible action must sit behind approval, and the approval request must include enough context for the approver to judge rather than rubber-stamp. An approval where the human cannot see why the action was proposed is latency with extra steps.` },

/* ── 12 · QUALITY CONTROL ──────────────────────────────── */
{ id:'quality.fact-check-my-output', category:'quality', title:'Fact-check my own output',
  when:'Run before anything goes to a client.', note:null,
  body:`Check this before I send it.

{{PASTE THE DRAFT}}
Source material it is supposed to be based on: {{PASTE SOURCE}}

List every factual claim, and for each mark: SUPPORTED (quote the source line), UNSUPPORTED (nothing in the material backs it), or CONTRADICTED (the material says otherwise).

Pay particular attention to numbers, dates, names, and any claim about what we have done before or achieved for others. Those are the ones that end relationships.

Then list every place the draft implies certainty the source does not support, even where no explicit claim is made.` },

{ id:'quality.find-hidden-assumption', category:'quality', title:'Find the hidden assumption',
  when:'When an answer looks right and you cannot say why it bothers you.', note:null,
  body:`Here is an analysis or recommendation:
{{PASTE}}

List every assumption it depends on, including the ones it does not state. For each: what happens to the conclusion if the assumption is wrong, and how I could cheaply test it.

Rank by how much the conclusion depends on it, not by how likely it is to be wrong. A load-bearing assumption that is probably true still deserves a test, because everything rests on it.

Then name the single assumption that, if wrong, makes the whole thing worthless.` },

{ id:'quality.rewrite-for-reader', category:'quality', title:'Rewrite in the register of the reader',
  when:'Same content, aimed at someone with different concerns.', note:null,
  body:`Rewrite this for a different reader.

{{PASTE}}
Currently written for: {{WHO}}
Now aimed at: {{NEW READER}} — who cares about {{WHAT THEY CARE ABOUT}} and is sceptical about {{WHAT THEY DOUBT}}

Keep every fact and every number identical. Change what leads, what is explained, what is assumed known, and what is cut.

Then tell me what the new reader will still object to that the original never had to address — that is usually the real work.` },

{ id:'quality.ask-me-what-you-need', category:'quality', title:'Ask me what you need',
  when:'Use first, on any request where you have not supplied full context.',
  note:'Costs one round trip and routinely saves three. Use it more than feels necessary.',
  body:`I want you to {{TASK}}.

Before you do any of it, ask me the questions you need answered to do it well. Ask only questions whose answers would genuinely change the output — not a checklist.

Rank them: which one answer would improve the result most?

Then wait. Do not produce a draft alongside the questions; a draft anchors both of us to your first guess, and I will end up editing that guess instead of giving you what you actually needed.` },

];

export const PROMPT_BY_ID = Object.fromEntries(PROMPTS.map((p) => [p.id, p]));
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
