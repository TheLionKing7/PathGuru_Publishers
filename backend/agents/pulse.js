/**
 * DigiFusion Intelligence Network — Pulse
 * =========================================
 * Analytics & Operations Monitoring Agent
 *
 * Pulse is the system's eyes. It monitors every agent, every task, and every
 * key metric — and delivers the intelligence the team needs to make decisions
 * and the alerts they need before problems become crises.
 */

import { AgentBase }      from './agentBase.js';
import { callAiProvider, resolveProvider } from '../aiPipeline.js';
import { getSupabase }    from '../supabaseClient.js';
import { dispatchPendingNotifications } from '../skills/notifier.js';
import { nexus }          from './nexus.js';

const PULSE_SYSTEM = `You are Pulse — the Analytics and Operations Monitoring agent for DigiFusion.

Your character:
You are precise, data-driven, and proactive. You do not wait to be asked — you surface what matters before it becomes a problem. Your job is to ensure the team always knows the true state of operations: what is working, what is at risk, and what demands immediate attention.

You think in metrics, patterns, and thresholds. You do not report noise — you filter for signal. When you raise an alert, it means something. When you produce a report, it contains decisions, not just data.

Your capabilities:
— Agent network monitoring: task completion rates, agent health, bottlenecks, failures
— Lead intelligence: pipeline health, conversion rates, lead quality trends
— Publishing metrics: content output, quality scores, publishing cadence
— Knowledge base analytics: coverage gaps, most-queried topics, ingestion status
— System health: error rates, API failures, integration issues
— Business analytics: revenue-adjacent metrics from the CMS and bookings
— Trend detection: early signals in data before they become obvious

How you work:
You run scheduled monitoring sweeps. You compare current state against baselines. You generate alerts only when thresholds are crossed. You produce reports in a format the team can act on within 60 seconds of reading.

You dispatch notifications via the notifications table. Critical issues go to all channels. Routine reports go to the dashboard. Weekly summaries go to WhatsApp.`;


// ── Monitoring thresholds ─────────────────────────────────────────────────────
const THRESHOLDS = {
  taskFailureRate:     0.20,   // alert if > 20% of recent tasks failed
  agentOfflineMinutes: 60,     // alert if an agent has been offline > 60 min unexpectedly
  pendingTasksHigh:    20,     // alert if > 20 tasks pending
  leadQueueHigh:       15,     // alert if > 15 new unprocessed leads
  criticalTaskAge:     120,    // alert if a priority-5 task has been in_progress > 120 min
};

export class Pulse extends AgentBase {
  constructor() {
    super({
      id:           'pulse',
      displayName:  'Pulse',
      role:         'Analytics & Operations Monitoring',
      systemPrompt: PULSE_SYSTEM,
      domains:      ['general'],
    });
    // Dedup: track last time each alert type was sent (in-memory, 6-hour cooldown)
    // Prevents the same alert firing on every 5-minute sweep or Render restart
    this._lastAlertTime = {};   // { alertKey: Date.now() }
    this._ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
  }

  _shouldAlert(key) {
    const last = this._lastAlertTime[key] || 0;
    return (Date.now() - last) > this._ALERT_COOLDOWN_MS;
  }

