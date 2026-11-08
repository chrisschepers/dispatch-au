// Builds backend/aircraft-fleet.json: the firefighting and rescue aircraft the
// aircraft layer follows (wish Chris 08-11-2026).
//
// Sources (facts only: call sign, registration, ICAO hex, type):
// - NAFC call signs, https://www.nafc.org.au/call-signs/ (call sign,
//   registration, category, make, model). NAFC notes that call signs change
//   regularly, so run this again before each fire season and now and then in it.
// - tar1090-db aircraft.csv (registration -> ICAO hex and type code).
//
// Run: node scripts/aircraft-fleet.mjs   (needs internet, writes the JSON)
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const NAFC = 'https://www.nafc.org.au/call-signs/';
const DB = 'https://github.com/wiedehopf/tar1090-db/raw/csv/aircraft.csv.gz';

// Only the call signs that stand for firefighting or rescue work. FIREBIRD,
// BIRDDOG, FIRESPOTTER and PARKAIR are light aircraft that mostly fly other
// jobs; they are left out for now.
const ROLES = {
  BOMBER: 'bomber',
  HELITAK: 'helitak',
  GUARDIAN: 'transport',
  FIRESCAN: 'scanner',
  LIFESAVER: 'rescue',
  RESCUE: 'rescue',
};

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();

async function nafcRows() {
  const page = await (
    await fetch(NAFC, { headers: { 'User-Agent': 'EmergenciesNearMe/1.0' } })
  ).text();
  const rows = [];
  for (const tr of page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => decode(m[1]),
    );
    if (cells.length < 5 || cells[0] === 'callsign') continue;
    const [callsign, registration, category, make, model] = cells;
    const m = callsign.match(/^([A-Z]+) (\d+)$/);
    if (!m || !ROLES[m[1]] || !registration) continue;
    rows.push({
      callsign,
      prefix: m[1],
      registration: registration.toUpperCase(),
      category,
      make,
      model,
    });
  }
  return rows;
}

async function hexByRegistration() {
  const buf = Buffer.from(await (await fetch(DB)).arrayBuffer());
  const map = new Map();
  for (const line of gunzipSync(buf).toString('utf8').split('\n')) {
    const f = line.split(';');
    if (f.length >= 3 && f[1])
      map.set(f[1].toUpperCase(), {
        hex: f[0].toLowerCase(),
        type: f[2] || null,
      });
  }
  return map;
}

const [rows, db] = await Promise.all([nafcRows(), hexByRegistration()]);
const seen = new Set();
const fleet = [];
let missing = 0;
for (const r of rows) {
  const hit = db.get(r.registration);
  if (!hit) {
    missing++;
    continue;
  }
  if (seen.has(hit.hex)) continue;
  seen.add(hit.hex);
  fleet.push({
    hex: hit.hex,
    registration: r.registration,
    callsign: r.callsign,
    role: ROLES[r.prefix],
    rotor:
      r.category.startsWith('RW') ||
      r.prefix === 'HELITAK' ||
      r.prefix === 'GUARDIAN',
    // Type 1 = large air tanker / heavy helicopter; type 4 SEAT = single engine.
    class: r.category,
    type: hit.type,
    model: [r.make, r.model].filter(Boolean).join(' '),
  });
}
fleet.sort((a, b) =>
  a.callsign.localeCompare(b.callsign, 'en', { numeric: true }),
);
writeFileSync(
  new URL('../backend/aircraft-fleet.json', import.meta.url),
  JSON.stringify(
    {
      built: new Date().toISOString().slice(0, 10),
      sources: [NAFC, 'tar1090-db'],
      fleet,
    },
    null,
    1,
  ) + '\n',
);
console.log(
  `fleet: ${fleet.length} aircraft (${missing} registrations without a hex code)`,
);
