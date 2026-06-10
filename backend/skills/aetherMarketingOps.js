/**
 * Aether Marketing Ops — live context for campaigns, calendar, firm IP
 */

import { getSupabase } from '../supabaseClient.js';
import { getFrameworksForAgent } from './firmFrameworks.js';
import { AETHER_AUTHOR_KB_SLUGS } from './aetherMarketingDoctrine.js';

export async function buildMarketingOpsSnapshot() {
  const db = getSupabase();
  const snap = {
    pulledAt:         new Date().toISOString(),
    frameworks:       getFrameworksForAgent('aether').map(f => ({ id: f.id, name: f.shortName || f.name, kind: f.kind })),
    authorIp:         ['Digital Ads Playbook', 'Stop Buying Ads. Start Buying Customers.'],
    authorKbSlugs:    AETHER_AUTHOR_KB_SLUGS,
    recentTasks:      [],
    scheduledContent: { queued: 0, pending: 0 },
    activeCampaigns:  [],
  };

  if (!db) return snap;

  const [tasksRes, scheduleRes] = await Promise.all([
    db.from('tasks')
      .select('title, status, type, created_at')
      .eq('agent_id', 'aether')
      .order('created_at', { ascending: false })
      .limit(8),
    import('./nexusCeoOps.js').then(m => m.loadOpsContext()).catch(() => null),
  ]);

  snap.recentTasks = (tasksRes.data || []).map(t => ({
    title: (t.title || '').slice(0, 70),
    status: t.status,
    type: t.type,
  }));

  if (scheduleRes?.contentSchedule) {
    snap.scheduledContent = {
      queued:  scheduleRes.contentSchedule.queued || 0,
      pending: scheduleRes.contentSchedule.pending || 0,
    };
  }

  snap.activeCampaigns = (tasksRes.data || [])
    .filter(t => /campaign|calendar|c2c|strategy/i.test(t.title || '') && t.status !== 'completed')
    .map(t => ({ title: (t.title || '').slice(0, 60), status: t.status }));

  return snap;
}

export function formatMarketingLiveContext(snap) {
  if (!snap) return '';
  const lines = [
    `EDITORIAL QUEUE: ${snap.scheduledContent?.queued || 0} queued, ${snap.scheduledContent?.pending || 0} awaiting Boss approval`,
    `AUTHOR IP: ${(snap.authorIp || []).join(' · ') || 'Digital Ads Playbook · Stop Buying Ads'}`,
    `FRAMEWORKS: ${(snap.frameworks || []).map(f => f.name).join(', ') || 'C2C Pipeline'}`,
    'STACK: Baldwin economics + platform doctrine → C2C Pipeline execution',
  ];
  if (snap.recentTasks?.length) {
    lines.push('RECENT AETHER WORK:');
    snap.recentTasks.slice(0, 4).forEach(t => lines.push(`  - ${t.title} [${t.status}]`));
  }
  return lines.join('\n');
}

export function extractBrandName(text) {
  const m = text.match(/(?:for|brand|client|campaign)\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/i)
    || text.match(/([A-Z][A-Za-z0-9&.\- ]{2,40})\s+(?:campaign|brand|marketing)/i);
  return m ? m[1].trim() : '';
}
