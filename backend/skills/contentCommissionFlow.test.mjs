/**
 * Run:  node backend/skills/contentCommissionFlow.test.mjs
 *
 * Verifies the pure intake/gate parsing helpers for the content-commission flow.
 * No framework, no dependency, exits non-zero on failure.
 */
import { extractUrlFromText, parseCommissionText, parseAngleReply } from './contentCommission.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

console.log('— extractUrlFromText —');
t('bare https url', extractUrlFromText('check https://example.com/post now') === 'https://example.com/post');
t('slack <url|label>', extractUrlFromText('see <https://example.com/x|the thing> please') === 'https://example.com/x');
t('slack <url> no label', extractUrlFromText('see <https://example.com/x> please') === 'https://example.com/x');
t('no url → null', extractUrlFromText('no link here') === null);
t('trailing punctuation stripped', extractUrlFromText('read https://example.com/post.') === 'https://example.com/post');

console.log('— parseCommissionText —');
{
  const r = parseCommissionText('https://example.com/post write about this');
  t('url + note split', r.url === 'https://example.com/post' && r.note === 'write about this');
}
{
  const r = parseCommissionText('<https://example.com/x|title> for sme angle');
  t('slack wrapped url + note', r.url === 'https://example.com/x' && r.note === 'for sme angle');
}
{
  const r = parseCommissionText('AI adoption in Nigerian banks');
  t('topic only', r.url === null && r.note === 'AI adoption in Nigerian banks');
}

console.log('— parseAngleReply —');
const angles = ['Angle one sentence', 'Angle two sentence', 'Angle three sentence'];
{
  const r = parseAngleReply('2', angles);
  t('numeric choose 2', r.action === 'choose' && r.angle === 'Angle two sentence' && r.index === 1);
}
{
  const r = parseAngleReply('go with #3', angles);
  t('#3 choose', r.action === 'choose' && r.index === 2);
}
{
  const r = parseAngleReply('the second one', angles);
  t('ordinal second', r.action === 'choose' && r.index === 1);
}
t('abandon', parseAngleReply('abandon this', angles).action === 'abandon');
{
  const r = parseAngleReply('How SMEs cut operational costs with AI automation', angles);
  t('free-text refinement', r.action === 'choose' && r.angle === 'How SMEs cut operational costs with AI automation');
}
t('empty → none', parseAngleReply('', angles).action === 'none');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
