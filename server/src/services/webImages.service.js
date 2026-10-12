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
          text: `Is this an accurate product photo of "${name}" - the same kind of product, and the same brand/model if one is named?
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
  const name = item.size ? `${item.name} ${item.size}` : item.name;
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

/** Searches up to `limit` lines with no photo. One run at a time; returns that run's promise. */
function findWebImages({ limit = 150 } = {}) {
  if (!env.gemini.apiKey) throw new ApiError(503, 'Finding photos needs GEMINI_API_KEY on the server');
  if (running) return running;
  running = (async () => {
    Object.assign(lastRun, { startedAt: new Date(), finishedAt: null, tried: 0, found: 0, error: null, results: [] });
    try {
      const retryBefore = new Date(Date.now() - RETRY_AFTER_DAYS * 864e5);
      const items = await StockItem.find({
        isArchived: false,
        zohoHasImage: { $ne: true },
        'media.images.0': { $exists: false },
        $or: [{ 'media.webSearchedAt': null }, { 'media.webSearchedAt': { $lt: retryBefore } }],
      }).limit(limit);
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
  return { ...lastRun, running: Boolean(running), missing };
}

module.exports = { findWebImages, webImagesStatus, pageImage };
