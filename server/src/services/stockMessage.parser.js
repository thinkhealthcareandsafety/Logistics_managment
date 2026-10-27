/**
 * Reads a stock message as the logistics team posts it in WhatsApp - pasted as is -
 * into categories and lines:
 *
 *   *AED PADS: 185*                    <- category (bold, or the first line of a block);
 *   1.Hs1 Pads: 50                        its total is checked, not stored
 *   4.G5 pad- (16) 28-11-2028\28-01-2029  <- quantity 16, two expiry dates
 *   8.Zoll Stat-D-Pad - (8) (20-09-2031)
 *   HS1 - 53 (3 without pad)              <- note
 *   Philips Batteries - 48 (8 old + 40 new)   or   (8) +40 =48   <- old / new
 *   Hs1 child Pad-0
 *
 * The quantity is the number in brackets, or after ":" / "-", or a number at the end -
 * never a model number inside the name (XFT120, DDP100, Zoll AED 3). Lines it can't
 * read are returned as `skipped`, so the person sees them before anything is saved.
 */

const DATE = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
// Unit words, not part of a name. ("SET", "Box" can be part of a product's name - kept.)
const UNITS = /\b(q|qty|pcs?|nos?|units?|packets?|pkts?)\b\.?/gi;

/** "28-11-2028" -> "2028-11-28"; null when it isn't a real date. */
function isoDate(d, m, y) {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const clean = (s) =>
  String(s || '')
    .replace(/[*_~]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Strips WhatsApp's copy prefix: "[27/10, 10:15 am] Pranjal: ..." */
const stripChatPrefix = (line) => line.replace(/^\s*\[[^\]]{4,40}\]\s*[^:]{1,40}:\s*/, '');

/** Reads one item line. null when no quantity can be found. */
function parseItem(raw) {
  let line = clean(raw).replace(/^(\d{1,3}|[A-Za-z])\s*[.)]\s*/, ''); // "1.", "2)", "A."
  if (!line) return null;

  // Expiry dates anywhere on the line.
  const expiryDates = [];
  line = line.replace(DATE, (all, d, m, y) => {
    const iso = isoDate(d, m, y);
    if (iso) expiryDates.push(iso);
    return iso ? ' ' : all;
  });
  line = line.replace(/[\\]/g, ' ').replace(/\(\s*\)/g, ' ');

  // Old + new: "(8 old + 40 new)", or "(8) +40 =48".
  let oldQuantity = null;
  const oldNew = line.match(/\(?\s*(\d+)\s*old\s*\+\s*(\d+)\s*new\s*\)?/i);
  if (oldNew) {
    oldQuantity = Number(oldNew[1]);
    line = line.replace(oldNew[0], ' ');
  }
  const plusSum = line.match(/\(\s*(\d+)\s*\)\s*\+\s*(\d+)\s*=\s*(\d+)/);
  if (plusSum) {
    oldQuantity = Number(plusSum[1]);
    line = line.replace(plusSum[0], ` (${plusSum[3]}) `);
  }

  // The quantity: in brackets, or after ":" / "-" / "–", or a number at the very end.
  const qtyPatterns = [/\(\s*(\d{1,6})\s*\)/, /[:\-–=]\s*\(?\s*(\d{1,6})\s*\)?(?![\w])/, /\s(\d{1,6})\s*$/];
  let match = null;
  for (const re of qtyPatterns) {
    match = line.match(re);
    if (match) break;
  }
  if (!match) return null;
  const quantity = Number(match[1]);
  const at = line.indexOf(match[0]);
  let name = line.slice(0, at);
  let rest = line.slice(at + match[0].length);

  name = clean(name.replace(UNITS, ' ').replace(/[:\-–=(]+\s*$/, ''));
  // Anything left - "(3 without pad)", "Used for training" - is a note.
  const note = clean(rest.replace(/[()]/g, ' ').replace(UNITS, ' ').replace(/^[-:,]+/, ''));
  if (!name || name.length > 120) return null;
  if (oldQuantity != null && oldQuantity > quantity) oldQuantity = quantity;
  return { name, quantity, oldQuantity, expiryDates, note: note.slice(0, 200) };
}

/** A category line: "AED PADS: 185", "*AED Trainer : 14*", "Training Pads (2)" -> name + stated total. */
function parseHeader(raw) {
  const line = clean(raw).replace(/^(\d{1,3})\s*[.)]\s*/, '');
  const m = line.match(/^(.*?)[\s:\-–]*\(?\s*(\d{1,6})?\s*\)?\s*$/);
  const name = clean((m ? m[1] : line).replace(/[:\-–]+$/, ''));
  const total = m && m[2] != null ? Number(m[2]) : null;
  return name ? { name: name.slice(0, 80), total } : null;
}

const SKIP_BLOCK = /^(stock (out|in)|stock available|stock update|updated stock)\b/i;

/**
 * The whole message -> { categories: [{ name, statedTotal, items: [...] }], skipped: [lines] }.
 * Blank lines separate categories; a bold (*...*) line always starts one.
 */
function parseStockMessage(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(stripChatPrefix);
  const categories = [];
  const skipped = [];
  let current = null;
  let atBlockStart = true;
  let skippingBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = clean(raw);
    if (!line) {
      atBlockStart = true;
      skippingBlock = false;
      continue;
    }
    // "STOCK AVAILABLE 28/09 12:55 PM" and the Stock out / Stock in lists aren't stock lines.
    if (SKIP_BLOCK.test(line)) {
      skippingBlock = /^stock (out|in)\b/i.test(line);
      atBlockStart = false;
      continue;
    }
    if (skippingBlock) continue;

    const bold = /^\s*\*[^*]+\*\s*$/.test(raw);
    const nextLine = clean(lines[i + 1] || '');
    if (bold || (atBlockStart && nextLine)) {
      const header = parseHeader(raw);
      if (header) {
        current = { name: header.name, statedTotal: header.total, items: [] };
        categories.push(current);
        atBlockStart = false;
        continue;
      }
    }
    atBlockStart = false;
    const item = parseItem(raw);
    if (!item) {
      skipped.push(line);
      continue;
    }
    if (!current) {
      current = { name: 'Other', statedTotal: null, items: [] };
      categories.push(current);
    }
    if (/^\s*\d{1,3}\s*[.)]/.test(clean(raw))) current.numberedLines = (current.numberedLines || 0) + 1;
    current.items.push(item);
  }

  const result = categories.filter((c) => c.items.length);
  for (const c of result) {
    c.total = c.items.reduce((n, i) => n + i.quantity, 0);
    c.totalMismatch = c.statedTotal != null && c.statedTotal !== c.total;
    c.numbered = (c.numberedLines || 0) * 2 > c.items.length;
  }
  return { categories: result, skipped };
}

module.exports = { parseStockMessage, parseItem, parseHeader };
