import { createHmac, createHash } from "crypto";

function envValue(name) {
  return typeof process.env[name] === "string" ? process.env[name].trim() : "";
}

// Support both naming conventions
const accountId     = envValue("CLOUDFLARE_ACCOUNT_ID") || envValue("R2_ACCOUNT_ID");
const bucket        = envValue("CLOUDFLARE_R2_BUCKET")  || envValue("R2_BUCKET_NAME");
const apiToken      = envValue("CLOUDFLARE_API_TOKEN");
const accessKeyId   = envValue("R2_ACCESS_KEY_ID");
const secretKey     = envValue("R2_SECRET_ACCESS_KEY");
const publicUrl     = envValue("R2_PUBLIC_URL");    // e.g. https://cdn.digitafusion.com

export const r2Config = {
  accountId,
  bucket,
  apiToken
};

// ── AWS Signature V4 helpers ──────────────────────────────────────────────────

function toAmzDate(d = new Date()) {
  // YYYYMMDDTHHMMSSZ — ISO string already ends with Z after stripping punctuation
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function hmac(key, data, encoding) {
  return createHmac("sha256", key).update(data, "utf8").digest(encoding || "buffer");
}

function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function getSigningKey(dateStamp, region, service) {
  const kDate    = hmac("AWS4" + secretKey, dateStamp);
  const kRegion  = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/**
 * Build AWS4-HMAC-SHA256 signed headers for an R2 PUT.
 * Falls back to Bearer token if S3 credentials are absent.
 */
async function buildR2Headers(url, body, contentType) {
  // Fall back to Bearer if no S3 keys configured
  if (!accessKeyId || !secretKey) {
    return {
      "Authorization":        `Bearer ${apiToken}`,
      "Content-Type":         contentType,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "x-amz-date":           toAmzDate(),
    };
  }

  const region  = "auto";
  const service = "s3";
  const now     = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const parsed     = new URL(url);
  const host       = parsed.host;
  const path       = parsed.pathname;

  // Compute payload hash
  const bodyBuffer = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  const payloadHash = sha256hex(bodyBuffer);

  // Canonical headers (must be sorted)
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    path,
    "",                 // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(dateStamp, region, service);
  const signature  = hmac(signingKey, stringToSign, "hex");

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Authorization":        authHeader,
    "Content-Type":         contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date":           amzDate,
  };
}

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
  const url     = getObjectUrl(key);
  const headers = await buildR2Headers(url, body, contentType);
  const response = await fetch(url, { method: "PUT", headers, body });

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
  await uploadToR2(key, body, contentType);
  const pub = publicUrl ? `${publicUrl.replace(/\/$/, '')}/${key}` : null;
  return { key, url: pub, servePath: mediaServePath(key) };
}

/** Public path on this server to stream a blog-media object (writer preview + CMS fallback). */
export function mediaServePath (key) {
  return `/api/media/${encodeURIComponent(key)}`;
}

/**
 * Fetch raw bytes for a blog-media object.
 */
export async function fetchMediaObject (key) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  if (!key || !key.startsWith(MEDIA_PREFIX)) throw new Error('Invalid media key');
  if (publicUrl) {
    const r = await fetch(`${publicUrl.replace(/\/$/, '')}/${encodeKey(key)}`);
    if (r.ok) {
      const contentType = r.headers.get('content-type') || guessImageMime(key);
      return { body: Buffer.from(await r.arrayBuffer()), contentType };
    }
  }
  const r = await fetch(getObjectUrl(key), {
    headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
  });
  if (!r.ok) throw new Error(`R2 fetch failed: ${r.status}`);
  const contentType = r.headers.get('content-type') || guessImageMime(key);
  return { body: Buffer.from(await r.arrayBuffer()), contentType };
}

