import fs from 'fs';
import path from 'path';
// pdf-lib is imported lazily where needed to avoid hard dependency at module load time

export async function htmlToPdfBuffer(html, options = {}) {
  // Lazy-import Playwright so the module can be loaded in environments
  // where Playwright/browser binaries are not installed.
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (e) {
    throw new Error("Playwright is not installed. Run 'npm run install-playwright' before generating PDFs.");
  }

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 }
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const pdfBuffer = await page.pdf({ format: options.format || 'A4', printBackground: true });
  await browser.close();
  return pdfBuffer;
}

export async function savePdfToDisk(buffer, filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function mergePdfBuffers(buffers = []) {
  const { PDFDocument } = await import('pdf-lib');
  const mergedPdf = await PDFDocument.create();
  for (const buff of buffers) {
    if (!buff) continue;
    const donor = await PDFDocument.load(buff);
    const donorPages = await mergedPdf.copyPages(donor, donor.getPageIndices());
    donorPages.forEach((p) => mergedPdf.addPage(p));
  }
  return Buffer.from(await mergedPdf.save());
}

export async function generateFinalPdf(coverHtml, contentHtml, options = {}) {
  const parts = [];
  if (coverHtml) {
    try {
      const coverPdf = await htmlToPdfBuffer(coverHtml, options);
      parts.push(coverPdf);
    } catch (e) {
      // continue without cover
    }
  }
  const contentPdf = await htmlToPdfBuffer(contentHtml, options);
  parts.push(contentPdf);
  return mergePdfBuffers(parts);
}
