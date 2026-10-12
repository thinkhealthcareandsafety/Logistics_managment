const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const StockItem = require('../models/StockItem');

/**
 * Product photos from the web for lines that have none from buyaedindia.com or Zoho.
 * Gemini with Google Search suggests image links and product pages; each candidate is
 * downloaded and shown back to Gemini, and only a photo that really is this product on a
 * white/plain background, sharp enough to use, is kept. Lines are searched once a month
 * at most, found or not.
 */

const MODELS = [env.gemini.model, 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest'].filter(Boolean);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const RETRY_AFTER_DAYS = 30;
const MAX_CANDIDATES = 6;

const lastRun = { startedAt: null, finishedAt: null, tried: 0, found: 0, error: null, results: [] };
let running = null;

async function gemini(body) {
  let lastErr;
  for (const model of [...new Set(MODELS)]) {
    try {
      const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, body, {
        headers: { 'x-goog-api-key': env.gemini.apiKey },
        timeout: 120000,
      });
      return data;
    } catch (err) {
      lastErr = err;
      // A quota or key problem is the same on every model - stop here.
      if ([401, 403, 429].includes(err.response?.status)) break;
    }
  }
  throw lastErr;
}

const textOf = (data) => (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
const jsonOf = (text) => {
  const m = String(text).match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
};
/** "Whistle (category: First Aid Kit Contents)" - short names are ambiguous without it. */
const describe = (item) => {
  const name = item.size ? `${item.name} ${item.size}` : item.name;
  const category = item.categoryId?.name;
  return category ? `${name} (category: ${category})` : name;
};
const NOT_SAME = 'A different kind of product that merely shares the name (e.g. a brand called "Whistle" that sells dental aligners) does NOT count.';

const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 2000;

/** Image links and product pages for a product, from a Google-grounded search. */
async function searchCandidates(name) {
  const data = await gemini({
    contents: [{
      role: 'user',
      parts: [{
        text: `Search the web for product photos of this exact item sold in India by a medical / safety equipment supplier: "${name}".
Prefer the manufacturer's or a major retailer's main product image: high resolution, product alone on a plain WHITE background.
Reply with ONLY JSON: {"images": ["direct image file URL", ...up to 4], "pages": ["product page URL", ...up to 4]}. Only real URLs you found.`,
      }],
    }],
    tools: [{ google_search: {} }],
  });
  const parsed = jsonOf(textOf(data)) || {};
  const grounded = (data?.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c) => c.web?.uri).filter(isHttp);
  return {
    images: (parsed.images || []).filter(isHttp).slice(0, 4),
    pages: [...new Set([...(parsed.pages || []).filter(isHttp), ...grounded])].slice(0, 5),
  };
}

/** The main product image a page declares (og:image, twitter:image, JSON-LD image). */
async function pageImage(url) {
  const res = await axios.get(url, { timeout: 15000, maxContentLength: 3 * 1024 * 1024, headers: { 'User-Agent': UA }, responseType: 'text' });
  const html = String(res.data || '');
  const base = res.request?.res?.responseUrl || url;
  const found = [];
  const meta = /<meta[^>]+(?:property|name|itemprop)=["'](?:og:image(?::secure_url)?|twitter:image|image)["'][^>]*>/gi;
  for (const tag of html.match(meta) || []) {
    const c = tag.match(/content=["']([^"']+)["']/i);
    if (c) found.push(c[1]);
  }
  for (const block of html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []) {
    const m = block.match(/"image"\s*:\s*(?:\[\s*)?"([^"]+)"/);
    if (m) found.push(m[1]);
  }
  const out = [];
  for (const f of found) {
    try {
      const abs = new URL(f.replace(/&amp;/g, '&'), base).href;
      if (isHttp(abs)) out.push(abs);
    } catch {
      /* not a usable link */
    }
  }
  return { images: [...new Set(out)].slice(0, 2), page: base };
}

/** Downloads a candidate and asks Gemini whether it is this product, on white, and sharp. */
async function verify(name, url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 8 * 1024 * 1024, headers: { 'User-Agent': UA } });
  const type = String(res.headers['content-type'] || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(type) || res.data.byteLength < 15000) return { ok: false };
  const data = await gemini({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: type, data: Buffer.from(res.data).toString('base64') } },
        {
          text: `This is for the stock list of an Indian first-aid, medical and safety equipment supplier.
Is this an accurate product photo of "${name}" - the same kind of product, and the same brand/model if one is named? ${NOT_SAME}
Also: is the background white or very plain and light, with no people, and is the photo sharp and high resolution (not a tiny thumbnail, not a collage, no big watermark)?
Reply ONLY JSON {"sameProduct": true|false, "whiteBackground": true|false, "sharp": true|false, "reason": "short"}`,
        },
      ],
    }],
    generationConfig: { temperature: 0 },
  });
  const v = jsonOf(textOf(data)) || {};
  return { ok: v.sameProduct === true && v.whiteBackground === true && v.sharp === true, reason: v.reason || '' };
}

