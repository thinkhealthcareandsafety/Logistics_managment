// Seeds a demo user + shipments with realistic checkpoint histories directly into
// MongoDB, bypassing TrackingMore entirely. Lets the dashboard, timeline, sockets
// and notification UI be exercised end-to-end without a live TrackingMore API key.
// Mostly Shree Maruti Courier (the default), with one Blue Dart and one Delhivery
// shipment so the multi-courier views have something to compare.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const logger = require('../config/logger');
const User = require('../models/User');
const Shipment = require('../models/Shipment');
const Notification = require('../models/Notification');
const Feedback = require('../models/Feedback');
const StockCategory = require('../models/StockCategory');
const StockItem = require('../models/StockItem');
const StockMovement = require('../models/StockMovement');
const StockSettings = require('../models/StockSettings');
const { STOCK_SNAPSHOT, STOCK_OUT_28_09 } = require('./stockSnapshot');
const { DEFAULT_CARRIER_CODE, DEFAULT_CARRIER_NAME } = require('../config/carrier');

const DEMO_EMAIL = 'demo@thinkhealth.in';

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

/**
 * Demo weight, freight, delivery address and courier route for the five active demo
 * shipments - invented, like the shipments themselves. The route mirrors what
 * TrackingMore returns for a real Shree Maruti AWB (city + state only).
 */
const DEMO_LOGISTICS = {
  50212345678: {
    weightKg: 6.5,
    freightAmount: 420,
    deliveryAddress: { line: '12, Residency Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' },
    route: ['Mumbai', 'Maharashtra', 'Bengaluru', 'Karnataka'],
  },
  SM9988776655: {
    weightKg: 4.2,
    freightAmount: 310,
    deliveryAddress: { line: 'Okhla Road, Sukhdev Vihar', city: 'South Delhi', state: 'Delhi', pincode: '110025' },
    route: ['Chennai', 'Tamil Nadu', 'Delhi', 'Delhi'],
  },
  SM5544332211: {
    weightKg: 1.8,
    freightAmount: 260,
    deliveryAddress: { line: 'Sector 44', city: 'Gurgaon', state: 'Haryana', pincode: '122003' },
    route: ['Ahmedabad', 'Gujarat', 'Gurgaon', 'Haryana'],
  },
  1490810012345: {
    weightKg: 32,
    freightAmount: 980,
    deliveryAddress: { line: 'FC Road, Shivajinagar', city: 'Pune', state: 'Maharashtra', pincode: '411005' },
    route: ['Mumbai', 'Maharashtra', 'Pune', 'Maharashtra'],
  },
  SM7766554433: {
    weightKg: 9.5,
    freightAmount: 540,
    deliveryAddress: { line: 'Sitabuldi Main Road', city: 'Nagpur', state: 'Maharashtra', pincode: '440012' },
    route: ['Surat', 'Gujarat', 'Nagpur', 'Maharashtra'],
  },
};

/** States for the archived demo shipments' cities (they only carry a city). */
const CITY_STATE = {
  Pune: 'Maharashtra',
  Hyderabad: 'Telangana',
  Ahmedabad: 'Gujarat',
  Jaipur: 'Rajasthan',
  Kochi: 'Kerala',
  Nagpur: 'Maharashtra',
};

function demoLogistics(awb) {
  const d = DEMO_LOGISTICS[awb];
  const [originCity, originState, destinationCity, destinationState] = d.route;
  return {
    weightKg: d.weightKg,
    freightAmount: d.freightAmount,
    deliveryAddress: d.deliveryAddress,
    carrierRoute: { originCity, originState, destinationCity, destinationState, fetchedAt: new Date() },
  };
}

