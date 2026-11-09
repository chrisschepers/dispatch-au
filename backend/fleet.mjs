// Builds the list of aircraft the aircraft layer follows (aircraft.mjs). Shared
// by scripts/aircraft-fleet.mjs, which writes the bundled aircraft-fleet.json,
// and the service, which rebuilds the list once a day: NAFC notes that call
// signs change regularly.
//
// Sources (facts only: call sign, registration, ICAO hex, type, operator):
// - NAFC call signs, https://www.nafc.org.au/call-signs/ (firefighting and
//   rescue call signs with their registration).
// - plane-alert-db (ODbL), https://github.com/sdr-enthusiasts/plane-alert-db
//   (operator of police, flying doctor and rescue aircraft).
// - tar1090-db aircraft.csv (registration -> ICAO hex and type; its
//   owner/operator field is only filled for recent registrations).
// - KNOWN below: rescue helicopters neither list names yet.
//
// Only organisations, never a private owner: names are matched against ORGS,
// and aircraft whose record asks for privacy (LADD, PIA) or is military are
// left out. Border Force and the military are not in ORGS on purpose.
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export const NAFC_URL = 'https://www.nafc.org.au/call-signs/';
export const PLANE_ALERT_URL =
  'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv';
export const TAR1090_URL =
  'https://github.com/wiedehopf/tar1090-db/raw/csv/aircraft.csv.gz';
export const SOURCES = [NAFC_URL, 'plane-alert-db (ODbL)', 'tar1090-db'];
const HEADERS = { 'User-Agent': 'EmergenciesNearMe/1.0' };

// Only the call signs that stand for firefighting or rescue work. FIREBIRD,
// BIRDDOG, FIRESPOTTER and PARKAIR are light aircraft that mostly fly other
// jobs; they are left out for now.
export const NAFC_ROLES = {
  BOMBER: 'bomber',
  HELITAK: 'helitak',
  GUARDIAN: 'transport',
  FIRESCAN: 'scanner',
  LIFESAVER: 'rescue',
  RESCUE: 'rescue',
};

// Helicopter type designators seen in the Australian register. Decides between
// an organisation's helicopter role and its plane role.
const ROTOR_TYPES = new Set(
  (
    'A109 A119 A139 A169 A189 AS32 AS50 AS55 AS65 B06 B105 B212 B214 B222 ' +
    'B230 B407 B412 B427 B429 B47G B47J B505 BK17 BRB2 CH7 EC20 EC30 EC35 ' +
    'EC45 EC55 EC75 EN28 EN48 EXEC EXEJ G2CA GAZL H160 H269 H47 H500 H60 ' +
    'KMAX MD52 MD60 NH90 R22 R44 R66 S52 S61 S70 S76 S92 TIGR UH1 UH12'
  ).split(' '),
);

const police = (name, match) => ({
  name,
  rotor: 'police',
  fixed: 'police',
  match,
});