async function findFor(item) {
  const name = describe(item);
  const { images, pages } = await searchCandidates(name);
  const candidates = images.map((u) => ({ url: u, page: '' }));
  for (const p of pages) {
    if (candidates.length >= MAX_CANDIDATES) break;
    try {
      const r = await pageImage(p);
      for (const u of r.images) candidates.push({ url: u, page: r.page });
    } catch {
      /* page unreachable - next one */
    }
  }
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.url) || seen.size >= MAX_CANDIDATES) continue;
    seen.add(c.url);
    try {
      if ((await verify(name, c.url)).ok) return c;
    } catch (err) {
      if ([401, 403, 429].includes(err.response?.status) && /googleapis/.test(err.config?.url || '')) throw err;
    }
  }
  return null;
}

// ─────────────────────────── Videos & brochures ───────────────────────────

const youtubeId = (u) => {
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

/** YouTube links and PDF links found on a product page. */
async function pageExtras(url) {
  const res = await axios.get(url, { timeout: 15000, maxContentLength: 3 * 1024 * 1024, headers: { 'User-Agent': UA }, responseType: 'text' });
  const html = String(res.data || '');
  const base = res.request?.res?.responseUrl || url;
  const videos = [...html.matchAll(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/g)].map((m) => m[0]);
  const pdfs = [];
  for (const m of html.matchAll(/href=["']([^"']+?\.pdf(?:\?[^"']*)?)["']/gi)) {
    try {
      pdfs.push(new URL(m[1].replace(/&amp;/g, '&'), base).href);
    } catch {
      /* not a usable link */
    }
  }
  return { videos, pdfs };
}

/** Title of a YouTube video (null if it doesn't exist or can't be embedded). */
async function youtubeTitle(id) {
  try {
    const { data } = await axios.get('https://www.youtube.com/oembed', { params: { url: `https://www.youtube.com/watch?v=${id}`, format: 'json' }, timeout: 10000 });
    return data?.title ? `${data.title}${data.author_name ? ` (channel: ${data.author_name})` : ''}` : null;
  } catch {
    return null;
  }
}

/** A PDF's bytes, or null if the link isn't a reachable PDF under 8 MB. */
async function fetchPdf(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 8 * 1024 * 1024, headers: { 'User-Agent': UA } });
    const buf = Buffer.from(res.data);
    return buf.subarray(0, 5).toString() === '%PDF-' ? buf : null;
  } catch {
    return null;
  }
}

