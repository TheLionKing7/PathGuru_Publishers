function envValue(name) {
  return typeof process.env[name] === "string" ? process.env[name].trim() : "";
}

// Support both naming conventions
const accountId = envValue("CLOUDFLARE_ACCOUNT_ID") || envValue("R2_ACCOUNT_ID");
const bucket    = envValue("CLOUDFLARE_R2_BUCKET")  || envValue("R2_BUCKET_NAME");
const apiToken  = envValue("CLOUDFLARE_API_TOKEN");
const publicUrl = envValue("R2_PUBLIC_URL");    // e.g. https://cdn.digitafusion.com

export const r2Config = {
  accountId,
  bucket,
  apiToken
};

export function isR2Enabled() {
  return Boolean(accountId && bucket && apiToken);
}

function getBaseUrl() {
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
}

function encodeKey(key) {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function getObjectUrl(key) {
  return `${getBaseUrl()}/${encodeKey(key)}`;
}

async function uploadToR2(key, body, contentType) {
  const url = getObjectUrl(key);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": contentType
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cloudflare R2 upload failed for ${key}: ${response.status} ${response.statusText} ${text}`);
  }

  return url;
}

function safeFileName(value) {
  return String(value || "").trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9-_.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "project";
}

export async function saveGeneratedProject(project, html, pdfBuffer) {
  if (!isR2Enabled()) {
    return null;
  }

  const title = safeFileName(project.title || project.id);
  const prefix = `pathguru/${project.id}-${title}`;
  const jsonKey = `${prefix}/project.json`;
  const htmlKey = `${prefix}/draft.html`;

  const jsonUrl = await uploadToR2(jsonKey, JSON.stringify(project, null, 2), "application/json");
  const htmlUrl = await uploadToR2(htmlKey, html, "text/html");

  let pdfUrl = null;
  if (pdfBuffer) {
    const pdfKey = `${prefix}/output.pdf`;
    pdfUrl = await uploadToR2(pdfKey, pdfBuffer, "application/pdf");
  }

  return {
    projectJsonUrl: jsonUrl,
    draftHtmlUrl: htmlUrl,
    pdfUrl,
  };
}

/* ── Blog media library ────────────────────────────────────────
   Upload, list, and delete files under the blog-media/ prefix.
   Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_BUCKET, and
   CLOUDFLARE_API_TOKEN.
──────────────────────────────────────────────────────────────── */
const MEDIA_PREFIX = 'blog-media/';

/**
 * Upload a single media asset.
 * @param {string} filename — original filename (used to build the R2 key)
 * @param {Buffer|Uint8Array} body — raw file bytes
 * @param {string} contentType — e.g. 'image/jpeg'
 * @returns {{ key: string, url: string }}
 */
export async function uploadMediaAsset (filename, body, contentType) {
  if (!isR2Enabled()) throw new Error('R2 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_BUCKET, and CLOUDFLARE_API_TOKEN in .env');
  const safe = safeFileName(filename.replace(/\.[^.]+$/, '')) + '.' + (filename.split('.').pop() || 'bin');
  const key  = `${MEDIA_PREFIX}${Date.now()}-${safe}`;
  const r2Url = await uploadToR2(key, body, contentType);
  // If R2_PUBLIC_URL is set, swap the storage URL for the CDN URL
  const url = publicUrl ? `${publicUrl.replace(/\/$/, '')}/${key}` : r2Url;
  return { key, url };
}

/**
 * List all objects in the blog-media/ prefix via Cloudflare REST API.
 */
export async function listMediaAssets () {
  if (!isR2Enabled()) return [];
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?prefix=${encodeURIComponent(MEDIA_PREFIX)}&limit=500`;
  const res = await fetch(apiUrl, {
    headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2 list failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const objects = data?.result?.objects || [];
  return objects.map(o => ({
    key:      o.key,
    size:     o.size,
    uploaded: o.uploaded,
    url:      publicUrl
      ? `${publicUrl.replace(/\/$/, '')}/${o.key}`
      : `${getBaseUrl()}/${encodeKey(o.key)}`,
  }));
}

/**
 * Delete a media asset by its R2 key.
 */
export async function deleteMediaAsset (key) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  const url = getObjectUrl(key);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2 delete failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return { deleted: key };
}

// ═══════════════════════════════════════════════════════════════
// LEARNING LIBRARY — organised by publishing intent folder
// Prefixes: library/playbooks/  library/research/  library/case-studies/
// ═══════════════════════════════════════════════════════════════

const VALID_LIBRARY_FOLDERS = ['playbooks', 'research', 'case-studies'];

export function isValidLibraryFolder (folder) {
  return VALID_LIBRARY_FOLDERS.includes(folder);
}

/**
 * Upload a PDF example to a library folder.
 * @param {string} folder   - 'playbooks' | 'research' | 'case-studies'
 * @param {string} filename - original filename
 * @param {Buffer|Uint8Array} body
 * @returns {{ key: string, url: string, name: string }}
 */
export async function uploadLibraryFile (folder, filename, body) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  if (!isValidLibraryFolder(folder)) throw new Error(`Invalid library folder: ${folder}`);
  const safe = safeFileName(filename);
  const key  = `library/${folder}/${Date.now()}-${safe}`;
  const r2Url = await uploadToR2(key, body, 'application/pdf');
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '';
  const url = publicUrl ? `${publicUrl.replace(/\/$/, '')}/${key}` : r2Url;
  return { key, url, name: filename };
}

/**
 * List all PDFs in a library folder.
 * @param {string} folder - 'playbooks' | 'research' | 'case-studies'
 */
export async function listLibraryFiles (folder) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  if (!isValidLibraryFolder(folder)) throw new Error(`Invalid library folder: ${folder}`);
  const prefix  = `library/${folder}/`;
  const apiUrl  = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?prefix=${encodeURIComponent(prefix)}&limit=200`;
  const res     = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${apiToken}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2 list failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data      = await res.json();
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '';
  return (data.result?.objects || []).map(o => ({
    key:       o.key,
    name:      o.key.split('/').pop().replace(/^\d+-/, ''), // strip timestamp prefix
    size:      o.size,
    uploaded:  o.uploaded,
    url:       publicUrl
      ? `${publicUrl.replace(/\/$/, '')}/${o.key}`
      : `${getBaseUrl()}/${encodeKey(o.key)}`,
  }));
}

/**
 * Delete a library file by its full R2 key.
 */
export async function deleteLibraryFile (key) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  // Safety: only allow deletion inside library/ prefix
  if (!key.startsWith('library/')) throw new Error('Key must be inside library/ prefix.');
  const url = getObjectUrl(key);
  const res = await fetch(url, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2 delete failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return { deleted: key };
}
