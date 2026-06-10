/**
 * Atlas consulting documents — persist DOCX/PDF buffers to R2 for download.
 *
 * R2 layout:
 *   atlas_deliverables/manifest.json
 *   atlas_deliverables/{taskId}/{filename}
 */

import { isR2Enabled } from '../cloudflareR2.js';

const MANIFEST_KEY = 'atlas_deliverables/manifest.json';
const MAX_MANIFEST = 150;

async function r2Put (key, body, contentType) {
  if (!isR2Enabled()) return false;
  const { uploadResearchAsset } = await import('../cloudflareR2.js');
  await uploadResearchAsset(key, body, contentType);
  return true;
}

async function r2GetJson (key) {
  if (!isR2Enabled()) return null;
  const { fetchResearchAsset } = await import('../cloudflareR2.js');
  return fetchResearchAsset(key);
}

async function r2GetBuffer (key) {
  if (!isR2Enabled()) return null;
  const { fetchResearchAssetBuffer } = await import('../cloudflareR2.js');
  return fetchResearchAssetBuffer(key);
}

/**
 * Save Atlas document buffer; return metadata safe for Supabase JSONB.
 */
export async function persistAtlasDocument (taskId, document = {}) {
  const filename = document.filename || `atlas-${taskId}.docx`;
  const format   = document.format || 'docx';
  const buffer   = document.buffer;
  if (!buffer || !taskId) {
    return { filename, format, hasDoc: Boolean(buffer) };
  }

  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const r2Key = `atlas_deliverables/${taskId}/${filename}`;
  const saved = await r2Put(r2Key, body, contentType);

  if (saved) {
    const manifest = (await r2GetJson(MANIFEST_KEY)) || [];
    const entry = {
      taskId,
      filename,
      format,
      r2Key,
      createdAt: new Date().toISOString(),
    };
    const filtered = manifest.filter(m => m.filename !== filename && m.taskId !== taskId);
    filtered.unshift(entry);
    await r2Put(MANIFEST_KEY, JSON.stringify(filtered.slice(0, MAX_MANIFEST), null, 2), 'application/json');
  }

  return {
    filename,
    format,
    hasDoc: true,
    r2Key: saved ? r2Key : null,
    taskId,
  };
}

export async function getAtlasDocumentByFilename (filename) {
  const manifest = (await r2GetJson(MANIFEST_KEY)) || [];
  const entry = manifest.find(m => m.filename === filename);
  if (!entry?.r2Key) return null;
  const buffer = await r2GetBuffer(entry.r2Key);
  if (!buffer) return null;
  return { ...entry, buffer };
}
