/**
 * Truth guard — anti-hallucination helpers for agent actions.
 *
 * OPERATIONAL STANDARD (DNA):
 * ANY FUNCTION YOU DESIGN MUST BE FULLY WIRED INTO ITS RELATIVE FEATURE AND FUNCTIONS.
 * Never tell Boss an action succeeded unless the side-effect returned proof (pageId, row id, etc.).
 */

export const FULL_WIRING_RULE = `FULL WIRING RULE: Any function you design must be fully wired into its relative feature and functions. Chat handlers must call the same stores/APIs the UI uses. Never claim Notion logs, publishes, or deliverables without verifying the backing write succeeded.`;

export function isNotionConfigured() {
  return !!(process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DB_ID);
}

/** User explicitly asked to log something to Notion (imperative), not a question about past logs. */
export function parseNotionLogIntent(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  if (/\b(can'?t|cannot|don'?t|where|what|find|anything|logged in notion|in notion\?)\b/i.test(lower)) {
    return null;
  }
  if (/\?$/.test(raw) && !/^(please\s+)?(log|add|record|save)\b/i.test(raw)) {
    return null;
  }

  const imperative =
    lower.match(/^(?:please\s+)?(?:log|add|record|save)\s+(.+?)\s+(?:to|into|in)\s+notion\b/i) ||
    lower.match(/^(?:please\s+)?log\s+(?:a\s+)?meeting(?:\s+(?:to|into|in)\s+notion)?\b/i);

  if (!imperative) return null;

  const subject = imperative[1]
    ? imperative[1].trim()
    : 'Meeting notes';

  return { subject: subject || raw.slice(0, 200) };
}

export function formatNotionLogReply({ pageId, subject, configured = isNotionConfigured() }) {
  if (!configured) {
    return 'Notion is not configured on this server (NOTION_API_KEY / NOTION_TASKS_DB_ID missing). I did **not** log anything — fix env on Render, then ask me to log again.';
  }
  if (!pageId) {
    return `Notion log **failed** — the API did not return a page ID for "${String(subject).slice(0, 80)}". Nothing was written. Check Render logs and Notion integration token scopes.`;
  }
  return `Done, Boss. "${String(subject).slice(0, 80)}" is logged in Notion (page \`${pageId.slice(0, 8)}…\`).`;
}

export function formatWorkflowDesignReply({ spec, quality, notionPageId, novaQueued }) {
  const parts = [`Boss, workflow spec drafted (${quality.grade} quality).`];
  if (notionPageId) {
    parts.push('Logged to Notion.');
  } else if (isNotionConfigured()) {
    parts.push('Notion log failed — spec is in PathGuru only.');
  } else {
    parts.push('Notion not configured — spec saved in PathGuru only.');
  }
  if (novaQueued) {
    parts.push('Nova has a build task queued.');
  } else {
    parts.push('Nova task queue did not confirm — check Tasks in Command Center.');
  }
  const header = parts.join(' ');
  const body = spec.slice(0, 1200) + (spec.length > 1200 ? '…' : '');
  return `${header}\n\n${body}`;
}

/** Append honesty block for LLM system prompts. */
export function buildHonestyEnforcementBlock() {
  return [
    FULL_WIRING_RULE,
    'YOU CAN ONLY CONFIRM FACTS VISIBLE IN THE LIVE SYSTEM STATE BLOCK.',
    'If something is NOT in that block, say "I do not have visibility into that right now."',
    'Never say "I have confirmed", "I have logged", or "logged in Notion" unless pageId or equivalent proof appears above.',
    'Wrong but confident is worse than uncertain and honest.',
  ].join(' ');
}
