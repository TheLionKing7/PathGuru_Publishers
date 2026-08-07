-- ════════════════════════════════════════════════════════════════════════════
-- PathGuru — synchronise the August 2026 research into the agent network
--
-- Run in the Supabase SQL editor (the same database the PathGuru backend reads).
--
-- WHAT THIS IS
-- Findings from the Book Two Chapter 7 research pass and the Kelly sizing
-- analysis, written into the two places the agents actually read from:
--
--   knowledge_base  → the corpus Orion (researcher) retrieves against, and the
--                     one the Synthesizer populates from PDFs. Retrievable by
--                     every agent, which is why the durable findings go here.
--   agent_memory    → episodic memory, per agent. Nexus (CEO/orchestrator) and
--                     Orion get the entries that should shape how they behave
--                     rather than what they can look up.
--
-- WHY BOTH, AND WHY THE SPLIT MATTERS
-- A fact belongs in knowledge_base. A standing instruction belongs in
-- agent_memory, because episodic memory is injected into the agent's context at
-- the start of every task, whereas knowledge_base is only consulted when
-- something retrieves it. Putting "never cite this claim" in knowledge_base
-- would mean the prohibition only fires when the agent happens to search for it,
-- which is exactly backwards.
--
-- Every row carries its evidence class in the content, because the whole estate
-- runs on the rule that a claim without provenance is an opinion wearing a suit.
-- ════════════════════════════════════════════════════════════════════════════

--
-- NOTE ON COLUMN TYPES (this bit was got wrong once, so it is written down).
--   frameworks, concepts, entities, tags  → TEXT[]   use ARRAY[...]
--   statistics                            → JSONB    use '[{"stat":..,"source":..,"year":..}]'::jsonb
--   agent_memory.content                  → JSONB
-- The JS insert path in synthesizer.js passes plain arrays for all of them, so it
-- cannot tell you which is which — supabase-js serialises to JSON either way. Read
-- 001_agent_network.sql for the DDL, not the calling code.
--
-- agent_memory.agent_id is NOT NULL REFERENCES agents(id). 'researcher' is seeded
-- by the migration addendum at the foot of 001_agent_network.sql, so these inserts
-- satisfy the key. Note the display_name there is 'Researcher' while nexus.js calls
-- the same agent 'Orion' — harmless, but it is why the network page shows one name
-- and the code another.
--
-- ── 1. Durable findings → knowledge_base ──────────────────────────────────

INSERT INTO knowledge_base
  (title, domain, source_type, source_key, source_name, content,
   frameworks, concepts, entities, statistics, tags, relevance_score)