// Organisations whose aircraft always show. `rotor` and `fixed` give the role
// of their helicopters and planes; null leaves that kind out (Toll's planes
// carry freight). Matched against plane-alert-db's operator and tar1090-db's
// owner/operator, so a bank that finances a helicopter ("Westpac Banking
// Corporation") or a police aero club does not count.
export const ORGS = [
  {
    name: 'Royal Flying Doctor Service',
    rotor: 'medical',
    fixed: 'medical',
    match: /royal flying doctor|\bRFDS\b/i,
  },
  {
    name: 'NSW Ambulance',
    rotor: 'rescue',
    fixed: 'medical',
    match: /\bNSW Ambulance|Ambulance Service of (NSW|New South Wales)/i,
  },
  {
    name: 'Toll Ambulance Rescue',
    rotor: 'rescue',
    fixed: null,
    match: /\bToll (Helicopters|Aeromedical|Ambulance)/i,
  },
  {
    name: 'Westpac Rescue Helicopter',
    rotor: 'rescue',
    fixed: null,
    match: /Westpac (Life ?Saver|Rescue)|Helicopter Rescue Service/i,
  },
  {
    name: 'CareFlight',
    rotor: 'rescue',
    fixed: 'medical',
    match: /\bcare ?flight/i,
  },
  {
    name: 'Air Ambulance Victoria',
    rotor: 'rescue',
    fixed: 'medical',
    match: /\bAir Ambulance Victoria|Victorian Air Ambulance/i,
  },
  // Before LifeFlight: "RACQ CQ Rescue" is not LifeFlight.
  {
    name: 'RACQ CQ Rescue',
    rotor: 'rescue',
    fixed: null,
    match: /\bCQ (Aeromedical|Rescue)|\bMac Rescue/i,
  },
  {
    name: 'LifeFlight',
    rotor: 'rescue',
    fixed: 'medical',
    match: /\blife ?flight|\bRACQ\b/i,
  },
  {
    name: 'QGAir',
    rotor: 'rescue',
    fixed: null,
    match: /^Queensland Government( Air( Wing)?)?$|\bQGAir\b/i,
  },
  {
    name: 'SA MedSTAR',
    rotor: 'rescue',
    fixed: 'medical',
    match: /\bMedSTAR|\bSA Ambulance|South Australian? Ambulance/i,
  },
  {
    name: 'RAC Rescue',
    rotor: 'rescue',
    fixed: null,
    match: /\bRAC Rescue|Royal Automobile Club of W/i,
  },
  {
    name: 'Ambulance Tasmania',
    rotor: 'rescue',
    fixed: 'medical',
    match: /\bAmbulance Tasmania/i,
  },
  {
    name: 'Snowy Hydro SouthCare',
    rotor: 'rescue',
    fixed: null,
    match: /\bSouthCare|\bSnowy Hydro/i,
  },
  police('NSW Police Force', /\b(NSW|New South Wales) Police/i),
  police('Victoria Police', /\bVictoria Police/i),
  police('Queensland Police', /\bQueensland Police/i),
  police('SA Police', /\b(SA|South Australian?) Police/i),
  police('WA Police', /\b(WA|Western Australian?) Police/i),
  police('NT Police', /\b(NT|Northern Territory) Police/i),
];

// Rescue helicopters neither source names yet (public knowledge: the operator's
// own registration series). The build still checks the type in tar1090-db, so
// a registration that is re-issued to another aircraft drops out.
export const KNOWN = [
  ...['TJE', 'TJF', 'TJG', 'TJH', 'TJI', 'TJJ', 'TJK', 'TJO'].map((r) => [
    `VH-${r}`,
    'A139',
    'Toll Ambulance Rescue',
  ]),
  ...['YXF', 'YXG', 'YXJ', 'YXK'].map((r) => [
    `VH-${r}`,
    'A139',
    'Air Ambulance Victoria',
  ]),
  ...['LF2', 'LF3', 'LF6'].map((r) => [`VH-${r}`, 'A139', 'LifeFlight']),
];

// In plane-alert-db, but a newer register snapshot shows another owner
// (checked 08-11-2026). Drop a registration here once plane-alert-db does.
export const EXCLUDE = new Set(['VH-FJK', 'VH-PSX', 'VH-LWO']);

export const isAustralian = (hex) =>
  /^[0-9a-f]{6}$/.test(hex) && hex >= '7c0000' && hex <= '7fffff';

export function orgFor(text) {
  if (!text) return null;
  return ORGS.find((o) => o.match.test(text)) ?? null;
}

const orgByName = new Map(ORGS.map((o) => [o.name, o]));

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();

