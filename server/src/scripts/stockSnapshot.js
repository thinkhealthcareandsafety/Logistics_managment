/**
 * The stock posted in the logistics WhatsApp group on 28/09 at 12:55 PM, transcribed
 * line by line so the Stock page opens on the team's real shelf.
 *
 * How the hand-typed message was read:
 *   - The number in brackets (or after the dash) is the quantity. "Q", "Pcs", "Packet"
 *     are unit markers, not part of the name.
 *   - "(8) +40 =48" means 8 old + 40 new = 48  ->  quantity 48, old 8.
 *   - Company / place names ("7 block for beng", "Goa return", "crowd strike") are not
 *     products. They're kept as the manager's internal note, never in the message.
 *   - Dimensions and sizes ("5*4", "10*20", "1m*1m", "Big", "Small") go in `size`, not
 *     the name - "Crepe Bandage" is one product in three sizes.
 *   - Two things on one line become two lines ("169+10(Big)", "Small+Big",
 *     "2 White/1 yellow with torch/1 yellow without torch").
 *   - Obvious typos fixed (Strecther -> Stretcher, Contect -> Contact, Saven -> Seven,
 *     Lardel -> Laerdal, Reflected -> Reflective, Inferred -> Infrared).
 *   - Category totals are NOT copied - the app computes them. Several hand-typed ones
 *     didn't add up (e.g. "AED Battery: 62" for lines that sum to 93).
 *
 * `note` is public (shown in the WhatsApp update); `internal` is the manager's own note.
 */
const BENG = '7 blocked for Beng training';

