#!/usr/bin/env node
/** Block push if outgoing commits contain Cursor Co-authored-by trailers. */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CURSOR_COAUTHOR = /Co-authored-by:[^\n]*(cursor|cursoragent@cursor\.com)/i;
const ZERO = '0'.repeat(40);

function commitsInRange(range) {
  try {
    return execSync(`git log ${range} --format=%B`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function checkRange(range) {
  const bodies = commitsInRange(range);
  if (!bodies) return null;
  if (!CURSOR_COAUTHOR.test(bodies)) return null;
  try {
    const shas = execSync(`git log ${range} --format=%h`, { encoding: 'utf8' }).trim().split('\n');
    return shas[0] || 'unknown';
  } catch {
    return 'unknown';
  }
}

const stdin = readFileSync(0, 'utf8').trim();
const refs = stdin ? stdin.split('\n').filter(Boolean) : [];

const ranges = [];
for (const line of refs) {
  const [, localSha, , remoteSha] = line.split(/\s+/);
  if (!localSha || localSha === ZERO) continue;
  ranges.push(remoteSha && remoteSha !== ZERO ? `${remoteSha}..${localSha}` : localSha);
}

if (!ranges.length) {
  try {
    ranges.push('@{u}..HEAD');
  } catch {
    ranges.push('-1');
  }
}

for (const range of ranges) {
  const bad = checkRange(range);
  if (bad) {
    console.error('\n[git] Push blocked: commit(s) include a Cursor Co-authored-by trailer.');
    console.error(`      Example: ${bad}`);
    console.error('      Amend or re-commit without the trailer, then push again.\n');
    process.exit(1);
  }
}
