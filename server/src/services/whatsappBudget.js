const WhatsAppUsage = require('../models/WhatsAppUsage');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Hard limits on WhatsApp sends. Every message Anantya delivers is billed (Meta's
 * per-message charge), so each send must first take a slot here: under the daily
 * and monthly limits, and under the per-number daily limit so no one customer is
 * messaged over and over. A failed send gives its slot back - it isn't billed.
 */

const indiaDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

async function monthCount(day) {
  const [row] = await WhatsAppUsage.aggregate([
    { $match: { day: { $regex: `^${day.slice(0, 7)}` } } },
    { $group: { _id: null, n: { $sum: '$count' } } },
  ]);
  return row?.n || 0;
}

/** Takes a slot for one message to `number`; false (and logged) when a limit is reached. */
async function reserve(number, context) {
  const { dailyLimit, monthlyLimit, perNumberDailyLimit } = env.anantya.limits;
  const day = indiaDay();
  await WhatsAppUsage.updateOne({ day }, { $setOnInsert: { day } }, { upsert: true }).catch((err) => {
    if (err.code !== 11000) throw err; // created by a send running alongside
  });
  let reason = '';
  if ((await monthCount(day)) >= monthlyLimit) {
    reason = `monthly limit of ${monthlyLimit}`;
  } else {
    // Atomic: only counts the message while the day and the number are both under their limits.
    const taken = await WhatsAppUsage.findOneAndUpdate(
      {
        day,
        count: { $lt: dailyLimit },
        $or: [{ [`perNumber.${number}`]: { $exists: false } }, { [`perNumber.${number}`]: { $lt: perNumberDailyLimit } }],
      },
      { $inc: { count: 1, [`perNumber.${number}`]: 1 } }
    );
    if (taken) return true;
    const today = await WhatsAppUsage.findOne({ day }).lean();
    reason = today.count >= dailyLimit ? `daily limit of ${dailyLimit}` : `limit of ${perNumberDailyLimit} a day to this number`;
  }
  await WhatsAppUsage.updateOne({ day }, { $inc: { blocked: 1 } });
  logger.warn(`${context}: WhatsApp to ${number} not sent - ${reason} reached`);
  return false;
}

/** Gives back the slot of a message that didn't go out. */
async function release(number) {
  await WhatsAppUsage.updateOne({ day: indiaDay() }, { $inc: { count: -1, [`perNumber.${number}`]: -1 } }).catch(() => {});
}

/** Today's and this month's counts against their limits - for the status screen. */
async function usage() {
  const day = indiaDay();
  const today = await WhatsAppUsage.findOne({ day }).lean();
  return {
    today: today?.count || 0,
    blockedToday: today?.blocked || 0,
    thisMonth: await monthCount(day),
    limits: env.anantya.limits,
  };
}

module.exports = { reserve, release, usage };
