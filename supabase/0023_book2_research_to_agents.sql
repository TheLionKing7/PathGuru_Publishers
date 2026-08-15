-- ════════════════════════════════════════════════════════════════════════════
-- 0023_book2_research_to_agents.sql
--
-- Synthesis of the Book Two completion research (13 August 2026) into the
-- agent network. Successor to 0018_research_to_agents.sql, which carried the
-- Chapter 7 pass. This one carries:
--
--   • the Chapter 8 regulatory pass  (what actually binds, and what does not)
--   • the Chapter 9 economic pass    (inference economics, and a direction
--                                     reversal that invalidates every TCO
--                                     model written before Q4 2025)
--   • the method findings            (derivation over citation; the
--                                     verification-pass failure modes)
--   • six new do-not-cite entries
--
-- COLUMN TYPES — read from supabase/001_agent_network.sql, not inferred:
--   knowledge_base.frameworks / concepts / entities / tags  → TEXT[]  (ARRAY[...])
--   knowledge_base.statistics / metadata                    → JSONB   (::jsonb)
--   agent_memory.content                                    → JSONB
--   agent_memory.tags                                       → TEXT[]
--   agent_memory.agent_id                                   → REFERENCES agents(id)
--
-- Valid agent ids: synthesizer, nexus, atlas, nova, aether, pulse, assistant,
-- researcher. ('Orion' is the display name nexus.js uses for 'researcher'.)
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. Re-run guard ───────────────────────────────────────────────────────
-- knowledge_base has no unique constraint on title, so a second run of this
-- file would duplicate every row rather than conflict. Clear this migration's
-- own rows first, keyed on source_key and on the exact tag set it writes.
-- This touches nothing written by 0018 or by Synthesizer's PDF ingestion.

DELETE FROM knowledge_base
 WHERE source_key IN ('ch8-compliance-research', 'ch9-tco-research', 'book2-completion')
    OR (source_key = 'ch7-context-perimeter' AND 'original' = ANY(tags));

DELETE FROM agent_memory
 WHERE 'book2' = ANY(tags)
   AND type IN ('doctrine', 'task_result')
   AND agent_id IN ('synthesizer', 'researcher')
   AND (summary LIKE 'DO-NOT-CITE REGISTER, second tranche%'
     OR summary LIKE 'STANDING RULE: the direction of hardware%'
     OR summary LIKE 'For research runs: the two highest-value%'
     OR summary LIKE 'Book Two "The Agentic Stack" completed%');

DELETE FROM agent_memory
 WHERE agent_id = 'synthesizer'
   AND summary LIKE 'EVIDENCE CLASS is a required field%';


-- ── 1. Durable findings → knowledge_base ──────────────────────────────────

INSERT INTO knowledge_base
  (title, domain, source_type, source_key, source_name, content,
   frameworks, concepts, entities, statistics, tags, relevance_score)
VALUES

