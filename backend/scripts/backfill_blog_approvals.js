#!/usr/bin/env node
/**
 * Backfill blog approvals that were resolved 'approved' but never published.
 *
 * Finds `pending_approval` tasks with approvalType `blog_post`, decision
 * `approved`, and no recorded publish state, then runs the same observable
 * publish transition used by live approvals (publishing → published/publish_failed
 * + SLACK_OPS_CHANNEL notice). Idempotent — safe to re-run.
 *
 * Usage:
 *   node --env-file=.env backend/scripts/backfill_blog_approvals.js
 *   node --env-file=.env backend/scripts/backfill_blog_approvals.js --dry-run
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { runApprovedBlogPublish } from '../skills/blogApprovalFlow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const dryRun = process.argv.includes('--dry-run');

function safeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

const db = getSupabase();
if (!db) {
  console.error('Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const { data: rows, error } = await db.from('tasks')
  .select('*')
  .eq('type', 'pending_approval')
  .eq('status', 'completed')
  .order('created_at', { ascending: false })
  .limit(200);

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

const orphans = (rows || []).filter((task) => {
  const input  = safeJson(task.input);
  const output = safeJson(task.output);
  return input.approvalType === 'blog_post'
    && output.decision === 'approved'
    && !output.publishState;
});

if (!orphans.length) {
  console.log('No orphaned approved blog approvals to backfill.');
  process.exit(0);
}

console.log(`${dryRun ? '[dry-run] ' : ''}Found ${orphans.length} approved blog approval(s) with no publish result.\n`);

for (const task of orphans) {
  const input  = safeJson(task.input);
  const output = safeJson(task.output);

  const approval = {
    approvalId:   task.id,
    decision:     'approved',
    approvalType: input.approvalType || 'blog_post',
    payload:      { ...(input.payload || {}), bossFeedback: output.feedback || '' },
    subject:      input.subject || task.title,
    feedback:     output.feedback || '',
    caveats:      input.payload?.bossCaveats || [],
  };

  console.log(`\u25B6 ${approval.subject}`);

  if (dryRun) {
    console.log('  (would attempt publish + record outcome + Slack ops notice)');
    continue;
  }

  const result = await runApprovedBlogPublish(approval);
  if (result.state === 'published') {
    console.log(`  \u2713 published: ${result.url || result.slug || '(no url)'}`);
  } else {
    console.log(`  \u2717 publish_failed: ${result.error}`);
  }
}

console.log('\nDone.');
