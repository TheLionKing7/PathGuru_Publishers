import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'webapp', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

html = html
  .replace(/<!-- ettings Modal[^>]*-->/, '<!-- Settings Modal -->')
  .replace(/<!-- reate Task Modal[^>]*-->/, '<!-- Create Task Modal -->')
  .replace(/<option value="1">[^<]*Critical \(1\)<\/option>/, '<option value="1">Critical (1)</option>')
  .replace(/<option value="2">[^<]*High \(2\)<\/option>/, '<option value="2">High (2)</option>')
  .replace(/<option value="3" selected>[^<]*Normal \(3\)<\/option>/, '<option value="3" selected>Normal (3)</option>')
  .replace(/<option value="4">[^<]*Low \(4\)<\/option>/, '<option value="4">Low (4)</option>')
  .replace(/[\u2014\u2013]/g, '-')
  .replace(/\u2192/g, '->')
  .replace(/\u2026/g, '...')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
  .replace(/[\u2600-\u27BF]/g, '');

const bad = (html.match(/â|ð|ï¸/g) || []).length;
fs.writeFileSync(indexPath, html, 'utf8');
console.log('Final cleanup done; suspicious chars:', bad);