-- ─────────── COMPLIANCE ───────────
(
  'RESOLVED: AI Act Article 15 is deferred with Article 12 — and the Commission''s own page was wrong',
  'compliance', 'research', 'ch8-compliance-research',
  'Book Two Ch8 research pass, 13 August 2026',
  'The contradiction flagged in the Ch7 pass is settled. Article 15 (accuracy, robustness, cybersecurity) sits in Chapter III Section 2, the same section as Article 12 (record-keeping). Regulation (EU) 2026/1744 defers Chapter III Sections 1, 2 and 3 in full — to 2 December 2027 for Annex III high-risk systems and 2 August 2028 for Annex I regulated products. There is no drafting route by which Article 15(5) applies from 2 August 2026 while Article 12 defers. Article 19 (six-month log retention floor) is in Section 3 and is deferred with them: the six-month minimum is a 2027/2028 duty, not a 2026 one, and that is the easiest error to make in this area. WHAT STILL APPLIES FROM 2 AUGUST 2026: Article 50 transparency, plus governance and market-surveillance machinery. THE FINDING WORTH USING: on 13 August 2026 — seventeen days after the amending regulation entered force — the European Commission''s own AI Act Service Desk was still serving the superseded Article 113 under a banner admitting the page had not been updated. A firm checking the regulator''s official lookup tool in good faith would have built to a deadline that no longer existed. That is almost certainly the origin of the earlier error, and it is a better argument for compliance-as-architecture than any invented example. EVIDENCE CLASS: primary legal instrument, corroborated by regulator guidance and three independent readings.',
  ARRAY['Compliance as Architecture'],
  ARRAY['AI Act','regulatory deferral','Article 113','record-keeping','robustness'],
  ARRAY['European Union','European Commission'],
  '[{"stat": "Chapter III Sections 1-3 deferred to 2 December 2027 (Annex III)", "source": "Regulation (EU) 2026/1744", "year": 2026}, {"stat": "Deferred to 2 August 2028 for Annex I regulated products", "source": "Regulation (EU) 2026/1744", "year": 2026}, {"stat": "Commission AI Act Service Desk still serving superseded Article 113 seventeen days after entry into force", "source": "Observed 13 August 2026", "year": 2026}]'::jsonb,
  ARRAY['compliance','ai-act','book2','ch8','regulatory','verified','resolved'],
  5
),
(
  'Finance has required version-bound decision attribution since 2018 — RTS 22, not RTS 6',
  'compliance', 'research', 'ch8-compliance-research',
  'Commission Delegated Regulation (EU) 2017/590, applies 3 January 2018',
  'CORRECTION TO EARLIER GUIDANCE: the per-transaction version-binding duty lives in RTS 22 (transaction reporting), not RTS 6 (organisational requirements). RTS 22 Article 8: where a computer algorithm makes the investment decision, it must be identified in field 57. Article 8(3) sets the designation''s properties — unique for each set of code or trading strategy; used consistently when referring to the algorithm OR VERSION OF THE ALGORITHM; and unique over time. Article 9 does the same for execution (field 59). RTS 6 Article 5(7) is the supporting change-control duty, and its exact wording matters: records of "any MATERIAL change made to the SOFTWARE USED FOR algorithmic trading", allowing determination of when, who made it, who approved it, and the nature of the change. Drafting it as "every change to a trading algorithm" invites a hostile reader to produce the text and win. THE CONTRAST THAT CARRIES THE ARGUMENT: AI Act Article 12 prescribes minimum log content for exactly one case — remote biometric identification under Annex III 1(a). Nothing in the Act requires a model version or system-prompt version to be bound to an inference. Finance has required it per transaction since January 2018; AI regulation, arriving a decade later, requires the capability to log and does not say what to log — and does not require it yet. EVIDENCE CLASS: primary legal instrument, verbatim.',
  ARRAY['Compliance as Architecture','Configuration Designation'],
  ARRAY['MiFID II','transaction reporting','algorithm versioning','decision attribution','audit trail'],
  ARRAY['European Union','ESMA'],
  '[{"stat": "Algorithm designation must be unique over time and used consistently across versions", "source": "Commission Delegated Regulation (EU) 2017/590, Art 8(3)", "year": 2017}, {"stat": "Applies from 3 January 2018", "source": "RTS 22 / RTS 6", "year": 2018}, {"stat": "AI Act prescribes log content for remote biometric ID only", "source": "Regulation (EU) 2024/1689, Art 12(3)", "year": 2024}]'::jsonb,
  ARRAY['compliance','mifid','book2','ch8','audit-log','verified','borrowable'],
  5
),
(
  'What actually binds today — GDPR, HIPAA, PCI DSS, SEC, and two claims that fail checking',
  'compliance', 'research', 'ch8-compliance-research',
  'Book Two Ch8 research pass, 13 August 2026',
  'GDPR: Article 30 is a STATIC REGISTER of categories of processing — it requires no event log, no per-transaction record, nothing about a decision. Firms pointing at Article 30 as their AI logging obligation have the wrong article. The operational duty is Article 5(2) accountability plus Article 32 security, both outcome-based; Article 32 does not use the word logging. Article 5(1)(e) storage limitation cuts against retention. THE SHARPEST CONTRAST: Directive (EU) 2016/680 Article 25 DOES impose true event logging for law-enforcement processing (collection, alteration, consultation, disclosure, combination, erasure, with identity and justification), transposition 6 May 2018. The EU legislature knows how to draft a logging duty; it did so in 2016 for police data and chose not to in the GDPR. HIPAA: 45 CFR 164.312(b) audit controls is the entire text — no mechanism, no content, no retention period — and it is unchanged since the Security Rule compliance date of 21 April 2005. An NPRM to strengthen it was published 6 January 2025 and has NOT been finalised. PCI DSS 10.2.1.3 ("audit logs capture all access to audit logs") is contractual scheme rule, not law, and has been mandatory since 31 March 2024 — do NOT attach the 31 March 2025 future-dated deadline to it. SEC 17a-4(f)(2)(i)(A)(1): a complete time-stamped audit trail recording modifications, deletions, date, time and responsible individual is a lawful means of preservation, and in the rule''s own text it is listed FIRST, ahead of WORM at (A)(2). Effective 3 January 2023; broker-dealer compliance date circa 3 May 2023. EVIDENCE CLASS: primary legal instruments throughout.',
  ARRAY['Compliance as Architecture'],
  ARRAY['GDPR','HIPAA','PCI DSS','SEC 17a-4','audit controls','WORM'],
  ARRAY['European Union','HHS OCR','PCI Security Standards Council','SEC'],
  '[{"stat": "HIPAA audit controls standard unchanged since 21 April 2005", "source": "45 CFR 164.312(b)", "year": 2005}, {"stat": "Audit trail is a lawful alternative to WORM, listed first in the rule", "source": "17 CFR 240.17a-4(f)(2)(i)(A)(1)", "year": 2023}, {"stat": "PCI DSS 10.2.1.3 mandatory since 31 March 2024", "source": "PCI DSS v4.0.1", "year": 2024}]'::jsonb,
  ARRAY['compliance','book2','ch8','gdpr','hipaa','verified'],
  5
),
(
  'The retention arithmetic, and the FRCP 37(e) threshold most people overstate',
  'compliance', 'research', 'ch8-compliance-research',
  'Book Two Ch8 research pass, 13 August 2026',
  'RETENTION PERIODS, each with its instrument: AI Act Article 19(1) at least six months (DEFERRED, so currently zero); SEC 17a-4(a) not less than six years, first two easily accessible; FINRA Rule 4511(b) at least six years as the default where no period is specified (note: 4511(b), NOT 4511(c), which is the format/media rule — secondary sources swap these); SOX auditor retention seven years under 17 CFR 210.2-06; simple contract limitation in England and Wales six years under Limitation Act 1980 s.5. A firm complying with the AI Act minimum and nothing else destroys its evidence FIVE AND A HALF YEARS before the limitation period on the related contract has run. FRCP 37(e) — STATE THE THRESHOLD PRECISELY: four predicates must all be met (should have been preserved in anticipation or conduct of litigation; lost; failed to take REASONABLE STEPS; cannot be restored or replaced). Only then does the court reach (e)(1) curative measures on a finding of prejudice, or (e)(2). The adverse-inference instruction under (e)(2) requires a finding of INTENT TO DEPRIVE — gross negligence is not enough. The safe framing is not "if you do not log, you lose". It is: if you cannot produce, and a court finds you designed the system so you could not produce, the presumption runs against you — and intent gets inferred from architecture decisions made years before the litigation. EVIDENCE CLASS: primary legal instruments, verbatim.',
  ARRAY['Compliance as Architecture'],
  ARRAY['retention','spoliation','limitation period','evidence','FRCP 37(e)'],
  ARRAY['SEC','FINRA','United States Courts'],
  '[{"stat": "SEC and FINRA both six years; SOX seven; England and Wales contract six", "source": "17a-4(a), FINRA 4511(b), 17 CFR 210.2-06, Limitation Act 1980 s.5", "year": 2026}, {"stat": "Adverse inference requires intent to deprive, not negligence", "source": "FRCP 37(e)(2), effective 1 December 2015", "year": 2015}]'::jsonb,
  ARRAY['compliance','book2','ch8','retention','litigation','verified'],
  4
),
(
  'NEGATIVE FINDING: no enforcement action anywhere has turned on an AI decision log',
  'compliance', 'research', 'ch8-compliance-research',
  'Book Two Ch8 research pass, 13 August 2026',
  'Targeted searching for any 2025-2026 enforcement action, fine or judgment hinging on the presence, absence or adequacy of AI decision logs returned almost exclusively VENDOR CONTENT MARKETING asserting that regulators "now require" AI audit trails, with no case citations. The AI enforcement actions that do exist — FTC v Rite Aid (Dec 2023), FTC/Evolv (Sep 2024), EEOC/iTutorGroup (2023), NYC Local Law 144 activity — are all about SUBSTANTIVE wrongs: deception, discrimination, unsubstantiated claims. None is an evidentiary-record case, and any tracker characterising them as turning on audit trails was not corroborated against the underlying orders. USE THE NEGATIVE FINDING, it is stronger than a case would be: the obligations are being designed now, in a period with no case law to calibrate against, which means the first firm tested will set the standard for everyone using whatever architecture it happened to build. AND FLAG THE CONTAMINATION: "regulators now require AI audit trails" is false as a statement of positive law in August 2026 and is the single most contaminated claim in this research area. EVIDENCE CLASS: exhaustive negative search; the absence is the finding.',
  ARRAY['Compliance as Architecture'],
  ARRAY['enforcement','case law','vendor marketing','negative finding'],
  ARRAY['FTC','EEOC','NYC DCWP'],
  '[{"stat": "Zero verified enforcement actions turning on AI decision logs as of August 2026", "source": "Exhaustive search, 13 August 2026", "year": 2026}]'::jsonb,
  ARRAY['compliance','book2','ch8','do-not-cite-adjacent','verified','negative-finding'],
  5
),

