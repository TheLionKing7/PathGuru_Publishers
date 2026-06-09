#!/usr/bin/env node
/** Strip Cursor co-author line from COMMIT_EDITMSG path (commit-msg hook). */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) process.exit(0);

const text = readFileSync(file, 'utf8');
const cleaned = text
  .split(/\r?\n/)
  .filter((line) => !/^Co-authored-by:\s*Cursor\s*</i.test(line))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd();

if (cleaned !== text.trimEnd()) writeFileSync(file, cleaned + (cleaned.endsWith('\n') ? '' : '\n'));