/** Candidate product videos and brochures from a Google-grounded search plus the pages it found. */
async function searchExtras(name, { wantVideos, wantBrochures }) {
  const want = [wantVideos && 'product videos on YouTube (demo, how-to-use, unboxing or review of this exact product)', wantBrochures && 'product brochures, datasheets or user manuals as PDF files'].filter(Boolean).join(' and ');
  const data = await gemini({
    contents: [{
      role: 'user',
      parts: [{
        text: `Search the web for ${want} for this exact item sold in India by a medical / safety equipment supplier: "${name}".
Reply with ONLY JSON: {"videos": ["YouTube URL", ...up to 4], "brochures": ["PDF URL", ...up to 4], "pages": ["manufacturer or retailer product page URL", ...up to 4]}. Only real URLs you found.`,
      }],
    }],
    tools: [{ google_search: {} }],
  });
  const parsed = jsonOf(textOf(data)) || {};
  const grounded = (data?.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c) => c.web?.uri).filter(isHttp);
  const videos = new Set((parsed.videos || []).map(youtubeId).filter(Boolean));
  const pdfs = new Set((parsed.brochures || []).filter((u) => isHttp(u)));
  for (const p of [...new Set([...(parsed.pages || []).filter(isHttp), ...grounded])].slice(0, 4)) {
    try {
      const found = await pageExtras(p);
      found.videos.map(youtubeId).filter(Boolean).forEach((id) => videos.add(id));
      found.pdfs.forEach((u) => pdfs.add(u));
    } catch {
      /* page unreachable */
    }
  }
  return { videoIds: [...videos].slice(0, 6), pdfUrls: [...pdfs].slice(0, 4) };
}

/** Finds and checks videos/brochures for one line; returns what passed Gemini's check. */
async function findExtrasFor(item) {
  const name = describe(item);
  const wantVideos = !item.media?.videos?.length;
  const wantBrochures = !item.media?.brochures?.length;
  const { videoIds, pdfUrls } = await searchExtras(name, { wantVideos, wantBrochures });

  const videos = [];
  if (wantVideos) {
    for (const id of videoIds) {
      const title = await youtubeTitle(id);
      if (title) videos.push({ url: `https://www.youtube.com/watch?v=${id}`, title });
    }
  }
  const pdfs = [];
  if (wantBrochures) {
    for (const url of pdfUrls) {
      if (pdfs.length >= 2) break;
      const buf = await fetchPdf(url);
      if (buf) pdfs.push({ url, buf });
    }
  }
  if (!videos.length && !pdfs.length) return { videos: [], brochures: [] };

  // One check for everything: which videos and PDFs are really about this product.
  const data = await gemini({
    contents: [{
      role: 'user',
      parts: [
        ...pdfs.map((p) => ({ inlineData: { mimeType: 'application/pdf', data: p.buf.toString('base64') } })),
        {
          text: `Product: "${name}".
${pdfs.length ? `The ${pdfs.length} attached PDF(s) are numbered 0..${pdfs.length - 1} in order.` : 'No PDFs attached.'}
YouTube videos (by title):
${videos.map((v, i) => `${i}: ${v.title}`).join('\n') || 'none'}
This is for the stock list of an Indian first-aid, medical and safety equipment supplier.
Which are about THIS product (same kind of product, and the same brand/model if one is named) - a video showing or explaining it, or a PDF that is its brochure, datasheet, catalogue page or manual? ${NOT_SAME} Reject unrelated products, generic news, and price lists.
Reply ONLY JSON {"videos": [matching video numbers], "brochures": [{"index": n, "title": "short title like 'Philips FRx brochure'"}]}`,
        },
      ],
    }],
    generationConfig: { temperature: 0 },
  });
  const verdict = jsonOf(textOf(data)) || {};
  return {
    videos: (verdict.videos || []).map((i) => videos[i]?.url).filter(Boolean).slice(0, 2),
    brochures: (verdict.brochures || [])
      .map((b) => pdfs[b?.index] && { url: pdfs[b.index].url, title: String(b.title || 'Brochure').slice(0, 80) })
      .filter(Boolean)
      .slice(0, 2),
  };
}

