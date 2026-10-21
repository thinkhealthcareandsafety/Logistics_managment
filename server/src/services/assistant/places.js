/**
 * Where a shipment is going, at state level, even when the address doesn't spell the
 * state out: the state field, else the city (Ahmedabad -> Gujarat), else the PIN code
 * (36xxxx-39xxxx -> Gujarat). And every Indian state the assistant should recognise in
 * a question, whether or not anything has been shipped there yet.
 */

const STATES = {
  'Andhra Pradesh': ['andhra', 'ap'],
  'Arunachal Pradesh': ['arunachal'],
  Assam: [],
  Bihar: [],
  Chhattisgarh: ['chattisgarh', 'chhatisgarh'],
  Goa: [],
  Gujarat: ['gujrat', 'gj'],
  Haryana: [],
  'Himachal Pradesh': ['himachal', 'hp'],
  Jharkhand: [],
  Karnataka: ['karnatak', 'ka'],
  Kerala: [],
  'Madhya Pradesh': ['mp'],
  Maharashtra: ['maharastra', 'mh'],
  Manipur: [],
  Meghalaya: [],
  Mizoram: [],
  Nagaland: [],
  Odisha: ['orissa'],
  Punjab: [],
  Rajasthan: [],
  Sikkim: [],
  'Tamil Nadu': ['tamilnadu', 'tn'],
  Telangana: ['telengana', 'ts'],
  Tripura: [],
  'Uttar Pradesh': ['up'],
  Uttarakhand: ['uttaranchal'],
  'West Bengal': ['bengal', 'wb'],
  Delhi: ['new delhi', 'ncr'],
  'Jammu and Kashmir': ['jammu', 'kashmir', 'j&k'],
  Ladakh: [],
  Chandigarh: [],
  Puducherry: ['pondicherry'],
  'Andaman and Nicobar Islands': ['andaman'],
  'Dadra and Nagar Haveli and Daman and Diu': ['daman', 'silvassa'],
  Lakshadweep: [],
};

