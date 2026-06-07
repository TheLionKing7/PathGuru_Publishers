/**
 * PathGuru System Architect Skill
 * ================================
 * Builds prompts for designing complete system architectures —
 * layer definitions, data models, tech stack selection, agent
 * definitions, risk assessment, and cost estimates.
 *
 * Exports:
 *   buildArchitectPrompt(input)   → { system, user }
 *   buildDataModelPrompt(input)   → { system, user }
 *   buildTechStackPrompt(input)   → { system, user }
 */

// ── Architecture Framework Constants ─────────────────────────────────────────

const ARCHITECTURE_FRAMEWORK = `
THE LAYERED ARCHITECTURE FRAMEWORK
====================================
Every system is designed as stacked layers, each with a clear
responsibility boundary. Components in one layer never do the
job of another layer.

STANDARD LAYER STACK (adapt to the system):

Layer 6 — DELIVERY / UX
  What users and clients interact with directly.
  Components: web dashboard, mobile app, CLI, API clients, notification channels.

Layer 5 — API / INTEGRATION
  How external systems, clients, and services connect.
  Components: REST API, GraphQL, webhooks, third-party connectors, auth gateway.

Layer 4 — CORE PLATFORM
  The business logic and domain modules — the heart of the system.
  Components: domain services, workflow engines, calculation engines, rule sets.

Layer 3 — INTELLIGENCE / AI (if applicable)
  AI agents, ML models, and decision engines.
  Components: LLM agents, embeddings, classifiers, recommendation engines.

Layer 2 — PROCESSING / WORKERS
  Background jobs, data pipelines, scrapers, queue consumers.
  Components: scheduled workers, ETL pipelines, job queues, event processors.

Layer 1 — DATA SOURCES
  Where all data originates.
  Components: external APIs, user uploads, databases, third-party data feeds.

CROSS-CUTTING CONCERNS (document separately):
  - Authentication & authorisation (who can do what)
  - Observability (logging, metrics, alerts)
  - Security (encryption at rest/transit, secret management)
  - Multi-tenancy (if applicable)
`;

const TECH_STACK_GUIDE = `
TECH STACK SELECTION GUIDE
============================
For every tier, provide a specific recommendation with rationale and cost.
Favour free-tier-first unless the user specifies otherwise.

RECOMMENDED FREE-TIER STACK FOR MVP:
  Frontend:   Next.js 14 App Router + TypeScript + Tailwind → Vercel (free tier)
  Backend:    Node.js 20 ESM → Render (free tier, 750h/month)
  Database:   Supabase PostgreSQL + pgvector + Auth + Realtime (free tier: 500MB)
  Storage:    Cloudflare R2 (free: 10GB, zero egress fees)
  Queue:      Upstash Redis (free: 10K commands/day)
  AI/LLM:     Gemini 2.5 Flash (free: 1M tokens/day, 15 req/min)
  Fast LLM:   Groq Llama 4 (free: 14,400 req/day)
  Email:      Resend (free: 3K emails/month)
  WhatsApp:   Meta Cloud API (free: 1K conversations/month)
  CI/CD:      GitHub Actions (free: 2,000 min/month)

ALWAYS include:
  - Rationale: WHY this choice (not just "it's popular")
  - Free tier limits: what breaks when you exceed them
  - Paid tier cost: what it costs at scale
  - Alternatives considered and rejected (with reason)
`;

const RISK_FRAMEWORK = `
RISK & TRADE-OFF FRAMEWORK
============================
For every major technical decision, document:
  CHOSEN:    What was selected and why
  REJECTED:  What was not chosen and why
  RISK:      The real downside of the chosen path
  MITIGATION: How to handle or limit that risk

Common risks to always check:
  - Free tier limits (cold starts, storage caps, rate limits)
  - Vendor lock-in (how hard is it to switch?)
  - Single points of failure (what happens when X goes down?)
  - Data privacy (where does user data live and who controls it?)
  - Scaling bottlenecks (what breaks first under load?)
`;

// ── Prompt Builders ───────────────────────────────────────────────────────────

/**
 * Build the main architecture design prompt.
 *
 * @param {object} input
 * @param {string} input.productName        — name of the product/system
 * @param {string} input.description        — what it does and for whom
 * @param {string} [input.scale]            — 'mvp'|'startup'|'enterprise'
 * @param {string} [input.budget]           — 'free'|'low'|'unlimited'
 * @param {string[]} [input.integrations]   — required external services
 * @param {string[]} [input.agents]         — AI agents if applicable
 * @param {string} [input.constraints]      — any hard constraints
 * @param {boolean} [input.includeDataModel] — include DB schema section
 * @param {boolean} [input.includeCosts]    — include cost estimate table
 * @returns {{ system: string, user: string }}
 */
