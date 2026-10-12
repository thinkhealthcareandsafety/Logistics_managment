const axios = require('axios');
const StockItem = require('../models/StockItem');
const logger = require('../config/logger');

/**
 * Product photos, videos and brochures for stock lines, taken from the company's own
 * store, buyaedindia.com (a Wix site). Wix publishes every product in a sitemap with
 * its photos; each product page carries the brochure PDFs and YouTube videos. Products
 * are matched to stock lines by name - model numbers (M3857A, 8900-0801-01…) count
 * double, because "Philips pads" alone would match half the catalogue.
 */

const SITE = 'https://www.buyaedindia.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (ThinkHealth Logistics media sync)' };
const MIN_SCORE = 0.55;

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an', 'in', 'to', 'by', 'standard', 'pack', 'set', 'new', 'n', 'pcs', 'piece', 'pieces']);
// "pads"/"padz"/"pad" are one word; so are "batteries"/"battery".
const stem = (t) => t.replace(/ies$/, 'y').replace(/(?<=[a-z]{3})[sz]$/, '');
function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[®™]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}
const isModel = (t) => (/\d/.test(t) && /[a-z]/.test(t)) || /^\d{4,}$/.test(t);

/** Adds joined neighbours ("smart"+"pad" -> "smartpad") so "SmartPads" meets "Smart Pads". */
function withCompounds(list) {
  const out = new Set(list);
  for (let i = 0; i < list.length - 1; i += 1) out.add(stem(list[i] + list[i + 1]));
  return out;
}

/**
 * How alike two product names are (0-1): half "how much of the shorter name is
 * covered", half overall overlap. Model numbers weigh double.
 */
function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length || !B.length) return 0;
  const Aset = new Set(A);
  const Bset = new Set(B);
  const Ab = withCompounds(A);
  const Bb = withCompounds(B);
  const weight = (t) => (isModel(t) ? 2 : 1);
  const sum = (set) => [...set].reduce((n, t) => n + weight(t), 0);
  let shared = 0;
  for (const t of Aset) if (Bb.has(t)) shared += weight(t);
  let sharedB = 0;
  for (const t of Bset) if (Ab.has(t)) sharedB += weight(t);
  const covered = Math.max(shared / sum(Aset), sharedB / sum(Bset));
  const overall = (shared + sharedB) / (sum(Aset) + sum(Bset));
  return 0.5 * covered + 0.5 * overall;
}

/** A model number specific enough to identify a product on its own (XBTAED001A, M3857A). */
const strongModel = (t) => t.length >= 5 && /\d/.test(t) && /[a-z]/.test(t);

/**
 * Is this store product really this stock line? Yes when they share a specific model
 * number, or when most of the stock line's own words appear in the product's name.
 * Long catalogue part numbers (8+ digits) that stores rarely print don't count
 * against a match.
 */
// Words that make a line an accessory of a device ("Battery for AED7000" is not the AED7000).
const VARIANT = new Set(['adult', 'baby', 'infant', 'child', 'pediatric', 'paediatric', 'female', 'junior']);
const ACCESSORY = new Set(['battery', 'pad', 'smartpad', 'case', 'bag', 'cabinet', 'bracket', 'skin', 'lung', 'airway', 'charger', 'signage', 'trainer', 'cable', 'cartridge', 'filter', 'license', 'mouthpiece', 'stand', 'mount']);

function isSameProduct(itemName, productTitle) {
  const item = tokens(itemName);
  const prod = withCompounds(tokens(productTitle));
  // An accessory only matches a product that is that accessory too.
  if (item.some((t) => ACCESSORY.has(t) && !prod.has(t))) return false;
  // Same for the version: a baby manikin is not the adult one.
  if (item.some((t) => VARIANT.has(t) && !prod.has(t))) return false;
  if (item.some((t) => strongModel(t) && prod.has(t))) return true;
  const weight = (t) => (isModel(t) ? 2 : 1);
  let total = 0;
  let shared = 0;
  for (const t of new Set(item)) {
    const hit = prod.has(t);
    if (!hit && /^\d+$/.test(t)) continue; // part numbers stores rarely print
    total += weight(t);
    if (hit) shared += weight(t);
  }
  return total > 0 && shared / total >= 0.75 && similarity(itemName, productTitle) >= 0.6;
}