function guessImageMime (key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
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

const VALID_LIBRARY_FOLDERS = [
  'playbooks', 'research', 'case-studies', 'frameworks',
  'ebook/non-fiction', 'ebook/fiction', 'ebook/back-cover',
];

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

// ═══════════════════════════════════════════════════════════════
// AGENCY IP STORE — generated playbooks, frameworks, templates
//
// Matches the user's actual R2 output structure:
//   Digifusion/Playbooks/Business/    → business_development
//   Digifusion/Playbooks/Automation/  → automation
//   Digifusion/Playbooks/Media/       → digital_media
//
// Each document is stored as a JSON object at:
//   Digifusion/Playbooks/<DomainFolder>/<slug>.json
//
// A single top-level manifest tracks all generated IP:
//   Digifusion/Playbooks/_manifest.json
// ═══════════════════════════════════════════════════════════════

const AGENCY_IP_BASE     = 'Digifusion/Playbooks';
const AGENCY_IP_MANIFEST = `${AGENCY_IP_BASE}/_manifest.json`;

// Map domain → R2 subfolder (matches user's Cloudflare folder names)
const DOMAIN_FOLDER_MAP = {
  business_development: 'Business',
  automation:           'Automation',
  digital_media:        'Media',
  general:              'Business',   // fallback
};

function agencyIPKey (slug, domain) {
  const folder = DOMAIN_FOLDER_MAP[domain] || 'Business';
  return `${AGENCY_IP_BASE}/${folder}/${slug}.json`;
}

async function readAgencyManifest () {
  try {
    const url = getObjectUrl(AGENCY_IP_MANIFEST);
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

async function writeAgencyManifest (items) {
  await uploadToR2(AGENCY_IP_MANIFEST, JSON.stringify(items), 'application/json');
}

/**
 * Save a generated agency playbook/framework to R2.
 * @param {object} p
 * @param {string} p.slug        - URL-safe id, e.g. 'digi-automation-playbook-v1'
 * @param {string} p.title       - Display title
 * @param {string} p.domain      - 'automation' | 'business_development' | 'digital_media'
 * @param {string} p.type        - 'playbook' | 'framework' | 'template' | 'methodology'
 * @param {string} p.content     - Full markdown content
 * @param {string[]} p.sources   - Source framework names used
 * @param {string} [p.tagline]   - One-line description
 * @param {string} [p.access]    - 'public' | 'premium'  (default 'premium')
 */
export async function saveAgencyPlaybook (p) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  const { slug, title, domain, type = 'playbook', content,
          sources = [], tagline = '', access = 'premium' } = p;
  if (!slug || !title || !content) throw new Error('slug, title, and content are required.');

  // Store in the domain-specific subfolder: Digifusion/Playbooks/Business|Automation|Media/
  const key = agencyIPKey(slug, domain);
  const now = new Date().toISOString();
  await uploadToR2(key, JSON.stringify({ slug, title, domain, type, content, sources, tagline, access, createdAt: now }), 'application/json');

  const entry = { slug, title, domain, type, sources, tagline, access, key, createdAt: now };
  const manifest = await readAgencyManifest();
  const filtered = manifest.filter(e => e.slug !== slug);
  filtered.unshift(entry);
  await writeAgencyManifest(filtered);
  return entry;
}

/**
 * Retrieve a single agency playbook (full content) by slug.
 * Looks up key from manifest so it works regardless of which domain subfolder it's in.
 */
export async function getAgencyPlaybook (slug) {
  if (!isR2Enabled()) return null;
  // Find the key from the manifest first (it encodes the correct domain subfolder)
  const manifest = await readAgencyManifest();
  const entry    = manifest.find(e => e.slug === slug);
  if (!entry) return null;
  const url = getObjectUrl(entry.key);
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 fetch failed for agency playbook "${slug}": ${res.status}`);
  return res.json();
}

/**
 * List agency playbook metadata (no content body).
 * @param {{ access?: string, type?: string }} [filter]
 */
export async function listAgencyPlaybooks (filter = {}) {
  if (!isR2Enabled()) return [];
  const manifest = await readAgencyManifest();
  return manifest.filter(e => {
    if (filter.access && e.access !== filter.access) return false;
    if (filter.type   && e.type   !== filter.type)   return false;
    return true;
  });
}

/**
 * Delete an agency playbook by slug.
 */
export async function deleteAgencyPlaybook (slug) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  // Resolve the actual key from the manifest (handles domain subfolder correctly)
  const manifest = await readAgencyManifest();
  const entry    = manifest.find(e => e.slug === slug);
  if (!entry) return { deleted: slug, note: 'not in manifest' };
  const res = await fetch(getObjectUrl(entry.key), {
    method: 'DELETE', headers: { 'Authorization': `Bearer ${apiToken}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed for "${slug}": ${res.status}`);
  await writeAgencyManifest(manifest.filter(e => e.slug !== slug));
  return { deleted: slug };
}

// ═══════════════════════════════════════════════════════════════
// FIRM IP STORE — proprietary blueprints, frameworks, methodologies
//
// Completely separate from the public Learning Library.
// Only Synthesizer and authorised internal agents can read here.
// Clients who purchase access get a time-limited signed URL.
//
// Structure:
//   firm_ip/blueprints/<slug>.pdf     — purchased / gated PDFs
//   firm_ip/frameworks/<slug>.pdf     — internal methodology docs
//   firm_ip/_manifest.json            — metadata index
//
// Access levels:
//   'internal'  — Synthesizer / agents only, never exposed to clients
//   'purchasable' — requires purchase record before signed URL issued
// ═══════════════════════════════════════════════════════════════

const FIRM_IP_BASE     = 'firm_ip';
const FIRM_IP_MANIFEST = `${FIRM_IP_BASE}/_manifest.json`;

async function readFirmIpManifest () {
  try {
    const url = getObjectUrl(FIRM_IP_MANIFEST);
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

async function writeFirmIpManifest (items) {
  await uploadToR2(FIRM_IP_MANIFEST, JSON.stringify(items), 'application/json');
}

/**
 * Upload a firm IP document (PDF or JSON content) to the protected firm_ip/ bucket area.
 *
 * @param {object} p
 * @param {string} p.slug        - URL-safe identifier, e.g. 'sme-scale-engine-blueprint'
 * @param {string} p.title       - Display title
 * @param {string} p.category    - 'blueprints' | 'frameworks' | 'methodologies'
 * @param {string} p.industry    - Sector tag, e.g. 'sme', 'pharma', 'government'
 * @param {Buffer|Uint8Array} p.body  - Raw PDF bytes
 * @param {'internal'|'purchasable'} [p.access] - Default 'purchasable'
 * @param {string} [p.description] - Short marketing description
 * @param {number} [p.priceUsd]  - Price for purchasable docs in USD
 */
export async function uploadFirmIpDocument (p) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  const {
    slug, title, category = 'blueprints', industry = 'general',
    body, access = 'purchasable', description = '', priceUsd = 0,
  } = p;
  if (!slug || !title || !body) throw new Error('slug, title, and body are required.');

  const key    = `${FIRM_IP_BASE}/${category}/${slug}.pdf`;
  const r2Url  = await uploadToR2(key, body, 'application/pdf');
  const now    = new Date().toISOString();

  const entry = {
    slug, title, category, industry, access, description, priceUsd,
    key, size: body.length ?? body.byteLength ?? 0, uploadedAt: now,
  };

  const manifest = await readFirmIpManifest();
  const filtered = manifest.filter(e => e.slug !== slug);
  filtered.unshift(entry);
  await writeFirmIpManifest(filtered);

  return entry;
}

/**
 * Retrieve raw bytes of a firm IP document by slug (internal/agent use only).
 */
export async function getFirmIpDocumentBytes (slug) {
  if (!isR2Enabled()) return null;
  const manifest = await readFirmIpManifest();
  const entry    = manifest.find(e => e.slug === slug);
  if (!entry) return null;
  const url = getObjectUrl(entry.key);
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firm IP fetch failed for "${slug}": ${res.status}`);
  const buf = await res.arrayBuffer();
  return { entry, bytes: Buffer.from(buf) };
}

/**
 * List firm IP documents, optionally filtered.
 * @param {{ category?: string, industry?: string, access?: string }} [filter]
 */
export async function listFirmIpDocuments (filter = {}) {
  if (!isR2Enabled()) return [];
  const manifest = await readFirmIpManifest();
  return manifest.filter(e => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.industry && e.industry !== filter.industry) return false;
    if (filter.access   && e.access   !== filter.access)   return false;
    return true;
  });
}

