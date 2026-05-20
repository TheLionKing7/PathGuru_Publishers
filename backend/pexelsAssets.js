/**
 * PathGuru Publishers — Pexels Asset Layer
 * Searches Pexels for images and optionally uploads to Cloudflare R2.
 */

const PEXELS_BASE = 'https://api.pexels.com/v1';

/**
 * Search Pexels for images matching a query.
 * @param {string} query
 * @param {Object} opts - { orientation, perPage, page }
 * @returns {Promise<Array>} array of normalised image objects
 */
export async function searchPexels (query, opts = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    // Return placeholder tiles so UI doesn't break during dev
    return Array.from({ length: 9 }, (_, i) => ({
      id: `placeholder-${i}`,
      alt: `${query} placeholder ${i + 1}`,
      src: {
        small:    `https://picsum.photos/seed/${query}${i}/400/300`,
        medium:   `https://picsum.photos/seed/${query}${i}/800/600`,
        large:    `https://picsum.photos/seed/${query}${i}/1200/900`,
        original: `https://picsum.photos/seed/${query}${i}/1920/1440`,
      },
      photographer: 'Placeholder',
      width: 1920,
      height: 1440,
    }));
  }

  const orientation = opts.orientation || '';   // landscape | portrait | square
  const perPage     = Math.min(opts.perPage || 20, 80);
  const page        = opts.page || 1;

  const params = new URLSearchParams({ query, per_page: perPage, page });
  if (orientation) params.set('orientation', orientation);

  const res = await fetch(`${PEXELS_BASE}/search?${params}`, {
    headers: { Authorization: key },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pexels API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.photos || []).map(normalise);
}

/**
 * Normalise a Pexels photo object to our internal shape.
 */
function normalise (photo) {
  return {
    id:           photo.id,
    alt:          photo.alt || '',
    photographer: photo.photographer || '',
    width:        photo.width,
    height:       photo.height,
    src: {
      small:    photo.src?.small    || '',
      medium:   photo.src?.medium   || '',
      large:    photo.src?.large    || photo.src?.large2x || '',
      original: photo.src?.original || '',
    },
    url: photo.url || '',
  };
}

/**
 * Upload a list of remote image URLs to Cloudflare R2.
 * Falls back gracefully if R2 is not configured.
 * @param {Array} assets  - [{ id, full, role }]
 * @returns {Promise<Array>} [{ id, r2Url, role }]
 */
export async function uploadAssetsToR2 (assets) {
  const { uploadToR2 } = await import('./cloudflareR2.js');
  const results = [];

  for (const asset of assets) {
    try {
      const imageRes = await fetch(asset.full || asset.src?.large || asset.src?.medium);
      if (!imageRes.ok) throw new Error(`Could not fetch image ${asset.id}`);
      const buffer  = Buffer.from(await imageRes.arrayBuffer());
      const key     = `assets/${asset.role || 'interior'}/${asset.id}.jpg`;
      const r2Url   = await uploadToR2(buffer, key, 'image/jpeg');
      results.push({ id: asset.id, r2Url, role: asset.role });
    } catch (err) {
      results.push({ id: asset.id, error: err.message, role: asset.role });
    }
  }

  return results;
}
