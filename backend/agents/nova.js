/**
 * DigiFusion Intelligence Network — Nova
 * =========================================
 * Automation Engineering & Technical Design Agent
 *
 * Nova designs the automation systems, technical architectures,
 * and operational workflows that transform how clients work.
 * It translates business problems into engineered solutions.
 */

import { AgentBase }      from './agentBase.js';
import { callAiProvider } from '../aiPipeline.js';
import { synthesizer }    from './synthesizer.js';

const NOVA_SYSTEM = `You are Nova — the Automation Engineering and Technical Design agent for DigiFusion.

Your character:
You are an elite systems thinker and automation architect. You see processes as systems to be optimised, and you design solutions with the precision of an engineer and the vision of a strategist. You do not recommend tools for the sake of it — you design the right system for the problem.

You work at the intersection of business process design and technical automation. You can design a high-level automation strategy for a CEO and a technical architecture for a developer in the same brief.

Your capabilities:
— Automation architecture: end-to-end system design for business process automation
— Workflow design: mapping current-state processes and designing optimised future-state
— Technical blueprints: system diagrams, integration architectures, API design specs
— Tool stack recommendations: selecting and sequencing the right automation tools
— ROI modelling: quantifying the business value of automation investments
— Playbook production: step-by-step implementation guides for automation projects
— Agent design: designing multi-agent AI systems for specific business functions

How you work:
You always start with the business outcome, not the technology. You ask: what decision needs to be made, what process needs to change, what result needs to be achieved? Then you design the system that delivers it. You produce blueprints that a technical team can implement and that an executive can understand.

You write with technical precision but never obscure business logic behind jargon.`;


export class Nova extends AgentBase {
  constructor() {
    super({
      id:           'nova',
      displayName:  'Nova',
      role:         'Automation Engineering & Technical Design',
      systemPrompt: NOVA_SYSTEM,
      domains:      ['automation', 'general'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CORE CAPABILITIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Design an automation system for a given business problem.
   */
  async designAutomation(problem, options = {}) {
    const { industry = 'general', scale = 'mid-market', tools = [] } = options;

    const knowledge = await synthesizer.answer(
      `Automation architecture and workflow design for: ${problem}`,
      'nova',
      ['automation', 'general'],
    );

    const prompt = `${knowledge ? `## Relevant automation frameworks from intelligence base\n${knowledge}\n\n---\n\n` : ''}
## Automation System Design Request

Business problem: ${problem}
Industry: ${industry}
Scale: ${scale}
${tools.length ? `Preferred/existing tools: ${tools.join(', ')}` : ''}

Design a complete automation system:

1. Current State Analysis
   — What manual processes exist today?
   — Where are the bottlenecks, errors, and inefficiencies?

2. Future State Design
   — What does the optimised, automated process look like?
   — What decisions are automated vs. human?

3. System Architecture
   — Components, integrations, and data flows (describe clearly)
   — Trigger → Process → Output logic for each automated workflow

4. Tool Stack
   — Recommended tools with justification (not brand-led, outcome-led)
   — Integration points and API dependencies

5. Implementation Roadmap
   — Phase 1 (Quick wins, 0–30 days)
   — Phase 2 (Core automation, 30–90 days)
   — Phase 3 (Optimisation, 90+ days)

6. ROI Projection
   — Time saved per week/month
   — Error reduction estimate
   — Revenue impact (if applicable)

7. Risk & Mitigation
   — Technical risks and failure points
   — Change management considerations

Produce at the level of a senior automation consultant's discovery deliverable.`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  /**
   * Produce a technical blueprint document for a specific system.
   */
  async buildBlueprint(systemName, requirements, options = {}) {
    const knowledge = await synthesizer.answer(
      `Technical architecture and blueprints for: ${systemName}`,
      'nova',
      ['automation', 'general'],
    );

    const prompt = `${knowledge ? `## Relevant technical frameworks\n${knowledge}\n\n---\n\n` : ''}
## Technical Blueprint: ${systemName}

Requirements:
${requirements}

Produce a technical blueprint:
1. System Overview (purpose, scope, key stakeholders)
2. Architecture Diagram Description (components, connections, data flows)
3. Technical Specifications (APIs, data models, integration contracts)
4. Component Breakdown (each module, its function, its inputs/outputs)
5. Security & Compliance Considerations
6. Scalability Design (how it handles growth)
7. Implementation Guide (step-by-step build sequence)
8. Testing & Validation Criteria
9. Maintenance & Monitoring Plan

Write this so it can serve as the primary technical document for the build team.`;

    return this.runLLM(prompt, { skipKnowledge: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, problem, systemName, requirements } = task;

    let result;
    switch (action) {
      case 'design_automation':
        result = await this.designAutomation(problem || task.description, {
          industry: task.industry,
          scale:    task.scale,
          tools:    task.tools || [],
        });
        break;
      case 'build_blueprint':
        result = await this.buildBlueprint(systemName || task.title, requirements || task.description);
        break;
      default:
        result = await this.runLLM(task.description || task.title, { knowledgeQuery: task.title });
    }

    await this.rememberEpisodic({
      summary:    `Completed ${action || 'task'}: "${(task.title || '').slice(0, 80)}"`,
      content:    { action, problem, resultLength: result?.length },
      type:       'task_result',
      tags:       ['automation', 'design', action].filter(Boolean),
      importance: 3,
      taskId:     task.id,
    });

    return { result };
  }
}

export const nova = new Nova();
