#!/usr/bin/env node
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../supabaseClient.js';
import { extractPostBody } from '../lib/extractPostBody.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const db = getSupabase();
const slug = 'rewiring-the-african-c-suite-the-ai-first-playbook-for-automation-driven-growth';
const { data } = await db.from('posts').select('content').eq('slug', slug).single();
const raw = data?.content || '';
console.log('raw length:', raw.length);
console.log('has post-body:', /post-body/i.test(raw));
const re = /<div[^>]*class=["'][^"']*post-body[^"']*["'][^>]*>/gi;
let m;
while ((m = re.exec(raw)) !== null) {
  console.log('match at', m.index, ':', m[0].slice(0, 120));
  console.log('  after:', raw.slice(m.index + m[0].length, m.index + m[0].length + 200));
}
// Show article structure
const articleStart = raw.indexOf('<article');
console.log('\n--- article section ---');
console.log(raw.slice(articleStart, articleStart + 2500));
console.log('\n--- h2/p tags count ---');
console.log('h2:', (raw.match(/<h2/gi) || []).length);
console.log('p:', (raw.match(/<p/gi) || []).length);
