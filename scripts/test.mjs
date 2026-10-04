#!/usr/bin/env node
/** Run the repository's self-contained backend test files. */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoots = ['backend'];
const testFilePattern = /\.test\.(?:mjs|js)$/;

async function findTests(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const found = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(fullPath);
    return entry.isFile() && testFilePattern.test(entry.name) ? [fullPath] : [];
  }));

  return found.flat();
}

const testFiles = (await Promise.all(testRoots.map((root) => findTests(path.join(repoRoot, root)))))
  .flat()
  .sort();

if (!testFiles.length) {
  console.error(`No test files matching ${testFilePattern} found under: ${testRoots.join(', ')}`);
  process.exit(1);
}

console.log(`Running ${testFiles.length} backend test files…`);
for (const file of testFiles) {
  const relativePath = path.relative(repoRoot, file);
  console.log(`\n▶ ${relativePath}`);
  const result = spawnSync(process.execPath, [file], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`Could not start ${relativePath}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${testFiles.length} backend test files passed.`);