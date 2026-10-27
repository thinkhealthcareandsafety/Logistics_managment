const ApiError = require('../utils/ApiError');
const { parseStockMessage } = require('./stockMessage.parser');
const { Category, Item, Movement } = require('../models/ManualStock');
const { manualLedger } = require('./stock.service');

/**
 * "Paste from WhatsApp" for the manual stock: the team's stock message in, the sheet
 * updated - matching lines get the new quantity (recorded as a count, with the
 * person's name), new lines and categories are added, and lines the message doesn't
 * mention are left alone. Preview first, then apply the very same plan.
 */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nameOf = (i) => (i.size ? `${i.name} ${i.size}` : i.name);

async function plan(text) {
  const parsed = parseStockMessage(text);
  if (!parsed.categories.length) throw new ApiError(400, 'Couldn’t find any stock lines in that text - paste the stock message as it is in WhatsApp');
  const [categories, items] = await Promise.all([Category.find().lean(), Item.find({ isArchived: false }).lean()]);
  const rows = [];
  for (const c of parsed.categories) {
    const existingCat = categories.find((x) => norm(x.name) === norm(c.name));
    const inCat = existingCat ? items.filter((i) => String(i.categoryId) === String(existingCat._id)) : [];
    const seen = new Map();
    for (const p of c.items) {
      // The same name twice in one category ("XFT120 - 2", "XFT120 - 1 used for training")
      // stays two lines: the second keeps its note in its name.
      let name = p.name;
      const key = norm(name);
      if (seen.has(key)) name = p.note ? `${p.name} (${p.note})` : `${p.name} ${seen.get(key) + 1}`;
      seen.set(key, (seen.get(key) || 0) + 1);

      const match = inCat.find((i) => norm(nameOf(i)) === norm(name));
      const action = !match
        ? 'new'
        : match.quantity === p.quantity && (p.oldQuantity == null || p.oldQuantity === match.oldQuantity)
          ? 'same'
          : 'update';
      rows.push({
        category: existingCat ? existingCat.name : c.name,
        categoryId: existingCat ? String(existingCat._id) : null,
        numbered: c.numbered,
        name,
        quantity: p.quantity,
        oldQuantity: p.oldQuantity,
        expiryDates: p.expiryDates,
        note: name === p.name ? p.note : '',
        action,
        itemId: match ? String(match._id) : null,
        current: match ? { quantity: match.quantity, oldQuantity: match.oldQuantity } : null,
      });
    }
  }
  return {
    rows,
    categories: parsed.categories.map((c) => ({
      name: c.name,
      exists: categories.some((x) => norm(x.name) === norm(c.name)),
      lines: c.items.length,
      total: c.total,
      statedTotal: c.statedTotal,
      totalMismatch: c.totalMismatch,
    })),
    skipped: parsed.skipped,
    untouched: items.filter((i) => !rows.some((r) => r.itemId === String(i._id))).length,
  };
}

async function previewImport(text) {
  const p = await plan(text);
  return {
    ...p,
    summary: {
      newCategories: p.categories.filter((c) => !c.exists).length,
      newItems: p.rows.filter((r) => r.action === 'new').length,
      updates: p.rows.filter((r) => r.action === 'update').length,
      unchanged: p.rows.filter((r) => r.action === 'same').length,
    },
  };
}

async function applyImport(text, { userId, actor = '', userName = '' }) {
  const p = await plan(text);
  const who = actor || userName;
  const note = 'From a pasted WhatsApp message';

  // Categories first, in the message's order, after the existing ones.
  const last = await Category.findOne().sort({ sortOrder: -1 }).lean();
  let order = (last?.sortOrder ?? -1) + 1;
  const catIds = new Map();
  for (const r of p.rows) {
    if (r.categoryId || catIds.has(norm(r.category))) continue;
    const cat = await Category.create({ name: r.category, listStyle: r.numbered ? 'numbers' : 'plain', sortOrder: order++ });
    catIds.set(norm(r.category), String(cat._id));
  }

  // Quantity changes on existing lines: one count, so each is logged with who did it.
  const changes = p.rows
    .filter((r) => r.action === 'update')
    .map((r) => {
      const split = r.current.oldQuantity != null;
      const oldQuantity = r.oldQuantity != null ? r.oldQuantity : split ? Math.min(r.current.oldQuantity, r.quantity) : null;
      return { itemId: r.itemId, quantity: r.quantity, oldQuantity };
    });
  if (changes.length) await manualLedger.applyCount({ changes, note, userId, actor: who });

  // Expiry dates and notes the message gives, on lines that already existed.
  for (const r of p.rows.filter((x) => x.itemId && (x.expiryDates.length || x.note))) {
    const set = {};
    if (r.expiryDates.length) set.expiryDates = r.expiryDates.map((d) => new Date(`${d}T00:00:00.000Z`));
    if (r.note) set.note = r.note;
    await Item.updateOne({ _id: r.itemId }, { $set: set });
  }

  // New lines: what's on the shelf when it's posted counts as old stock (as everywhere).
  let created = 0;
  for (const r of p.rows.filter((x) => x.action === 'new')) {
    const categoryId = r.categoryId || catIds.get(norm(r.category));
    const lastItem = await Item.findOne({ categoryId }).sort({ sortOrder: -1 }).lean();
    const oldQuantity = r.oldQuantity != null ? r.oldQuantity : r.quantity;
    const item = await Item.create({
      categoryId,
      name: r.name.slice(0, 120),
      quantity: r.quantity,
      oldQuantity,
      note: r.note || '',
      expiryDates: r.expiryDates.map((d) => new Date(`${d}T00:00:00.000Z`)),
      sortOrder: (lastItem?.sortOrder ?? -1) + 1,
    });
    await Movement.create({
      itemId: item._id,
      itemName: r.name,
      change: r.quantity,
      quantityAfter: r.quantity,
      oldChange: oldQuantity,
      newChange: r.quantity - oldQuantity,
      reason: 'created',
      note,
      userId,
      userName: who,
    });
    created += 1;
  }

  return { categoriesCreated: catIds.size, itemsCreated: created, itemsUpdated: changes.length, unchanged: p.rows.filter((r) => r.action === 'same').length, untouched: p.untouched };
}

module.exports = { previewImport, applyImport };
