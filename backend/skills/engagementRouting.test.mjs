import test from 'node:test';
import assert from 'node:assert/strict';
import { routeEngagement } from './engagementRouting.js';

test('automation routes to Nova with AVE', () => {
  assert.deepEqual(routeEngagement({ track: 'ai-automation' }), {
    assigned_agent: 'nova', framework_id: 'ave',
  });
});

test('digital media routes to Aether with C2C', () => {
  assert.deepEqual(routeEngagement({ track: 'digital-media' }), {
    assigned_agent: 'aether', framework_id: 'c2c',
  });
});

test('track aliases resolve to the canonical lane', () => {
  assert.equal(routeEngagement({ track: 'automation' }).assigned_agent, 'nova');
  assert.equal(routeEngagement({ track: 'bd' }).assigned_agent, 'atlas');
  assert.equal(routeEngagement({ track: 'media' }).assigned_agent, 'aether');
});

test('BD defaults to Deal Engine when nothing else is known', () => {
  assert.deepEqual(routeEngagement({ track: 'business-development' }), {
    assigned_agent: 'atlas', framework_id: 'deal-engine',
  });
});

test('regulation decides before size — a fintech is a fintech first', () => {
  assert.equal(
    routeEngagement({ track: 'business-development', sector: 'Financial services' }).framework_id,
    'fira',
  );
  assert.equal(
    routeEngagement({ track: 'business-development', sector: 'Public sector / NGO' }).framework_id,
    'govtech',
  );
});

test('segment short ids route to their architecture', () => {
  assert.equal(routeEngagement({ track: 'business-development', segment: 'enterprise' }).framework_id, 'enterprise-velocity');
  assert.equal(routeEngagement({ track: 'business-development', segment: 'sme' }).framework_id, 'sme-scale-engine');
  assert.equal(routeEngagement({ track: 'business-development', segment: 'gov' }).framework_id, 'govtech');
});

test('enterprise headcount bands route to Enterprise Velocity', () => {
  for (const band of ['250–999', '1,000+', '250-999', '1000+']) {
    assert.equal(
      routeEngagement({ track: 'business-development', headcountBand: band }).framework_id,
      'enterprise-velocity',
      `band ${band}`,
    );
  }
});

test('a small known headcount routes to the SME engine', () => {
  assert.equal(
    routeEngagement({ track: 'business-development', headcountBand: '50–249' }).framework_id,
    'sme-scale-engine',
  );
});

test('an unknown track returns nulls, never a default agent', () => {
  assert.deepEqual(routeEngagement({ track: 'nonsense' }), {
    assigned_agent: null, framework_id: null, reason: 'unknown track',
  });
  assert.equal(routeEngagement({}).assigned_agent, null);
});

test('a segment route is not a practice area — no lane, no agent', () => {
  assert.equal(routeEngagement({ track: 'enterprise' }).assigned_agent, null);
  assert.equal(routeEngagement({ track: 'small-business' }).assigned_agent, null);
});