/**
 * Generate a time-limited pre-signed download URL for a purchasable document.
 * NOTE: Cloudflare R2 pre-signed URLs require S3 credentials (not Bearer token).
 * If S3 keys are not configured, falls back to a server-proxied download token approach.
 * @param {string} slug
 * @param {number} [ttlSeconds=3600] - Link validity in seconds
 */
export async function getFirmIpDownloadUrl (slug, ttlSeconds = 3600) {
  if (!isR2Enabled()) throw new Error('R2 is not configured.');
  const manifest = await readFirmIpManifest();
  const entry    = manifest.find(e => e.slug === slug);
  if (!entry) throw new Error(`Firm IP document not found: ${slug}`);

  // If full S3-compatible keys available, build a pre-signed URL
  if (accessKeyId && secretKey) {
    const region    = 'auto';
    const service   = 's3';
    const now       = new Date();
    const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 16) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const host      = `${accountId}.r2.cloudflarestorage.com`;
    const path      = `/${bucket}/${encodeKey(entry.key)}`;
    const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const expires   = String(ttlSeconds);

    const queryParams = [
      ['X-Amz-Algorithm',  'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', `${accessKeyId}/${credScope}`],
      ['X-Amz-Date',       amzDate],
      ['X-Amz-Expires',    expires],
      ['X-Amz-SignedHeaders', 'host'],
    ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

    const canonicalRequest = [
      'GET', path, queryParams,
      `host:${host}\n`, 'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credScope,
      sha256hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(dateStamp, region, service);
    const signature  = hmac(signingKey, stringToSign, 'hex');

    return `https://${host}${path}?${queryParams}&X-Amz-Signature=${signature}`;
  }

  // Fallback: server will proxy the download via a short-lived token stored in memory
  // The calling route (/api/blueprints/:slug/download) handles the token check
  return null; // signals to caller to proxy the download server-side
}

/** Get manifest entry metadata only (no bytes). */
export async function getFirmIpMeta (slug) {
  const manifest = await readFirmIpManifest();
  return manifest.find(e => e.slug === slug) ?? null;
}

/** Upload Orion research deliverables (JSON / markdown). */
export async function uploadResearchAsset(key, body, contentType) {
  const credentialed = Boolean(apiToken || (accessKeyId && secretKey));
  if (!accountId || !bucket || !credentialed) {
    throw new Error('R2 is not configured for research deliverables');
  }
  return uploadToR2(key, body, contentType);
}

/** Fetch a research deliverable JSON blob from R2 (public URL or direct). */
export async function fetchResearchAsset(key) {
  if (!accountId || !bucket) return null;
  if (publicUrl) {
    const r = await fetch(`${publicUrl.replace(/\/$/, '')}/${encodeKey(key)}`);
    if (r.ok) return r.json().catch(() => null);
  }
  try {
    const r = await fetch(getObjectUrl(key), {
      headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
    });
    if (r.ok) return r.json().catch(() => null);
  } catch { /* ignore */ }
  return null;
}

/** Fetch raw bytes from R2 (DOCX/PDF/binary deliverables). */
export async function fetchResearchAssetBuffer(key) {
  if (!accountId || !bucket) return null;
  if (publicUrl) {
    const r = await fetch(`${publicUrl.replace(/\/$/, '')}/${encodeKey(key)}`);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  }
  try {
    const r = await fetch(getObjectUrl(key), {
      headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  } catch { /* ignore */ }
  return null;
}
