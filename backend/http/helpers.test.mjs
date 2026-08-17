/**
 * Run:  node backend/http/helpers.test.mjs
 *
 * Verifies parseBody branches on content-type: urlencoded → URLSearchParams,
 * JSON → JSON.parse, and that the raw body is preserved as a non-enumerable
 * `_raw` property for signature validators.
 *
 * No framework, no dependency, exits non-zero on failure.
 */
import { parseBody } from './helpers.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)); };

const URLENC = 'From=whatsapp%3A%2B15551234567&Body=Hello%20Boss%20%26%20team&ProfileName=Kimi&WaId=15551234567&MessageSid=SMabc123';

console.log('— application/x-www-form-urlencoded body —');
const form = parseBody(URLENC, 'application/x-www-form-urlencoded');
t('parses From', form.From === 'whatsapp:+15551234567');
t('parses Body with decoded space and &', form.Body === 'Hello Boss & team');
t('parses ProfileName', form.ProfileName === 'Kimi');
t('parses WaId', form.WaId === '15551234567');
t('parses MessageSid', form.MessageSid === 'SMabc123');
t('preserves the raw body', form._raw === URLENC);
t('_raw is non-enumerable', !Object.keys(form).includes('_raw'));
t('JSON.stringify omits _raw', !JSON.stringify(form).includes('_raw'));

console.log('— application/json body —');
const json = parseBody('{"subject":"hello","n":1}', 'application/json');
t('parses JSON fields', json.subject === 'hello' && json.n === 1);
t('JSON _raw preserved', json._raw === '{"subject":"hello","n":1}');
t('JSON _raw non-enumerable', !Object.keys(json).includes('_raw'));

console.log('— fallbacks —');
const empty = parseBody('', 'application/json');
t('empty body → {} with empty _raw', Object.keys(empty).length === 0 && empty._raw === '');
const bad = parseBody('not-json', 'application/json');
t('invalid JSON → {} with _raw intact', Object.keys(bad).length === 0 && bad._raw === 'not-json');
const urlencEmpty = parseBody('', 'application/x-www-form-urlencoded');
t('empty urlencoded → {}', Object.keys(urlencEmpty).length === 0 && urlencEmpty._raw === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
