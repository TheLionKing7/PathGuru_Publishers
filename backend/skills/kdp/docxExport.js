/**
 * KDP manuscript DOCX export via Pandoc (HTML → DOCX).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function isPandocAvailable() {
  try {
    await execFileAsync('pandoc', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function buildKdpDocx(html, project = {}) {
  if (!html) throw new Error('HTML content required for DOCX export');
  if (!(await isPandocAvailable())) {
    throw new Error('Pandoc is not installed — DOCX export unavailable');
  }

  const id = randomBytes(8).toString('hex');
  const tmpDir = tmpdir();
  const htmlPath = join(tmpDir, `${id}.html`);
  const docPath = join(tmpDir, `${id}.docx`);
  const refTemplate = join(__dirname, '../../assets/consulting-reference.docx');
  const safeTitle = (project.title || 'pathguru-manuscript')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  try {
    await writeFile(htmlPath, html, 'utf8');
    const args = [
      htmlPath,
      '-o', docPath,
      '--from', 'html',
      '--to', 'docx',
      '-V', `title=${project.title || 'Manuscript'}`,
    ];
    if (existsSync(refTemplate)) {
      args.push(`--reference-doc=${refTemplate}`);
    }
    await execFileAsync('pandoc', args, { timeout: 60_000 });
    const buffer = await readFile(docPath);
    return {
      buffer,
      format: 'docx',
      filename: `${safeTitle}-${new Date().toISOString().slice(0, 10)}.docx`,
    };
  } finally {
    unlink(htmlPath).catch(() => {});
    unlink(docPath).catch(() => {});
  }
}
