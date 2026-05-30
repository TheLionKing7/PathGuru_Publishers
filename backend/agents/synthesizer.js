/**
 * DigiFusion Intelligence Network — Synthesizer
 * ===============================================
 * The knowledge engine and orchestrator of the agent network.
 *
 * Responsibilities:
 *   1. PDF Ingestion    — reads PDFs from R2, extracts structured knowledge
 *   2. Knowledge Graph  — stores, indexes, and maintains the knowledge_base table
 *   3. Context Routing  — answers knowledge queries from other agents
 *   4. Synthesis        — combines knowledge from multiple sources into briefs
 *   5. Orchestration    — coordinates multi-agent workflows when instructed
 *
 * The Synthesizer has no ego — it does not produce final deliverables.
 * It exists to make every other agent smarter.
 */

import { AgentBase }    from './agentBase.js';
import { getSupabase }  from '../supabaseClient.js';
import { callAiProvider, resolveProvider } from '../aiPipeline.js';
import { isR2Enabled, getJsonCache }       from '../cloudflareR2.js';

// ── PDF text extraction (pdfjs-dist, server-safe) ────────────────────────────
async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null)
      || await import('pdfjs-dist').catch(() => null);

    if (!pdfjsLib) {
      // Fallback: try pdf-parse
      const pdfParse = (await import('pdf-parse')).default;
      const result   = await pdfParse(buffer);
      return result.text || '';
    }

    const pdf   = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n\n');
  } catch (e) {
    console.error('[Synthesizer] PDF text extraction failed:', e.message);
    return '';
  }
}

// ── Download a file from R2 ───────────────────────────────────────────────────
async function fetchFromR2(key) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
  const bucket    = process.env.CLOUDFLARE_R2_BUCKET  || process.env.R2_BUCKET_NAME || '';
  const apiToken  = process.env.CLOUDFLARE_API_TOKEN  || '';

  if (!accountId || !bucket || !apiToken) throw new Error('R2 credentials not configured');

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const url        = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedKey}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
  if (!res.ok) throw new Error(`R2 fetch failed for ${key}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── List all PDFs in R2 under a prefix ───────────────────────────────────────
async function listR2PDFs(prefix = 'knowledge/') {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
  const bucket    = process.env.CLOUDFLARE_R2_BUCKET  || process.env.R2_BUCKET_NAME || '';
  const apiToken  = process.env.CLOUDFLARE_API_TOKEN  || '';

  if (!accountId || !bucket || !apiToken) return [];

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?prefix=${encodeURIComponent(prefix)}&limit=500`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
  if (!res.ok) return [];

  const data = await res.json();
  return (data?.result?.objects || [])
    .filter(o => o.key.toLowerCase().endsWith('.pdf'))
    .map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }));
}


const SYNTHESIZER_SYSTEM = `You are Synthesizer — the intelligence engine of the DigiFusion agent network.

Your sole purpose is to extract, structure, and serve knowledge so that every other agent in the network operates from a foundation of real insight rather than generic training data.

You are methodical, precise, and thorough. You do not guess. When you extract knowledge from a document, you identify:
— The core frameworks and methodologies (with their full logical architecture)
— Specific data points, statistics, and market figures (with sources and years)
— Real-world case studies and examples
— Diagnostic frameworks and assessment criteria
— Actionable models that can be applied to client engagements

You write knowledge summaries in clear, professional language suited for a global consulting firm. Every piece of knowledge you extract carries proper attribution.

You serve the following agents: Atlas (research + BD), Nova (automation), Aether (content strategy), Pulse (analytics), Nexus (coordination), Assistant (customer VA).

When asked to synthesize across multiple sources, you identify convergent themes, contradictions, and gaps — you do not flatten everything into agreement.`;