/** NAFC call-sign table: one row per call sign with a firefighting or rescue role. */
export function parseNafc(page) {
  const rows = [];
  for (const tr of page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => decode(m[1]),
    );
    if (cells.length < 5 || cells[0] === 'callsign') continue;
    const [callsign, registration, category, make, model] = cells;
    const m = callsign.match(/^([A-Z]+) (\d+)$/);
    if (!m || !NAFC_ROLES[m[1]] || !registration) continue;
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

// One CSV line; plane-alert-db only quotes the odd link that holds a comma.
function csvFields(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/** plane-alert-db rows for Australian hex codes. */
export function parsePlaneAlert(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^7[c-f]/i.test(line)) continue;
    const [hex, registration, operator, typeName, type, cmpg, , , , category] =
      csvFields(line);
    const h = hex.toLowerCase();
    if (!isAustralian(h) || !registration) continue;
    rows.push({
      hex: h,
      registration: registration.toUpperCase(),
      operator,
      typeName,
      type,
      cmpg,
      category,
    });
  }
  return rows;
}

/**
 * Streams tar1090-db's gzipped aircraft.csv line by line and keeps Australian
 * hex codes plus the `wanted` registrations (NAFC also lists US and Canadian
 * tankers), so memory stays small: ~17,000 of ~620,000 rows.
 * Columns: hex;registration;type;flags;description;year;ownOp; and flags is
 * military, interesting, PIA, LADD as 0/1 (trailing zeros cut off).
 */
export async function readTar1090(body, wanted = new Set(), maxBytes = 64e6) {
  const input =
    typeof body?.getReader === 'function' ? Readable.fromWeb(body) : body;
  const byHex = new Map();
  const byReg = new Map();
  const keep = (line) => {
    const f = line.split(';');
    if (f.length < 3 || !f[1]) return;
    const hex = f[0].toLowerCase();
    const registration = f[1].toUpperCase();
    if (!/^[0-9a-f]{6}$/.test(hex)) return;
    if (!isAustralian(hex) && !wanted.has(registration)) return;
    const a = {
      hex,
      registration,
      type: f[2] || null,
      flags: f[3] || '',
      model: f[4] || null,
      ownOp: f[6] || null,
    };
    byHex.set(hex, a);
    byReg.set(registration, a);
  };
  let size = 0;
  // A runaway download must not fill the memory: stop at maxBytes (gzipped).
  const limit = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      done(size > maxBytes ? new Error('tar1090-db too large') : null, chunk);
    },
  });
  const decoder = new TextDecoder();
  let rest = '';
  await pipeline(input, limit, createGunzip(), async (source) => {
    for await (const chunk of source) {
      const lines = (rest + decoder.decode(chunk, { stream: true })).split(
        '\n',
      );
      rest = lines.pop() ?? '';
      for (const line of lines) keep(line);
    }
  });
  keep(rest + decoder.decode());
  return { byHex, byReg };
}

/** Privacy request (PIA, LADD) or military in tar1090-db's flags. */
const flagged = (flags) =>
  flags[0] === '1' || flags[2] === '1' || flags[3] === '1';

/**
 * The fleet from parsed sources: NAFC first (its role wins when an aircraft is
 * in both), then the police, rescue and medical aircraft of ORGS.
 * `doubtful` lists the candidates left out, with the reason.
 */
