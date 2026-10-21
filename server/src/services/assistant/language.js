/**
 * Turns Hinglish (and loose English) into the plain English the assistant's rules read:
 * "aaj kitne deliver hue" -> "today how many delivered", "unme se kitne gujarat ke" ->
 * "of them how many gujarat". Applied word by word, longest phrases first.
 */

const PHRASES = [
  // follow-ups ("of them")
  [/\b(un ?me(in|n)?|in ?me(in|n)?|is ?me(in)?|us ?me(in)?|un ?mai?n?)\s+(se|say)\b/g, 'of them'],
  [/\b(unme|unmein|inme|inmein|isme|usme)\b/g, 'of them'],
  [/\b(aur|or phir|and what about|what about|how about)\b/g, 'what about'],
  // dates
  [/\b(aaj|aj)\b/g, 'today'],
  [/\b(kal|kl)\b/g, 'yesterday'],
  [/\b(is|iss|ye|yeh) (hafte|hafta|week)\b/g, 'this week'],
  [/\b(pichh?le|pichh?la|last) (hafte|hafta)\b/g, 'last week'],
  [/\b(is|iss|ye|yeh) (mahine|mahina|month)\b/g, 'this month'],
  [/\b(pichh?le|pichh?la) (mahine|mahina|month)\b/g, 'last month'],
  [/\b(is|iss) (saal|sal|year)\b/g, 'this year'],
  // questions
  [/\b(kitne|kitna|kitni|ketle|kitte)\b/g, 'how many'],
  [/\b(kaun ?se|kaun ?sa|kaun ?si|konse|konsa|kaun|kon)\b/g, 'which'],
  [/\b(dikhao|dikha do|dikhaao|dikha|batao|bata do|bataao|bata|bolo|list karo|list do)\b/g, 'show'],
  [/\b(kya|kyaa)\b/g, 'what'],
  [/\b(kab)\b/g, 'when'],
  [/\b(kahan|kaha|kidhar)\b/g, 'where'],
  // shipment states
  [/\b(raste|raaste|rastey) (me|mein|main|mai)\b/g, 'in transit'],
  [/\b(nikal (gaye|gaya|gayi)|nikle|nikla|bheja|bheje|bheji|bhej diya|bhej diye|dispatch (hue|hua|kiye|kiya))\b/g, 'shipped'],
  [/\b(pahunch|pahunche|pahuncha|pahunchi|pohoch|pohoche|mil gaye|mil gaya|deliver (ho gaye|ho gaya|hue|hua|huye))\b/g, 'delivered'],
  [/\b(nahi pahunche|nahi pahuncha|deliver nahi hue|nahi mile)\b/g, 'not delivered'],
  [/\b(atke|atka|atki|fase|phase|fasa|ruke|ruka)\b/g, 'stuck'],
  [/\b(der se|der|late hai|late hue)\b/g, 'late'],
  [/\b(pickup nahi hua|pickup baaki)\b/g, 'pending'],
  // stock
  [/\b(maal|maal|saman|samaan)\b/g, 'stock'],
  [/\b(khatam|khtm|khatm|nahi bacha|zero)\b/g, 'out of stock'],
  [/\b(kam hai|kam ho gaya|kam)\b/g, 'low'],
  [/\b(bacha|baaki|bache)\b/g, 'left'],
  // couriers / money
  [/\b(sabse sasta|sasta|saste)\b/g, 'cheapest'],
  [/\b(sabse tez|sabse jaldi|tez|jaldi)\b/g, 'fastest'],
  [/\b(sabse achha|sabse acha|best wala)\b/g, 'best'],
  [/\b(kharcha|kharch|bhada|bhaada)\b/g, 'freight'],
  [/\b(sabse zyada|sabse jyada|zyada|jyada)\b/g, 'most'],
  [/\b(har|each|every|per)\s+(state|rajya)\b/g, 'by state'],
  [/\b(har|each|every|per)\s+(city|shehar|shahar)\b/g, 'by city'],
  [/\b(state|city|courier|client|customer) ?wise\b/g, 'by $1'],
  // places / filler
  [/\b(se|say)\b/g, 'from'],
  [/\b(ke liye|ko)\b/g, 'for'],
  [/\b(me|mein|main|mai)\b/g, 'in'],
  [/\b(hai|hain|he|hei|tha|the|thi|ka|ki|ke|wale|wala|wali|abhi|bhi|toh|na|ji|please|pls|plz)\b/g, ' '],
];

function toEnglish(text) {
  let q = ` ${String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[?!.,;:]+/g, ' ')} `;
  for (const [re, to] of PHRASES) q = q.replace(re, to);
  return ` ${q.replace(/\s+/g, ' ').trim()} `;
}

module.exports = { toEnglish };
