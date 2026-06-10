#!/usr/bin/env node
/**
 * Remove Cursor / AI co-author trailers from COMMIT_EDITMSG (commit-msg hook).
 * Matches cursoragent@cursor.com and common Cursor Co-authored-by variants.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CURSOR_COAUTHOR_LINE =
  /^Co-authored-by:\s*.+(cursor|cursoragent@cursor\.com)/i;

export function stripCursorCoauthorLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !CURSOR_COAUTHOR_LINE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

const file = process.argv[2];
if (!file) process.exit(0);

const text = readFileSync(file, 'utf8');
const cleaned = stripCursorCoauthorLines(text);

if (cleaned !== text.trimEnd()) {
  writeFileSync(file, cleaned + (cleaned.endsWith('\n') ? '' : '\n'));
}
