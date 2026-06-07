/**
 * PathGuru Designer Skill
 * =======================
 * Builds prompts for creating rich interactive HTML diagrams —
 * architecture diagrams, system maps, process flows, and product visuals.
 *
 * Exports:
 *   buildDesignerPrompt(input)  → { system, user }
 *   buildDiagramPrompt(input)   → { system, user }   (alias)
 */

// ── Design System Constants ───────────────────────────────────────────────────

const DESIGN_SYSTEM = `
DESIGN LANGUAGE — apply this to every HTML diagram without exception.

COLOUR PALETTE:
  Background:  #080d14   (page base)
  Surface:     #0d1420   (card backgrounds)
  Border:      #1e2a3a   (card borders)
  Gold:        #c9a84c   (primary accent, headings, stats)
  Green:       #22c55e   (data sources layer)
  Blue:        #3b82f6   (processing/ingestion layer)
  Purple:      #a855f7   (AI/intelligence layer)
  Teal:        #14b8a6   (API/integration layer)
  Indigo:      #6366f1   (delivery/UI layer)
  Text:        #f1f5f9   (headings), #94a3b8 (body), #64748b (labels)

CARDS — every component is a card:
  border-radius: 10px
  padding: 13px 15px
  transition: transform .18s, box-shadow .18s
  hover: transform translateY(-3px) + coloured box-shadow per layer

CARD ANATOMY:
  icon (emoji, 17–18px) + title (12px bold #f1f5f9) + subtitle (10.5px #94a3b8) + tag badge (9.5px uppercase)

LAYER ROWS (for architecture diagrams):
  Left side: vertical rotated label (writing-mode: vertical-lr; transform: rotate(180deg))
  Content: flex-wrap of cards
  Colour: label and tag badge match the layer's accent colour

FLOW ARROWS (between layers):
  <div class="arrow-row">
    <div class="arrow-line"></div>
    <div class="arrow-label"><div class="arrow-dot"></div> [flow description] <div class="arrow-dot"></div></div>
    <div class="arrow-line"></div>
  </div>
  arrow-line: height 1px, gradient from transparent through #2d4060
  arrow-dot: pulsing animation — opacity .3→1, scale 1→1.4, 2.2s infinite

STATS BAR (top of diagram):
  4 key metrics. stat-value: 22px bold #c9a84c. stat-label: 10.5px uppercase #475569

LEGEND (bottom):
  legend-dot: 10×10px rounded square per layer colour + label

FILE REQUIREMENTS:
  - Fully self-contained HTML — no external dependencies, renders offline
  - All CSS inline in <style> block
  - Mobile responsive: flex-wrap on cards, stacked below 768px
  - Footer: product name · company · year
`;

const DIAGRAM_TYPES = `
DIAGRAM TYPES — choose based on what's being visualised:

1. ARCHITECTURE DIAGRAM (layered system)
   Use when: system architecture, platform overview, technical components
   Structure: stats bar → stacked layer rows (data sources bottom, delivery top) → legend

2. PROCESS FLOW
   Use when: workflows, pipelines, user journeys, step-by-step processes
   Structure: numbered steps connected by directional arrows, grouped by phase

3. AGENT / NETWORK MAP
   Use when: multi-agent systems, microservices, connected services
   Structure: central hub + radiating connections, or grid of nodes with labelled edges

4. PRODUCT OVERVIEW
   Use when: pitch presentations, stakeholder briefings, product one-pagers
   Structure: hero + feature cards + how-it-works flow + call to action

5. DATA FLOW
   Use when: ETL pipelines, data ingestion, database relationships
   Structure: sources → transforms → destinations with operation labels on connectors
`;

// ── Prompt Builders ───────────────────────────────────────────────────────────

/**
 * Build a designer prompt for creating an HTML diagram.
 *
 * @param {object} input
 * @param {string} input.productName        — name of the product/system
 * @param {string} input.description        — what the system does
 * @param {string} input.diagramType        — 'architecture'|'process'|'network'|'product'|'data' (optional, auto-detected)
 * @param {object[]} [input.layers]         — array of layer definitions (for architecture diagrams)
 *   Each layer: { name, colour, components: [{icon, title, subtitle, tag}] }
 * @param {string[]} [input.flowLabels]     — labels for arrow rows between layers
 * @param {object[]} [input.stats]          — stats bar items: [{value, label}]
 * @param {string} [input.company]          — company name for footer
 * @param {string} [input.additionalContext] — any extra context
 * @returns {{ system: string, user: string }}
 */
export function buildDesignerPrompt({
  productName,
  description,
  diagramType = 'architecture',
  layers = [],
  flowLabels = [],
  stats = [],
  company = 'Digital Fusion Labs',
  additionalContext = '',
}) {
  const system = `You are a senior product designer and visual communicator specialising in
technical system diagrams. You produce rich, interactive, self-contained HTML files that
communicate complex systems clearly to any audience.

${DESIGN_SYSTEM}

${DIAGRAM_TYPES}

ABSOLUTE REQUIREMENTS:
- Output ONLY the complete HTML file — no markdown fences, no explanation before or after
- Every layer must have at least 2 cards
- Every card must have icon + title + subtitle + tag
- Arrow dots must have the pulse animation
- File must render correctly with no internet connection
- Stats bar must have exactly 4 metrics
- Footer: "${productName} · ${company} · ${new Date().getFullYear()}"`;

  const layerBlock = layers.length
    ? `LAYERS (bottom to top):\n${layers.map((l, i) =>
        `${i + 1}. ${l.name} (colour: ${l.colour || 'auto-assign'}):\n` +
        (l.components || []).map(c => `   - ${c.icon || '⚙️'} ${c.title}: ${c.subtitle} [${c.tag}]`).join('\n')
      ).join('\n\n')}`
    : '';

  const statsBlock = stats.length
    ? `STATS BAR:\n${stats.map(s => `- "${s.value}" / "${s.label}"`).join('\n')}`
    : 'Choose 4 meaningful metrics from the system description.';

  const flowBlock = flowLabels.length
    ? `FLOW ARROW LABELS (between layers, bottom to top):\n${flowLabels.map((f, i) => `${i + 1}. "${f}"`).join('\n')}`
    : 'Write descriptive flow labels between each layer pair.';

  const user = `Create a rich interactive HTML architecture diagram for ${productName}.

PRODUCT DESCRIPTION:
${description}

DIAGRAM TYPE: ${diagramType}

${layerBlock}

${statsBlock}

${flowBlock}

${additionalContext ? `ADDITIONAL CONTEXT:\n${additionalContext}` : ''}

Produce the complete, self-contained HTML file now. Apply the full design language: dark theme, layer labels, animated arrows, hover effects, stats bar, colour-coded cards, legend, footer. Output only the HTML.`;

  return { system, user };
}

// Alias
export const buildDiagramPrompt = buildDesignerPrompt;
