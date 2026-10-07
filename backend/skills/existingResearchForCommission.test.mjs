/** Run: node backend/skills/existingResearchForCommission.test.mjs */
import { resolveExistingResearchForCommission } from './existingResearchForCommission.js';

let pass = 0;
let fail = 0;
const t = (name, condition) => {
  if (condition) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    console.log('  FAIL', name);
  }
};

const REPORT_ID = '64f5aaf2-1234-4234-9234-123456789abc';
const reports = [
  {
    id: REPORT_ID,
    title: '[Orion] Openmarket Africa thesis',
    description: 'Research task: openmarket Africa thesis',
    agent_id: 'researcher',
    type: 'research',
    status: 'completed',
    output: { instruction: 'Openmarket Africa thesis', brief: 'A'.repeat(80), sources: [{ url: 'https://example.com' }] },
  },
  {
    id: '527944e1-1234-4234-9234-123456789abc',
    title: '[Orion] Unrelated AI pricing report',
    description: 'Research task: AI pricing report',
    agent_id: 'researcher',
    type: 'research',
    status: 'completed',
    output: { instruction: 'AI pricing report', brief: 'B'.repeat(80), sources: [] },
  },
];

function makeDb(rows = reports) {
  const filters = [];
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    order() { return this; },
    limit() {
      const selected = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      return Promise.resolve({ data: selected, error: null });
    },
  };
  return { from(table) { return table === 'tasks' ? query : null; } };
}

console.log('— existing Orion source selection —');
{
  const result = await resolveExistingResearchForCommission({
    message: 'Let Aether draft a blog post based on the completed Openmarket Africa thesis.',
    db: makeDb(),
  });
  t('selects the exact matching completed report, not the unrelated latest report', result.ok && result.task.id === REPORT_ID);
}
{
  const result = await resolveExistingResearchForCommission({
    message: 'Let Aether draft from Orion report 64f5aaf2-1234-4234-9234-123456789abc.',
    db: makeDb(),
  });
  t('resolves exact report UUID', result.ok && result.task.id === REPORT_ID);
}
{
  const result = await resolveExistingResearchForCommission({
    message: 'Aether, draft this blog post using the research.',
    history: [
      { role: 'assistant', content: '**Latest Orion deliverable**: *Unrelated AI pricing report*' },
      { role: 'user', content: 'I need the completed Openmarket Africa thesis research.' },
    ],
    db: makeDb(),
  });
  t('uses the explicit user-referenced report rather than the unrelated prior “latest deliverable” assistant result', result.ok && result.task.id === REPORT_ID);
}
{
  const duplicate = [...reports, { ...reports[0], id: '7a4b9c13-1234-4234-9234-123456789abc' }];
  const result = await resolveExistingResearchForCommission({
    message: 'Aether draft from the completed Openmarket Africa thesis report.',
    db: makeDb(duplicate),
  });
  t('requests clarification when the topic matches multiple completed reports', !result.ok && result.reason === 'ambiguous' && result.candidates.length === 2);
}
{
  const result = await resolveExistingResearchForCommission({
    message: 'Aether draft from Orion report 64f5aaf2-1234-4234-9234-123456789abc.',
    db: makeDb(reports.map((row) => row.id === REPORT_ID ? { ...row, status: 'in_progress' } : row)),
  });
  t('requires the referenced task to be completed', !result.ok && result.reason === 'not_found');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);