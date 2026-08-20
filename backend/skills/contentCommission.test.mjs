/**
 * Run:  node backend/skills/contentCommission.test.mjs
 *
 * Verifies the content-commission helper:
 *   • the statuses stay in lock-step with the SQL check constraint (exactly 11)
 *   • a transition persists the new stage + stage fields
 *   • a transition is mirrored into the Slack thread (thread_ts)
 *   • invalid statuses are rejected
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { CONTENT_COMMISSION_STATUSES, createContentCommission, transitionContentCommission } from './contentCommission.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const REQUIRED = [
  'intake', 'assessing', 'angle_review', 'researching', 'research_review',
  'synthesising', 'drafting', 'draft_review', 'publishing', 'published', 'abandoned',
];

console.log('— statuses match the SQL check constraint —');
t('exactly 11 statuses', CONTENT_COMMISSION_STATUSES.length === 11);
t('same order as the constraint', JSON.stringify(CONTENT_COMMISSION_STATUSES) === JSON.stringify(REQUIRED));

const baseRow = { id: 'c1', status: 'intake', slack_channel: 'C-T', slack_thread_ts: 'ts.1', source_note: null };

function makeDb() {
  const state = { updated: [], inserted: [] };
  return {
    state,
    from() {
      return {
        update(patch) {
          return {
            eq(k, v) {
              return {
                select() {
                  return {
                    async single() {
                      state.updated.push({ ...patch, [k]: v });
                      return { data: { ...baseRow, ...patch }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(p) {
          return {
            select() {
              return {
                async single() {
                  state.inserted.push(p);
                  return { data: { ...baseRow, ...p }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const origFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let slackPayload = null;

process.env.SLACK_BOT_TOKEN = 'xoxb-test';
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('slack.com/api/chat.postMessage')) {
    slackPayload = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, ts: 'ts.2' }) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
};

try {
  console.log('— transition persists + mirrors —');
  {
    const db = makeDb();
    const res = await transitionContentCommission({
      id: 'c1', status: 'researching', note: 'Orion kicked off', fields: { research_task_id: 't-1' }, db,
    });
    t('transition ok', res.ok === true);
    t('status persisted', db.state.updated[0]?.status === 'researching');
    t('stage field persisted', db.state.updated[0]?.research_task_id === 't-1');
    t('mirrored to slack thread', slackPayload?.channel === 'C-T' && slackPayload?.thread_ts === 'ts.1');
    t('mirror names the stage', /researching/.test(slackPayload?.text || ''));
  }

  console.log('— invalid status rejected —');
  {
    const db = makeDb();
    const res = await transitionContentCommission({ id: 'c1', status: 'bogus', db });
    t('invalid status rejected', res.ok === false && /invalid status/.test(res.error || ''));
  }

  console.log('— create starts at intake + mirrors —');
  {
    const db = makeDb();
    slackPayload = null;
    const res = await createContentCommission({
      sourceUrl: 'https://example.com', sourceNote: 'Write about X', slackChannel: 'C-T', slackThreadTs: 'ts.1', db,
    });
    t('create ok at intake', res.ok === true && res.commission.status === 'intake');
    t('intake mirrored to thread', slackPayload?.thread_ts === 'ts.1');
  }
} finally {
  globalThis.fetch = origFetch;
  process.env = savedEnv;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
