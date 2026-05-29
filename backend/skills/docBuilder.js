/**
 * DigiFusion Intelligence Network — Consulting Document Builder
 * ==============================================================
 * Converts agent-produced research/strategy content into professional
 * consulting-grade documents (DOCX and PDF).
 *
 * Supported document types:
 *   research-paper   — market research brief (McKinsey/BCG style)
 *   playbook         — operational playbook with phases and checklists
 *   case-study       — client case study with challenge/solution/results
 *   market-brief     — concise market intelligence brief (4–8 pages)
 *   strategy-report  — strategic recommendations report
 *
 * Output pipeline:
 *   Agent markdown text
 *     └─ enrichMarkdown()  — injects DigiFusion branding, page structure
 *         └─ Pandoc         — markdown → DOCX (with reference template)
 *         └─ OR: HTML renderer → Playwright → PDF
 *
 * Pandoc must be installed on the server. Render.yaml handles this via
 * `apt-get install -y pandoc` in the buildCommand.
 *
 * Falls back to a plain HTML document if Pandoc is not available.
 */

import { execFile }     from 'node:child_process';
import { promisify }    from 'node:util';
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync }   from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir }       from 'node:os';
import { randomBytes }  from 'node:crypto';

const execFileAsync = promisify(execFile);
const __dirname     = dirname(fileURLToPath(import.meta.url));

// ── Template definitions ──────────────────────────────────────────────────────