/** Videos and brochures for lines missing either, three lines at a time. */
async function findExtras(retryBefore, limit) {
  const items = await StockItem.find({
    isArchived: false,
    $and: [
      { $or: [{ 'media.videos.0': { $exists: false } }, { 'media.brochures.0': { $exists: false } }] },
      { $or: [{ 'media.extrasSearchedAt': null }, { 'media.extrasSearchedAt': { $lt: retryBefore } }] },
    ],
  })
    .populate('categoryId', 'name')
    .limit(limit);
  lastRun.extras = { total: items.length, tried: 0, videos: 0, brochures: 0 };
  let stop = false;
  const queue = [...items];
  const worker = async () => {
    while (queue.length && !stop) {
      const item = queue.shift();
      let found = { videos: [], brochures: [] };
      try {
        found = await findExtrasFor(item);
      } catch (err) {
        if ([401, 403, 429].includes(err.response?.status)) {
          lastRun.error = `Google search unavailable: ${err.response?.data?.error?.message || err.message}`;
          stop = true;
          return; // leave this line unmarked so it's tried again
        }
      }
      const set = { 'media.extrasSearchedAt': new Date() };
      if (found.videos.length) set['media.videos'] = found.videos;
      if (found.brochures.length) set['media.brochures'] = found.brochures;
      if (found.videos.length || found.brochures.length) set['media.matchedAt'] = item.media?.matchedAt || new Date();
      await StockItem.updateOne({ _id: item._id }, { $set: set });
      lastRun.extras.tried += 1;
      lastRun.extras.videos += found.videos.length ? 1 : 0;
      lastRun.extras.brochures += found.brochures.length ? 1 : 0;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  logger.info(`Web extras: ${lastRun.extras.videos} lines got videos, ${lastRun.extras.brochures} got brochures (of ${lastRun.extras.tried})`);
}

/** Searches up to `limit` lines with no photo, then videos/brochures. One run at a time; returns that run's promise. */
function findWebImages({ limit = 150 } = {}) {
  if (!env.gemini.apiKey) throw new ApiError(503, 'Finding photos needs GEMINI_API_KEY on the server');
  if (running) return running;
  running = (async () => {
    Object.assign(lastRun, { startedAt: new Date(), finishedAt: null, tried: 0, found: 0, error: null, results: [], extras: null });
    try {
      const retryBefore = new Date(Date.now() - RETRY_AFTER_DAYS * 864e5);
      const items = await StockItem.find({
        isArchived: false,
        zohoHasImage: { $ne: true },
        'media.images.0': { $exists: false },
        $or: [{ 'media.webSearchedAt': null }, { 'media.webSearchedAt': { $lt: retryBefore } }],
      })
        .populate('categoryId', 'name')
        .limit(limit);
      for (const item of items) {
        let hit = null;
        try {
          hit = await findFor(item);
        } catch (err) {
          const msg = err.response?.data?.error?.message || err.message;
          if ([401, 403, 429].includes(err.response?.status)) {
            lastRun.error = `Google search unavailable: ${msg}`;
            logger.warn(`Web photo finder stopped: ${msg}`);
            break; // don't mark the rest as searched
          }
        }
        lastRun.tried += 1;
        const set = { 'media.webSearchedAt': new Date() };
        if (hit) {
          lastRun.found += 1;
          Object.assign(set, {
            'media.images': [hit.url],
            'media.sourceUrl': item.media?.sourceUrl || hit.page || '',
            'media.sourceTitle': item.media?.sourceTitle || 'Web photo (checked)',
            'media.matchedAt': new Date(),
          });
        }
        await StockItem.updateOne({ _id: item._id }, { $set: set });
        lastRun.results.unshift({ name: item.displayName, image: hit?.url || null });
        lastRun.results = lastRun.results.slice(0, 40);
      }
      logger.info(`Web photo finder: ${lastRun.found}/${lastRun.tried} lines got a photo`);
      if (!lastRun.error) await findExtras(retryBefore, limit * 3);
    } catch (err) {
      lastRun.error = err.message;
      logger.error(`Web photo finder failed: ${err.message}`);
    } finally {
      lastRun.finishedAt = new Date();
      running = null;
    }
    return { ...lastRun };
  })();
  return running;
}

async function webImagesStatus() {
  const missing = await StockItem.countDocuments({ isArchived: false, zohoHasImage: { $ne: true }, 'media.images.0': { $exists: false } });
  const [noVideo, noBrochure] = await Promise.all([
    StockItem.countDocuments({ isArchived: false, 'media.videos.0': { $exists: false } }),
    StockItem.countDocuments({ isArchived: false, 'media.brochures.0': { $exists: false } }),
  ]);
  return { ...lastRun, running: Boolean(running), missing, noVideo, noBrochure };
}

module.exports = { findWebImages, webImagesStatus, pageImage, pageExtras };