const STOCK_SNAPSHOT = [
  {
    name: 'AED',
    listStyle: 'plain',
    items: [
      { name: 'FRX', quantity: 27 },
      { name: 'HS1', quantity: 53, note: '3 without pad' },
      { name: 'Zoll AED', quantity: 34 },
    ],
  },
  {
    name: 'AED Trainer',
    listStyle: 'plain',
    items: [
      { name: 'AED Trainer XFT120', quantity: 2 },
      { name: 'Mini AED Trainer', quantity: 2 },
      { name: 'Zoll AED Trainer', quantity: 1, note: 'with bag' },
      { name: 'AED Trainer XFT120', quantity: 1, note: 'used for training' },
    ],
  },
  {
    name: 'AED Pads',
    listStyle: 'numbers',
    items: [
      { name: 'HS1 Pads', quantity: 47 },
      { name: 'FRX Pads', quantity: 23 },
      { name: 'Defibtech Pads DDP100', quantity: 7 },
      { name: 'G5 Pad', quantity: 16, expiry: ['2028-11-28', '2029-01-28'] },
      { name: 'OBS Medtronic Pad', quantity: 1 },
      { name: 'Zoll Stat Pad', quantity: 81 },
      { name: 'Philips M3713A', quantity: 0 },
      { name: 'Zoll Stat-D-Pad', quantity: 8, expiry: ['2031-09-20'] },
      { name: 'HS1 Child Pad', quantity: 0 },
    ],
  },
  {
    name: 'Training Pads',
    listStyle: 'numbers',
    items: [
      { name: 'Philips FRX Training Pads', quantity: 0 },
      { name: 'Philips HS1 Training Pads Set', quantity: 1 },
      { name: 'XFT Training Pad', quantity: 1 },
    ],
  },
  {
    name: 'AED Battery',
    listStyle: 'numbers',
    items: [
      { name: 'Philips Batteries', quantity: 48, old: 8 },
      { name: 'G5 Battery', quantity: 18, note: '4 yrs from installation' },
      { name: 'Defibtech Battery DBP 2800', quantity: 4, expiry: ['2033-09-30'] },
      { name: 'Lithium Battery', quantity: 23 },
    ],
  },
  {
    name: 'AED Accessories',
    listStyle: 'numbers',
    items: [
      { name: 'Child Key', quantity: 18, internal: '7 blocked for Beng' },
      { name: 'Fast Response Kit (ready)', quantity: 0 },
      {
        name: 'Signage',
        quantity: 30,
        internal: 'The 28/09 update also said "+ medic assist (2) - blocked (53)" on this line. Check whether medic assist signage needs its own line.',
      },
      { name: 'Wooden Cabinet', quantity: 2, note: 'in office' },
      { name: 'New Cabinet', quantity: 20 },
      { name: 'Regular Old Cabinet', quantity: 2, note: 'paint' },
      { name: 'Old Small Cabinet', quantity: 8, note: 'paint' },
      { name: 'Cabinet Bracket', quantity: 1 },
      { name: 'Cabinet Alarm', quantity: 50 },
      { name: 'Big Cabinet', quantity: 9 },
      { name: 'Alu. FAK Box Green Mini', quantity: 1 },
    ],
  },
  {
    name: 'AED Bags',
    listStyle: 'numbers',
    items: [
      { name: 'Zoll AED Bag', quantity: 84 },
      { name: 'Defibtech Bag', quantity: 9 },
      { name: 'HS1 AED Empty Red Carry Case', quantity: 4 },
      { name: 'Mediana AED Bag', quantity: 1 },
    ],
  },
  {
    name: 'Fast Response Kit Bags (Empty)',
    listStyle: 'letters',
    items: [
      { name: 'Yellow', quantity: 71 },
      { name: 'Lemon', quantity: 29 },
      { name: 'Black', quantity: 99 },
      { name: 'Red', quantity: 169 },
      { name: 'Red', size: 'Big', quantity: 10 },
      { name: 'First Aid Kit - Red', size: 'Big', quantity: 100 },
      { name: 'First Aid Kit - Green', size: 'Big', quantity: 1 },
      { name: 'EMT Bag', quantity: 4 },
      { name: 'Trauma Bag', quantity: 14 },
    ],
  },
  {
    name: 'Trauma Bags + Trauma Kit',
    listStyle: 'numbers',
    items: [
      { name: 'Red Kit', quantity: 6 },
      { name: 'Blue Kit', quantity: 9 },
      { name: 'Red Bag', quantity: 5 },
      { name: 'Blue Bag', quantity: 4 },
      { name: 'Green Bag', quantity: 6 },
      { name: 'CPRx Bag', quantity: 4 },
      { name: 'Ambu Bag', quantity: 90 },
    ],
  },
  {
    name: 'Safety Items',
    listStyle: 'plain',
    items: [
      { name: 'Sample Cabinet', quantity: 0 },
      { name: 'Key Cabinet', quantity: 3 },
      { name: 'Scoop Stretcher', quantity: 7 },
      { name: 'Spine Board', quantity: 0 },
      { name: 'Wheel Chair', quantity: 0 },
      { name: '2-Fold Stretcher', quantity: 2 },
      { name: '4-Fold Stretcher', quantity: 2 },
      { name: 'BP Machine', quantity: 0 },
      { name: 'Smoke Hood', quantity: 1, note: 'sample' },
      { name: 'Stretcher + Fast Response Kit (Yellow)', quantity: 68 },
      { name: 'Stretcher + Fast Response Kit (Red)', quantity: 1 },
      { name: 'Manikins', quantity: 1 },
      { name: 'Laerdal Manikins', quantity: 4 },
      { name: 'Prestan Adult Manikins Series 2000', quantity: 0 },
      { name: 'Female Manikins', quantity: 1 },
      { name: 'Breath Analyzer AT6000', quantity: 9 },
      { name: 'Contact Thermometer', quantity: 56 },
      { name: 'Non-Contact Thermometer', quantity: 66 },
      { name: 'Contact Infrared Thermometer', quantity: 1, note: 'model i413' },
      { name: 'Paper Shredder', quantity: 0 },
      { name: 'Reflective Jacket ERT (Green)', quantity: 13, internal: 'Get items returned from Crowd Strike' },
      { name: 'Under Vehicle Mirror', quantity: 1 },
      { name: 'Baton Light', quantity: 1 },
      { name: 'Smoke Mask', quantity: 4, note: 'Venus' },
      { name: 'Binocular', quantity: 1 },
      { name: 'Snake Catching Stick', quantity: 1, internal: 'Goa return' },
      { name: 'Fire Blanket', size: '1m × 1m', quantity: 7 },
      { name: 'Snake Bite Kit', quantity: 1 },
      { name: 'Smart Link Setup', quantity: 2 },
      { name: 'Smart Link Battery Frame', quantity: 89 },
      { name: 'Lithium Batteries', quantity: 296, note: '25 boxes' },
      { name: 'Fire Suit', quantity: 0 },
      { name: 'Neck Collar', quantity: 3 },
      { name: 'Chest Seal', quantity: 1, note: 'pack of 10' },
      { name: 'Manikin Lungs', quantity: 2 },
      { name: 'Head Immobilizer', quantity: 1 },
      { name: 'Fireman Axe', quantity: 1 },
      { name: 'Spillex', quantity: 7 },
      { name: 'AED Sheet', quantity: 9 },
      { name: 'FAK Box', quantity: 52 },
      { name: 'Anti-Fire Smoke Mask', quantity: 46 },
    ],
  },
  {
    name: 'Trauma Items',
    listStyle: 'plain',
    items: [
      { name: 'Razors', quantity: 179, internal: BENG },
      { name: 'CPR Mask', quantity: 119, internal: BENG },
      { name: 'Tweezers', quantity: 81 },
      { name: 'Scissors', quantity: 190, internal: BENG },
      {
        name: 'Snap Light',
        quantity: 5,
        internal: 'Listed twice in the 28/09 update - once as 5, once as 0. Recount.',
      },
      { name: 'Ambu Bag', quantity: 42 },
      {
        name: 'Sterile Dressing Pad (burn dressing)',
        quantity: 50,
        internal: 'May be the same stock as "Burn Dressing" and "Sterile Dressing Pad" further down (all 50). Check and merge.',
      },
      { name: 'Crepe Bandage', size: '5×4', quantity: 47 },
      { name: 'Crepe Bandage', size: '7.5×4', quantity: 42 },
      { name: 'Crepe Bandage', size: '10×4', quantity: 44 },
      { name: 'Gauze Bandage', size: '5×5', quantity: 10 },
      { name: 'Gauze Bandage', size: '7.5×4', quantity: 0 },
      { name: 'Gauze Bandage', size: '10×4', quantity: 2 },
      { name: 'Gauze Pad', size: '10×20', quantity: 38 },
      { name: 'Gauze Pad', size: '10×10', quantity: 0 },
      { name: 'Gauze Pad', size: '5×5', quantity: 50 },
      { name: 'White Gloves', quantity: 14 },
      { name: 'Surgical Mask', quantity: 295, note: 'pcs' },
      { name: 'Pen Torch', quantity: 8 },
      { name: 'Whistle', quantity: 115 },
      { name: 'Burn Dressing', quantity: 50 },
      { name: 'Sterile Dressing Pad', quantity: 50 },
      { name: 'Triangular Bandage', quantity: 31 },
      { name: 'Garbage Bag (Green)', quantity: 8 },
      { name: 'Eye Shield', quantity: 98 },
      { name: 'Eye Cup', quantity: 7 },
      { name: 'Burn Gel', quantity: 0 },
      { name: 'Micropore 3M Tape', size: 'Small', quantity: 0 },
      { name: 'Micropore 3M Tape', size: 'Big', quantity: 0 },
      { name: 'Emergency Thermal Blanket', quantity: 112 },
      { name: 'Breathing Barrier', quantity: 16 },
      { name: 'Rolled Splint', quantity: 11 },
      { name: 'Tourniquet', quantity: 111 },
      { name: 'Emergency Trauma Dressing', quantity: 43 },
      { name: 'Eye Wash Solution', quantity: 0 },
      { name: 'Adhesive Bandage', quantity: 30, note: 'pcs' },
      { name: 'Alcohol Swabs', quantity: 28, note: 'pcs' },
      { name: 'Surgical Gloves Box', quantity: 4 },
      { name: 'Trauma Bracket', quantity: 4 },
      { name: 'Aris Trauma Pouch', quantity: 7 },
      { name: 'Aris Trauma Bag (full)', quantity: 2 },
      { name: 'Emergency Blanket', quantity: 500 },
      { name: 'Glow Sticks', quantity: 7 },
      { name: 'Aris Bandage', quantity: 100 },
    ],
  },
  {
    name: '5SU',
    listStyle: 'plain',
    items: [
      { name: 'First Aid Book', quantity: 27 },
      { name: 'Zip Lock', quantity: 22 },
      { name: 'PP Kit', quantity: 191 },
      { name: 'Gloves', quantity: 25, note: 'packets, pack of 250' },
      { name: 'Mask', quantity: 41, note: 'packets, V4400' },
      { name: 'Raincoat Poncho', quantity: 40 },
      { name: '3M Protective Eyewear', quantity: 6 },
      { name: 'Safety Goggles', quantity: 20 },
      { name: 'Safety Gloves', quantity: 7, note: 'Procut Karma' },
      { name: 'Safety Helmet (White)', quantity: 2 },
      { name: 'Safety Helmet (Yellow, with torch)', quantity: 1 },
      { name: 'Safety Helmet (Yellow, without torch)', quantity: 1 },
    ],
  },
  {
    name: 'Disney Material',
    listStyle: 'numbers',
    items: [
      { name: 'Disney Bag', quantity: 5 },
      { name: 'Seven Ocean Food', quantity: 0 },
      { name: 'Seven Ocean Water', quantity: 27 },
      { name: 'Face Shield', quantity: 4 },
      { name: 'Maglite Torch', quantity: 20 },
      { name: 'Duracell Battery', quantity: 12 },
    ],
  },
];

/**
 * The "Stock Out" block at the end of the 28/09 update: goods that went to customers.
 * These are company names, not products - they become stock-out records against the
 * matching lines (the quantities above are already after these left).
 */
const STOCK_OUT_28_09 = [
  { category: 'AED Pads', item: 'HS1 Pads', quantity: 2, customer: 'RBS Industrial' },
  { category: 'AED Pads', item: 'FRX Pads', quantity: 1, customer: 'The Tata Power' },
  { category: 'AED Accessories', item: 'Fast Response Kit (ready)', quantity: 3, customer: 'Usha Fire Safety MU' },
  { category: 'AED', item: 'HS1', quantity: 1, customer: 'Jones Lang LaSalle Property' },
];

module.exports = { STOCK_SNAPSHOT, STOCK_OUT_28_09 };