VALUES
(
  'EU AI Act logging duties are law but deferred — Regulation (EU) 2026/1744',
  'compliance', 'research', 'ch7-context-perimeter-research',
  'Book Two Ch7 research pass, 6 August 2026',
  'Regulation (EU) 2026/1744 of 8 July 2026 (the Digital Omnibus on AI), amending Regulation (EU) 2024/1689, was published in the Official Journal on 24 July 2026 and entered into force on 27 July 2026. Point (40) amends Article 113 and defers Chapter III Sections 1-3 — which contains the Article 12 logging duties — to 2 December 2027 for stand-alone high-risk systems (Annex III) and 2 August 2028 for AI embedded in regulated products (Annex I). Articles 12, 19 and 26 are deferred, not amended: the six-month minimum log retention survives intact and simply does not bite yet. CONSEQUENCE: nothing in the AI Act currently requires anyone to keep an agent log. An operator relying on regulation to force the discipline has 16 to 24 months of nothing. Still applicable on the original timetable: prohibitions and AI literacy from 2 Feb 2025; GPAI obligations from 2 Aug 2025; two new Article 5 prohibitions and synthetic-content marking from 2 December 2026. UNRESOLVED: one research pass reported Article 15(5) as applying from 2 August 2026; Article 15 sits in Chapter III Section 2 and should be deferred with Article 12. Read the consolidated Article 113 before relying on either. EVIDENCE CLASS: mandated, primary source, in force.',
  ARRAY['Context Perimeter'],
  ARRAY['AI Act','audit logging','regulatory deferral','high-risk AI','record-keeping'],
  ARRAY['European Union','European Commission'],
  '[{"stat": "High-risk logging duties deferred to 2 December 2027 (Annex III)", "source": "Regulation (EU) 2026/1744, Art 113 as amended", "year": 2026}, {"stat": "Regulated-product high-risk deferred to 2 August 2028 (Annex I)", "source": "Regulation (EU) 2026/1744, Art 113 as amended", "year": 2026}, {"stat": "Minimum log retention six months, unchanged", "source": "Regulation (EU) 2024/1689, Arts 19 and 26(6)", "year": 2024}]'::jsonb,
  ARRAY['compliance','ai-act','book2','ch7','regulatory','verified'],
  5
),
(
  'Twelve published prompt-injection defences bypassed at over 90 percent',
  'security', 'research', 'ch7-context-perimeter-research',
  'The Attacker Moves Second (arXiv, 10 October 2025)',
  'Nasr, Carlini, Sitawarin, Schulhoff, Hayes, Ilie, Pluto, Song, Chaudhari, Shumailov, Thakurta, Xiao, Terzis, Tramer — OpenAI, Anthropic, Google DeepMind, ETH Zurich, Northeastern, HackAPrompt. Twelve published defences, most originally reporting near-zero attack success, were bypassed at over 90 percent attack success by adaptive attacks. Human red-teaming reached 100 percent against defences scoring 0 percent under static attack. Per-defence adaptive success: Spotlighting >95, Prompt Sandwiching >95, MetaSecAlign 96, PromptGuard 94, Protect AI detector ~90, Model Armor ~90, Data Sentinel >80, MELON 76-95, PIGuard 71, StruQ 100. Three frontier labs co-authoring a paper that demolishes their own field is close to adversarial-interest-proof. COMPANION FINDING (NIST/US AI Safety Institute, 17 January 2025, AgentDojo with Claude 3.5 Sonnet): strongest baseline attack 11 percent success; strongest novel red-team attack 81 percent; repeating attacks raised average success from 57 to 80 percent over 25 attempts. Attack success is a function of attacker effort, not of fixed defence quality. EVIDENCE CLASS: peer-adjacent preprint plus government measurement, both primary.',
  ARRAY['Context Perimeter'],
  ARRAY['prompt injection','adaptive attack','blast radius','agent security','red teaming'],
  ARRAY['OpenAI','Anthropic','Google DeepMind','NIST','ETH Zurich'],
  '[{"stat": "Over 90% adaptive attack success against 12 published defences", "source": "The Attacker Moves Second, arXiv 10 Oct 2025", "year": 2025}, {"stat": "11% attack success under strongest baseline vs 81% under novel red team", "source": "NIST / US AI Safety Institute, AgentDojo, 17 Jan 2025", "year": 2025}, {"stat": "Average attack success rose 57% to 80% over 25 attempts", "source": "NIST / US AI Safety Institute, 17 Jan 2025", "year": 2025}, {"stat": "Human red-teaming reached 100% against defences scoring 0% under static attack", "source": "The Attacker Moves Second, arXiv 10 Oct 2025", "year": 2025}]'::jsonb,
  ARRAY['security','prompt-injection','book2','ch7','verified'],
  5
),
(
  'Permission filtering must happen at retrieval, never post-hoc',
  'security', 'research', 'ch7-context-perimeter-research',
  'Book Two Ch7 research pass, 6 August 2026',
  'AWS states the operative rule (18 September 2025): assume that any data passed to an LLM as part of a prompt could be returned to the principal. Post-hoc filtering fails because data leaves through side channels — in EchoLeak the exfiltration was an auto-fetched markdown image and three independent output-side controls fell in one chain. THREE CASES. Slack AI (August 2024): an attacker created a public channel of one; because public-channel messages are searchable workspace-wide regardless of membership, Slack AI pulled attacker text and victim private-channel content into one context. Slack confirmed on 19 August 2024 this was intended behaviour. "Everyone can search it" and "safe beside private data in a model context" are different properties. Lasso Security (retest 14 January 2025): repositories public during 2024 then made private or deleted remained retrievable through Copilot — 20,580 repositories across 16,290 organisations including Microsoft own, plus 300+ private tokens. The ACL changed; the index did not. ServiceNow Now Assist (AppOmni, 19 November 2025): agents run with the privilege of the user who started the interaction unless otherwise configured, so a payload planted by a low-privileged user executes with admin privileges when an admin later triggers it. ServiceNow confirmed intended behaviour. SCALING CEILING: Pinecone documentation gives metadata-filtered multitenancy at 100 read units against 1 for namespace-per-tenant, with $in/$nin capped at 10,000 values, while AWS notes principals may belong to hundreds of groups. Filter-based ACLs run out of room. EVIDENCE CLASS: vendor documentation and disclosed incidents, all primary, none a confirmed in-the-wild breach.',
  ARRAY['Context Perimeter'],
  ARRAY['retrieval-time permission','ACL staleness','agent identity','multitenancy','least privilege'],
  ARRAY['Slack','Microsoft','ServiceNow','AWS','Pinecone','Lasso Security','AppOmni'],
  '[{"stat": "20,580 repositories across 16,290 organisations still retrievable after being made private", "source": "Lasso Security retest, 14 Jan 2025", "year": 2025}, {"stat": "Metadata-filtered multitenancy costs 100 read units against 1 for namespace-per-tenant", "source": "Pinecone documentation", "year": 2025}, {"stat": "Filter operators capped at 10,000 values, against identity models carrying hundreds of groups per principal", "source": "Pinecone documentation; AWS guidance", "year": 2025}]'::jsonb,
  ARRAY['security','rag','permissions','book2','ch7','verified'],
  5
),
(
  'Embedding inversion recovers 92 percent of 32-token inputs exactly',
  'security', 'research', 'ch7-context-perimeter-research',
  'Morris, Kuleshov, Shmatikov, Rush — EMNLP 2023',
  'Dense text embeddings can be inverted to recover the original text: 92 percent of 32-token inputs recovered exactly, with public code. OPERATIONAL CONSEQUENCE: a purge that removes source documents but leaves vectors behind has not removed the secret. This is the most defensible technical claim available on vector-store data handling and the one most often got wrong in practice — deletion policies routinely cover the document store and not the index. EVIDENCE CLASS: peer-reviewed, reproducible.',
  ARRAY['Context Perimeter'],
  ARRAY['embedding inversion','vector store','data deletion','right to erasure'],
  ARRAY['EMNLP','Cornell'],
  '[{"stat": "92% of 32-token inputs recovered exactly from dense embeddings", "source": "Morris, Kuleshov, Shmatikov, Rush \u2014 EMNLP", "year": 2023}]'::jsonb,
  ARRAY['security','embeddings','privacy','book2','ch7','verified'],
  4
),
(
  'Audit logs: what is actually mandated, and the retention arithmetic that fails',
  'compliance', 'research', 'ch7-context-perimeter-research',
  'Book Two Ch7 research pass, 6 August 2026',
  'IN FORCE AND USABLE. MiFID II RTS 6 Article 5(7): for each change to a trading algorithm, record when it was made, who made it, who approved it, and what it was — in force since 3 January 2018, and the model the AI Act did not copy. SEC 17a-4 as amended (Release 34-96034, effective 3 January 2023): a complete time-stamped audit trail recording all modifications and deletions, their date and time, and the identity of the individual responsible is now a lawful substitute for WORM hardware — the strongest regulatory endorsement available of hash-chained append-only logging. PCI DSS v4.0.1 Requirement 10.2.1.3: log all access to the audit logs — the clearest mandate anywhere for access logging on the log itself. eIDAS Article 41(2): a qualified time stamp carries a presumption of accuracy and integrity, with implementing detail in Commission Implementing Regulation (EU) 2025/1929 applicable from 20 October 2025. GDPR PRECISION: Article 30 is a static register of processing activities, not an event log, and requires logging no transaction; the operational duty comes from Article 5(2) accountability and Article 32 security, both outcome-based, while Article 5(1)(e) storage limitation cuts the other way. THE RETENTION ARITHMETIC: AI Act floor is six months; limitation in England and Wales is six years; SEC and FINRA require six years; SOX auditor retention is seven. A firm complying with the AI Act minimum and nothing else destroys the evidence roughly eleven and a half years before it needs it, and under FRCP 37(e) may face an adverse-inference instruction for having done so. EVIDENCE CLASS: mandated, primary sources, article and rule numbers verified.',
  ARRAY['Context Perimeter'],
  ARRAY['audit logs','evidentiary standards','retention','non-repudiation','trusted timestamping'],
  ARRAY['SEC','FINRA','PCI SSC','European Union','ESMA'],
  '[{"stat": "SEC 17a-4 and FINRA 4511 require six years", "source": "17 CFR 240.17a-4; FINRA Rule 4511", "year": 2023}, {"stat": "SOX auditor retention seven years", "source": "17 CFR 210.2-06; PCAOB AS 1215", "year": 2003}, {"stat": "EU AI Act minimum log retention six months", "source": "Regulation (EU) 2024/1689, Arts 19 and 26(6)", "year": 2024}, {"stat": "Limitation period in England and Wales six years", "source": "Limitation Act 1980, s.5", "year": 1980}]'::jsonb,
  ARRAY['compliance','audit','logging','book2','ch7','verified'],
  5
),
(
  'The sizing asymmetry — Kelly applied to commitment under uncertainty',
  'strategy', 'research', 'kelly-sizing-advisory',
  'Kelly sizing analysis, recomputed 6 August 2026',
  'For any real edge there is exactly one fraction of resources that maximises long-run growth, and the curve around that optimum is not symmetric. At a 55 percent chance paying two to one the optimum is 32.5 percent; half of that retains 76 percent of the growth rate; twice it drives the growth rate to minus 0.014 per decision, with 54 percent of hundred-decision paths finishing below their start despite a genuine edge throughout. Full-optimum sizing carries a 92 percent median maximum drawdown, which is why practitioners take a fraction. SUBSTITUTION: replace capital with the discretionary transformation budget, the win rate with the probability this initiative delivers, the payoff ratio with recoverable margin over cost at risk. LIMITS, STATED BEFORE A QUANT STATES THEM: Kelly assumes bets that repeat, can be re-sized freely, and are independent. An automation programme is lumpy, partly irreversible, and correlated — a portfolio of six pilots is often one pilot attempted six times. This is a ceiling and a discipline, not a formula for a capital budget. Also: entropy is a multiplicative drag — three per cent monthly is 1 minus 0.97^12 = 30.6 per cent a year, not thirty-six, and 84 per cent over five years. Friction does not reduce growth; it reduces the exponent. EVIDENCE CLASS: derived, computed analytically and confirmed by seeded 40,000-path simulation; all parameters stated and reproducible.',
  ARRAY['Commitment Sizer','FrictionIQ'],
  ARRAY['fractional Kelly','sizing asymmetry','geometric mean','compounding','error budget'],
  ARRAY['John Kelly Jr','Daniel Bernoulli','Bell Labs'],
  '[{"stat": "Optimum fraction 32.5% at p=0.55, b=2", "source": "Derived; Kelly 1956", "year": 2026}, {"stat": "Half the optimum retains 76% of the long-run growth rate", "source": "Derived analytically, confirmed by 40,000-path simulation", "year": 2026}, {"stat": "Twice the optimum gives growth of -0.014 per decision, 54% of paths below start", "source": "Derived analytically, confirmed by 40,000-path simulation", "year": 2026}, {"stat": "Full-Kelly median maximum drawdown 92%", "source": "10,000-path Monte Carlo", "year": 2026}, {"stat": "3% monthly friction compounds to 30.6% a year, not 36%", "source": "1 - 0.97^12, reproducible", "year": 2026}]'::jsonb,
  ARRAY['strategy','sizing','frictioniq','book1','verified'],
  5
);

