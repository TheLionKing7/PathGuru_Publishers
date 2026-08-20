/**
 * Task hygiene — cancel stale work, dedupe research, reconcile ghost completions.
 * Mirrors supabase/013 + 014 intent; safe to run on a schedule.
 */

import { getSupabase } from '../supabaseClient.js';

export async function cancelStuckTasks({ olderThanMinutes = 30, dryRun = false } = {}) {
  const db = getSupabase();
  if (!db) return { cancelled: [], error: 'no_db' };

  const cutoff = new Date(Date.now() - olderThanMinutes * 60000).toISOString();
  const { data: stuck } = await db
    .from('tasks')
    .select('id, title, status, agent_id, created_at')
    .in('status', ['pending', 'in_progress'])
    // Approval requests wait on the Boss indefinitely — they are not "stuck".
    // Cancelling them here is what silently killed six blog articles.
    .neq('type', 'pending_approval')
    .lt('created_at', cutoff)
    .limit(100);

  const cancelled = [];
  for (const t of stuck || []) {
    const reason = `stuck in ${t.status} for >${olderThanMinutes}m`;
    if (!dryRun) {
      await db.from('tasks').update({
        status:     'cancelled',
        updated_at: new Date().toISOString(),
        error:      `Auto-cancelled: ${reason} (task hygiene)`,
      }).eq('id', t.id);
    }
    cancelled.push({ id: t.id, title: t.title, agent_id: t.agent_id, status: t.status, reason });
  }

  // A hygiene sweep that quietly kills work is indistinguishable from work that
  // was never done — it hid six blog articles for weeks. Post every cancellation
  // to ops so a kill is always attributable to a task and a reason.
  if (!dryRun && cancelled.length) {
    try {
      const { postSlackMessage, slackChannelFor, recordNotificationAttempt } = await import('./slackNotify.js');
      const channel = slackChannelFor('ops');
      if (channel) {
        const lines = cancelled.map((c) => `• \`${c.title}\` (${c.agent_id || 'unknown'}) — ${c.reason}`);
        const res = await postSlackMessage({
          channel,
          text: `:broom: *Task hygiene auto-cancelled ${cancelled.length} stuck task(s)*\n${lines.join('\n')}`,
        });
        await recordNotificationAttempt({ db, channel: 'slack', target: channel, ok: res.ok, providerId: res.providerId, error: res.error });
      } else {
        console.warn('[TaskHygiene] cancelled tasks but SLACK_OPS_CHANNEL unset — no notice posted');
      }
    } catch (e) {
      console.warn('[TaskHygiene] Slack ops notice failed:', e.message);
    }
  }

  return { cancelled };
}

export async function dedupePendingResearch({ dryRun = false } = {}) {
  const db = getSupabase();
  if (!db) return { deduped: [] };

  const { data: pending } = await db
    .from('tasks')
    .select('id, title, created_at')
    .eq('type', 'research')
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false });

  if (!pending || pending.length <= 1) return { deduped: [], kept: pending?.[0]?.id || null };

  const [keep, ...dupes] = pending;
  const deduped = [];

  for (const d of dupes) {
    if (!dryRun) {
      await db.from('tasks').update({
        status:     'cancelled',
        updated_at: new Date().toISOString(),
        error:      'Duplicate research task removed by task hygiene',
      }).eq('id', d.id);
    }
    deduped.push({ id: d.id, title: d.title });
  }

  return { deduped, kept: keep.id };
}

export async function reconcileGhostResearchCompletions({ dryRun = false } = {}) {
  const db = getSupabase();
  if (!db) return { reconciled: [] };

  const { data: rows } = await db
    .from('tasks')
    .select('id, title, output, status')
    .eq('type', 'research')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(40);

  const reconciled = [];
  for (const t of rows || []) {
    const brief = t.output?.brief;
    if (brief && String(brief).trim().length >= 20) continue;

    if (!dryRun) {
      await db.from('tasks').update({
        status:     'failed',
        updated_at: new Date().toISOString(),
        error:      'Reconciled: completed without research brief in output',
      }).eq('id', t.id);
    }
    reconciled.push({ id: t.id, title: t.title });
  }

  return { reconciled };
}

export async function flushStaleNotifications({ dryRun = false } = {}) {
  const db = getSupabase();
  if (!db) return { flushed: 0 };

  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: stale } = await db
    .from('notifications')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .limit(200);

  if (!stale?.length) return { flushed: 0 };

  if (!dryRun) {
    await db.from('notifications')
      .update({ status: 'sent', dispatched_at: new Date().toISOString() })
      .in('id', stale.map((n) => n.id));
  }

  return { flushed: stale.length };
}

/** Full hygiene pass — call before briefings and on a schedule. */
export async function runTaskHygiene(opts = {}) {
  const dryRun = !!opts.dryRun;
  const [stuck, dedupe, ghost, notifications] = await Promise.all([
    cancelStuckTasks({ olderThanMinutes: opts.stuckMinutes ?? 30, dryRun }),
    dedupePendingResearch({ dryRun }),
    reconcileGhostResearchCompletions({ dryRun }),
    flushStaleNotifications({ dryRun }),
  ]);

  let notionBackfill = { synced: 0, skipped: 0 };
  if (!dryRun) {
    try {
      const { backfillResearchNotionLogs } = await import('./nexusNotionOps.js');
      notionBackfill = await backfillResearchNotionLogs({ limit: opts.notionBackfillLimit ?? 3 });
    } catch (e) {
      console.warn('[TaskHygiene] Notion research backfill:', e.message);
    }
  }

  const summary = {
    dryRun,
    cancelledStuck:      stuck.cancelled?.length || 0,
    dedupedResearch:     dedupe.deduped?.length || 0,
    reconciledGhost:     ghost.reconciled?.length || 0,
    flushedNotifications: notifications.flushed || 0,
    notionBackfillSynced: notionBackfill.synced || 0,
    at: new Date().toISOString(),
    detail: { stuck, dedupe, ghost, notifications, notionBackfill },
  };

  if (!dryRun && (summary.cancelledStuck || summary.dedupedResearch || summary.reconciledGhost)) {
    console.log('[TaskHygiene]', JSON.stringify({
      cancelledStuck: summary.cancelledStuck,
      dedupedResearch: summary.dedupedResearch,
      reconciledGhost: summary.reconciledGhost,
    }));
  }

  return summary;
}
