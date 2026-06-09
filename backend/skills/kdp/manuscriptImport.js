/**
 * Import existing manuscripts — parse TXT/MD/DOCX/PDF into section objects.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const CHAPTER_RE = /^(?:#{1,3}\s+)?(?:chapter|part|section|module)\s*[\dIVXLC]+[.:)\-\s]*(.+)?$/i;
const ALLCAPS_HEADING_RE = /^[A-Z][A-Z0-9\s:'\-–—]{4,}$/;

export function parseImportedText(raw = '', hints = {}) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { title: hints.title || 'Untitled', sections: [] };

  const lines = text.split('\n');
  const sections = [];
  let current = null;

  function pushCurrent() {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (body || current.title) {
      sections.push({
        type:  current.type || 'chapter',
        title: current.title || `Section ${sections.length + 1}`,
        body,
      });
    }
    current = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.lines.push('');
      continue;
    }

    const chapterMatch = trimmed.match(CHAPTER_RE);
    if (chapterMatch) {
      pushCurrent();
      const titlePart = (chapterMatch[1] || trimmed.replace(CHAPTER_RE, '')).trim();
      current = {
        type:  /^part\b/i.test(trimmed) ? 'section' : 'chapter',
        title: titlePart || trimmed,
        lines: [],
      };
      continue;
    }

    if (!current && sections.length === 0 && trimmed.length < 120 && !trimmed.endsWith('.')) {
      // First short line may be document title
      if (!hints.title) {
        current = { type: 'introduction', title: trimmed, lines: [] };
        continue;
      }
    }

    if (!current) {
      current = { type: 'chapter', title: `Section ${sections.length + 1}`, lines: [] };
    }
    current.lines.push(line);
  }
  pushCurrent();

  if (!sections.length) {
    sections.push({
      type:  'chapter',
      title: hints.title || 'Manuscript',
      body:  text,
    });
  }

  const title = hints.title
    || sections[0]?.title
    || text.split('\n')[0]?.slice(0, 80)
    || 'Untitled';

  return {
    title,
    subtitle: hints.subtitle || '',
    sections,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

async function pandocToPlain(buffer, ext) {
  const id = randomBytes(6).toString('hex');
  const inPath = join(tmpdir(), `${id}-in.${ext}`);
  const outPath = join(tmpdir(), `${id}.txt`);
  try {
    await writeFile(inPath, buffer);
    await execFileAsync('pandoc', [inPath, '-o', outPath, '--to', 'plain'], { timeout: 45_000 });
    return readFile(outPath, 'utf8');
  } catch {
    return null;
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

async function pdfToText(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data?.text || '';
  } catch {
    return '';
  }
}

/** Extract plain text from an uploaded manuscript file. */
export async function extractManuscriptText(buffer, filename = 'upload.txt', hints = {}) {
  const name = String(filename || '').toLowerCase();
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');

  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
    return parseImportedText(body.toString('utf8'), hints);
  }

  if (name.endsWith('.docx')) {
    const plain = await pandocToPlain(body, 'docx');
    if (plain) return parseImportedText(plain, hints);
    throw new Error('Could not read DOCX — install Pandoc or paste your manuscript as text.');
  }

  if (name.endsWith('.pdf')) {
    const plain = await pdfToText(body);
    if (plain?.trim()) return parseImportedText(plain, hints);
    throw new Error('Could not extract text from PDF.');
  }

  // Fallback: treat as UTF-8 text
  return parseImportedText(body.toString('utf8'), hints);
}
