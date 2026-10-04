/**
 * Run: node backend/skills/aetherContentStatus.test.mjs
 * Pure intent and formatter checks; no database or external services.
 */
import {
  buildAetherContentStatusReply,
  isAetherContentStatusQuery,
  resolveAetherContentStatusRequest,
} from './aetherContentStatus.js';

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

console.log('— intent routing —');
t('routes the reported Aether writing-status question', isAetherContentStatusQuery('Has Aether finished writing the blog post?'));
t('routes a simple blog status question', isAetherContentStatusQuery('What is the status of Aether’s blog post?'));
t('routes a direct Aether commission status query', isAetherContentStatusQuery('What is the status of Aether’s commission?'));
t('routes a blog draft status question without requiring Aether to be named', isAetherContentStatusQuery('Is the blog draft ready?'));
t('routes a request for current work visibility and latest update', isAetherContentStatusQuery('Boss, I don’t have visibility into Aether’s current work on the OpenMarket blog post. Please share the task reference or brief so I can pull the latest update'));
t('does not route a request to write a post', !isAetherContentStatusQuery('Aether, write a blog post about AI adoption.'));
t('does not route unrelated chat', !isAetherContentStatusQuery('Good morning, Nexus.'));
t('routes "update?" with the preceding commission request in thread history', isAetherContentStatusQuery('update?', [
  { role: 'user', content: 'Ask Aether to write a blog post about AI adoption in African SMEs.' },
],));
t('uses the prior thread request as the grounded status lookup topic', resolveAetherContentStatusRequest('update?', [
  { role: 'user', content: 'Ask Aether to write a blog post about AI adoption in African SMEs.' },
]) === 'Ask Aether to write a blog post about AI adoption in African SMEs.');
t('resolves a follow-up across an intervening Nexus reply', isAetherContentStatusQuery('Any update?', [
  { role: 'user', content: 'Aether, write a post about AI adoption in African SMEs.' },
  { role: 'assistant', content: 'The commission was started.' },
]));
t('does not revive Aether context across a newer unrelated user message', !isAetherContentStatusQuery('update?', [
  { role: 'user', content: 'Aether, write a blog post about AI adoption.' },
  { role: 'assistant', content: 'Commission started.' },
  { role: 'user', content: 'What is the weather?' },
]));
t('does not infer an Aether status query from an ungrounded "update?"', !isAetherContentStatusQuery('update?'));

function makeDb(rows, queryError = null) {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return query; },
    order(column, options) { calls.push(['order', column, options]); return query; },
    limit(value) { calls.push(['limit', value]); return query; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: queryError }).then(resolve, reject); },
  };
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

console.log('— commission status replies —');
{
  const db = makeDb([{ angle: 'AI adoption in African SMEs', status: 'draft_review' }]);
  const reply = await buildAetherContentStatusReply({ db });
  t('reports completed draft awaiting review', /draft is complete and awaiting review/.test(reply));
  t('identifies the commission subject', /AI adoption in African SMEs/.test(reply));
  t('reads the content commission source', db.calls.some(([method, value]) => method === 'from' && value === 'content_commission'));
}
{
  const db = makeDb([
    { angle: 'OpenMarket weekly intelligence blog', status: 'drafting' },
    { angle: 'AI adoption in African SMEs', status: 'published', published_url: 'https://example.com/unrelated' },
  ]);
  const reply = await buildAetherContentStatusReply({ db, message: 'Boss, I don’t have visibility into Aether’s current work on the OpenMarket blog post. Please share the task reference or brief so I can pull the latest update' });
  t('finds the specifically named OpenMarket commission', /OpenMarket weekly intelligence blog/.test(reply));
  t('reports the matching commission status', /Aether is drafting the post/.test(reply));
  t('does not substitute an unrelated commission', !/AI adoption|unrelated/.test(reply));
  t('fetches enough recent commissions to resolve a named topic', db.calls.some(([method, value]) => method === 'limit' && value === 50));
}
{
  const db = makeDb([{ angle: 'AI adoption in African SMEs', status: 'drafting' }]);
  const reply = await buildAetherContentStatusReply({
    db,
    message: 'Ask Aether to write a blog post about AI adoption in African SMEs.',
  });
  t('matches a tracked commission when instruction wording differs from its angle', /AI adoption in African SMEs/.test(reply));
  t('grounds the differently worded match in its recorded status', /Aether is drafting the post/.test(reply));
}
{
  const reply = await buildAetherContentStatusReply({
    db: makeDb([{ angle: 'AI adoption', status: 'drafting' }]),
    message: 'What is Aether doing on the OpenMarket blog post?',
  });
  t('does not report unrelated status when the named topic is untracked', /couldn’t find a tracked blog commission matching “OpenMarket”/.test(reply));
  t('explicitly avoids substituting an unrelated post', /won’t substitute an unrelated post/.test(reply));
}
{
  const reply = await buildAetherContentStatusReply({ db: makeDb([{ angle: 'AI adoption', status: 'drafting' }]) });
  t('distinguishes a draft still in progress', /Aether is drafting the post/.test(reply));
}
{
  const reply = await buildAetherContentStatusReply({ db: makeDb([{ angle: 'AI adoption', status: 'published', published_url: 'https://example.com/post' }]) });
  t('reports published URL when present', /published.*https:\/\/example\.com\/post/.test(reply));
}
{
  const reply = await buildAetherContentStatusReply({ db: makeDb([]) });
  t('does not claim completion when no commission is tracked', /can’t verify/.test(reply));
}
{
  let threw = false;
  try {
    await buildAetherContentStatusReply({ db: makeDb(null, { message: 'database unavailable' }) });
  } catch (error) {
    threw = /database unavailable/.test(error.message);
  }
  t('surfaces database lookup failures to the caller', threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);