function daysFromNow(d) {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

/** Writes the demo data into an already-connected database. */
async function seedData() {
  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    const passwordHash = await bcrypt.hash('Demo@12345', 12);
    user = await User.create({
      name: 'Demo Ops Manager',
      email: DEMO_EMAIL,
      passwordHash,
      company: 'ThinkHealth',
    });
    logger.info(`Created demo user: ${DEMO_EMAIL} / Demo@12345`);
  }

  await Shipment.deleteMany({ createdBy: user._id });
  await Notification.deleteMany({ userId: user._id });
  await Feedback.deleteMany({ ownerId: user._id });

  const shipments = [
    {
      trackingNumber: '50212345678',
      carrierCode: 'bluedart',
      carrierName: 'Bluedart',
      productDetails: { name: 'N95 Respirator Masks (Box of 50)', sku: 'PPE-N95-050', quantity: 20, category: 'PPE' },
      customerInfo: { name: 'Apollo Diagnostics', email: 'procurement@apollodx.example', phone: '+91 98765 43210' },
      ...demoLogistics('50212345678'),
      shippingDate: hoursAgo(48),
      estimatedDelivery: daysFromNow(1),
      status: 'out_for_delivery',
      currentLocation: 'Bengaluru Hub',
      lastCheckedAt: hoursAgo(0.5),
      checkpoints: [
        { status: 'pending', statusRaw: 'info_received', location: 'Mumbai Warehouse', description: 'Shipment information received', checkpointTime: hoursAgo(46), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Mumbai Sorting Facility', description: 'Shipment picked up', checkpointTime: hoursAgo(40), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Pune Transit Hub', description: 'Arrived at transit hub', checkpointTime: hoursAgo(24), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Bengaluru Hub', description: 'Arrived at destination hub', checkpointTime: hoursAgo(6), source: 'trackingmore' },
        { status: 'out_for_delivery', statusRaw: 'transit', location: 'Bengaluru Hub', description: 'Out for delivery', checkpointTime: hoursAgo(0.5), source: 'trackingmore' },
      ],
    },
    {
      trackingNumber: 'SM9988776655',
      carrierCode: DEFAULT_CARRIER_CODE,
      carrierName: DEFAULT_CARRIER_NAME,
      productDetails: { name: 'Surgical Gloves (Case)', sku: 'PPE-GLV-CASE', quantity: 10, category: 'PPE' },
      customerInfo: { name: 'Fortis Hospital', email: 'stores@fortis.example', phone: '+91 98111 22334' },
      ...demoLogistics('SM9988776655'),
      shippingDate: hoursAgo(96),
      estimatedDelivery: hoursAgo(2),
      status: 'delivered',
      currentLocation: 'New Delhi',
      lastCheckedAt: hoursAgo(2),
      checkpoints: [
        { status: 'pending', statusRaw: 'inforeceived', location: 'Chennai Warehouse', description: 'Shipment information received', checkpointTime: hoursAgo(90), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Chennai Airport', description: 'Departed facility', checkpointTime: hoursAgo(80), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'New Delhi Airport', description: 'Arrived at facility', checkpointTime: hoursAgo(10), source: 'trackingmore' },
        { status: 'out_for_delivery', statusRaw: 'transit', location: 'New Delhi', description: 'Out for delivery', checkpointTime: hoursAgo(4), source: 'trackingmore' },
        { status: 'delivered', statusRaw: 'delivered', location: 'New Delhi', description: 'Delivered - signed by receptionist', checkpointTime: hoursAgo(2), source: 'trackingmore' },
      ],
    },
    {
      trackingNumber: 'SM5544332211',
      carrierCode: DEFAULT_CARRIER_CODE,
      carrierName: DEFAULT_CARRIER_NAME,
      productDetails: { name: 'Digital Thermometers (Carton)', sku: 'DX-THERM-100', quantity: 5, category: 'Diagnostics' },
      customerInfo: { name: 'Max Healthcare', email: 'logistics@maxhealthcare.example', phone: '+91 99887 66554' },
      ...demoLogistics('SM5544332211'),
      shippingDate: hoursAgo(20),
      estimatedDelivery: daysFromNow(2),
      status: 'exception',
      currentLocation: 'Customs - Delhi Air Cargo',
      lastCheckedAt: hoursAgo(1),
      checkpoints: [
        { status: 'pending', statusRaw: 'inforeceived', location: 'Ahmedabad Hub', description: 'Shipment information received', checkpointTime: hoursAgo(18), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Ahmedabad Airport', description: 'Departed origin facility', checkpointTime: hoursAgo(15), source: 'trackingmore' },
        { status: 'exception', statusRaw: 'exception', location: 'Delhi Air Cargo', description: 'Customs clearance delay - documentation under review', checkpointTime: hoursAgo(1), source: 'trackingmore' },
      ],
      exceptionFollowUp: {
        isBeingFollowedUp: false,
        notes: [],
      },
    },
    {
      trackingNumber: '1490810012345',
      carrierCode: 'delhivery',
      carrierName: 'Delhivery',
      productDetails: { name: 'Hand Sanitizer 5L (Pack)', sku: 'HYG-SAN-5L', quantity: 40, category: 'Hygiene' },
      customerInfo: { name: 'CityCare Pharmacy Chain', email: 'orders@citycare.example', phone: '+91 90000 12345' },
      ...demoLogistics('1490810012345'),
      shippingDate: hoursAgo(3),
      estimatedDelivery: daysFromNow(3),
      status: 'pending',
      currentLocation: 'Mumbai Warehouse',
      lastCheckedAt: hoursAgo(2.5),
      checkpoints: [
        { status: 'pending', statusRaw: 'pending', location: 'Mumbai Warehouse', description: 'Awaiting carrier pickup', checkpointTime: hoursAgo(2.5), source: 'trackingmore' },
      ],
    },
    {
      // Blew its promised ETA while still in transit - exercises the "late" triage path.
      trackingNumber: 'SM7766554433',
      carrierCode: DEFAULT_CARRIER_CODE,
      carrierName: DEFAULT_CARRIER_NAME,
      productDetails: { name: 'Nitrile Examination Gloves (Carton)', sku: 'PPE-NIT-200', quantity: 15, category: 'PPE' },
      customerInfo: { name: 'Sunrise Medical Stores', email: 'purchase@sunrisemed.example', phone: '+91 91234 56780' },
      ...demoLogistics('SM7766554433'),
      shippingDate: hoursAgo(120),
      estimatedDelivery: daysFromNow(-2),
      status: 'in_transit',
      currentLocation: 'Nagpur Transit Hub',
      lastCheckedAt: hoursAgo(9),
      checkpoints: [
        { status: 'pending', statusRaw: 'inforeceived', location: 'Surat Warehouse', description: 'Shipment information received', checkpointTime: hoursAgo(118), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Surat Sorting Facility', description: 'Shipment picked up', checkpointTime: hoursAgo(110), source: 'trackingmore' },
        { status: 'in_transit', statusRaw: 'transit', location: 'Nagpur Transit Hub', description: 'Held at transit hub - onward connection delayed', checkpointTime: hoursAgo(9), source: 'trackingmore' },
      ],
    },
  ];

  const created = await Shipment.insertMany(shipments.map((s) => ({ ...s, createdBy: user._id })));

  await Notification.create({
    userId: user._id,
    shipmentId: created[0]._id,
    status: 'out_for_delivery',
    message: `Shipment ${created[0].trackingNumber} is now Out for Delivery (Bengaluru Hub)`,
  });
  await Notification.create({
    userId: user._id,
    shipmentId: created[2]._id,
    status: 'exception',
    message: `Shipment ${created[2].trackingNumber} is now Exception (Customs - Delhi Air Cargo)`,
  });

  // DEMO DATA ONLY - invented customers and invented words, exactly like the shipments
  // above. They exist so the reviews marquee has something to move. Every name carries
  // a "(demo)" suffix that shows on the public page, because a seeded testimonial
  // presented as a real one is the precise thing the consent gate exists to prevent.
  // Delete these before the site goes live.
  //
  // These ride on completed consignments that are archived, so they fill the reviews
  // section and the analytics without burying the live triage queue.
  const REVIEWED = [
    {
      trackingNumber: 'SM4417720398',
      product: { name: 'Surgical Gloves (Case)', sku: 'PPE-GLV-CASE', quantity: 12, category: 'PPE' },
      customer: 'Greenleaf Pharmacy Chain (demo)',
      city: 'Pune',
      rating: 5,
      comment:
        'The tracking link meant our stores team stopped calling us for updates. We knew the consignment had landed before the ward did.',
      daysAgo: 6,
    },
    {
      trackingNumber: 'SM4417720412',
      product: { name: 'IV Cannula 20G (Box)', sku: 'CON-IVC-20G', quantity: 30, category: 'Consumables' },
      customer: 'Nova Diagnostics Lab (demo)',
      city: 'Hyderabad',
      rating: 5,
      comment:
        'We shifted three depots onto this in a week. The CSV import took the whole backlog in one go and everything was tracking by the afternoon.',
      daysAgo: 11,
    },
    {
      trackingNumber: 'SM4417720455',
      product: { name: 'Nitrile Gloves (M)', sku: 'GLV-NTR-M', quantity: 40, category: 'PPE' },
      customer: 'Riverbend Medical Stores (demo)',
      city: 'Ahmedabad',
      rating: 4,
      comment:
        'Delay alerts are the real win — we hear about a stuck parcel the morning it slips, not when the customer rings. Would like a weekly summary email.',
      daysAgo: 14,
    },
    {
      trackingNumber: 'SM4417720487',
      product: { name: 'Digital Thermometers (Carton)', sku: 'DX-THERM-100', quantity: 8, category: 'Diagnostics' },
      customer: 'Sunrise Hospital Supply (demo)',
      city: 'Jaipur',
      rating: 5,
      comment:
        'WhatsApp updates landed with the pharmacist directly. Our "where is my order" calls have basically stopped.',
      daysAgo: 19,
    },
    {
      trackingNumber: 'SM4417720501',
      product: { name: 'Cold Chain Vaccine Carrier', sku: 'CC-VAX-CARRIER', quantity: 4, category: 'Cold chain' },
      customer: 'Lakeside Clinic Group (demo)',
      city: 'Kochi',
      rating: 5,
      comment:
        'Cold-chain consignments are the ones we worry about. Seeing every scan in one place, in plain language, took a lot of anxiety out of the week.',
      daysAgo: 23,
    },
    {
      trackingNumber: 'SM4417720534',
      product: { name: 'Disposable Face Masks (Carton)', sku: 'PPE-MSK-CTN', quantity: 25, category: 'PPE' },
      customer: 'Ashoka Wholesale Pharma (demo)',
      city: 'Nagpur',
      rating: 4,
      comment:
        'Setup was an afternoon. The exception notes keep the follow-up history with the shipment instead of scattered across inboxes.',
      daysAgo: 28,
    },
  ];

  const reviewedShipments = await Shipment.insertMany(
    REVIEWED.map((r) => {
      const deliveredAt = hoursAgo(r.daysAgo * 24);
      return {
        trackingNumber: r.trackingNumber,
        carrierCode: DEFAULT_CARRIER_CODE,
        carrierName: DEFAULT_CARRIER_NAME,
        productDetails: r.product,
        customerInfo: {
          name: r.customer,
          email: `stores@${r.city.toLowerCase()}.example`,
          phone: '',
        },
        deliveryAddress: { city: r.city, state: CITY_STATE[r.city] || '' },
        shippingDate: hoursAgo((r.daysAgo + 3) * 24),
        estimatedDelivery: hoursAgo((r.daysAgo - 1) * 24),
        status: 'delivered',
        currentLocation: r.city,
        lastCheckedAt: deliveredAt,
        deliveryNoticeSentAt: deliveredAt,
        isArchived: true,
        createdBy: user._id,
        checkpoints: [
          { status: 'pending', statusRaw: 'inforeceived', location: 'Mumbai Warehouse', description: 'Shipment information received', checkpointTime: hoursAgo((r.daysAgo + 3) * 24), source: 'trackingmore' },
          { status: 'in_transit', statusRaw: 'transit', location: 'Mumbai Sorting Facility', description: 'Shipment picked up', checkpointTime: hoursAgo((r.daysAgo + 2) * 24), source: 'trackingmore' },
          { status: 'out_for_delivery', statusRaw: 'transit', location: r.city, description: 'Out for delivery', checkpointTime: hoursAgo(r.daysAgo * 24 + 5), source: 'trackingmore' },
          { status: 'delivered', statusRaw: 'delivered', location: r.city, description: 'Delivered - signed for at goods-in', checkpointTime: deliveredAt, source: 'trackingmore' },
        ],
      };
    })
  );

  await Feedback.insertMany(
    reviewedShipments.map((shipment, i) => ({
      shipmentId: shipment._id,
      trackingNumber: shipment.trackingNumber,
      ownerId: user._id,
      rating: REVIEWED[i].rating,
      comment: REVIEWED[i].comment,
      customerName: REVIEWED[i].customer,
      consentToPublish: true,
      isPublished: true,
      createdAt: hoursAgo(REVIEWED[i].daysAgo * 24 - 6),
      updatedAt: hoursAgo(REVIEWED[i].daysAgo * 24 - 6),
    })),
    // Without this mongoose stamps "now" over the dates above and every demo review
    // claims to have been written this minute.
    { timestamps: false }
  );

  await seedStock();

  logger.info(`Seeded ${created.length} active + ${reviewedShipments.length} archived demo shipments for ${DEMO_EMAIL}`);
  logger.info(
    `Seeded ${REVIEWED.length} demo reviews - all tagged "(demo)". DELETE THESE before going live.`
  );
}

/**
 * For a fresh hosted database (SEED_IF_EMPTY=true): fills it with the demo data only
 * when there are no users at all, so a redeploy never overwrites real shipments.
 */
async function seedIfEmpty() {
  if (await User.exists({})) return false;
  logger.info('Empty database - loading demo data');
  await seedData();
  return true;
}

async function seedStock() {
  await Promise.all([
    StockCategory.deleteMany({}),
    StockItem.deleteMany({}),
    StockMovement.deleteMany({}),
    StockSettings.deleteMany({}),
  ]);

  const importedAt = new Date('2026-09-28T07:25:00.000Z'); // 12:55 PM IST
  const movements = [];
  let itemCount = 0;

  const byCategory = {};
  for (const [categoryIndex, category] of STOCK_SNAPSHOT.entries()) {
    const doc = await StockCategory.create({ name: category.name, listStyle: category.listStyle, sortOrder: categoryIndex });
    const items = await StockItem.insertMany(
      category.items.map((item, i) => ({
        categoryId: doc._id,
        name: item.name,
        size: item.size || '',
        quantity: item.quantity,
        oldQuantity: item.old ?? null,
        note: item.note || '',
        internalNote: item.internal || '',
        expiryDates: (item.expiry || []).map((d) => new Date(`${d}T00:00:00.000Z`)),
        sortOrder: i,
      }))
    );
    byCategory[category.name] = items;
    itemCount += items.length;
    items.forEach((item) =>
      movements.push({
        itemId: item._id,
        itemName: item.displayName,
        change: item.quantity,
        quantityAfter: item.quantity,
        reason: 'created',
        note: 'Imported from the 28/09 WhatsApp stock update',
        userName: 'WhatsApp import',
        createdAt: importedAt,
      })
    );
  }

  // The update's "Stock Out" block - customers, not products.
  STOCK_OUT_28_09.forEach((out, i) => {
    const item = byCategory[out.category].find((it) => it.name === out.item);
    movements.push({
      itemId: item._id,
      itemName: item.displayName,
      change: -out.quantity,
      quantityAfter: item.quantity,
      reason: 'dispatch',
      customer: out.customer,
      userName: 'WhatsApp import',
      createdAt: new Date(importedAt.getTime() + (i + 1) * 1000),
    });
  });

  await StockMovement.insertMany(movements, { timestamps: false });
  await StockSettings.create({ key: 'default', lastCountAt: importedAt, lastCountBy: 'WhatsApp import' });
  logger.info(`Seeded stock: ${STOCK_SNAPSHOT.length} categories, ${itemCount} items (from the 28/09 WhatsApp update)`);
}

module.exports = { seedData, seedIfEmpty };

// `npm run seed`: connect, (re)load the demo data, exit.
if (require.main === module) {
  connectDB()
    .then(seedData)
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(`Seed failed: ${err.stack || err.message}`);
      process.exit(1);
    });
}
