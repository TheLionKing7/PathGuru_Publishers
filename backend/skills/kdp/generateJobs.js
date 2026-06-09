/**
 * Async book generation jobs — avoids HTTP timeout on long manuscripts.
 */

import { putJsonCache, getJsonCache } from '../../cloudflareR2.js';

const jobs = new Map();
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

function jobKey(id) {
  return `cache/generate-jobs/${id}.json`;
}

export function createJobId() {
  return `gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createJob(input) {
  const id = createJobId();
  const job = {
    id,
    status:     'queued',
    progress:   0,
    message:    'Queued',
    input:      { ...input, _async: true },
    result:     null,
    error:      null,
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };
  jobs.set(id, job);
  putJsonCache(jobKey(id), job).catch(() => {});
  return job;
}

export async function getJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  try {
    const cached = await getJsonCache(jobKey(id));
    if (cached) {
      jobs.set(id, cached);
      return cached;
    }
  } catch {}
  return null;
}

export async function updateJob(id, patch) {
  const job = await getJob(id);
  if (!job) return null;
  const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  putJsonCache(jobKey(id), next).catch(() => {});
  return next;
}

export function shouldRunAsync(input) {
  if (input.async === true || input._async === true) return true;
  const length = String(input.length || 'standard').toLowerCase();
  return length === 'deep' || length === 'standard';
}

export function pruneOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (new Date(job.updatedAt).getTime() < cutoff) jobs.delete(id);
  }
}

const running = new Set();

/** Run buildProject in background and update job status. */
export async function runGenerateJob(id, buildProject) {
  if (running.has(id)) return;
  running.add(id);
  try {
    await updateJob(id, { status: 'running', progress: 5, message: 'Starting pipeline…' });
    const job = await getJob(id);
    if (!job) return;

    const input = { ...job.input, assetBaseUrl: job.input.assetBaseUrl || process.env.PATHGURU_PUBLIC_URL || '' };
    await updateJob(id, { progress: 15, message: 'Research & editorial…' });

    const result = await buildProject(input);
    const fmt = String(input.format || 'pdf').toLowerCase();
    if (fmt === 'epub' || fmt === 'both') {
      try {
        const { buildEpub } = await import('../../epubBuilder.js');
        const buf = await buildEpub(result.project, result.manuscript, result.design);
        result.epubBase64 = buf.toString('base64');
      } catch (e) {
        result.epubWarning = e.message;
      }
    }

    await updateJob(id, {
      status:   'complete',
      progress: 100,
      message:  'Draft complete',
      result,
      error:    null,
    });
  } catch (e) {
    await updateJob(id, {
      status:   'failed',
      progress: 0,
      message:  e.message || 'Generation failed',
      error:    e.message || 'Generation failed',
    });
  } finally {
    running.delete(id);
    pruneOldJobs();
  }
}
