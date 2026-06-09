/**
 * Publisher imprint packs — fixed front matter (sigil, intro, title, copyright).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPRINTS_ROOT = path.resolve(__dirname, '../../assets/imprints');

export const IMPRINT_PACKS = {
  pathfinda: {
    id:          'pathfinda',
    brandName:   'PathFinda Publishers',
    logoFile:    'pathfinda-logo.png',
    introDir:    'pathfinda',
    introFile:   'why-the-a.md',
    introTitle:  "WHY THE 'A'?",
    sequence:    ['imprint-sigil', 'publisher-intro', 'title-page', 'copyright-page'],
  },
  digitalNation: {
    id:          'digitalNation',
    brandName:   'Digital Nation Inc.',
    logoFile:    'digital-nation-logo.png',
    introDir:    null,
    introFile:   null,
    introTitle:  null,
    sequence:    ['imprint-sigil', 'title-page', 'copyright-page'],
  },
};

function resolveImprintKey(publisherProfile, publisherName) {
  const style = publisherProfile?.resolvedStyle || publisherProfile?.style || '';
  if (style === 'pathfinda' || /pathfinda/i.test(publisherName || '')) return 'pathfinda';
  if (style === 'digitalNation' || /digital nation/i.test(publisherName || '')) return 'digitalNation';
  const profileKey = String(publisherProfile?.id || '').toLowerCase();
  if (profileKey === 'pathfinda') return 'pathfinda';
  if (profileKey === 'digitalnation' || profileKey === 'digital_nation') return 'digitalNation';
  return null;
}

export function getImprintPack(publisherProfile, publisherName) {
  const key = resolveImprintKey(publisherProfile, publisherName);
  return key ? IMPRINT_PACKS[key] : null;
}

export function imprintLogoUrl(pack, baseUrl = '') {
  if (!pack?.logoFile) return '';
  const base = (baseUrl || '').replace(/\/$/, '');
  return `${base}/assets/imprints/${pack.logoFile}`;
}

async function readIntroBody(pack) {
  if (!pack?.introDir || !pack.introFile) return '';
  const filePath = path.join(IMPRINTS_ROOT, pack.introDir, pack.introFile);
  if (!existsSync(filePath)) return '';
  return readFile(filePath, 'utf8');
}

/**
 * Build fixed imprint sections to prepend before AI chapters.
 */
export async function buildImprintSections(project, options = {}) {
  const pack = getImprintPack(project.publisherProfile, project.publisher);
  if (!pack) return [];

  const baseUrl = options.assetBaseUrl || process.env.PATHGURU_PUBLIC_URL || '';
  const logoUrl = project.publisherProfile?.logoUrl
    || imprintLogoUrl(pack, baseUrl);
  const introBody = await readIntroBody(pack);

  const disclaimer = 'This publication is for educational purposes and should be adapted to the reader\'s context before professional, financial, legal, medical, or safety decisions are made.';

  const sectionBuilders = {
    'imprint-sigil': () => ({
      type:         'imprint-sigil',
      title:        pack.brandName,
      body:         '',
      logoUrl,
      designIntent: { layout: 'imprint-sigil', pageBreakBefore: true },
    }),
    'publisher-intro': () => ({
      type:         'publisher-intro',
      title:        pack.introTitle || 'Publisher',
      body:         introBody,
      designIntent: { layout: 'publisher-intro', pageBreakBefore: true },
    }),
    'title-page': () => ({
      type:         'title-page',
      title:        project.title || 'Untitled',
      body:         [
        project.subtitle || '',
        project.author ? `By ${project.author}` : '',
      ].filter(Boolean).join('\n\n'),
      designIntent: { layout: 'title-page', pageBreakBefore: true },
    }),
    'copyright-page': () => ({
      type:         'copyright-page',
      title:        'Copyright',
      body:         [
        project.copyright || `Copyright ${new Date().getFullYear()} ${project.author || 'Author'}. All rights reserved.`,
        '',
        `Published by ${project.publisher || pack.brandName}.`,
        project.author ? `Written by ${project.author}.` : '',
        '',
        disclaimer,
      ].filter(Boolean).join('\n'),
      designIntent: { layout: 'copyright-page', pageBreakBefore: true },
    }),
  };

  return pack.sequence
    .filter(id => id !== 'publisher-intro' || introBody.trim())
    .map(id => sectionBuilders[id]?.())
    .filter(Boolean);
}

/** Strip AI-generated frontmatter/copyright — imprint replaces them. */
export function stripDuplicateFrontMatter(sections = []) {
  const skip = new Set(['frontmatter', 'copyright', 'title-page', 'copyright-page', 'imprint-sigil', 'publisher-intro']);
  return sections.filter(s => !skip.has((s.type || '').toLowerCase()));
}

export async function applyImprintToManuscript(manuscript, project, options = {}) {
  const imprint = await buildImprintSections(project, options);
  if (!imprint.length) return manuscript;

  const bodySections = stripDuplicateFrontMatter(manuscript?.sections || []);
  return {
    ...manuscript,
    sections: [...imprint, ...bodySections],
  };
}

/** Resolve bundled logo into publisherProfile when empty. */
export function resolveBundledLogo(publisherProfile, assetBaseUrl = '') {
  const pack = getImprintPack(publisherProfile, publisherProfile?.brandName);
  if (!pack) return publisherProfile;
  const logoUrl = publisherProfile?.logoUrl || imprintLogoUrl(pack, assetBaseUrl);
  return { ...publisherProfile, logoUrl };
}
