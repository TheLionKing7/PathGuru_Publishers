/** Run: node backend/skills/agentNetworkStatus.test.mjs */
import { buildAgentNetworkStatusReply, isAgentNetworkStatusQuery } from './agentNetworkStatus.js';

let pass = 0;
let fail = 0;
const test = (name, condition) => {
  if (condition) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    console.log('  FAIL', name);
  }
};

console.log('— network-status intent —');
test('routes broad agent operations question', isAgentNetworkStatusQuery('How are all agents doing? What is the team status?'));
test('routes finished work question', isAgentNetworkStatusQuery('Who has completed their job?'));
test('does not route task assignment', !isAgentNetworkStatusQuery('Ask Aether to write a blog post.'));
test('does not route ordinary conversation', !isAgentNetworkStatusQuery('Good morning, Nexus.'));

console.log('— grounded network report —');
const now = Date.parse('2026-09-26T12:00:00.000Z');
const report = buildAgentNetworkStatusReply({
  snapshotAt: '2026-09-26T12:00:00.000Z',
  agents: {
    aether: { name: 'Aether', status: 'busy', lastActivity: '2026-09-26T11:00:00.000Z' },
    atlas: { name: 'Atlas', status: 'idle', lastActivity: null },
    nova: { name: 'Nova', status: 'offline', lastActivity: null },
  },
  activeTasks: [
    { title: 'Draft blog', agent_id: 'aether', status: 'in_progress', created_at: '2026-09-23T12:00:00.000Z' },
    { title: 'Pending plan', agent_id: 'atlas', status: 'pending', created_at: '2026-09-25T12:00:00.000Z' },
    { title: 'Awaiting Boss approval', agent_id: 'aether', status: 'pending', type: 'pending_approval', created_at: '2026-09-20T12:00:00.000Z' },
  ],
  recentCompletedTasks: [{ title: 'Market scan', agent_id: 'orion' }],
  recentFailedTasks: [{ title: 'Broken export', agent_id: 'nova', error: 'provider timeout' }],
}, { now });
test('reports active tasks and owners', /Draft blog \[in_progress, 3d\]/.test(report) && /Aether/.test(report));
test('flags open work aged 48 hours or more', /Stuck \(open ≥48h\): Draft blog/.test(report));
test('does not call approval waits stuck', !/Stuck \(open ≥48h\).*Awaiting Boss approval/.test(report));
test('reports recently completed work', /Recently completed: Market scan → orion/.test(report));
test('reports failed work and error details', /Broken export → nova \(provider timeout\)/.test(report));
test('does not call an idle agent offline', /Atlas: availability unverified/.test(report));
test('reports explicitly recorded offline status', /Nova: offline/.test(report));
test('does not claim activity availability from stale status', /not a live heartbeat/.test(report));
test('does not claim network visibility when unavailable', /can’t verify agent operations/.test(buildAgentNetworkStatusReply({ dataAvailable: false })));
test('warns when snapshot is partial', /partial snapshot/.test(buildAgentNetworkStatusReply({ agents: {}, partial: true })));
test('reports completion-history lookup failure instead of an empty completion claim', /completion history could not be read/.test(buildAgentNetworkStatusReply({ agents: {}, completedAvailable: false })));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);