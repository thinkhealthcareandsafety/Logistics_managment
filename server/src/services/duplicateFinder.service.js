const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const StockItem = require('../models/StockItem');

/**
 * Finds stock lines that are the same product entered more than once under different
 * names ("Shackle Jacket Padlock Asian Regular" / "... Regular Asian"). Plain text
 * similarity can't tell a duplicate from a variant (5 cm vs 7.5 cm bandage, green vs
 * orange jacket), so Gemini reads the whole list and groups only true duplicates.
 * It suggests; merging stays a separate, reversible step.
 */

const MODELS = [env.gemini.model, 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest'].filter(Boolean);

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    groups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          ids: { type: 'ARRAY', items: { type: 'STRING' } },
          keepName: { type: 'STRING' },
          reason: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'medium'] },
        },
        required: ['ids', 'keepName', 'reason', 'confidence'],
      },
    },
  },
  required: ['groups'],
};

const PROMPT = `You are cleaning the stock list of an Indian medical & safety equipment supplier. Each line is "id | name".
Group lines that are THE SAME PHYSICAL PRODUCT entered more than once under different names - different word order, spelling, abbreviations, extra words like "Standard" or "Empty", or a part number added/removed.
NEVER group variants: different sizes or dimensions (5cm vs 7.5cm, 1M x 1M vs 2M x 2M, 30 L vs 120 L), different colours, different models or model numbers, adult vs infant/child/baby, a device vs its accessory, a full kit vs the empty bag, different pack sizes.
Only include groups of 2 or more. keepName: the clearest of the existing names. confidence "high" only when you are sure they are the same product; otherwise "medium". If there are no duplicates, return an empty list.`;

async function findDuplicates() {
  if (!env.gemini.apiKey) throw new ApiError(503, 'Finding duplicates needs GEMINI_API_KEY on the server');
  const items = await StockItem.find({ isArchived: false }).select('name size zohoItemId').lean();
  const list = items.map((i) => `${i._id} | ${i.size ? `${i.name} ${i.size}` : i.name}`).join('\n');
  const body = {
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: list }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  };
  let data;
  let lastErr;
  for (const model of [...new Set(MODELS)]) {
    try {
      ({ data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, body, {
        headers: { 'x-goog-api-key': env.gemini.apiKey },
        timeout: 120000,
      }));
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!data) throw new ApiError(502, `Duplicate check unavailable (${lastErr?.response?.data?.error?.message || lastErr?.message})`);
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'The duplicate check returned an unreadable answer - try again');
  }
  const byId = new Map(items.map((i) => [String(i._id), i]));
  return (parsed.groups || [])
    .map((g) => ({ ...g, ids: [...new Set(g.ids.filter((id) => byId.has(id)))] }))
    .filter((g) => g.ids.length >= 2)
    .map((g) => ({ ...g, names: g.ids.map((id) => (byId.get(id).size ? `${byId.get(id).name} ${byId.get(id).size}` : byId.get(id).name)) }));
}

/**
 * Merges lines into one: the line keeping the name absorbs the others' Zoho items as
 * aliases (stock = total of all), the others are archived. Reversible with unmerge.
 */
async function mergeLines(keepId, otherIds) {
  const keep = await StockItem.findOne({ _id: keepId, isArchived: false });
  if (!keep) throw new ApiError(404, 'Stock item not found');
  const others = await StockItem.find({ _id: { $in: otherIds, $ne: keepId }, isArchived: false });
  if (!others.length) throw new ApiError(400, 'Pick at least one other line to merge');
  for (const o of others) {
    for (const id of [o.zohoItemId, ...(o.zohoAliases || []).map((a) => a.zohoItemId)].filter(Boolean)) {
      if (id !== keep.zohoItemId && !keep.zohoAliases.some((a) => a.zohoItemId === id)) {
        keep.zohoAliases.push({ zohoItemId: id, name: id === o.zohoItemId ? o.zohoItemName || o.name : (o.zohoAliases.find((a) => a.zohoItemId === id) || {}).name || '' });
      }
    }
    // Manual (non-Zoho) lines: their count simply adds on.
    if (!o.zohoItemId) keep.quantity += o.quantity;
    o.isArchived = true;
    o.archivedReason = 'merged';
    o.productCode = '';
    await o.save();
  }
  keep.markModified('zohoAliases');
  await keep.save();
  return keep;
}

/** Undoes one merge: the alias leaves the line and its old line comes back. */
async function unmergeAlias(lineId, zohoItemId) {
  const line = await StockItem.findOne({ _id: lineId, isArchived: false });
  if (!line) throw new ApiError(404, 'Stock item not found');
  line.zohoAliases = line.zohoAliases.filter((a) => a.zohoItemId !== zohoItemId);
  line.markModified('zohoAliases');
  await line.save();
  const back = await StockItem.findOne({ zohoItemId, isArchived: true, archivedReason: 'merged' });
  if (back) {
    back.isArchived = false;
    back.archivedReason = '';
    await back.save();
  }
  return line;
}

module.exports = { findDuplicates, mergeLines, unmergeAlias };