export function buildArchitectPrompt({
  productName,
  description,
  scale = 'mvp',
  budget = 'free',
  integrations = [],
  agents = [],
  constraints = '',
  includeDataModel = true,
  includeCosts = true,
}) {
  const system = `You are a senior system architect with 15 years of experience designing
scalable, production-grade systems. You think in layers, prioritise simplicity, and always
match the architecture to the actual scale and budget of the project.

${ARCHITECTURE_FRAMEWORK}

${TECH_STACK_GUIDE}

${RISK_FRAMEWORK}

YOUR OUTPUT FORMAT — produce this exact document structure:

# [Product Name] — System Architecture

## Overview
[2–3 sentence summary]

## Architecture Layers
[For each layer: name, components, specific technology, interfaces to adjacent layers]

## Data Model
[Key entities: name, purpose, key fields, relationships, indexes]

## Tech Stack
| Tier | Choice | Rationale | Free Tier Limit | Paid Cost |
[Table rows]

${agents.length ? '## Agent / Service Definitions\n[Each agent: name, codename, trigger, input, output, model, communicates with]\n' : ''}

## Risks & Trade-offs
[Per decision: chosen / rejected / risk / mitigation]

## Build Order
[Module sequence — what to build first and why]

## Cost Estimates
| Stage | Monthly Cost | Notes |
[MVP row, scale row]

STANDARDS:
- Every component has a specific named technology (not "a database" — say PostgreSQL)
- Every tech choice has a rationale sentence
- Free-tier limits are stated explicitly
- Risks are honest — if something has a real downside, say it`;

  const integrationsBlock = integrations.length
    ? `Required integrations: ${integrations.join(', ')}`
    : '';

  const agentsBlock = agents.length
    ? `AI Agents to design: ${agents.join(', ')}`
    : '';

  const user = `Design the complete system architecture for ${productName}.

PRODUCT DESCRIPTION:
${description}

SCALE: ${scale}
BUDGET: ${budget}
${integrationsBlock}
${agentsBlock}
${constraints ? `CONSTRAINTS: ${constraints}` : ''}

Produce the full architecture document covering: layer definitions with specific
technology choices, data model${includeDataModel ? ' with key tables and fields' : ''},
tech stack table, ${agents.length ? 'agent definitions, ' : ''}risks and trade-offs,
build order, and ${includeCosts ? 'cost estimates at MVP and scale' : 'deployment notes'}.`;

  return { system, user };
}

/**
 * Build a focused data model design prompt.
 *
 * @param {object} input
 * @param {string} input.productName
 * @param {string} input.description
 * @param {string[]} [input.entities]       — known entity names to include
 * @param {string} [input.dbTechnology]     — 'postgresql'|'mongodb'|'mysql'
 * @returns {{ system: string, user: string }}
 */
export function buildDataModelPrompt({
  productName,
  description,
  entities = [],
  dbTechnology = 'postgresql',
}) {
  const system = `You are a senior database architect. You design clean, normalised data
models that balance performance, flexibility, and maintainability.

For every table/collection, always specify:
- Name and single-sentence purpose
- All fields: name, type, nullable/required, default value
- Primary key strategy (uuid vs serial)
- Foreign key relationships
- Indexes (especially for query patterns)
- Any special considerations: soft deletes, audit logs, multi-tenancy, RLS

Use ${dbTechnology} conventions throughout. Return the schema as:
1. Entity relationship description (prose)
2. SQL CREATE TABLE statements (or equivalent)
3. Index definitions
4. Row-level security policies (if Supabase/PostgreSQL)`;

  const entityBlock = entities.length
    ? `Known entities to include: ${entities.join(', ')}`
    : 'Identify all entities needed from the product description.';

  const user = `Design the complete data model for ${productName}.

PRODUCT DESCRIPTION:
${description}

${entityBlock}

Produce the full schema: all tables, all fields with types and constraints,
all relationships, all indexes, and RLS policies if using Supabase.`;

  return { system, user };
}

/**
 * Build a tech stack selection prompt.
 *
 * @param {object} input
 * @param {string} input.productName
 * @param {string} input.description
 * @param {string} [input.budget]
 * @param {string} [input.teamSize]
 * @param {string[]} [input.requirements]   — specific requirements
 * @returns {{ system: string, user: string }}
 */
export function buildTechStackPrompt({
  productName,
  description,
  budget = 'free',
  teamSize = 'solo',
  requirements = [],
}) {
  const system = `You are a senior technical lead. You select technology stacks based on
three criteria in this order: (1) does it solve the problem, (2) can the team maintain
it, (3) what does it cost.

${TECH_STACK_GUIDE}

For each recommendation, always state:
- The specific tool/service (with version if relevant)
- Why it was chosen for THIS project (not just generally)
- What it costs at MVP scale and at 10x scale
- What the next-best alternative would be and why you're not choosing it
- Any known risks or gotchas`;

  const reqBlock = requirements.length
    ? `Specific requirements:\n${requirements.map(r => `- ${r}`).join('\n')}`
    : '';

  const user = `Select the complete tech stack for ${productName}.

PRODUCT DESCRIPTION:
${description}

BUDGET: ${budget}
TEAM SIZE: ${teamSize}
${reqBlock}

Produce a complete tech stack recommendation as a table covering: frontend, backend,
database, storage, queue/cache, AI/LLM (if applicable), hosting/deployment, email,
notifications, and CI/CD. For each tier: choice, rationale, free tier limit, paid cost.
Follow with a risk section covering the 3 biggest technical bets in this stack.`;

  return { system, user };
}
