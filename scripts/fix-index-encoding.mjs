/**
 * Fix UTF-8 mojibake in webapp/index.html (PowerShell line-removal corruption).
 * Strips broken emoji prefixes; uses ASCII punctuation in visible UI text.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '..', 'webapp', 'index.html');

let html = fs.readFileSync(indexPath, 'utf8');

/** Mojibake punctuation -> ASCII */
const punct = [
  ['\u00e2\u0080\u0094', '-'], // em dash (as mojibake bytes in utf8 string - try literal)
  ['\u00e2\u0080\u0093', '-'], // en dash
  ['\u00e2\u0080\u0099', "'"],
  ['\u00e2\u0080\u009c', '"'],
  ['\u00e2\u0080\u009d', '"'],
  ['\u00e2\u0080\u00a6', '...'],
  ['\u00e2\u0086\u0092', '->'],
  ['\u00e2\u0086\u0090', '<-'],
  ['\u00e2\u0086\u00a9', 'Undo'],
  ['\u00e2\u0086\u00aa', 'Redo'],
  ['\u00e2\u0089\u00a1', '='],
  ['\u00e2\u0084\u0096', '#'],
  ['\u00e2\u0098\u00b0', '*'],
  ['\u00e2\u00ab\u00b7', '<'],
  ['\u00e2\u00ab\u00b8', '>'],
  ['\u00e2\u009c\u0095', 'x'],
];

// Literal mojibake sequences as they appear in the corrupted file
const literal = [
  ['â€"', '-'],
  ['â€"', '-'],
  ['â€¦', '...'],
  ['â†\'', '->'],
  ['â†\'', '->'],
  ['â†\'', '<-'],
  ['â†©', 'Undo'],
  ['â†ª', 'Redo'],
  ['â‰¡', '='],
  ['â„–', '#'],
  ['â˜°', '*'],
  ['â«·', '<'],
  ['â«¸', '>'],
  ['âœ•', 'x'],
  ['â­\u008f', ''],
  ['âš¡', ''],
  ['â˜\u0081ï¸\u008f', ''],
  ['â¬\u0087ï¸\u008f', ''],
  ['âœ\u008fï¸\u008f', ''],
  ['âœ¨', ''],
];

for (const [from, to] of [...literal, ...punct]) {
  html = html.split(from).join(to);
}

/** Strip remaining emoji / symbol mojibake prefixes before labels */
html = html.replace(/[\u0080-\uFFFF]*?(?=(Generate|Dashboard|Article|Guide|Listicle|How-To|Case Study|Review|Expert Roundup|Opinion|Gemini|Claude|DeepSeek|Cerebras|Field Guide|Playbook|Research|Tool|SaaS|Service|Bundle|Download|Subscription|Critical|High|Normal|Low|Minimal|Close))/g, (m, word, offset, str) => {
  // Only strip if match is inside tag text (not attribute names)
  const before = str.slice(Math.max(0, offset - 80), offset);
  if (!/>[^<]*$/.test(before) && !/placeholder="[^"]*$/.test(before)) return m;
  if (m.length > 0 && /[^\x20-\x7e]/.test(m)) return '';
  return m;
});

/** Remove mojibake emoji clusters at start of option/button text */
html = html.replace(/>(\s*[\u00c0-\u024f\u0080-\u03ff\ud800-\udfff]+(?:\u00c2[\u0080-\u00bf])*\s*)([A-Za-z])/g, '>$2');
html = html.replace(/>(\s*[\u00c0-\u024f\u0080-\u03ff\ud800-\udfff\uFE0F\u20E3]+\s*)/g, '>');

/** Fix broken blog AI provider select */
html = html.replace(
  /<select id="blogAiProvider">ion value="gemini" selected>[^<]*<\/option>/,
  '<select id="blogAiProvider">\n                    <option value="gemini" selected>Gemini (default)</option>'
);

/** Clean comment box-drawing garbage */
html = html.replace(/<!-- [^\n]*[\u2550\u2500\u2014\u00e2][^\n]*-->/g, (c) => {
  const label = c.match(/MODULE:|BLOG:|NEXUS|SHOP|ANALYTICS|GENERATE|DASHBOARD|EDITOR|ASSETS|TEAM|ACTIVITY|AGENT|CONSOLE|TASKS|LEADS|CONTENT|Settings|Task output/i);
  return label ? `<!-- ${label[0].replace(/:$/, '')} -->` : '<!-- -->';
});

/** Placeholder em-dashes in empty KPI slots */
html = html.replace(/>\s*-\s*<\/(strong|div|span)>/g, (m) => m); // keep single dash

/** Collapse double spaces from emoji removal */
html = html.replace(/  +/g, ' ');
html = html.replace(/>\s+</g, '><');

fs.writeFileSync(indexPath, html, 'utf8');

const remaining = (html.match(/â|ðŸ|âœ|â†|â€|ï¸/g) || []).length;
console.log(`Fixed ${indexPath}; remaining suspicious sequences: ${remaining}`);
if (remaining > 0) {
  const idx = html.search(/â|ðŸ/);
  console.log('Sample:', JSON.stringify(html.slice(idx, idx + 60)));
}
