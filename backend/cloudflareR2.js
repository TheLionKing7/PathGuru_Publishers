function envValue(name) {
  return typeof process.env[name] === "string" ? process.env[name].trim() : "";
}

const accountId = envValue("CLOUDFLARE_ACCOUNT_ID");
const bucket = envValue("CLOUDFLARE_R2_BUCKET");
const apiToken = envValue("CLOUDFLARE_API_TOKEN");

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
    draftHtmlUrl: htmlUrl
    , pdfUrl
  };
}