  _markAlerted(key) {
    this._lastAlertTime[key] = Date.now();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MONITORING SWEEPS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Full monitoring sweep — run on schedule or on demand.
   * Returns a health report and dispatches any alerts.
   */
  async sweep() {
    const db = getSupabase();
    if (!db) return { error: 'Supabase not configured' };

    const now = new Date();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const cutoff1h  = new Date(now - 60 * 60 * 1000).toISOString();

    const [
      agentsRes,
      recentTasksRes,
      pendingTasksRes,
      newLeadsRes,
      criticalTasksRes,
    ] = await Promise.all([
      db.from('agents').select('*'),
      db.from('tasks').select('status, agent_id, priority, error').gte('created_at', cutoff24h),
      db.from('tasks').select('id, title, agent_id, priority, created_at').eq('status', 'pending').order('priority', { ascending: false }),
      db.from('leads').select('id').eq('status', 'new'),
      db.from('tasks').select('id, title, agent_id, started_at').eq('status', 'in_progress').eq('priority', 5).lt('started_at', cutoff1h),
    ]);

    const agents        = agentsRes.data  || [];
    const recentTasks   = recentTasksRes.data || [];
    const pendingTasks  = pendingTasksRes.data || [];
    const newLeads      = newLeadsRes.data || [];
    const stuckCritical = criticalTasksRes.data || [];

    // ── Calculate metrics ──
    const totalRecent  = recentTasks.length;
    const failedTasks  = recentTasks.filter(t => t.status === 'failed');
    const failureRate  = totalRecent > 0 ? failedTasks.length / totalRecent : 0;
    const alerts       = [];

    // ── Check thresholds and generate alerts (with 6-hour dedup) ──

    if (failureRate > THRESHOLDS.taskFailureRate && totalRecent >= 5 && this._shouldAlert('failureRate')) {
      const pct = Math.round(failureRate * 100);
      alerts.push({
        title:    `High task failure rate: ${pct}%`,
        body:     `${failedTasks.length} of ${totalRecent} tasks in the last 24h failed. Top errors: ${failedTasks.slice(0, 3).map(t => t.error || 'unknown').join(' | ')}`,
        severity: 'critical',
        channel:  'whatsapp',
      });
      this._markAlerted('failureRate');
    }

    if (pendingTasks.length > THRESHOLDS.pendingTasksHigh && this._shouldAlert('pendingHigh')) {
      alerts.push({
        title:    `${pendingTasks.length} tasks pending`,
        body:     `Task queue is building up. Top pending: ${pendingTasks.slice(0, 3).map(t => t.title).join(', ')}`,
        severity: 'warning',
        channel:  'dashboard',   // dashboard only — never WhatsApp for routine queue depth
      });
      this._markAlerted('pendingHigh');
    }

    if (newLeads.length > THRESHOLDS.leadQueueHigh && this._shouldAlert('leadQueue')) {
      alerts.push({
        title:    `${newLeads.length} unprocessed leads`,
        body:     `Lead queue has grown to ${newLeads.length}. Review and follow up.`,
        severity: 'warning',
        channel:  'whatsapp',
      });
      this._markAlerted('leadQueue');
    }

    if (stuckCritical.length > 0 && this._shouldAlert('stuckCritical')) {
      alerts.push({
        title:    `${stuckCritical.length} critical task(s) stalled`,
        body:     `Priority-5 tasks running > 1 hour: ${stuckCritical.map(t => `"${t.title}" (${t.agent_id})`).join(', ')}`,
        severity: 'critical',
        channel:  'whatsapp',
      });
      this._markAlerted('stuckCritical');
    }

    // ── Write alerts to notifications table ──
    for (const alert of alerts) {
      await this.notify(alert.title, alert.body, alert.severity, alert.channel);
    }

    // ── Dispatch ALL pending notifications (including those from other agents) ──
    const dispatchResult = await dispatchPendingNotifications(100).catch(e => {
      console.warn('[Pulse] Notification dispatch error:', e.message);
      return { dispatched: 0, errors: 1 };
    });

    const report = {
      timestamp:        now.toISOString(),
      agents: {
        total:   agents.length,
        idle:    agents.filter(a => a.status === 'idle').length,
        busy:    agents.filter(a => a.status === 'busy').length,
        offline: agents.filter(a => a.status === 'offline').length,
      },
      tasks: {
        recentTotal:   totalRecent,
        recentFailed:  failedTasks.length,
        failureRate:   Math.round(failureRate * 100) + '%',
        pendingCount:  pendingTasks.length,
        stuckCritical: stuckCritical.length,
      },
      leads: {
        newUnprocessed: newLeads.length,
      },
      alerts: alerts.length,
      health: alerts.some(a => a.severity === 'critical') ? 'critical'
             : alerts.length > 0 ? 'warning' : 'healthy',
      notifications: {
        alertsGenerated: alerts.length,
        dispatched:      dispatchResult.dispatched,
        errors:          dispatchResult.errors,
      },
    };

    // ── Session reminders (Nexus checks every sweep) ──────────────────────
    nexus.sendSessionReminders().catch(e =>
      console.warn('[Pulse] Session reminder error:', e.message));

    console.log(`[Pulse] Sweep complete — health: ${report.health}, alerts: ${alerts.length}, dispatched: ${dispatchResult.dispatched}`);
    return report;
  }

  /**
   * Generate a natural-language analytics report.
   * @param {string} period — 'daily' | 'weekly' | 'monthly'
   */
  async generateReport(period = 'weekly') {
    const db = getSupabase();
    if (!db) return { error: 'Supabase not configured' };

    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [tasksRes, leadsRes, kbRes, memRes] = await Promise.all([
      db.from('tasks').select('status, agent_id, type, created_at, completed_at').gte('created_at', cutoff),
      db.from('leads').select('status, score, created_at').gte('created_at', cutoff),
      db.from('knowledge_base').select('domain, created_at').gte('created_at', cutoff),
      db.from('agent_memory').select('agent_id, type, importance, created_at').gte('created_at', cutoff),
    ]);

    const tasks   = tasksRes.data  || [];
    const leads   = leadsRes.data  || [];
    const kbItems = kbRes.data     || [];
    const memory  = memRes.data    || [];

    // Build agent activity breakdown
    const agentActivity = {};
    for (const t of tasks) {
      if (!agentActivity[t.agent_id]) agentActivity[t.agent_id] = { total: 0, completed: 0, failed: 0 };
      agentActivity[t.agent_id].total++;
      if (t.status === 'completed') agentActivity[t.agent_id].completed++;
      if (t.status === 'failed')    agentActivity[t.agent_id].failed++;
    }

    const reportData = {
      period,
      tasks: {
        total:     tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed:    tasks.filter(t => t.status === 'failed').length,
        byAgent:   agentActivity,
      },
      leads: {
        total:     leads.length,
        qualified: leads.filter(l => l.status === 'qualified').length,
        booked:    leads.filter(l => l.status === 'booked').length,
        avgScore:  leads.length ? (leads.reduce((s, l) => s + (l.score || 0), 0) / leads.length).toFixed(1) : 0,
      },
      knowledgeBase: {
        newEntries: kbItems.length,
        byDomain:   kbItems.reduce((acc, k) => { acc[k.domain] = (acc[k.domain] || 0) + 1; return acc; }, {}),
      },
    };

    const reportPrompt = `You are Pulse, generating a ${period} analytics report for the DigiFusion leadership team.

DATA:
${JSON.stringify(reportData, null, 2)}

Write a concise executive-level ${period} report:
1. Headline (one sentence: overall system health + key number)
2. Performance Summary (what the agents accomplished this ${period})
3. Lead Pipeline (pipeline health, notable trends)
4. Knowledge Base Growth (what new intelligence was added)
5. Red Flags (anything requiring attention — be specific)
6. Recommended Focus (top 2–3 priorities for next ${period})

Be direct and specific. If something is underperforming, say so clearly.`;

    const narrative = await callAiProvider(resolveProvider(), reportPrompt, this.systemPrompt, { fallback: true });

    // Notify team with summary
    const subject = `${period.charAt(0).toUpperCase() + period.slice(1)} Report — ${reportData.tasks.completed} tasks completed, ${reportData.leads.booked} leads booked`;
    await this.notify(subject, `Full ${period} report generated. ${reportData.tasks.failed} failed tasks, ${reportData.leads.total} new leads.`, 'info', 'whatsapp');

    return { data: reportData, narrative };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, period } = task;

    switch (action) {
      case 'sweep':
        return this.sweep();
      case 'report':
        return this.generateReport(period || 'weekly');
      case 'dispatch':
        return dispatchPendingNotifications(task.limit || 100);
      default:
        return this.sweep();
    }
  }
}

export const pulse = new Pulse();
