/**
 * Run: node backend/skills/slackConversation.test.mjs
 * Focused tests for the active-thread continuation gate; no Slack/Supabase services.
 */
import { isNexusConversationThread } from './slackConversation.js';

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

function fakeDb(data, error = null) {
  const query = {
    from(table) {
      t('checks Slack conversation history table', table === 'slack_conversation');
      return this;
    },
    select(columns) {
      t('queries only the history row id', columns === 'id');
      return this;
    },
    eq(column, value) {
      if (column === 'channel') t('filters by channel', value === 'C123');
      if (column === 'thread_ts') t('filters by thread timestamp', value === '123.456');
      return this;
    },
    async limit(count) {
      t('limits the history lookup to one row', count === 1);
      return { data, error };
    },
  };
  return query;
}

t('does not allow a missing database', !(await isNexusConversationThread({ db: null, channel: 'C123', threadTs: '123.456' })));
t('does not allow a missing thread identifier', !(await isNexusConversationThread({ db: fakeDb([{ id: 1 }]), channel: 'C123', threadTs: '' })));
t('allows follow-ups in a thread with Nexus conversation history', await isNexusConversationThread({ db: fakeDb([{ id: 1 }]), channel: 'C123', threadTs: '123.456' }));
t('ignores a thread without Nexus conversation history', !(await isNexusConversationThread({ db: fakeDb([]), channel: 'C123', threadTs: '123.456' })));
t('fails closed when the history query errors', !(await isNexusConversationThread({ db: fakeDb(null, { message: 'query failed' }), channel: 'C123', threadTs: '123.456' })));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);