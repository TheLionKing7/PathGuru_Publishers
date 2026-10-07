/** Resolve an explicitly referenced, completed Orion brief without guessing. */

const TASK_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TOPIC_PHRASE = /\b(?:thesis|research|report|brief|deliverable)\s+(?:on|about|around|for|into)\s+([\p{L}\p{N}][^.!?\n]*)/i;
const SOURCE_TOPIC = /\b(?:based\s+on|from|using|use)\s+(?:the\s+)?(?:completed\s+)?(?:orion\s+)?(?:research\s+)?(?:(?:thesis|report|brief|deliverable|research)\s+(?:on|about|for|into)\s+|(?:thesis|report|brief|deliverable)\s+)([\p{L}\p{N}][^.!?\n]*)/i;
const COMPLETED_TOPIC = /\b(?:completed|finished|ready|done)\s+(?:the\s+)?([\p{L}\p{N}][^.!?\n]{1,100}?)\s+(?:thesis|research|report|brief|deliverable)\b/i;
const TOPIC_BEFORE_RESEARCH = /\b(?:research|thesis|report|brief|deliverable)\s+(?:on|about|for|into)\s+(?:the\s+)?([\p{L}\p{N}][^.!?\n]{1,100}?)(?=\s+(?:is|was|has|have|completed|finished|ready|done)\b|[.!?\n]|$)/i;
const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'article', 'as', 'at', 'be', 'been', 'being', 'blog', 'by', 'completed',
  'done', 'draft', 'for', 'from', 'get', 'has', 'have', 'in', 'into', 'is', 'it', 'logged', 'of', 'on',
  'orion', 'our', 'report', 'research', 'ready', 'the', 'their', 'this', 'to', 'was', 'were', 'with',
  'notion', 'aether', 'thesis', 'deliverable', 'brief', 'finished', 'result', 'work', 'completed',
  'let', 'write', 'writing', 'draft', 'drafting', 'create', 'make', 'using', 'use', 'based', 'pick', 'up',
  'start', 'article', 'post', 'content', 'marketing', 'about', 'blog', 'want', 'need', 'please', 'have', 'ask',
  'china', 'chinese', 'cheap', 'products', 'uproar', 'ibos', 'nigeria', 'symptoms', 'system', 'ripe',
  'intelligence', 'commerce', 'coordination', 'cordination', 'empower', 'intra', 'africa', 'trade', 'key',
  'information', 'strong', 'case', 'marketing', 'this', 'time', 'ensure', 'recent', 'issue', 'concerning',
]);
const RESEARCH_REFERENCE = /\b(?:orion|research|thesis|report|brief|deliverable)\b/i;

