#!/usr/bin/env node
/** Build desktop/icon.ico from brand logo (JPEG or PNG). NSIS requires .ico on Windows. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'webapp', 'assets', 'gurucms-logo.png');
const pngOut = path.join(root, 'desktop', 'icon.png');
const icoOut = path.join(root, 'desktop', 'icon.ico');

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(source).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()),
);

fs.writeFileSync(pngOut, pngBuffers.at(-1));
const icoBuf = await pngToIco(pngBuffers);
fs.writeFileSync(icoOut, icoBuf);
console.log(`Wrote ${pngOut} and ${icoOut} (${icoBuf.length} bytes)`);
