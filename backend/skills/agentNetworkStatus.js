/** Pure intent and formatting helpers for Nexus's live agent-network status. */

const NETWORK_STATUS_QUERY = /\b(?:agent network|(?:all|every|my|the)?\s*agents?\s+(?:status|working|stuck|available|unavailable|offline|busy|idle|failed|completed|finished)|(?:all\s+)?agents?\s+(?:status|working|stuck|available|unavailable|offline|busy|idle|failed)|status of (?:all )?agents|whole team|team status|network status|network health|how (?:are|is) (?:all )?(?:the )?(?:agents|team)|who(?:'s| is) (?:working|stuck|available|unavailable|offline|idle)|who has (?:finished|completed)|have (?:all )?(?:the )?(?:agents|team) (?:finished|completed)|has everyone (?:finished|completed)|workflow status|operational status)\b/i;

/** Match questions about the whole agent team, not tasks to dispatch. */
export function isAgentNetworkStatusQuery(message) {
  return NETWORK_STATUS_QUERY.test(String(message || '').trim());
}

function formatAge(timestamp, now) {
  const time = Date.parse(timestamp || '');
  if (!Number.isFinite(time)) return 'age unknown';
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Format a network snapshot without inferring facts that the snapshot lacks. */
export function buildAgentNetworkStatusReply(snapshot, { now = Date.now() } = {}) {
  if (!snapshot || snapshot.dataAvailable === false) {
    return `Boss, I can’t verify agent operations right now${snapshot?.error ? `: ${snapshot.error}` : ' because the status data is unavailable'}. I won’t infer who is idle or offline.`;
  }

  const agents = Object.entries(snapshot.agents || {});
  const tasks = snapshot.activeTasks || [];
  const recentCompleted = snapshot.recentCompletedTasks || [];
  const recentFailed = snapshot.recentFailedTasks || [];
  const stuckTasks = tasks.filter((task) => {
    if (!['pending', 'in_progress'].includes(task.status)) return false;
    if (task.type === 'pending_approval') return false;
    const created = Date.parse(task.created_at || '');
    return Number.isFinite(created) && now - created >= 48 * 60 * 60 * 1000;
  });
  const lines = [`Boss, agent operations snapshot (${snapshot.snapshotAt || 'time unavailable'}):`];

  if (!agents.length) lines.push('• Agent roster: unavailable in the status data.');
  for (const [id, agent] of agents) {
    const name = agent.name || agent.display_name || id;
    const assigned = tasks.filter((task) => task.agent_id === id);
    const taskText = assigned.length
      ? assigned.map((task) => `${task.title || 'Untitled task'} [${task.status}${task.created_at ? `, ${formatAge(task.created_at, now)}` : ''}]`).join('; ')
      : 'no tracked active task';
    const rawStatus = agent.status || 'unknown';
    const availability = ['offline', 'error', 'unknown'].includes(rawStatus)
      ? rawStatus
      : rawStatus === 'idle' && !agent.lastActivity
        ? 'availability unverified'
        : rawStatus;
    lines.push(`• ${name}: ${availability}; ${taskText}.`);
  }

  if (stuckTasks.length) {
    lines.push(`Stuck (open ≥48h): ${stuckTasks.map((task) => `${task.title || 'Untitled task'} → ${task.agent_id || 'unassigned'} (${formatAge(task.created_at, now)})`).join('; ')}.`);
  } else {
    lines.push('Stuck (open ≥48h): none found in tracked active tasks.');
  }

  if (snapshot.completedAvailable === false) {
    lines.push('Recently completed: unavailable; completion history could not be read.');
  } else if (recentCompleted.length) {
    lines.push(`Recently completed: ${recentCompleted.slice(0, 5).map((task) => `${task.title || 'Untitled task'} → ${task.agent_id || 'unassigned'}`).join('; ')}.`);
  } else {
    lines.push('Recently completed: none recorded in the last 24h.');
  }
  if (snapshot.failedAvailable === false) {
    lines.push('Recent failures: unavailable; failure history could not be read.');
  } else if (recentFailed.length) {
    lines.push(`Recent failures: ${recentFailed.slice(0, 5).map((task) => `${task.title || 'Untitled task'} → ${task.agent_id || 'unassigned'}${task.error ? ` (${task.error})` : ''}`).join('; ')}.`);
  }
  if (snapshot.partial) lines.push('Warning: this is a partial snapshot; some status sources could not be read.');
  lines.push('Availability is based on recorded status, not a live heartbeat; idle agents may not have a current activity signal.');
  return lines.join('\n');
}