const CITY_STATE = {
  ahmedabad: 'Gujarat', surat: 'Gujarat', vadodara: 'Gujarat', baroda: 'Gujarat', rajkot: 'Gujarat', gandhinagar: 'Gujarat', bhavnagar: 'Gujarat', jamnagar: 'Gujarat', vapi: 'Gujarat', anand: 'Gujarat', bharuch: 'Gujarat',
  mumbai: 'Maharashtra', pune: 'Maharashtra', nagpur: 'Maharashtra', thane: 'Maharashtra', nashik: 'Maharashtra', aurangabad: 'Maharashtra', navi: 'Maharashtra', kolhapur: 'Maharashtra', solapur: 'Maharashtra', satara: 'Maharashtra', panvel: 'Maharashtra', chakan: 'Maharashtra', bhiwandi: 'Maharashtra', goregaon: 'Maharashtra', andheri: 'Maharashtra',
  bengaluru: 'Karnataka', bangalore: 'Karnataka', mysuru: 'Karnataka', mysore: 'Karnataka', mangaluru: 'Karnataka', mangalore: 'Karnataka', hubli: 'Karnataka', belgaum: 'Karnataka', belagavi: 'Karnataka',
  chennai: 'Tamil Nadu', coimbatore: 'Tamil Nadu', madurai: 'Tamil Nadu', trichy: 'Tamil Nadu', hosur: 'Tamil Nadu', salem: 'Tamil Nadu', kancheepuram: 'Tamil Nadu',
  hyderabad: 'Telangana', secunderabad: 'Telangana', warangal: 'Telangana',
  visakhapatnam: 'Andhra Pradesh', vizag: 'Andhra Pradesh', vijayawada: 'Andhra Pradesh', tirupati: 'Andhra Pradesh', guntur: 'Andhra Pradesh',
  delhi: 'Delhi', 'new delhi': 'Delhi',
  gurgaon: 'Haryana', gurugram: 'Haryana', faridabad: 'Haryana', panipat: 'Haryana', sonipat: 'Haryana', manesar: 'Haryana',
  noida: 'Uttar Pradesh', ghaziabad: 'Uttar Pradesh', lucknow: 'Uttar Pradesh', kanpur: 'Uttar Pradesh', agra: 'Uttar Pradesh', varanasi: 'Uttar Pradesh', meerut: 'Uttar Pradesh',
  kolkata: 'West Bengal', howrah: 'West Bengal', durgapur: 'West Bengal', siliguri: 'West Bengal',
  jaipur: 'Rajasthan', jodhpur: 'Rajasthan', udaipur: 'Rajasthan', kota: 'Rajasthan',
  indore: 'Madhya Pradesh', bhopal: 'Madhya Pradesh', gwalior: 'Madhya Pradesh', jabalpur: 'Madhya Pradesh',
  raipur: 'Chhattisgarh', bhilai: 'Chhattisgarh',
  bhubaneswar: 'Odisha', cuttack: 'Odisha',
  patna: 'Bihar', ranchi: 'Jharkhand', jamshedpur: 'Jharkhand', dhanbad: 'Jharkhand',
  guwahati: 'Assam',
  kochi: 'Kerala', cochin: 'Kerala', thiruvananthapuram: 'Kerala', trivandrum: 'Kerala', kozhikode: 'Kerala', calicut: 'Kerala',
  margao: 'Goa', panaji: 'Goa', vasco: 'Goa',
  chandigarh: 'Chandigarh', mohali: 'Punjab', ludhiana: 'Punjab', amritsar: 'Punjab', jalandhar: 'Punjab',
  dehradun: 'Uttarakhand', haridwar: 'Uttarakhand', shimla: 'Himachal Pradesh', jammu: 'Jammu and Kashmir', srinagar: 'Jammu and Kashmir',
  puducherry: 'Puducherry', pondicherry: 'Puducherry',
};

