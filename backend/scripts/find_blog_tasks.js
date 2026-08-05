#!/usr/bin/env node
/**
 * The last 20 blog or pending-approval tasks, with topic and input size.
 * The quickest way to see what the agents queued and whether it is stuck.
 *
 *   node --env-file=.env.local backend/scripts/find_blog_tasks.js
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const db = getSupabase();
const { data, error } = await db.from('tasks')
  .select('id,title,status,type,input,created_at')
  .or('type.eq.pending_approval,title.ilike.%blog%')
  .order('created_at', { ascending: false })
  .limit(20);

if (error) console.error(error);
for (const t of data || []) {
  const topic = t.input?.payload?.topic || t.input?.payload?.proposedTitle || '';
  const contentLen = JSON.stringify(t.input || '').length;
  console.log(t.created_at?.slice(0, 10), t.status, t.type, topic?.slice(0, 60), 'input chars:', contentLen);
}
