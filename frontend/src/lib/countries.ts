// Country list for contact forms.
//
// Typing a country by hand produced "USA", "usa" and "United States" as three
// different countries, and the send filter matches exactly — so a contact typed
// one way silently drops out of a send filtered the other way. Picking from a
// fixed list removes that whole class of mistake.
//
// The names come from the browser's own Intl data rather than a hardcoded table
// or an npm package: one short list of ISO 3166-1 codes, and the runtime supplies
// correctly spelled names. Same reasoning as the timezone picker on the send page.

const CODES = [
  "AF","AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BT",
  "BO","BA","BW","BR","BN","BG","BF","BI","KH","CM","CA","CV","CF","TD","CL","CN","CO","KM","CG","CD",
  "CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FJ","FI",
  "FR","GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY","HT","HN","HK","HU","IS","IN","ID","IR",
  "IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT",
  "LU","MO","MG","MW","MY","MV","ML","MT","MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM",
  "NA","NR","NP","NL","NZ","NI","NE","NG","KP","MK","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH",
  "PL","PT","PR","QA","RO","RU","RW","KN","LC","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK",
  "SI","SB","SO","ZA","KR","SS","ES","LK","SD","SR","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TO",
  "TT","TN","TR","TM","TV","UG","UA","AE","GB","US","UY","UZ","VU","VA","VE","VN","YE","ZM","ZW",
];

/**
 * Country names, alphabetical. Falls back to the raw codes on the rare runtime
 * without Intl.DisplayNames — a usable list beats an empty dropdown.
 */
export function countryNames(): string[] {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    const names = CODES.map((c) => display.of(c) ?? c);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  } catch {
    return [...CODES].sort();
  }
}