export class Synthesizer extends AgentBase {
  constructor() {
    super({
      id:           'synthesizer',
      displayName:  'Synthesizer',
      role:         'Knowledge Engine & Orchestrator',
      systemPrompt: SYNTHESIZER_SYSTEM,
      domains:      ['business_development', 'automation', 'digital_media', 'general'],
      model:        process.env.SYNTHESIZER_MODEL || 'claude-sonnet-4-5',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PDF INGESTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Process a single PDF from R2.
   * Extracts text → runs structured knowledge extraction → stores in knowledge_base.
   * @param {string} r2Key  — R2 object key (e.g. 'knowledge/playbooks/my-guide.pdf')
   * @param {string} domain — 'business_development' | 'automation' | 'digital_media' | 'general'
   */
  async ingestPDF(r2Key, domain = 'general') {
    const db = getSupabase();
    console.log(`[Synthesizer] Ingesting PDF: ${r2Key}`);

    // Check if already processed
    if (db) {
      const { data: existing } = await db.from('knowledge_base')
        .select('id').eq('source_key', r2Key).limit(1);
      if (existing?.length > 0) {
        console.log(`[Synthesizer] Already processed: ${r2Key}`);
        return { skipped: true, reason: 'already_processed', key: r2Key };
      }
    }

    // Download and extract text
    const buffer = await fetchFromR2(r2Key);
    const rawText = await extractPdfText(buffer);

    if (!rawText || rawText.trim().length < 100) {
      return { error: 'Could not extract meaningful text from PDF', key: r2Key };
    }

    // Chunk text to stay within token limits (process in 6000-char blocks)
    const chunks = [];
    for (let i = 0; i < rawText.length; i += 6000) {
      chunks.push(rawText.slice(i, i + 6000));
    }

    const sourceName = r2Key.split('/').pop().replace(/\.pdf$/i, '');
    const allEntries = [];

    for (const [idx, chunk] of chunks.entries()) {
      const extractionPrompt = `Analyze this section from the document "${sourceName}" and extract structured knowledge.

DOCUMENT SECTION (${idx + 1} of ${chunks.length}):
"""
${chunk}
"""

Return a JSON array of knowledge units extracted from this section. Each unit:
{
  "title": "concise title of this knowledge unit",
  "content": "full extracted knowledge, 200-500 words, written for a consulting firm audience",
  "frameworks": ["framework names mentioned, e.g. McKinsey 7S"],
  "concepts": ["key concepts and topics covered"],
  "entities": ["companies, people, products, tools mentioned"],
  "statistics": [{"stat": "description", "value": "number/percentage", "source": "attribution", "year": "year if known"}],
  "relevance_score": 1-5
}

Only extract substantive knowledge — skip boilerplate, tables of contents, and generic platitudes.
Return ONLY a valid JSON array. If no substantive knowledge, return [].`;

      try {
        const raw     = await callAiProvider(this.provider, extractionPrompt, this.systemPrompt);
        const parsed  = this._parseJsonArray(raw);
        allEntries.push(...parsed.map(e => ({ ...e, chunkIndex: idx })));
      } catch (e) {
        console.warn(`[Synthesizer] Extraction failed for chunk ${idx}:`, e.message);
      }
    }

    if (allEntries.length === 0) {
      return { error: 'No knowledge units extracted', key: r2Key };
    }

    // Store all extracted knowledge units in Supabase
    if (db) {
      const rows = allEntries.map(e => ({
        title:           e.title || sourceName,
        domain,
        source_type:     'pdf',
        source_key:      r2Key,
        source_name:     sourceName,
        content:         e.content || '',
        frameworks:      e.frameworks || [],
        concepts:        e.concepts  || [],
        entities:        e.entities  || [],
        statistics:      e.statistics || [],
        tags:            [domain, ...( e.concepts || []).slice(0, 5)],
        relevance_score: e.relevance_score || 3,
      }));

      const { error } = await db.from('knowledge_base').insert(rows);
      if (error) console.error('[Synthesizer] knowledge_base insert error:', error.message);
    }

    // Write episodic memory
    await this.rememberEpisodic({
      summary:    `Ingested PDF "${sourceName}" — extracted ${allEntries.length} knowledge units across ${chunks.length} sections`,
      content:    { r2Key, domain, unitsExtracted: allEntries.length, chunks: chunks.length },
      type:       'task_result',
      tags:       ['ingestion', domain, 'pdf'],
      importance: 4,
    });

    console.log(`[Synthesizer] ✓ Ingested ${r2Key} → ${allEntries.length} knowledge units`);
    return { success: true, key: r2Key, unitsExtracted: allEntries.length };
  }

  /**
   * Scan R2 for unprocessed PDFs and ingest them all.
   * @param {string|string[]} prefix — R2 prefix(es) to scan. Pass an array to scan multiple.
   *                                   Defaults to both 'knowledge/' and 'library/' to cover
   *                                   the full R2 structure automatically.
   * @param {string} domain          — fallback domain if prefix doesn't match domainMap
   */
  async ingestAll(prefix = ['knowledge/', 'library/'], domain = 'general') {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    const allPdfs  = [];
    for (const p of prefixes) {
      const found = await listR2PDFs(p);
      allPdfs.push(...found);
    }
    // Deduplicate by key (in case prefix overlap)
    const pdfs    = [...new Map(allPdfs.map(p => [p.key, p])).values()];
    const results = [];

    // Map R2 prefix → domain
    // Covers both the legacy paths and the user's actual R2 structure:
    //   knowledge/automation/   knowledge/business/   knowledge/media/
    //   library/frameworks/     library/playbooks/    library/research/   library/case-studies/
    const domainMap = {
      'knowledge/business':   'business_development',
      'knowledge/automation': 'automation',
      'knowledge/media':      'digital_media',
      'library/frameworks':   'business_development',   // source frameworks (McKinsey, BCG, etc.)
      'library/playbooks':    'business_development',
      'library/research':     'business_development',
      'library/case-studies': 'digital_media',
    };

    for (const pdf of pdfs) {
      const detectedDomain = Object.entries(domainMap).find(([prefix]) => pdf.key.startsWith(prefix))?.[1] || domain;
      const result = await this.ingestPDF(pdf.key, detectedDomain);
      results.push(result);
    }

    return { total: pdfs.length, results };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE QUERY (for other agents)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Answer a knowledge query for another agent.
   * Searches the knowledge_base, selects relevant entries, and synthesizes a brief.
   * @param {string} query        — what the requesting agent needs to know
   * @param {string} forAgent     — agent ID making the request
   * @param {string[]} [domains]  — domain filter
   * @param {number} [limit]      — max entries to retrieve
   * @returns {string}            — synthesized knowledge brief
   */
  async answer(query, forAgent, domains = [], limit = 8) {
    const db = getSupabase();
    if (!db) return '';

    let q = db.from('knowledge_base')
      .select('title, domain, content, frameworks, concepts, statistics, source_name')
      .order('relevance_score', { ascending: false })
      .limit(limit * 2); // fetch more, then filter

    if (domains.length > 0) q = q.in('domain', [...domains, 'general']);

    const { data, error } = await q;
    if (error || !data?.length) return 'No relevant knowledge found in the intelligence base.';

    const synthesisPrompt = `You are serving a knowledge request from ${forAgent}.

QUERY: "${query}"

AVAILABLE KNOWLEDGE ENTRIES:
${data.map((e, i) => `[${i}] "${e.title}" (${e.domain}, source: ${e.source_name || 'unknown'})\n${e.content.slice(0, 400)}`).join('\n\n---\n\n')}

Synthesize a focused, expert-level knowledge brief that directly answers the query.
— Draw only from the entries above, citing source names
— Be specific: include frameworks, data points, and models where present
— Write for a senior consultant who will use this to deliver client work
— 300–600 words
— No generic filler, no invented facts`;

    return callAiProvider(this.provider, synthesisPrompt, this.systemPrompt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SYNTHESIS (multi-source briefs)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Synthesize a custom deliverable from the knowledge base.
   * Used by agents to generate frameworks, playbooks, and research briefs.
   * @param {object} options
   * @param {string} options.instruction   — what to produce
   * @param {string[]} options.domains     — relevant domains
   * @param {string} options.outputFormat  — 'brief' | 'framework' | 'playbook' | 'scorecard'
   */
  async synthesize({ instruction, domains = [], outputFormat = 'brief' }) {
    const knowledgeContext = await this.queryKnowledge(instruction, 8);

    const prompt = `${knowledgeContext}\n\n---\n\n## Synthesis instruction\n${instruction}

Output format: ${outputFormat}
Audience: senior consulting professionals and their clients
Quality bar: equivalent to KPMG / BCG published work
Draw only from the knowledge provided above. Be specific, cite sources, use real data.`;

    return callAiProvider(this.provider, prompt, this.systemPrompt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE (task dispatch)
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, r2Key, domain, prefix, query, forAgent, instruction, domains, outputFormat } = task;

    switch (action) {
      case 'ingest_pdf':
        return this.ingestPDF(r2Key, domain || 'general');

      case 'ingest_all':
        // Default: scan both knowledge/ and library/ to cover the full R2 structure
        return this.ingestAll(prefix || ['knowledge/', 'library/'], domain || 'general');

      case 'answer':
        return { answer: await this.answer(query, forAgent || 'unknown', domains || []) };

      case 'synthesize':
        return { result: await this.synthesize({ instruction, domains, outputFormat }) };

      default:
        // Generic: run the LLM with knowledge context
        const result = await this.runLLM(task.description || task.title || 'No instruction provided', {
          knowledgeQuery: task.title,
        });
        return { result };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  _parseJsonArray(text) {
    try { return JSON.parse(text); } catch {}
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try { return JSON.parse(match[0]); } catch { return []; }
  }
}

export const synthesizer = new Synthesizer();