function parseOutput(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

function tokens(text) {
  return (String(text || '').match(/[\p{L}\p{N}]+/gu) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function messageTopicTokens(text) {
  return [...new Set(tokens(text))];
}

function extractAnchors(message, history) {
  const messages = [String(message || ''), ...[...(history || [])].reverse()
    .filter((turn) => turn?.role === 'user')
    .map((turn) => String(turn.content || turn.text || ''))];

  const directId = messages[0].match(TASK_ID)?.[0];
  if (directId) return { taskId: directId, topicTokens: [] };

  const directTopic = messages[0].match(SOURCE_TOPIC)?.[1] || messages[0].match(TOPIC_PHRASE)?.[1] ||
    messages[0].match(/\bbased\s+on\s+(?:the\s+)?completed\s+([\p{L}\p{N}][^.!?\n]*)/i)?.[1] ||
    messages[0].match(/\b(?:thesis|research|report|brief|deliverable)\s+(?:around|on|about|for|into)\s+([\p{L}\p{N}][^.!?\n]*)/i)?.[1] ||
    messages[0].match(/\bcompleted\s+(?:orion\s+)?(?:thesis|research|report|brief|deliverable)\s+(?:around|on|about|for|into)\s+([\p{L}\p{N}][^.!?\n]*)/i)?.[1];
  if (directTopic) {
    const topicTokens = [...new Set(tokens(directTopic))];
    if (topicTokens.length) return { taskId: null, topicTokens };
  }
  const completedTopic = messages[0].match(COMPLETED_TOPIC)?.[1] ||
    messages[0].match(/\b(?:completed|finished|ready|done)\s+(?:the\s+)?(?:orion\s+)?(?:research\s+)?(?:(?:thesis|report|brief|deliverable)\s+(?:on|about|for|into)\s+|(?:thesis|report|brief|deliverable)\s+)([^.!?\n]+)/i)?.[1] ||
    messages[0].match(/\b(?:completed|finished|ready|done)\s+(?:the\s+)?([\p{L}\p{N}][^.!?\n]{1,100})\s+(?:thesis|research|report|brief|deliverable)\b/i)?.[1];
  if (completedTopic) {
    const topicTokens = [...new Set(tokens(completedTopic))];
    if (topicTokens.length) return { taskId: null, topicTokens };
  }
  const topicBeforeResearch = messages[0].match(TOPIC_BEFORE_RESEARCH)?.[1];
  if (topicBeforeResearch) {
    const topicTokens = [...new Set(tokens(topicBeforeResearch))];
    if (topicTokens.length) return { taskId: null, topicTokens };
  }
  // Use only the user's explicit report reference. An assistant's "latest"
  // result may be unrelated and is never a safe source-selection signal.
  for (const text of messages.slice(1)) {
    const phrase = text.match(TOPIC_PHRASE)?.[1] || text.match(SOURCE_TOPIC)?.[1] ||
      text.match(/\bbased\s+on\s+(?:the\s+)?completed\s+([\p{L}\p{N}][^.!?\n]*)/i)?.[1];
    const completedTopic = text.match(COMPLETED_TOPIC)?.[1];
    const beforeResearch = text.match(TOPIC_BEFORE_RESEARCH)?.[1];
    const broadTopic = text.match(/\b(?:thesis|research|report|brief|deliverable)\s+(?:around|on|about|for|into)\s+([\p{L}\p{N}][^.!?\n]*)/i)?.[1] ||
      text.match(/\bcompleted\s+(?:orion\s+)?(?:thesis|research|report|brief|deliverable)\s+(?:around|on|about|for|into)\s+([\p{L}\p{N}][^.!?\n]*)/i)?.[1];
    const topic = phrase || completedTopic || beforeResearch || broadTopic;
    if (!topic) continue;
    const topicTokens = [...new Set(tokens(topic))];
    if (topicTokens.length) return { taskId: null, topicTokens };
  }

  if (RESEARCH_REFERENCE.test(messages[0])) {
    const topicTokens = messageTopicTokens(messages[0]);
    if (topicTokens.length) return { taskId: null, topicTokens };
  }
  for (const text of messages.slice(1)) {
    if (!RESEARCH_REFERENCE.test(text)) continue;
    const topicTokens = messageTopicTokens(text);
    if (topicTokens.length) return { taskId: null, topicTokens, fallbackReference: true };
  }

  return { taskId: null, topicTokens: [] };
}

function taskBrief(row) {
  const output = parseOutput(row.output);
  return {
    brief: output.brief || '',
    sources: Array.isArray(output.sources) ? output.sources : [],
    output,
  };
}

/**
 * Return a research task only when the requested report is explicitly and
 * uniquely identified. No "latest deliverable" fallback is permitted.
 */
export async function resolveExistingResearchForCommission({ message, history = [], db } = {}) {
  if (!db) return { ok: false, reason: 'unavailable' };

  const anchors = extractAnchors(message, history);
  if (!anchors.taskId && !anchors.topicTokens.length) {
    return { ok: false, reason: 'reference_required' };
  }

  let query = db.from('tasks')
    .select('id, title, description, agent_id, type, status, output, completed_at')
    .eq('agent_id', 'researcher')
    .eq('type', 'research')
    .eq('status', 'completed');
  if (anchors.taskId) query = query.eq('id', anchors.taskId);

  const { data, error } = await query.order('completed_at', { ascending: false }).limit(100);
  if (error) return { ok: false, reason: 'lookup_failed' };

  const usable = (data || []).map((row) => ({ row, deliverable: taskBrief(row) }))
    .filter(({ row, deliverable }) => row.agent_id === 'researcher' && row.type === 'research' &&
      row.status === 'completed' && String(deliverable.brief).trim().length >= 40);

  if (anchors.taskId && !usable.length) {
    const { data: exactRows, error: exactError } = await db.from('tasks')
      .select('id, title, description, agent_id, type, status, output, completed_at')
      .eq('id', anchors.taskId)
      .limit(1);
    const exactRow = exactRows?.[0];
    if (exactError || !exactRow || exactRow.agent_id !== 'researcher' || exactRow.type !== 'research' ||
        exactRow.status !== 'completed' || String(taskBrief(exactRow).brief).trim().length < 40) {
      return { ok: false, reason: 'not_found' };
    }
    const exactBrief = taskBrief(exactRow);
    return { ok: true, task: exactRow, brief: exactBrief.brief, sources: exactBrief.sources };
  }

  if (anchors.taskId) {
    const exact = usable.filter(({ row }) => String(row.id).toLowerCase() === anchors.taskId.toLowerCase());
    return exact.length === 1
      ? { ok: true, task: exact[0].row, brief: exact[0].deliverable.brief, sources: exact[0].deliverable.sources }
      : { ok: false, reason: 'not_found' };
  }

  const matches = usable.map((candidate) => {
    const output = candidate.deliverable.output;
    const searchable = [candidate.row.title, candidate.row.description, output.instruction]
      .filter(Boolean).join(' ');
    const taskTokens = new Set(tokens(searchable));
    const overlap = anchors.topicTokens.filter((word) => taskTokens.has(word)).length;
    return { ...candidate, overlap };
  }).filter((candidate) => candidate.overlap >= Math.min(2, anchors.topicTokens.length) &&
    (candidate.overlap / anchors.topicTokens.length >= (anchors.fallbackReference ? 0.1 : 0.25)));

  if (!matches.length) return { ok: false, reason: 'not_found', topicTokens: anchors.topicTokens };
  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      candidates: matches.map(({ row }) => ({ id: row.id, title: row.title })),
    };
  }

  const match = matches[0];
  return { ok: true, task: match.row, brief: match.deliverable.brief, sources: match.deliverable.sources };
}