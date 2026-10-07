/** Conservative intent routing for explicit Boss-to-agent task instructions. */

const AGENT_ALIASES = [
  { agentId: 'researcher', names: ['orion', 'research agent', 'researcher'] },
  { agentId: 'aether', names: ['aether', 'content agent', 'marketing agent'] },
  { agentId: 'atlas', names: ['atlas', 'bd agent', 'business development agent'] },
  { agentId: 'nova', names: ['nova', 'automation agent', 'ai agent'] },
  { agentId: 'synthesizer', names: ['synthesizer', 'knowledge agent'] },
  { agentId: 'pulse', names: ['pulse', 'analytics agent', 'monitoring agent'] },
  { agentId: 'assistant', names: ['assistant', 'aria', 'va'] },
];

const STATUS_LANGUAGE =
  /\b(?:status|progress|update|where is|how is .* (?:going|doing)|has .* (?:finished|completed)|is .* (?:done|finished|working))\b/i;
const DIRECTIVE_LANGUAGE =
  /^(?:(?:hey\s+)?(?:nexus|orion|aether|atlas|nova|pulse|synthesizer|aria|assistant)[,:\s-]*)?(?:i\s+(?:want|need)\s+(?:you|\w+[\w -]*?)\s+to\s+|please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|have\s+\w+[\w -]*?\s+(?:to\s+)?|get\s+\w+[\w -]*?\s+to\s+|ask\s+\w+[\w -]*?\s+to\s+|tell\s+\w+[\w -]*?\s+to\s+|let\s+\w+[\w -]*?\s+|delegate\s+|assign\s+|send\s+|route\s+|start\s+|run\s+|write\s+|draft\s+|create\s+|build\s+|design\s+|analy[sz]e\s+|investigate\s+|prepare\s+|review\s+|monitor\s+|check\s+|produce\s+|make\s+)/i;

const EXISTING_RESEARCH_ACTION = /\b(?:pick\s+up|use|reuse|work\s+from|refine|build\s+on|draft\s+from|write\s+from|start\s+from|based\s+on|informed\s+by)\b/i;
const RESEARCH_REFERENCE = /\b(?:orion|research|report|brief|deliverable|thesis)\b/i;

function isExplicitAetherFollowUp(text) {
  return /\b(?:let|have|ask|tell|delegate|assign|instruct)\s+(?:the\s+)?aether\b/i.test(text) &&
    /\b(?:blog|article|post|draft|write|refine|pick\s+up)\b/i.test(text) &&
    /\b(?:orion|research|thesis|report|brief|deliverable)\b/i.test(text);
}

function hasAgentName(text, aliases) {
  return aliases.some((name) => new RegExp(`\\b${name}\\b`, 'i').test(text));
}

function inferAgent(text) {
  const lower = text.toLowerCase();
  if (/\b(?:research|investigat|look into|study|current facts|market intelligence)\b/.test(lower)) return 'researcher';
  if (/\b(?:blog|article|post|write|draft|content|seo|editorial|brand voice|campaign copy)\b/.test(lower)) return 'aether';
  if (/\b(?:sales|prospect|business development|deal|pipeline|lead generation|dream 50)\b/.test(lower)) return 'atlas';
  if (/\b(?:automation|workflow|saas|technical architecture|integrat(?:e|ion))\b/.test(lower)) return 'nova';
  if (/\b(?:analytics|metrics|monitor|dashboard|performance report)\b/.test(lower)) return 'pulse';
  if (/\b(?:knowledge base|synthesi[sz]e|intelligence report|save to kb)\b/.test(lower)) return 'synthesizer';
  if (/\b(?:lead qualification|booking|customer support|client intake)\b/.test(lower)) return 'assistant';
  return null;
}

/**
 * Return a deterministic agent task only for a clear instruction, never for
 * status questions or conversational mentions of agents.
 */
export function classifyDirectAgentTask(message) {
  const text = String(message || '').trim();
  const explicitAetherFollowUp = isExplicitAetherFollowUp(text);
  if (!text || (STATUS_LANGUAGE.test(text) && !explicitAetherFollowUp) ||
      (!DIRECTIVE_LANGUAGE.test(text) && !explicitAetherFollowUp)) return null;

  const namedAgent = explicitAetherFollowUp
    ? 'aether'
    : AGENT_ALIASES.find(({ names }) => hasAgentName(text, names))?.agentId;
  const inferredAgent = inferAgent(text);
  const agentId = namedAgent || inferredAgent;
  if (!agentId || agentId === 'researcher' || agentId === 'assistant') return null;

  const isBlog = agentId === 'aether' && (
    (/\b(?:blog|article|post)\b/i.test(text) &&
      /\b(?:write|draft|publish|create|produce|have|ask|let|please|need|want|delegate|assign|refine|pick\s+up|use|reuse|build\s+on)\b/i.test(text)) ||
    explicitAetherFollowUp
  );
  const action = isBlog ? 'blog_commission'
    : agentId === 'aether' && /\b(?:write|draft|create|produce)\b/i.test(text) ? 'write'
      : null;
  const type = agentId === 'researcher' ? 'research'
    : agentId === 'aether' ? (isBlog ? 'content' : 'analysis')
    : agentId === 'atlas' || agentId === 'nova' ? 'analysis'
      : agentId === 'pulse' ? 'analysis'
        : agentId === 'synthesizer' ? 'research' : 'general';

  return {
    agentId,
    action,
    type,
    title: text.replace(/\s+/g, ' ').slice(0, 120),
    instruction: text,
    reuseResearch: isBlog && (EXISTING_RESEARCH_ACTION.test(text) || explicitAetherFollowUp) && RESEARCH_REFERENCE.test(text),
  };
}