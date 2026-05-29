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
//
// Listing uses a manifest file (library/<folder>/_manifest.json)
// maintained on every upload/delete. This avoids the Cloudflare
// REST API (which needs a global token), relying only on the
// same S3-compatible Bearer token used for PUT/GET/DELETE.
// ═══════════════════════════════════════════════════════════════

const VALID_LIBRARY_FOLDERS = ['playbooks', 'research', 'case-studies'];

export function isValidLibraryFolder (folder) {
  return VALID_LIBRARY_FOLDERS.includes(folder);
}

// ── Manifest helpers ──────────────────────────────────────────

function manifestKey (folder) {
  return `library/${folder}/_manifest.json`;
}

async function readLibraryManifest (folder) {
  try {
    const url = getObjectUrl(manifestKey(folder));
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return [];
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function writeLibraryManifest (folder, items) {
  await uploadToR2(manifestKey(folder), JSON.stringify(items), 'application/json');
}

// ── Public API ────────────────────────────────────────────────

/**
 * Upload a PDF to a library folder and record it in the manifest.
 * @param {string} folder   - 'playbooks' | 'research' | 'case-studies'
 * @param {string} filename - original filename
 * @param {Buffer|Uint8Array} body
 * @returns {{ key: string, url: string, name: string, size: number, uploaded: string }}
 */
export async function uploadLibraryFile (folder, filename, body) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  if (!isValidLibraryFolder(folder)) throw new Error(`Invalid library folder: ${folder}`);

  const safe    = safeFileName(filename);
  const ts      = Date.now();
  const key     = `library/${folder}/${ts}-${safe}`;
  const r2Url   = await uploadToR2(key, body, 'application/pdf');
  const cdnBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  const url     = cdnBase ? `${cdnBase}/${key}` : r2Url;

  const entry = {
    key,
    name:     filename,
    size:     body.length ?? body.byteLength ?? 0,
    uploaded: new Date(ts).toISOString(),
    url,
  };

  // Update manifest (read-modify-write; on conflict the last writer wins — fine for this use case)
  const manifest = await readLibraryManifest(folder);
  manifest.unshift(entry);           // newest first
  await writeLibraryManifest(folder, manifest);

  return entry;
}

/**
 * List all PDFs in a library folder (reads manifest, no Cloudflare REST API needed).
 * @param {string} folder - 'playbooks' | 'research' | 'case-studies'
 */
export async function listLibraryFiles (folder) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  if (!isValidLibraryFolder(folder)) throw new Error(`Invalid library folder: ${folder}`);
  return readLibraryManifest(folder);
}

// ═══════════════════════════════════════════════════════════════
// GENERIC JSON CACHE — lightweight key/value store in R2
// Used for small, infrequently-changing payloads (e.g. Vektor users)
// ═══════════════════════════════════════════════════════════════

/**
 * Persist any JSON-serialisable value to R2.
 * @param {string} key  - R2 object key, e.g. 'cache/vektor-users.json'
 * @param {object} data - value to store (will be JSON-stringified)
 */
export async function putJsonCache (key, data) {
  if (!isR2Enabled()) return;
  await uploadToR2(key, JSON.stringify(data), 'application/json');
}

/**
 * Retrieve and parse a cached JSON object from R2.
 * Returns null if the object does not exist or R2 is not configured.
 * @param {string} key
 * @returns {object|null}
 */
export async function getJsonCache (key) {
  if (!isR2Enabled()) return null;
  const url = getObjectUrl(key);
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 get failed for ${key}: ${res.status}`);
  return await res.json();
}

/**
 * Delete a library file by its full R2 key and remove it from the manifest.
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

  // Remove from manifest
  const parts  = key.split('/');            // library/<folder>/filename
  const folder = parts[1];
  if (folder && isValidLibraryFolder(folder)) {
    const manifest = await readLibraryManifest(folder);
    const updated  = manifest.filter(f => f.key !== key);
    await writeLibraryManifest(folder, updated);
  }

  return { deleted: key };
}
