/**
 * Rebuild index.html: clean UTF-8 from git + publisher removed + Command shell from current.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'webapp', 'index.html');
const cur = fs.readFileSync(indexPath, 'utf8');
const old = execSync('git show HEAD~1:webapp/index.html', {
  encoding: 'utf8',
  maxBuffer: 25 * 1024 * 1024,
  cwd: root,
});

function extractBetween(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing start: ${startMarker}`);
  const end = html.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Missing end after ${startMarker}`);
  return html.slice(start, end + endMarker.length);
}

function extractFrom(html, startMarker) {
  const start = html.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing: ${startMarker}`);
  return html.slice(start);
}

// Remove publisher module from clean old HTML
const pubStart = old.indexOf('id="module-publishing"');
const pubOpen = old.lastIndexOf('<div class="module-shell', pubStart);
const pubEndMarker = '</div><!-- /module-publishing -->';
const pubEnd = old.indexOf(pubEndMarker, pubOpen);
if (pubOpen === -1 || pubEnd === -1) {
  throw new Error('Could not locate module-publishing block in git history');
}
let body = old.slice(0, pubOpen) + old.slice(pubEnd + pubEndMarker.length);

// Blog module first / active (publisher nav removed via current sidebar)
body = body.replace(
  '<div class="module-shell" id="module-blog"',
  '<div class="module-shell active" id="module-blog"'
);

// Head + launcher from current (DigiFusion Command title, launcher.css)
const headEnd = cur.indexOf('</head>') + '</head>'.length;
const head = cur.slice(0, headEnd);

// Sidebar from current (blog-first nav, no publisher button)
const sidebarStart = cur.indexOf('<!-- Sidebar');
const sidebarEnd = cur.indexOf('</aside>', sidebarStart) + '</aside>'.length;
const sidebar = fixAscii(cur.slice(sidebarStart, sidebarEnd));

// Main modules from clean body (between dept-route-nav and scripts)
const mainStart = body.indexOf('<main class="main-panel"');
const mainEnd = body.indexOf('</main>', mainStart) + '</main>'.length;
let main = body.slice(mainStart, mainEnd);

// Footer modals + scripts from current (may have split-specific changes)
const footerStart = cur.indexOf('<div class="task-output-drawer"');
if (footerStart === -1) throw new Error('Missing task output drawer in current index.html');
const footer = fixAscii(cur.slice(footerStart));

// Launcher block from current
const launcherStart = cur.indexOf('<!-- Product launcher');
const launcherEnd = cur.indexOf('<!-- Sidebar', launcherStart);
const launcher = fixAscii(cur.slice(launcherStart, launcherEnd));

function stripEmoji(text) {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}][\uFE0F\u20E3]?/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/\uFE0F/g, '');
}

function fixAscii(chunk) {
  return stripEmoji(chunk)
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2026/g, '...')
    .replace(/\u00D7/g, 'x')
    // leftover mojibake from corrupted slices
    .replace(/â€"/g, '-')
    .replace(/â€"/g, '-')
    .replace(/â€¦/g, '...')
    .replace(/â†'/g, '->')
    .replace(/â†'/g, '<-')
    .replace(/â†©/g, 'Undo')
    .replace(/â†ª/g, 'Redo')
    .replace(/âœ•/g, 'x')
    .replace(/â‰¡/g, '=')
    .replace(/â„–/g, '#')
    .replace(/â˜°/g, '*')
    .replace(/â«·/g, '<')
    .replace(/â«¸/g, '>')
    .replace(/[â][^\s<]{0,3}\s*(?=[A-Za-z])/g, '');
}

// Fix sidebar mojibake in launcher separately
const fixedLauncher = fixAscii(launcher);
const fixedSidebar = fixAscii(sidebar);

const cleanMain = fixAscii(main);

const out = `${head}
<body>

  ${fixedLauncher}

  ${fixedSidebar}

  <!-- App chrome + main panel -->
  <div class="app-chrome">
  ${cleanMain}
  </div>

  ${fixAscii(footer)}
`;

// Verify no publisher module leaked back
if (out.includes('module-publishing')) {
  throw new Error('Publisher module still present after rebuild');
}

fs.writeFileSync(indexPath, out, 'utf8');
const cleaned = out;

const bad = (cleaned.match(/â|ðŸ|ï¸|âœ/g) || []).length;
console.log(`Rebuilt index.html (${cleaned.length} chars); mojibake tokens left: ${bad}`);