/** First digits of a PIN code -> state (India Post's zones; the exceptions first). */
const PIN3 = {
  403: 'Goa', 605: 'Puducherry', 737: 'Sikkim', 160: 'Chandigarh', 744: 'Andaman and Nicobar Islands', 682: 'Kerala',
  246: 'Uttarakhand', 247: 'Uttarakhand', 248: 'Uttarakhand', 249: 'Uttarakhand', 262: 'Uttarakhand', 263: 'Uttarakhand',
  790: 'Arunachal Pradesh', 791: 'Arunachal Pradesh', 792: 'Arunachal Pradesh', 793: 'Meghalaya', 794: 'Meghalaya', 795: 'Manipur', 796: 'Mizoram',
  797: 'Nagaland', 798: 'Nagaland', 799: 'Tripura', 396: 'Dadra and Nagar Haveli and Daman and Diu',
};
const PIN2 = {
  11: 'Delhi', 12: 'Haryana', 13: 'Haryana', 14: 'Punjab', 15: 'Punjab', 16: 'Punjab', 17: 'Himachal Pradesh', 18: 'Jammu and Kashmir', 19: 'Jammu and Kashmir',
  20: 'Uttar Pradesh', 21: 'Uttar Pradesh', 22: 'Uttar Pradesh', 23: 'Uttar Pradesh', 24: 'Uttar Pradesh', 25: 'Uttar Pradesh', 26: 'Uttar Pradesh', 27: 'Uttar Pradesh', 28: 'Uttar Pradesh',
  30: 'Rajasthan', 31: 'Rajasthan', 32: 'Rajasthan', 33: 'Rajasthan', 34: 'Rajasthan', 36: 'Gujarat', 37: 'Gujarat', 38: 'Gujarat', 39: 'Gujarat',
  40: 'Maharashtra', 41: 'Maharashtra', 42: 'Maharashtra', 43: 'Maharashtra', 44: 'Maharashtra', 45: 'Madhya Pradesh', 46: 'Madhya Pradesh', 47: 'Madhya Pradesh', 48: 'Madhya Pradesh',
  49: 'Chhattisgarh', 50: 'Telangana', 51: 'Andhra Pradesh', 52: 'Andhra Pradesh', 53: 'Andhra Pradesh', 56: 'Karnataka', 57: 'Karnataka', 58: 'Karnataka', 59: 'Karnataka',
  60: 'Tamil Nadu', 61: 'Tamil Nadu', 62: 'Tamil Nadu', 63: 'Tamil Nadu', 64: 'Tamil Nadu', 67: 'Kerala', 68: 'Kerala', 69: 'Kerala',
  70: 'West Bengal', 71: 'West Bengal', 72: 'West Bengal', 73: 'West Bengal', 74: 'West Bengal', 75: 'Odisha', 76: 'Odisha', 77: 'Odisha', 78: 'Assam',
  80: 'Bihar', 81: 'Jharkhand', 82: 'Jharkhand', 83: 'Jharkhand', 84: 'Bihar', 85: 'Bihar',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** "maharastra", "MH", "Gujarat " -> the state's proper name; null when it isn't one. */
function canonicalState(text) {
  const t = norm(text);
  if (!t) return null;
  for (const [name, aliases] of Object.entries(STATES)) {
    if (norm(name) === t || aliases.includes(t)) return name;
  }
  return null;
}

function cityState(city) {
  const t = norm(city);
  if (!t) return null;
  if (CITY_STATE[t]) return CITY_STATE[t];
  // "Mumbai-Goregaon(E)", "Bengaluru Bellandur" -> the first known word
  for (const word of t.split(' ')) if (CITY_STATE[word]) return CITY_STATE[word];
  return null;
}

function pinState(pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (p.length !== 6) return null;
  return PIN3[p.slice(0, 3)] || PIN2[p.slice(0, 2)] || null;
}

/** The state a shipment is going to, worked out as well as the data allows. */
function stateOf(s) {
  return (
    canonicalState(s.deliveryAddress?.state) ||
    canonicalState(s.carrierRoute?.destinationState) ||
    pinState(s.deliveryAddress?.pincode) ||
    cityState(s.deliveryAddress?.city) ||
    cityState(s.carrierRoute?.destinationCity) ||
    null
  );
}

function cityOf(s) {
  return (s.deliveryAddress?.city || s.carrierRoute?.destinationCity || '').trim();
}

/**
 * A state or city named in the question: a state (all of India's, by name or common
 * spelling), else a city from the data or the known list. { type, name } or null.
 */
function placeIn(q, knownCities = []) {
  const text = ` ${norm(q)} `;
  let best = null;
  for (const [name, aliases] of Object.entries(STATES)) {
    for (const a of [norm(name), ...aliases.filter((x) => x.length >= 4)]) {
      if (text.includes(` ${a} `) && (!best || a.length > best.len)) best = { type: 'state', name, len: a.length };
    }
  }
  if (best) return { type: best.type, name: best.name };
  const cities = [...new Set([...knownCities.map(norm).filter((c) => c.length >= 3), ...Object.keys(CITY_STATE)])].sort((a, b) => b.length - a.length);
  const city = cities.find((c) => text.includes(` ${c} `));
  return city ? { type: 'city', name: city.replace(/\b[a-z]/g, (ch) => ch.toUpperCase()) } : null;
}

/** Whether a shipment goes to that place. */
function goesTo(s, place) {
  if (!place) return true;
  if (place.type === 'state') return stateOf(s) === place.name;
  const want = norm(place.name);
  const city = norm(cityOf(s));
  return city === want || city.split(' ').includes(want) || city.startsWith(`${want} `);
}

module.exports = { stateOf, cityOf, placeIn, goesTo, canonicalState, STATES };
