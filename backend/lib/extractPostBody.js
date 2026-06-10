/**
 * Extract inner HTML from PathGuru .post-body wrapper (handles nested divs).
 */
export function extractPostBody(html = '') {
  const raw = String(html || '').trim();
  if (!raw) return '';

  const startMatch = raw.match(/<div[^>]*class=["'][^"']*post-body[^"']*["'][^>]*>/i);
  if (startMatch) {
    const startIdx = startMatch.index + startMatch[0].length;
    let depth = 1;
    let i = startIdx;
    const lower = raw.toLowerCase();
    while (i < raw.length && depth > 0) {
      const nextOpen = lower.indexOf('<div', i);
      const nextClose = lower.indexOf('</div>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        if (depth === 0) {
          const inner = raw.slice(startIdx, nextClose).trim();
          if (inner.length > 0) return inner;
          break; // empty .post-body — try full-document fallback below
        }
        i = nextClose + 6;
      }
    }
    const tail = raw.slice(startIdx).trim();
    if (tail.length > 0) return tail;
  }

  if (/^<!doctype/i.test(raw) || /<html[\s>]/i.test(raw)) {
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) {
      const inner = extractPostBody(bodyMatch[1]);
      if (inner && inner !== bodyMatch[1]) return inner;
      return bodyMatch[1]
        .replace(/<article[^>]*class=["'][^"']*post-wrap[^"']*["'][^>]*>/i, '')
        .replace(/<\/article>/i, '')
        .replace(/<h1[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<\/h1>/i, '')
        .replace(/<p[^>]*class=["'][^"']*post-excerpt[^"']*["'][^>]*>[\s\S]*?<\/p>/i, '')
        .replace(/<p[^>]*class=["'][^"']*post-meta[^"']*["'][^>]*>[\s\S]*?<\/p>/i, '')
        .replace(/<img[^>]*class=["'][^"']*post-image[^"']*["'][^>]*>/i, '')
        .trim();
    }
  }

  return raw;
}
