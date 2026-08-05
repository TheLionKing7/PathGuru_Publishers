#!/usr/bin/env node
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const db = getSupabase();
let data;
if (process.argv[2]) {
  ({ data } = await db.from('tasks').select('*').eq('id', process.argv[2]).single());
} else {
  ({ data } = await db.from('tasks').select('*').ilike('title', '%African C%').order('created_at', { ascending: false }).limit(1).single());
}

const out = join(__dirname, '../../tmp-task-dump.json');
writeFileSync(out, JSON.stringify(data, null, 2));
console.log('Wrote', out, 'title:', data?.title);
