/**
 * Which stock category a product belongs in, from its name - the same headings the
 * team used in the WhatsApp update plus the groups the full Zoho catalogue needs.
 * Used when Zoho Books brings in a product that isn't on the sheet yet, so it lands
 * in the right section instead of a catch-all. First matching rule wins, so specific
 * rules sit above general ones. Returns null when nothing fits.
 */
const RULES = [
  ['Training Pads', [/training pads?/i, /trainer-? ?pad/i]],
  ['AED Trainer', [/aed trainer/i, /trainer dcf/i, /frx aed trainer/i, /xft-120c aed trainer/i]],
  ['AED Bags', [/^aed bag/i]],
  ['AED Battery', [/aed battery/i, /battery for aed/i, /\bhs1 battery/i, /aed plus replacement batteries/i, /defibtech battery/i, /power heart g3 battery/i, /chargepak battery/i, /lithium battery panasonic cr123a/i]],
  ['AED Pads', [/\bpads?\b.*(aed|electrode|defib|hs1|frx|smartpads|infant|child|stat|padz)/i, /(padz|stat pad|smartpads)/i, /electrode/i, /child pad/i, /infant child key/i, /compatible pads/i, /aed pads/i, /intellisense pads/i, /pediatric defibrillation pads/i, /pad ddp/i, /a15 pad/i, /onsite pads/i, /multifunction pads/i, /aed pad/i]],
  ['AED', [/heartstart frx aed/i, /heart start hs1 onsite aed/i, /zoll aed (plus|3)/i, /powerheart g5 aed/i, /life ?line auto/i, /hearton aed/i]],
  ['AED Accessories', [/aed wall/i, /aed signage/i, /aed empty case/i, /cabinet - zoll/i, /philips original cabinet/i, /antitheft alarm for cabinet/i, /aed management/i, /smartx/i, /event review software/i, /infrared data cable/i]],
  ['CPR & Training', [/manikin/i, /prestan/i, /laerdal/i, /practiman/i, /\bcpr\b/i, /cprx/i, /anti choking trainer/i, /self learning mat/i]],
  ['Fast Response Kit Bags (Empty)', [/fast response kit(?! stretcher)/i, /\(empty\)/i, /bag pack for go bag/i, /first aid bag/i]],
  ['Trauma Bags + Trauma Kit', [/trauma back ?pack/i, /trauma bagpack/i, /trauma kit/i, /tourniquet bag/i, /trauma pouch/i]],
  ['Trauma Items', [/tourniquet/i, /trauma scissor/i, /tweezers/i, /emergency bandage/i, /chest seal/i, /head immobilizer/i, /cervical collar/i, /splints?/i, /nasg/i, /emergency thermal blanket/i, /eye shield/i, /massive bleeding/i, /casualty care/i, /wound care/i, /^whistle$/i]],
  ['First Aid Kits', [/first aid kit/i, /first aid wall cabinet/i, /fak boxes/i, /upk boxes/i, /emergency-medical-air-case/i, /first aid hand book/i, /first aid station/i, /emergency response chart/i, /spill kit/i]],
  ['First Aid Consumables', [/bandage/i, /gauze/i, /burn/i, /dressing/i, /abdominal pad/i, /cotton roll/i, /micropore/i, /primapore/i, /dettol/i, /savlon/i, /betadine/i, /iodine/i, /hydrogen peroxide/i, /potassium permanganate/i, /ointment/i, /swabs?/i, /wipes/i, /^excel /i, /eye wash solution/i, /eye cup/i, /eye pad/i, /cold pack/i, /ice bag/i, /hot water bag/i, /zandu balm/i, /razor/i, /latex .*gloves/i, /nitrile gloves/i, /hand sanitizer/i, /tulle/i, /waste bag/i, /sharps/i, /snake bite/i, /covid/i, /antiseptic/i, /crepe/i]],
  ['Medical Equipment', [/ambu bag/i, /oxygen/i, /\bbp machine/i, /pulse oximeter/i, /thermometer/i, /stethoscope/i, /nebulizer/i, /ecg machine/i, /monitor/i, /crash cart/i, /anti choking device/i]],
  ['Stretchers & Evacuation', [/stretcher/i, /spine board/i, /evacuation chair/i, /resguardo/i, /wheel ?chair/i, /crutches/i, /bath (chair|benches)/i, /torso restraint/i]],
  ['Fire Safety', [/fire/i, /blanket/i, /bridge ?hill/i, /smoke (hood|mask)/i, /anti smoke mask/i, /\bscba\b/i, /breathing apparatus/i, /smoke detector/i, /multi ?purpose (branch|nozzle)/i]],
  ['Alcohol Breath Analyzers', [/breath ?analy[sz]/i, /breathalyzer/i]],
  ['Safety Items', [/face mask/i, /^venus /i, /safety (goggles|helmet|jacket|harness|eye|electrical|glasses)/i, /goggles/i, /gloves/i, /ear ?muff/i, /earplug/i, /gum boots/i, /rain coat/i, /pp kit/i, /arm g(au|ua)rd/i, /harness/i, /eye wash station/i, /smart link setup/i, /toe line rope/i, /spectacles/i, /floor marking tape/i, /ventilation fan/i]],
  ['Lockout Tagout (LOTO)', [/lockout/i, /padlock/i, /pad locks/i, /lockout hasp/i, /location tag/i]],
  ['Security & Patrol', [/metal detector/i, /boom barriers/i, /x-ray/i, /frisking/i, /under (carriage|vehicle) mirror/i, /convex mirror/i, /guard patrol/i, /tapping coin/i, /key cabinet/i, /alkosign/i, /beacon/i, /stun gun/i, /shepherd hook/i, /snake catch/i, /tyre lock/i, /lock cutter/i, /lanyard/i, /key chain/i, /garrett/i, /queue manager/i]],
  ['Traffic & Road Safety', [/traffic/i, /speed breaker/i, /caution (tape|board)/i, /link chain/i, /vehicle jumper/i, /life bouy/i]],
  ['Lighting & Communication', [/torch/i, /baton light/i, /batton light/i, /search light/i, /glow stick/i, /megaphone/i, /walkie/i, /binoculars/i]],
  ['Emergency Supplies', [/food ration/i, /water pouch/i, /\bert\b/i, /umbrella/i, /disaster kit/i]],
  ['Fitness & Rehab', [/ergometer/i, /treadmill/i, /spinning bike/i, /pilates/i, /resistance bands/i, /hydro collator/i]],
  ['Electronics & Spares', [/frc/i, /crimp connector/i, /db 25/i, /\bdac\b/i, /battery$/i, /duracell/i, /eveready/i, /dry cell/i, /cable tie/i]],
  ['Packing & Shipping', [/corrugated/i, /packing/i, /courier charges/i, /zip lock/i]],
  ['Office & General', [/office/i, /home supplies/i, /shredder/i, /clock/i, /television/i, /petty cash/i, /locker/i, /phone/i, /notice board/i, /signage board/i, /luggage/i, /elan vital/i]],
];

function categoryFor(name) {
  for (const [category, patterns] of RULES) if (patterns.some((p) => p.test(String(name || '')))) return category;
  return null;
}

module.exports = { categoryFor, RULES };