#!/usr/bin/env node
/**
 * Pre-commit guard — block secrets files and obvious credential patterns.
 */
import { execSync } from 'node:child_process';

const BLOCKED = [
  /^\.env$/,
  /^\.env\.(?!example)[^/]+$/,
  /\.pem$/,
  /credentials\.json$/,
  /service-account.*\.json$/,
];

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|private[_-]?key)\s*[:=]\s*['"]?[a-zA-Z0-9_\-/+=]{20,}/i,
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./,
];

function stagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
  return out.trim().split(/\r?\n/).filter(Boolean);
}

function stagedContent(path) {
  return execSync(`git show :${path}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

const files = stagedFiles();
if (!files.length) process.exit(0);

for (const file of files) {
  const norm = file.replace(/\\/g, '/');
  if (BLOCKED.some((re) => re.test(norm))) {
    console.error(`\nPre-commit blocked: "${file}" is a secrets file.`);
    console.error('Commit .env.example templates only — never live .env files.\n');
    process.exit(1);
  }
  if (!/\.(js|mjs|cjs|json|md|html|ts|tsx)$/.test(norm)) continue;
  try {
    const text = stagedContent(file);
    for (const pat of SECRET_PATTERNS) {
      if (pat.test(text)) {
        console.error(`\nPre-commit blocked: possible secret in staged "${file}".`);
        console.error('Remove credentials or use environment variables.\n');
        process.exit(1);
      }
    }
  } catch {
    // ignore unreadable / binary
  }
}

console.log('guard-staged: ok');