async function get(url, opts = {}) {
  const { data } = await axios.get(url, { headers: UA, timeout: 30000, ...opts });
  return data;
}

/** Every product in the store's sitemap: page URL and its photos. */
async function listProducts() {
  const xml = await get(`${SITE}/store-products-sitemap.xml`, { responseType: 'text' });
  const products = [];
  for (const block of String(xml).split('<url>').slice(1)) {
    const url = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!url || !url.includes('/product/')) continue;
    const images = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const imageTitle = (block.match(/<image:title>(?:<!\[CDATA\[)?([^<\]]+)/) || [])[1] || '';
    products.push({ url, images, title: imageTitle });
  }
  return products;
}

const youtubeId = (u) => (u.match(/(?:youtube\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/) || [])[1];

/** A product page's real title, brochure PDFs and YouTube videos. */
async function readProductPage(product) {
  const html = String(await get(product.url, { responseType: 'text' }));
  const title =
    (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] ||
    (html.match(/<title>([^<]+)<\/title>/) || [])[1] ||
    product.title;
  const pdfs = [...new Set((html.match(/https?:\/\/[^"'\\\s<>]+\.pdf/gi) || []).map((u) => u.replace(/\\u002F/g, '/')))];
  const videoIds = [...new Set((html.match(/(?:youtube\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/g) || []).map(youtubeId).filter(Boolean))];
  return {
    ...product,
    title: title.replace(/\s*\|\s*.*$/, '').replace(/&amp;/g, '&').trim(),
    brochures: pdfs.slice(0, 5).map((url, i) => ({ url, title: pdfs.length > 1 ? `Brochure ${i + 1}` : 'Brochure' })),
    videos: videoIds.slice(0, 5).map((id) => `https://www.youtube.com/watch?v=${id}`),
  };
}

async function inBatches(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(...(await Promise.all(list.slice(i, i + size).map((x) => fn(x).catch(() => null)))));
  }
  return out.filter(Boolean);
}

let running = null;
let lastRun = { at: null, products: 0, matched: 0, error: '' };

/**
 * Reads the whole store and attaches the best-matching product's media to every stock
 * line (only when the match is confident). Lines with no match keep whatever they had.
 */
async function syncProductMedia({ dryRun = false } = {}) {
  if (running) return running;
  running = (async () => {
    try {
      if (dryRun) lastRun.preview = [];
      const products = await inBatches(await listProducts(), 4, readProductPage);
      const items = await StockItem.find({ isArchived: false });
      let matched = 0;
      for (const item of items) {
        const name = item.size ? `${item.name} ${item.size}` : item.name;
        let best = null;
        let bestScore = 0;
        for (const p of products) {
          const score = Math.max(similarity(name, p.title), similarity(item.zohoItemName || '', p.title));
          if (score > bestScore) {
            best = p;
            bestScore = score;
          }
        }
        const itemName = [name, item.zohoItemName].find((n) => n && isSameProduct(n, best?.title || ''));
        if (!best || bestScore < MIN_SCORE || !itemName) continue;
        if (dryRun) {
          matched += 1;
          (lastRun.preview ||= []).push({ item: name, product: best.title, score: Number(bestScore.toFixed(2)), images: best.images.length, videos: best.videos.length, brochures: best.brochures.length });
          continue;
        }
        item.media = {
          images: best.images.slice(0, 8),
          videos: best.videos,
          brochures: best.brochures,
          sourceUrl: best.url,
          sourceTitle: best.title,
          matchedAt: new Date(),
        };
        await item.save();
        matched += 1;
      }
      lastRun = { at: new Date(), products: products.length, matched, error: '', preview: dryRun ? lastRun.preview : undefined };
      logger.info(`Product media: ${products.length} store products, ${matched} stock lines matched`);
      return lastRun;
    } catch (err) {
      lastRun = { ...lastRun, at: new Date(), error: err.message };
      logger.warn(`Product media sync failed: ${err.message}`);
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

const mediaStatus = () => ({ ...lastRun, running: Boolean(running) });

module.exports = { syncProductMedia, mediaStatus, similarity, isSameProduct };