export function buildFleet({ nafc, planeAlert, db }) {
  const fleet = [];
  const seen = new Set();
  let missing = 0;
  for (const r of nafc) {
    const hit = db.byReg.get(r.registration);
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
      role: NAFC_ROLES[r.prefix],
      rotor:
        r.category.startsWith('RW') ||
        r.prefix === 'HELITAK' ||
        r.prefix === 'GUARDIAN' ||
        ROTOR_TYPES.has(hit.type),
      // Type 1 = large air tanker / heavy helicopter; type 4 SEAT = single engine.
      class: r.category,
      type: hit.type,
      model: [r.make, r.model].filter(Boolean).join(' '),
    });
  }
  fleet.sort((a, b) =>
    a.callsign.localeCompare(b.callsign, 'en', { numeric: true }),
  );

  // Candidates by hex. The register's own owner field comes first, then
  // plane-alert-db, then KNOWN.
  const doubtful = [];
  const candidates = new Map();
  const add = (hit, org, source, listedType = null) => {
    if (!candidates.has(hit.hex))
      candidates.set(hit.hex, { hit, org, source, listedType });
  };
  for (const a of db.byHex.values()) {
    const org = orgFor(a.ownOp);
    if (org && isAustralian(a.hex)) add(a, org, 'owner');
  }
  for (const r of planeAlert) {
    const org = orgFor(r.operator);
    if (!org || r.cmpg === 'Mil') continue;
    const hit = db.byHex.get(r.hex);
    if (!hit) doubtful.push([r.registration, 'not in tar1090-db']);
    else if (hit.registration !== r.registration)
      doubtful.push([r.registration, `hex now ${hit.registration}`]);
    else add(hit, org, 'plane-alert-db', r.type || null);
  }
  for (const [registration, type, name] of KNOWN) {
    const hit = db.byReg.get(registration);
    if (!hit || hit.type !== type)
      doubtful.push([registration, `not a ${type} in tar1090-db`]);
    else add(hit, orgByName.get(name), 'known');
  }

  // A plane-alert-db type that differs from the register's means the
  // registration may have moved to another aircraft. Accept it only when the
  // register names the same organisation or it is a type that organisation
  // already flies.
  const types = new Map();
  const consistent = (c) =>
    c.source !== 'plane-alert-db' ||
    c.listedType === c.hit.type ||
    orgFor(c.hit.ownOp) === c.org;
  for (const c of candidates.values()) {
    if (!consistent(c)) continue;
    if (!types.has(c.org)) types.set(c.org, new Set());
    types.get(c.org).add(c.hit.type);
  }
  const extra = [];
  for (const c of candidates.values()) {
    const { hit, org } = c;
    if (seen.has(hit.hex)) continue;
    if (!consistent(c) && !types.get(org)?.has(hit.type)) {
      doubtful.push([
        hit.registration,
        `listed as ${c.listedType}, register says ${hit.type}`,
      ]);
      continue;
    }
    if (EXCLUDE.has(hit.registration)) {
      doubtful.push([hit.registration, 'another owner in a newer register']);
      continue;
    }
    if (flagged(hit.flags)) {
      doubtful.push([hit.registration, 'privacy or military flag']);
      continue;
    }
    const rotor = ROTOR_TYPES.has(hit.type);
    const role = rotor ? org.rotor : org.fixed;
    if (!role) continue;
    seen.add(hit.hex);
    extra.push({
      hex: hit.hex,
      registration: hit.registration,
      callsign: null,
      role,
      rotor,
      class: null,
      type: hit.type,
      model: hit.model,
      operator: org.name,
    });
  }
  extra.sort((a, b) => a.registration.localeCompare(b.registration));
  fleet.push(...extra);
  const counts = {};
  for (const a of fleet) counts[a.role] = (counts[a.role] || 0) + 1;
  return { fleet, counts, missing, doubtful };
}

async function get(fetcher, url, timeoutMs) {
  const res = await fetcher(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} HTTP ${res.status}`);
  return res;
}

async function text(res, maxBytes) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Source too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Downloads all sources and builds the fleet. Every fetch has its own timeout. */
export async function fetchFleet({
  fetcher = fetch,
  timeoutMs = 120_000,
} = {}) {
  const [page, alerts] = await Promise.all([
    get(fetcher, NAFC_URL, 30_000).then((r) => text(r, 4e6)),
    get(fetcher, PLANE_ALERT_URL, 60_000).then((r) => text(r, 16e6)),
  ]);
  const nafc = parseNafc(page);
  const planeAlert = parsePlaneAlert(alerts);
  const wanted = new Set([
    ...nafc.map((r) => r.registration),
    ...KNOWN.map(([r]) => r),
  ]);
  const res = await get(fetcher, TAR1090_URL, timeoutMs);
  const db = await readTar1090(res.body, wanted);
  return buildFleet({ nafc, planeAlert, db });
}
