/* Replace the knowledge base's copy of every curated source with the repo's.
 *
 * The repo is the authority. This deletes by source key and re-inserts, so
 * running it after an edit replaces rather than accumulates.
 *
 *   npm run knowledge:ingest
 *
 * NOTE ON THE IMPORT ORDER. The skill is loaded with a dynamic import on
 * purpose. Static `import` statements are hoisted and run before any top-level
 * code, so a plain import would load supabaseClient — which reads the
 * environment as it initialises — before the .env file below had been read,
 * and the client would come up unconfigured every time.
 */

// Same .env load as server.js: this runs from a shell, so nothing has read it yet.
try {
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('dotenv').config({ path: new URL('../.env', import.meta.url) });
} catch { /* --env-file, or a real environment. Either is fine. */ }

const { ingestCurated, curatedStatus } = await import('../backend/skills/curatedKnowledge.js');

const r = await ingestCurated({});
for (const s of r.sources) {
  const by = Object.entries(s.byStatus).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`  ${s.units} units into ${s.domain}  (${by})`);
  console.log(`  ${s.name}`);
}
const st = await curatedStatus({});
for (const s of st.sources) {
  console.log(`  in table: ${s.inTable}  in repo: ${s.inRepo}  ${s.stale ? 'STALE' : 'in step'}`);
}