-- ── 2. Standing instructions → agent_memory (Nexus and Orion) ─────────────
--
-- These are behavioural rather than factual, which is why they go here: episodic
-- memory is injected at the start of every task, so a prohibition fires whether
-- or not the agent thought to search for it.

INSERT INTO agent_memory (agent_id, task_id, type, summary, content, tags, importance)
VALUES
(
  'researcher', NULL, 'directive',
  'DO-NOT-CITE register — claims that do not survive checking. Never reproduce these.',
  jsonb_build_object(
    'rejected_outright', jsonb_build_array(
      '89% of organisations using RAG are exposing proprietary data or PII, attributed to a July 2026 study by CyberAI Labs — no methodology, no sample, no authors, no traceable existence for the organisation. Related 72% and 73% figures from the same source are equally untraceable. There is no real number to substitute; no such population study exists.',
      'Princeton Newport Partners returned 20% a year for 30 years with no down year — the fund ran 1969-1988, nineteen years, ~19.1% gross and 15.1% net. The no-down-year element is fair; use the real numbers.',
      'The Kelly formula ran inside Renaissance Technologies — methods are not public, unfalsifiable, unusable.',
      'Buffett uses roughly quarter-Kelly — retrofitted, no such statement exists.',
      'The Kelly formula generated more wealth than any other equation in finance — unsupportable superlative.',
      'Half-Kelly cuts variance by 50% — wrong. Variance scales with the square of the fraction, so half-Kelly leaves ~25%. It is the standard deviation that halves.'
    ),
    'usable_only_with_frame', jsonb_build_array(
      '99% of organisations have exposed sensitive data — Varonis own 1,000-environment assessment base, no collection date, drawn from organisations that already suspected a permissions problem.',
      'Copilot accessed 3 million confidential records per organisation — Concentric AI own customer aggregate, no published sample size or methodology.',
      'Anthropic browser-agent figures 23.6% then 11.2% then 1% — three different evaluations with different attackers. The trend is real; the series is not, and must not be presented as one.'
    ),
    'standing_rules', jsonb_build_array(
      'The date on a figure must be the date of MEASUREMENT, not the date of the page it was found on. This has caught errors in three separate chapters and is the highest-yield check available.',
      'Label every source: mandated / industry practice / vendor self-report. A vendor benchmark may still be usable, cited AS a vendor self-report, which often strengthens a sceptical argument.',
      'Derive from an established law before citing anyone. Derivation has no attack surface and no expiry date.',
      'Microsoft Spotlighting reporting >50% to <2% attack success is true as a March 2024 measurement and misleading now. If cited, cite >95% under adaptive attack in the same breath.',
      'The public AgentDojo leaderboard results are dated 24 February 2025. Any 2026 article citing AgentDojo is citing a late-2024 measurement.'
    )
  ),
  ARRAY['do-not-cite','evidence-discipline','research-standards','governing'],
  5
),
(
  'nexus', NULL, 'directive',
  'Estate state as of 6 August 2026 — what exists, what is only a plan, and what must not be claimed as a capability.',
  jsonb_build_object(
    'built_and_live', jsonb_build_array(
      'FrictionIQ diagnostic with the Commitment Sizer and sector-architecture cards, live on digitafusion.com/diagnostic — cards render on the result screen after completion, not on the landing page.',
      'The FrictionIQ register, moved to PathGuru.',
      'Pre-orders for all four Techno-Economist books, charging at purchase, on digitafusion.com/pre-order. Book One releases 1 October 2026.',
      'Two live articles: /the-friction-tax and /why-corporate-ai-pilots-fail, both linking to the pre-order page.'
    ),
    'designed_but_not_built', jsonb_build_array(
      'The agentic consulting infrastructure — trace table, verification gate, budget ceiling, context perimeter. Documented in digitafusion/agentic-consulting-infrastructure.md. NOT BUILT.',
      'The ground-truth event log. NOT BUILT — and until it exists every probability the firm quotes is a declared prior, which the Commitment Sizer already says on its own face.'
    ),
    'binding_rule',
    'Never present the agent stack or the event log as a capability. They are plans. Until the event log exists, any conversion or success probability the firm states is a prior and must be described as one.',
    'framework_count', 'Nine frameworks — five operating, four sector architectures — plus three blueprints and two research volumes. Books are research the agency draws on, never frameworks.',
    'open_items', jsonb_build_array(
      'paid-acquisition-sizing-rule.md has two figures still blank: the first tranche and the total maximum. Both must be filled before any campaign runs.',
      'Book Two Chapter 7 research complete, chapter undrafted. Chapters 8, 9 and the Conclusion follow.',
      'Paystack has never processed an order end to end — a one-unit probe product exists for verifying the payment path.'
    )
  ),
  ARRAY['estate-state','governing','capability-claims','august-2026'],
  5
),
(
  'nexus', NULL, 'directive',
  'Sizing discipline — the firm applies to itself what the Commitment Sizer tells clients.',
  jsonb_build_object(
    'principle', 'The penalty for committing less than optimal is gentle and roughly linear; the penalty for committing more is steep and non-linear. Underbetting costs time. Overbetting costs the firm.',
    'applied_to_the_firm', jsonb_build_array(
      'Paid acquisition: the first tranche is fixed before launch and never raised mid-flight, including for a good reason — an in-flight raise is always justified by a signal too small to have been measured.',
      'Scale only if the pessimistic end of the confidence interval clears break-even. If the interval straddles break-even, nothing has been learned that justifies more money.',
      'Thirty completed assessments minimum from a single channel before any scaling decision is even available. Below that the interval is too wide for the lower-bound test to pass on any realistic rate.',
      'Distinguishing a 5% conversion rate from 2.5% needs roughly 905 completed assessments per channel. The gate cannot be "wait for significance" — that will never arrive.'
    ),
    'measure_only', 'Completed assessments, and of those the share reaching capture. Ignore impressions, reach, CTR, engagement rate, follower growth, video views and cost per click — they are available, and an available number crowds out an important one.'
  ),
  ARRAY['sizing','paid-acquisition','governing','discipline'],
  4
);

-- ── 3. Verify ─────────────────────────────────────────────────────────────
--
--   SELECT title, domain, relevance_score FROM knowledge_base
--   WHERE 'ch7' = ANY(tags) OR 'verified' = ANY(tags) ORDER BY created_at DESC;
--
--   SELECT agent_id, type, summary, importance FROM agent_memory
--   WHERE 'governing' = ANY(tags) ORDER BY created_at DESC;
--
-- Orion recalls episodic memory at the start of each task, so the do-not-cite
-- register fires on every research run rather than only when searched for.
-- ════════════════════════════════════════════════════════════════════════════