-- ─────────── ECONOMICS ───────────
(
  'DIRECTION REVERSAL: hardware and rented GPU prices rose through 2026 — every pre-Q4-2025 TCO model is inverted',
  'economics', 'research', 'ch9-tco-research',
  'Book Two Ch9 research pass, 13 August 2026',
  'THE MOST CONSEQUENTIAL FINDING IN THIS PASS. Every TCO model written before Q4 2025 assumes hardware depreciates against falling replacement cost. For 2026 that assumption is INVERTED, driven by a DRAM/HBM shortage. Documented consequences: a consumer GPU with a $1,999 launch MSRP selling at $4,381 street in August 2026 (+119%); a professional card''s MSRP RAISED MID-LIFE by 87% (close to unprecedented); one hyperscaler raising GPU capacity-block prices TWICE in six months (January and July 2026, both without announcement) after having CUT the same line 25% in June 2025; a major vendor withdrawing its largest unified-memory configuration entirely and raising the next tier 25%. Separately, one hyperscaler SHORTENED its AI/ML hardware depreciation from six years to five on 7 February 2025, citing the pace of AI development — the first reversal after a decade in which every large operator EXTENDED useful life. STANDING RULE: do not print "prices will keep falling" as an assumption in any deliverable. Say the numbers will move and the direction is no longer knowable. When the firms with the best information disagree about the useful life of the asset, a three-year amortisation is a judgment rather than a fact. EVIDENCE CLASS: analyst firm with stated methodology (DRAM contract prices), trade press (street prices), provider pricing pages (rate rises), company disclosure (depreciation).',
  ARRAY['Total Cost of Intelligence'],
  ARRAY['TCO','hardware pricing','DRAM shortage','depreciation','capital budgeting'],
  ARRAY['NVIDIA','AWS','Apple','Amazon','TrendForce'],
  '[{"stat": "Consumer GPU street price $4,381 against $1,999 launch MSRP (+119%)", "source": "Trade press, 7 August 2026", "year": 2026}, {"stat": "Professional card MSRP raised mid-life by 87%", "source": "Vendor list price via trade press, early August 2026", "year": 2026}, {"stat": "Hyperscaler raised GPU prices twice in six months, +15% Jan and ~20% Jul 2026", "source": "Provider pricing page and trade press", "year": 2026}, {"stat": "Amazon shortened AI hardware depreciation 6 to 5 years", "source": "Company disclosure, 7 February 2025", "year": 2025}]'::jsonb,
  ARRAY['economics','book2','ch9','tco','hardware','standing-rule','verified'],
  5
),
(
  'The make-or-rent theorem: the multiplexing penalty 1 + beta/sqrt(R)',
  'economics', 'derivation', 'ch9-tco-research',
  'Derived from queueing theory — settled science, no citation required',
  'THE STRONGEST MATERIAL IN THE BOOK BECAUSE IT IS DERIVED, NOT CITED. Three results, each provable in a paragraph. (1) COST: with hourly rate R, saturated throughput T and utilization rho, cost per million tokens = R / (rho * T * 3600) * 1e6, so cost per token is EXACTLY inversely proportional to utilization. Halve utilization, double the price of everything. Confirmed to three significant figures by a published measured benchmark: $0.469/M at 100% utilization rising to $4.693/M at 10% — exactly ten times. (2) LATENCY: single-server mean time in system is service time times 1/(1-rho). At rho=0.5 latency is 2x; at 0.9, 10x; at 0.95, 20x; at 0.99, 100x. (3) THE OPTIMUM: cost goes as 1/rho and latency as 1/(1-rho), so their product goes as 1/(rho(1-rho)); maximising rho - rho^2 gives 1 - 2rho = 0, so RHO* = 0.5 EXACTLY. The joint cost-and-latency optimum for a single inference server is precisely half capacity. (4) THE PENALTY: by the square-root staffing rule, servers needed = R + beta*sqrt(R), so achievable utilization = 1/(1 + beta/sqrt(R)). Headroom falls as 1/sqrt(R). Since cost goes as 1/rho, the MULTIPLEXING PENALTY = 1 + beta/sqrt(R): at beta=1, a small firm at 2 GPU-equivalents pays 1.71x, mid-market at 20 pays 1.22x, a conglomerate at 200 pays 1.07x, a hosted provider at 2000 pays 1.02x. At identical hardware, software and skill, the small firm loses ~1.7x from statistical multiplexing alone, it cannot be optimised away, and it decays as the square root of load. EVIDENCE CLASS: settled science, derivable in the text, no citation should be given.',
  ARRAY['Total Cost of Intelligence','Multiplexing Penalty'],
  ARRAY['queueing theory','utilization','capacity planning','make-or-rent','square-root staffing'],
  ARRAY[]::TEXT[],
  '[{"stat": "Joint cost-latency optimum is exactly 50% utilization", "source": "Derived: minimise 1/(rho(1-rho))", "year": 2026}, {"stat": "Multiplexing penalty 1.71x at 2 GPU-equivalents, 1.07x at 200", "source": "Derived: 1 + beta/sqrt(R), beta=1", "year": 2026}, {"stat": "Cost per token exactly inversely proportional to utilization, confirmed 100% to 10% = 10x", "source": "Published measured benchmark, 8 July 2026", "year": 2026}]'::jsonb,
  ARRAY['economics','book2','ch9','derivation','governing','verified'],
  5
),
(
  'Inference pricing: the durable multipliers, and the thumb on the scale in every published comparison',
  'economics', 'research', 'ch9-tco-research',
  'Provider pricing pages, read 13 August 2026',
  'PRINT THE MULTIPLIERS, NOT THE PRICES. Three major frontier providers have converged on two structural discounts that are far more durable than the per-token rates around them: prompt-cache reads cost ~0.1x fresh input, and batch submission costs 0.5x on both sides. Those have 24+ month shelf life; the prices have about six. THE SYSTEMATIC DISTORTION: every published build-vs-rent comparison examined prices the API at NAIVE LIST and the owned box at OPTIMAL UTILIZATION. Both halves are wrong in the same direction. Applied to a retrieval-heavy enterprise flow at ~80% cache hit, caching alone cuts a blended rate by more than 40%, and caching plus batching takes it to roughly a THIRD of naive list. Correct both sides and the break-even volume in every published comparison moves out by roughly an order of magnitude. CORRECTED BLENDS at an 88:12 input:output mix (the typical retrieval-heavy enterprise ratio): hosted open-weight endpoints land at $0.09-$0.21 per million, NOT the $0.33 previously used — too high by roughly threefold. Frontier mid-tier blends to $2.96-$3.20. ALSO NOTE: data residency now has a published price — one provider charges a 10% premium for US-only endpoints and 1.5x standard rates for region-restricted deployments. That is a direct, citable number for the sovereignty argument. AND A TRAP: at least one provider publishes dedicated GPU rates PER MINUTE while aggregator sites reproduce them as hourly — a 60x error. EVIDENCE CLASS: provider list prices, primary, read 13 August 2026; six-month shelf life.',
  ARRAY['Total Cost of Intelligence'],
  ARRAY['inference pricing','prompt caching','batch API','blended rate','data residency'],
  ARRAY['Anthropic','OpenAI','Google','Together','DeepInfra','Groq','Fireworks','Baseten'],
  '[{"stat": "Cache read approximately 0.1x input price across three major providers", "source": "Provider pricing pages, 13 August 2026", "year": 2026}, {"stat": "Batch API 50% off both sides, converged across providers", "source": "Provider pricing pages, 13 August 2026", "year": 2026}, {"stat": "Hosted open-weight blended $0.09-0.21/M at 88:12 mix", "source": "Provider list prices, 13 August 2026", "year": 2026}, {"stat": "Data residency priced at +10% US-only, 1.5x region-restricted", "source": "Provider pricing page, 13 August 2026", "year": 2026}]'::jsonb,
  ARRAY['economics','book2','ch9','pricing','perishable','verified'],
  5
),
(
  'Utilization is a property of the operator, not the hardware — 5% against 85%',
  'economics', 'research', 'ch9-tco-research',
  'Book Two Ch9 research pass, 13 August 2026',
  'THE EVIDENCE SPLITS CLEANLY BY OPERATOR SOPHISTICATION, AND THE SPLIT IS THE FINDING. Low side: ~5% average GPU utilization across roughly 23,000 enterprise Kubernetes clusters before optimisation — but that is a VENDOR SELF-REPORT with no stated measurement window, from a vendor that sells the remedy, so it may only be used with all three caveats and only alongside the high side. High side: 83% and 85% cluster utilization measured over 11 months across 150M+ GPU-hours and 4M jobs by an operator with nothing to sell — primary, peer-reviewable, far better methodologised. RECONCILIATION: they measure different populations, unoptimised enterprise clusters before autoscaling versus a professionally scheduled research estate. The correct statement is that utilization is a property of the OPERATOR — a firm buying a box does not inherit 85%, it inherits something nearer 5%, because the scheduling competence is the product it chose not to buy. That survives the obvious rebuttal in a way "owned inference sits idle" does not. THE COUNTERWEIGHT, which a fair treatment owes: measured reliability at small scale is entirely manageable — MTTF for 8-GPU jobs is 47.7 days, against 7.9 hours at 1,024 GPUs and a projected 1.8 hours at 16,384. Failure cost is SUPERLINEAR in cluster size, so the small build is the operationally easy one. What defeats it is economics, not reliability — the opposite of what most firms fear. EVIDENCE CLASS: primary operator measurement (high side); vendor self-report with caveats (low side).',
  ARRAY['Total Cost of Intelligence'],
  ARRAY['utilization','GPU reliability','MTTF','capacity planning','idle capital'],
  ARRAY['Meta','Cast AI'],
  '[{"stat": "83% and 85% cluster utilization over 11 months, 150M+ GPU-hours", "source": "Meta, arXiv:2410.21680", "year": 2024}, {"stat": "MTTF 47.7 days at 8 GPUs vs 7.9 hours at 1,024 GPUs", "source": "Meta, arXiv:2410.21680", "year": 2024}, {"stat": "~5% enterprise GPU utilization before optimisation (vendor self-report, no measurement window)", "source": "Cast AI, 2026", "year": 2026}]'::jsonb,
  ARRAY['economics','book2','ch9','utilization','verified','use-with-caveats'],
  4
),
(
  'Enterprise AI spend is not normally distributed — the median firm spends less than one box costs',
  'economics', 'research', 'ch9-tco-research',
  'Ramp AI Index (June 2026) and Menlo Ventures (fielded 7-25 November 2025)',
  'OBSERVED TRANSACTION DATA beats stated intention here. Across 70,000+ US businesses: median AI spend $11.38 per employee per month; 90th percentile $611; top 1% $7,449. THE MEDIAN-TO-TOP-1% RATIO IS 654x, which means any "average enterprise AI spend" figure is meaningless. At 300 employees the median firm spends about $41,000 a year on AI in total — comfortably BELOW the annual cost of a single owned dual-GPU box. For most small and mid-sized firms the entire AI budget is smaller than the hardware decision being debated. SURVEY DATA, with its methodology: total 2025 enterprise generative AI spend $37B, up 3.2x from $11.5B in 2024; applications $19B / infrastructure $18B; foundation model APIs $12.5B, which is 33.8% of TOTAL spend but 69% of INFRASTRUCTURE spend — both framings circulate and they differ by 2x, so always state which. n=495 US enterprise AI decision-makers, fielded 7-25 November 2025, VC-declared interest. CRITICAL: that report publishes NO percentage of enterprises reporting measurable ROI. Any figure attributed to it on ROI is fabricated or misattributed. A separate CIO survey (n=100, as of 8 May 2025) found innovation budgets falling from 25% to 7% of LLM spend — AI moving from discretionary experiment into centralised IT and business-unit budgets, which is precisely the transition from experiment to capital budget line. EVIDENCE CLASS: observed transaction data (Ramp); analyst survey with stated methodology and fielding dates (Menlo, a16z).',
  ARRAY['Total Cost of Intelligence'],
  ARRAY['enterprise AI spend','budget distribution','capital budgeting','market sizing'],
  ARRAY['Ramp','Menlo Ventures','a16z'],
  '[{"stat": "Median $11.38 per employee per month; top 1% $7,449; ratio 654x", "source": "Ramp AI Index, June 2026, 70,000+ US businesses", "year": 2026}, {"stat": "$37B 2025 enterprise generative AI spend, $12.5B foundation model APIs", "source": "Menlo Ventures, fielded 7-25 Nov 2025, n=495", "year": 2025}, {"stat": "Innovation budgets fell 25% to 7% of LLM spend", "source": "a16z, n=100 CIOs, as of 8 May 2025", "year": 2025}]'::jsonb,
  ARRAY['economics','book2','ch9','market-data','verified'],
  4
),