const TEMPLATES = {
  'research-paper': {
    label:        'Market Research Brief',
    eyebrow:      'Intelligence Report',
    sections:     ['Executive Summary', 'Market Context', 'Key Findings', 'Frameworks & Models', 'Competitive Landscape', 'Implications', 'Recommended Actions', 'Sources'],
    coverTag:     'RESEARCH',
    accentColor:  '#0F2460',
  },
  'playbook': {
    label:        'Operational Playbook',
    eyebrow:      'Strategy Playbook',
    sections:     ['Overview', 'Strategic Context', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Diagnostic Questions', 'KPIs & Metrics', 'Implementation Timeline'],
    coverTag:     'PLAYBOOK',
    accentColor:  '#1A5C3A',
  },
  'case-study': {
    label:        'Case Study',
    eyebrow:      'Client Case Study',
    sections:     ['Executive Summary', 'The Challenge', 'Our Approach', 'The Solution', 'Results & Impact', 'Key Learnings', 'Applicability'],
    coverTag:     'CASE STUDY',
    accentColor:  '#5C2A1A',
  },
  'market-brief': {
    label:        'Market Intelligence Brief',
    eyebrow:      'Market Brief',
    sections:     ['Key Takeaways', 'Market Overview', 'Trends & Signals', 'Competitive Dynamics', 'Opportunities', 'Next Steps'],
    coverTag:     'MARKET BRIEF',
    accentColor:  '#1A3F5C',
  },
  'strategy-report': {
    label:        'Strategic Recommendations Report',
    eyebrow:      'Strategic Analysis',
    sections:     ['Executive Summary', 'Situation Analysis', 'Strategic Options', 'Recommended Strategy', 'Roadmap', 'Risk Assessment', 'Investment Required', 'Expected Outcomes'],
    coverTag:     'STRATEGY',
    accentColor:  '#3C1A5C',
  },
};

// ── Pandoc availability check ─────────────────────────────────────────────────

let _pandocAvailable = null;
async function isPandocAvailable() {
  if (_pandocAvailable !== null) return _pandocAvailable;
  try {
    await execFileAsync('pandoc', ['--version']);
    _pandocAvailable = true;
  } catch {
    _pandocAvailable = false;
    console.warn('[DocBuilder] Pandoc not found — falling back to HTML output.');
  }
  return _pandocAvailable;
}

// ── Markdown enrichment ───────────────────────────────────────────────────────

/**
 * Wrap raw agent markdown with document metadata so Pandoc produces
 * a properly structured DOCX with title, author, date.
 */
function buildPandocMarkdown(content, meta) {
  const { title, subtitle, author, date, docType, client } = meta;
  const template = TEMPLATES[docType] || TEMPLATES['research-paper'];

  return `---
title: "${title.replace(/"/g, '\\"')}"
subtitle: "${(subtitle || template.label).replace(/"/g, '\\"')}"
author: "${(author || 'DigiFusion Intelligence').replace(/"/g, '\\"')}"
date: "${date || new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}"
subject: "${template.label}"
keywords: [${template.sections.map(s => `"${s}"`).join(', ')}]
lang: "en"
---

${client ? `*Prepared for: ${client}*\n\n---\n\n` : ''}${content}

---

*© ${new Date().getFullYear()} DigiFusion. All rights reserved. This document is confidential and prepared solely for the intended recipient.*
`;
}

// ── HTML template for fallback / PDF rendering ────────────────────────────────

function buildConsultingHTML(content, meta) {
  const { title, subtitle, author, date, docType, client } = meta;
  const template = TEMPLATES[docType] || TEMPLATES['research-paper'];
  const accent   = template.accentColor;

  // Convert markdown to basic HTML (headings, bold, lists)
  const htmlBody = content
    .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul>${m}</ul>`)
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[hul]|<hr|<li|<\/)/gm, '')
    .replace(/^(.+)$/gm, m => m.startsWith('<') ? m : `<p>${m}</p>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 25mm 20mm 25mm 20mm; }
  body {
    font-family: 'Georgia', serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1a1a2e;
    background: #fff;
  }

  /* Cover page */
  .cover {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 60px 60px 50px;
    background: ${accent};
    color: white;
    page-break-after: always;
  }
  .cover-tag {
    font-family: 'Arial', sans-serif;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 3px;
    color: rgba(255,255,255,0.7);
    text-transform: uppercase;
    border-left: 3px solid rgba(255,255,255,0.4);
    padding-left: 12px;
  }
  .cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 40px 0; }
  .cover-eyebrow {
    font-family: 'Arial', sans-serif;
    font-size: 10pt;
    font-weight: 400;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 20px;
  }
  .cover-title {
    font-family: 'Georgia', serif;
    font-size: 32pt;
    font-weight: 700;
    line-height: 1.15;
    color: white;
    margin-bottom: 20px;
    max-width: 520px;
  }
  .cover-subtitle {
    font-family: 'Arial', sans-serif;
    font-size: 12pt;
    color: rgba(255,255,255,0.75);
    max-width: 480px;
    line-height: 1.5;
  }
  .cover-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 1px solid rgba(255,255,255,0.2);
    padding-top: 24px;
  }
  .cover-firm { font-family: 'Arial', sans-serif; font-size: 14pt; font-weight: 700; color: white; }
  .cover-meta { font-family: 'Arial', sans-serif; font-size: 9pt; color: rgba(255,255,255,0.6); text-align: right; line-height: 1.6; }

  /* Content */
  .content { padding: 50px 60px; }
  h1 {
    font-family: 'Arial', sans-serif;
    font-size: 20pt;
    font-weight: 700;
    color: ${accent};
    margin: 40px 0 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid ${accent};
  }
  h2 {
    font-family: 'Arial', sans-serif;
    font-size: 14pt;
    font-weight: 700;
    color: #1a1a2e;
    margin: 28px 0 10px;
  }
  h3 {
    font-family: 'Arial', sans-serif;
    font-size: 11pt;
    font-weight: 700;
    color: #333;
    margin: 20px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  h4 {
    font-family: 'Arial', sans-serif;
    font-size: 10.5pt;
    font-weight: 700;
    color: #555;
    margin: 16px 0 6px;
  }
  p { margin-bottom: 12px; }
  ul, ol { margin: 12px 0 16px 24px; }
  li { margin-bottom: 6px; }
  strong { color: #1a1a2e; }
  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 32px 0;
  }
  .callout {
    background: #F5F7FF;
    border-left: 4px solid ${accent};
    padding: 16px 20px;
    margin: 20px 0;
    border-radius: 0 6px 6px 0;
  }
  .callout-label {
    font-family: 'Arial', sans-serif;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: ${accent};
    margin-bottom: 6px;
  }
  .footer-bar {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    font-family: 'Arial', sans-serif;
    font-size: 8pt;
    color: #999;
    display: flex;
    justify-content: space-between;
    padding: 8px 60px;
    border-top: 1px solid #eee;
    background: white;
  }
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <div class="cover-tag">${template.coverTag}</div>
  <div class="cover-body">
    <p class="cover-eyebrow">${template.eyebrow}</p>
    <h1 class="cover-title">${title}</h1>
    ${subtitle ? `<p class="cover-subtitle">${subtitle}</p>` : ''}
  </div>
  <div class="cover-footer">
    <div class="cover-firm">DigiFusion</div>
    <div class="cover-meta">
      ${client ? `Prepared for: ${client}<br>` : ''}
      ${author || 'DigiFusion Intelligence'}<br>
      ${date || new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}
    </div>
  </div>
</div>

<!-- Document Body -->
<div class="content">
${htmlBody}
</div>

<!-- Footer -->
<div class="footer-bar">
  <span>DigiFusion Intelligence — Confidential</span>
  <span>${title}</span>
</div>

</body>
</html>`;
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build a consulting document from agent content.
 *
 * @param {object} params
 * @param {string} params.content     — The raw markdown from the agent
 * @param {string} params.title       — Document title
 * @param {string} [params.subtitle]  — Optional subtitle
 * @param {string} [params.docType]   — Template: research-paper | playbook | case-study | market-brief | strategy-report
 * @param {string} [params.format]    — Output format: 'docx' | 'pdf' | 'html' (default: 'docx')
 * @param {string} [params.author]    — Author name
 * @param {string} [params.client]    — Client/recipient name
 * @param {string} [params.date]      — Custom date string
 *
 * @returns {{ buffer: Buffer, format: string, filename: string, html: string }}
 */
export async function buildConsultingDoc({
  content,
  title,
  subtitle   = '',
  docType    = 'research-paper',
  format     = 'docx',
  author     = 'DigiFusion Intelligence',
  client     = '',
  date       = '',
}) {
  const meta     = { title, subtitle, author, date, docType, client };
  const template = TEMPLATES[docType] || TEMPLATES['research-paper'];
  const safeName = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}-${dateSlug}`;

  // Always build the HTML version (used as fallback + PDF source)
  const html = buildConsultingHTML(content, meta);

  // ── DOCX via Pandoc ──────────────────────────────────────────────────────
  if (format === 'docx' && await isPandocAvailable()) {
    const id      = randomBytes(8).toString('hex');
    const tmpDir  = tmpdir();
    const mdPath  = join(tmpDir, `${id}.md`);
    const docPath = join(tmpDir, `${id}.docx`);

    // Reference DOCX template (gives DigiFusion branding to Pandoc output)
    const refTemplatePath = join(__dirname, '../assets/consulting-reference.docx');
    const hasRefTemplate  = existsSync(refTemplatePath);

    try {
      await writeFile(mdPath, buildPandocMarkdown(content, meta), 'utf8');

      const pandocArgs = [
        mdPath,
        '-o', docPath,
        '--from', 'markdown+smart',
        '--to',   'docx',
        '-V', `title=${title}`,
        '-V', `date=${date || new Date().toLocaleDateString('en-GB')}`,
      ];

      if (hasRefTemplate) {
        pandocArgs.push(`--reference-doc=${refTemplatePath}`);
      }

      await execFileAsync('pandoc', pandocArgs, { timeout: 30_000 });
      const buffer = await readFile(docPath);

      return { buffer, format: 'docx', filename: `${filename}.docx`, html, template };
    } catch (e) {
      console.error('[DocBuilder] Pandoc DOCX error:', e.message);
      // fall through to HTML
    } finally {
      unlink(mdPath).catch(() => {});
      unlink(docPath).catch(() => {});
    }
  }

  // ── PDF via Playwright ────────────────────────────────────────────────────
  if (format === 'pdf') {
    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page    = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      const buffer  = await page.pdf({
        format:          'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      await browser.close();
      return { buffer, format: 'pdf', filename: `${filename}.pdf`, html, template };
    } catch (e) {
      console.error('[DocBuilder] Playwright PDF error:', e.message);
      // fall through to HTML
    }
  }

  // ── HTML fallback ─────────────────────────────────────────────────────────
  const buffer = Buffer.from(html, 'utf8');
  return { buffer, format: 'html', filename: `${filename}.html`, html, template };
}

/**
 * List available document templates.
 */
export function listDocTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    label:    t.label,
    eyebrow:  t.eyebrow,
    sections: t.sections,
  }));
}

/**
 * Upload a built document to R2 and return the URL.
 * Stores under: consulting-docs/<YYYY-MM>/<filename>
 */
export async function uploadDocToR2(buffer, filename, format) {
  try {
    const { uploadToR2Internal } = await import('../cloudflareR2.js').catch(() => ({}));
    // Use the R2 raw upload via fetch (same pattern as cloudflareR2.js uploadToR2)
    const { isR2Enabled } = await import('../cloudflareR2.js');
    if (!isR2Enabled()) return null;

    const month    = new Date().toISOString().slice(0, 7);
    const key      = `consulting-docs/${month}/${filename}`;
    const mimeMap  = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', html: 'text/html' };
    const mime     = mimeMap[format] || 'application/octet-stream';

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
    const bucket    = process.env.CLOUDFLARE_R2_BUCKET  || process.env.R2_BUCKET_NAME;
    const apiToken  = process.env.CLOUDFLARE_API_TOKEN;
    const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

    const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': mime },
      body: buffer,
    });

    if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
    return publicUrl ? `${publicUrl}/${key}` : url;
  } catch (e) {
    console.warn('[DocBuilder] R2 upload error:', e.message);
    return null;
  }
}