-- ─────────── SECURITY / METHOD ───────────
(
  'Prompt injection reframed: it is an attack on independence, not a content problem',
  'security', 'derivation', 'ch7-context-perimeter',
  'Book Two Chapter 7, derived from IEC 61508',
  'THE REFRAME, and it is original to this estate. Indirect prompt injection is universally presented as a content problem — something bad got into the context window, filter it out. It is more accurate and more useful to see it as an ATTACK ON INDEPENDENCE. An attacker who plants one instruction in one document that several agents will retrieve has manufactured a common-cause failure to order: they have set the shared-failure fraction to one, on a flow of their choosing, at a moment of their choosing, and every downstream check that reads the same document is now an accomplice rather than a control. THE ARITHMETIC comes from reliability engineering, standardised in IEC 61508 as the BETA-FACTOR MODEL. For two redundant channels each failing at rate lambda, system failure = ((1-beta)*lambda)^2 + beta*lambda, where beta is the share of failures common to both. At lambda = 0.5%: beta=0 gives 1 error in 40,000; beta=0.1 gives 1 in 1,922; beta=0.4 gives 1 in 498; a single channel gives 1 in 200. READ THE MIDDLE ROW: a tenth of failures arriving through a shared channel does not cost a tenth of the redundancy. The second check was costed at a 200-fold improvement and delivers 9.6-fold — 95% of the value is gone at a fraction most design reviews round to zero. CONSEQUENCE FOR ARCHITECTURE: the perimeter is a DECORRELATION DEVICE with an economic justification before it is a security control. It restores the independence that every reliability figure assumes, which is what lets a firm commit at the size its edge actually supports. Give the checker a different shelf: remove from a checking agent''s context everything written by an outside party, and accept slightly higher escalation in exchange for a check that is actually independent. Independence is bought with capability; there is no version where it is free. EVIDENCE CLASS: settled science (IEC 61508), applied.',
  ARRAY['Context Perimeter','Beta-Factor Model'],
  ARRAY['prompt injection','common-cause failure','decorrelation','redundancy','blast radius'],
  ARRAY['IEC'],
  '[{"stat": "Two checks at 0.5%: 1 in 40,000 independent vs 1 in 1,922 at beta=0.1", "source": "Derived, IEC 61508 beta-factor model", "year": 2026}, {"stat": "95% of redundancy value destroyed at a 10% common-cause fraction", "source": "Derived", "year": 2026}]'::jsonb,
  ARRAY['security','book2','ch7','derivation','governing','verified','original'],
  5
),
(
  'METHOD: derive rather than cite — the two strongest chapters cited almost nothing',
  'method', 'internal', 'book2-completion',
  'Book Two completion retrospective, 13 August 2026',
  'STANDING LESSON FOR ALL FUTURE WORK. The two chapters that came out strongest are the two that DERIVED rather than cited: Chapter 7 from IEC 61508''s beta-factor model, Chapter 9 from queueing theory. A derivation has no attack surface, no expiry date, and demonstrates the method the firm sells. Where a claim can be reached from a named theorem, reach it that way and cite nothing. THREE-TEST DISCIPLINE before any number is written: (1) Is the date on this figure the date of MEASUREMENT, or the date of the page I found it on? This has now caught errors in five separate chapters and is the single highest-yield check available. (2) Is the source the vendor? A vendor announcement or benchmark is a marketing document — but it may still be usable, cited AS a vendor self-report, which often STRENGTHENS a sceptical argument. The strongest form vendor evidence takes is a vendor conceding a limit in its own documentation, or stating a weakness against its own commercial interest. (3) Can I derive this from a law already established? If so, derive it. VERIFICATION FINDINGS: an independent full-manuscript audit of 68,600 words found six arithmetic errors, sixteen internal inconsistencies, two unregistered coinages, five undated statistics and a reverted spelling convention — in a manuscript that had already been checked chapter by chapter. Run every stated arithmetic relationship in BOTH directions; forward-only checking missed all six. EVIDENCE CLASS: internal method, validated by outcome.',
  ARRAY['Evidence Discipline'],
  ARRAY['research method','verification','derivation','evidence class','fact-checking'],
  ARRAY['PathFinda Publishers'],
  '[{"stat": "Full-manuscript audit found 6 arithmetic errors and 16 inconsistencies after chapter-level checking", "source": "Book Two verification pass, 13 August 2026", "year": 2026}]'::jsonb,
  ARRAY['method','governing','book2','evidence-discipline','verified'],
  5
),
(
  'ENGINEERING LESSON: bulk text transforms fail silently — bound every structural regex',
  'method', 'internal', 'book2-completion',
  'Book Two production, 13 August 2026',
  'A regex normalising three part-opener blocks in an 83,000-word manuscript OVER-MATCHED and silently wrapped four entire chapters — roughly 107,000 characters — inside a blockquote. It was invisible in the markdown source, passed every word-count and structural check, and surfaced only on reading a rendered page of the output PDF. TWO RULES THIS PRODUCES, applicable to any bulk content pipeline: (1) BOUND EVERY STRUCTURAL REGEX WITH AN EXPLICIT ASSERTION ON MATCH LENGTH. A pattern intended to capture 1,200 characters that captures 107,000 should raise, not proceed. (2) AFTER ANY BULK TRANSFORM, RENDER AND READ A SAMPLE FROM EACH MAJOR SECTION BEFORE SHIPPING. Structural corruption is invisible to counts and greps; it is visible immediately to a human reading one page. GENERAL FORM: the recovery was cheap only because the component source files were never mutated in place — all transforms were applied to an assembled copy. Keep the assembly step and the source of truth separate, and a bad transform costs a rebuild rather than a reconstruction. EVIDENCE CLASS: internal incident, root-caused.',
  ARRAY['Evidence Discipline'],
  ARRAY['content pipeline','regression','structural corruption','build discipline'],
  ARRAY[]::TEXT[],
  '[{"stat": "107,000 characters silently corrupted by an unbounded regex; invisible to counts, visible on first rendered page", "source": "Book Two production incident, 13 August 2026", "year": 2026}]'::jsonb,
  ARRAY['method','governing','engineering','build-discipline','verified'],
  4
);


-- ── 2. Standing directives → agent_memory ─────────────────────────────────
-- Synthesizer recalls episodic memory at the start of each task, so these fire
-- on every run rather than only when searched for.

INSERT INTO agent_memory (agent_id, type, summary, content, tags, importance)
VALUES
(
  'synthesizer',
  'doctrine',
  'DO-NOT-CITE REGISTER, second tranche. Six claims that circulate widely, sound authoritative, and do not survive checking. Never pass these into a deliverable.',
  jsonb_build_object(
    'supersedes', 'None — additive to the register in migration 0018',
    'entries', jsonb_build_array(
      jsonb_build_object('claim','"Datacenter GPUs last only 1-3 years"','finding','Sourced to an anonymous self-described architect relayed via social media. The publishing outlet ITSELF states it could not verify the person and cannot trust the claim. The disclaimer is stripped everywhere the figure is repeated.','use','Cite the incident as an EXAMPLE of the failure mode. Never cite the number.'),
      jsonb_build_object('claim','"9% annualised GPU failure rate / 27% over three years"','finding','An extrapolation from a 54-day snapshot, not a measured annual rate.','use','Print the 54-day measurement instead: 419 interruptions over 54 days on up to 16,384 GPUs, 78% confirmed hardware, >90% goodput.'),
      jsonb_build_object('claim','"20-30% of GPUs fail"','finding','Conflates manufacturing attrition with in-service burn-in. Published per-stage yield data for current parts does not exist.','use','The vocabulary confusion is worth explaining; the number is not usable.'),
      jsonb_build_object('claim','"X% of enterprises report measurable ROI (attributed to Menlo Ventures)"','finding','No such figure exists in the report. Checked directly.','use','Treat as fabricated or misattributed until proven otherwise.'),
      jsonb_build_object('claim','"HIPAA requires audit logs to be retained for six years"','finding','FALSE. The six years at 45 CFR 164.316(b)(2)(i) covers DOCUMENTATION — the written policies and procedures. The Security Rule sets NO retention period for audit logs at all.','use','An entire compliance-product category sells against a requirement that is not in the regulation. That is the story.'),
      jsonb_build_object('claim','"Certificate Transparency (RFC 9162) is an internet standard"','finding','RFC 9162 is category EXPERIMENTAL, as was its predecessor RFC 6962. The argument survives; the label does not.','use','Describe it as an Experimental IETF document that has run in production for over a decade.'),
      jsonb_build_object('claim','"Regulators now require AI audit trails"','finding','False as a statement of positive law in August 2026. The most contaminated claim in the compliance area, and it is almost entirely vendor marketing.','use','State the negative finding instead.')
    ),
    'unit_trap', 'At least one inference provider publishes dedicated GPU rates PER MINUTE while price-aggregator sites reproduce them as hourly — a 60x error. Never take a GPU rate from an aggregator; read the provider page and read the column header.',
    'bandwidth_trap', 'The widely-repeated 1,792 GB/s memory bandwidth for a current consumer GPU is NOT published on the manufacturer specification page. Derive it instead from the published bus width and the JEDEC speed grade: 512 bits x 28 Gbps / 8 = 1,792 GB/s. If you cannot find both inputs for a card, say so.'
  ),
  ARRAY['do-not-cite','governing','doctrine','verified','book2'],
  5
),
(
  'synthesizer',
  'doctrine',
  'EVIDENCE CLASS is a required field on every extracted claim. Nine classes, and the class governs how far a claim can be pushed.',
  jsonb_build_object(
    'classes', jsonb_build_array(
      'settled science — name the theorem; no citation needed and none should be given',
      'primary legal instrument — quote verbatim, give the article number and the date of legal force',
      'regulator guidance — official but not law; say which',
      'government statistic — give the reference period, not the release date',
      'primary operator measurement — the strongest empirical class; note what the operator sells, if anything',
      'provider list price — perishable, six-month shelf life; record the date the page was read',
      'analyst survey — only usable with sample size AND fielding window AND declared interest',
      'vendor self-report — a marketing document, but STRONGER than neutral evidence when the vendor concedes a limit or testifies against its own interest',
      'practitioner assertion — usable only when labelled as such, and never under a load-bearing economic claim'
    ),
    'date_rule', 'The date attached to a figure must be the DATE OF MEASUREMENT or date of legal force, never the date of the page it was found on. This single check has now caught errors in five separate chapters and is the highest-yield test available.',
    'derivation_rule', 'Before citing anything, ask whether it can be derived from a law already established. A derivation has no attack surface, no expiry date, and demonstrates the method. Prefer it every time.',
    'both_directions', 'Run every stated arithmetic relationship in BOTH directions. Forward-only checking missed all six arithmetic errors found in the Book Two audit. Where a document gives a total and its components, add the components. Where it gives a ratio and its terms, compute the ratio.'
  ),
  ARRAY['evidence-discipline','governing','doctrine','method'],
  5
),
(
  'synthesizer',
  'doctrine',
  'STANDING RULE: the direction of hardware and inference prices is no longer knowable. Do not print "prices will keep falling" in any deliverable.',
  jsonb_build_object(
    'reversal', 'Through 2026 a DRAM/HBM shortage pushed hardware prices UP, at least two providers raised published rates, and one hyperscaler shortened its AI-hardware depreciation schedule after a decade of extensions across the industry.',
    'consequence', 'Every TCO model written before Q4 2025 — including our own earlier work — assumes hardware depreciates against falling replacement cost. That assumption is inverted for 2026.',
    'what_to_say', 'Say the numbers will move within six to twelve months and that the direction is genuinely uncertain for the first time in several years. Then anchor the argument on the part that does not move.',
    'what_is_durable', jsonb_build_array(
      'The cache and batch multipliers (0.1x cache read, 0.5x batch) — 24+ month shelf life, converged across three major providers. Print these rather than prices.',
      'Memory capacity and bandwidth specifications — fixed per part, safe indefinitely.',
      'Every derivation: cost proportional to 1/rho, latency to 1/(1-rho), the rho*=0.5 optimum, the multiplexing penalty 1 + beta/sqrt(R). These are theorems and do not expire.',
      'Reliability measurements from primary operators — stable historical records.'
    ),
    'applied_to_the_firm', 'Any client-facing TCO or infrastructure recommendation must carry the date its prices were read, state the six-month shelf life explicitly, and rest its conclusion on the derivations rather than the table.'
  ),
  ARRAY['economics','governing','standing-rule','tco','book2'],
  5
),
(
  'researcher',
  'doctrine',
  'For research runs: the two highest-value findings in the Book Two passes were both NEGATIVE — a thing that does not exist, and a deadline that moved. Report absences.',
  jsonb_build_object(
    'negative_finding_1', 'No enforcement action, fine or judgment anywhere has turned on the presence, absence or adequacy of an AI decision log, as of August 2026. Searching for one returned almost exclusively vendor content marketing. The absence is a stronger argument than any case would have been, because it means the first firm tested sets the standard for everyone.',
    'negative_finding_2', 'No primary or well-methodologised measurement exists ANYWHERE of the engineering hours required to operate self-hosted inference. Every figure in circulation is a practitioner estimate, and one widely-read publisher revised its own estimate roughly fourfold in fourteen months. Report the range 60-80% of the owned-box bill with the assumption stated, and treat any source quoting a tighter figure with suspicion.',
    'negative_finding_3', 'No current industry-average PUE figure could be sourced; the leading survey is paywalled beyond an excerpt containing no PUE value, sample size or fielding date. The 1.2 and 1.4 values used across the published TCO literature are ASSUMPTIONS. Present PUE as a sensitivity range (1.1 hyperscale / 1.4 enterprise room / 1.8 converted office), never as a fact.',
    'rule', 'When a search for a figure returns only vendor marketing, that is a finding to report, not a gap to fill with the best available marketing. Say what does not exist and say how hard you looked.'
  ),
  ARRAY['research','governing','doctrine','negative-finding','book2'],
  5
),
(
  'synthesizer',
  'task_result',
  'Book Two "The Agentic Stack" completed 13 August 2026 — 83,450 words, 315 pages, verified end to end. Two research passes synthesised into this network.',
  jsonb_build_object(
    'deliverable', 'The Agentic Stack: Building Sovereign, Multi-Agent Enterprise Infrastructure — Book Two of the Techno-Economist Series',
    'measurements', jsonb_build_object(
      'words', 83450, 'pages_6x9', 315, 'figures', 10, 'coinages_used', 15,
      'source_entries', 126, 'glossary_entries', 62, 'index_headwords', 76,
      'spine_inches', 0.712, 'cover_wrap', '12.962 x 9.25 in'
    ),
    'new_coinage', 'The multiplexing penalty, 1 + beta/sqrt(R) — the factor by which a firm''s own inference costs more than an identically-equipped provider''s, from statistical multiplexing alone. Spends the last of the 15-coinage budget.',
    'corrections_forced_to_earlier_work', jsonb_build_array(
      'Hosted open-weight blended rate $0.33 to $0.126 per million — the earlier figure was too high by roughly threefold.',
      'US commercial electricity 12 cents to 13.54 cents per kWh.',
      'Owned desk-box annual cost $11,870 to $13,786; labour share 76% to 65%.',
      'Crossover against hosted open-weight 98.5M to 300M tokens/day — now 4.3x above what the hardware can physically serve.',
      'The source under the earlier cost table was a developer-content publisher (practitioner assertion), not primary. Reframed as an explicit assumption.'
    ),
    'note', 'Every one of those errors ran in the direction that STRENGTHENS the conclusion. That is luck. The dating discipline that made them findable is not, and is the transferable part.'
  ),
  ARRAY['book2','completion','milestone','synthesis'],
  4
);


-- ── 3. Verify ─────────────────────────────────────────────────────────────
--
--   SELECT title, domain, relevance_score FROM knowledge_base
--   WHERE 'ch8' = ANY(tags) OR 'ch9' = ANY(tags) ORDER BY created_at DESC;
--
--   SELECT agent_id, type, summary, importance FROM agent_memory
--   WHERE 'governing' = ANY(tags) ORDER BY created_at DESC;
--
--   -- everything this migration added:
--   SELECT count(*) FROM knowledge_base WHERE source_key LIKE 'ch8-%'
--     OR source_key LIKE 'ch9-%' OR source_key = 'book2-completion';
--
-- ════════════════════════════════════════════════════════════════════════════
