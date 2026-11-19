// Fire Danger Ratings (AFDRS) and Total Fire Bans per district, for today and
// tomorrow. Only sources whose licence demonstrably allows commercial reuse
// are in here (researched 19-11-2026, see the pull request):
//
// - NSW Rural Fire Service, fdrToban.xml: CC BY 4.0, listed on the RFS feeds
//   page and on data.nsw.gov.au. It carries the 20 NSW fire areas and the ACT.
//
// Not in here, on purpose: Victoria (CFA's feed is "personal, non-commercial
// use only"; the same figures sit in the VicEmergency feed, whose commercial
// use is not confirmed), South Australia (the feed has no licence of its own,
// data.sa.gov.au marks CFS data and the district boundaries CC BY-NC-ND),
// Queensland, Western Australia, Tasmania and the Northern Territory, and
// anything fetched from the Bureau of Meteorology.
//
// Off unless FIRE_DANGER_ENABLED is switched on.
import { XMLParser } from 'fast-xml-parser';
import { EntityDecoder, XML } from '@nodable/entities';
import { SyntaxValidator } from 'fast-xml-validator';
import { skipCounter } from './skipped.mjs';
import { places as bundledPlaces } from './places.mjs';

/** The AFDRS ratings, lowest first. */
export const RATINGS = [
  'No Rating',
  'Moderate',
  'High',
  'Extreme',
  'Catastrophic',
];

export const fireDangerSources = {
  'nsw-rfs': {
    name: 'NSW Rural Fire Service',
    states: ['nsw', 'act'],
    timeZone: 'Australia/Sydney',
    // The ratings change once or twice a day; a ban can be declared any time.
    interval: 30 * 60_000,
    staleAfter: 3 * 3600_000,
    url: 'https://www.rfs.nsw.gov.au/feeds/fdrToban.xml',
    adviceUrl: 'https://www.rfs.nsw.gov.au/fire-information/fdr-and-tobans',
    attribution:
      '© State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au.',
    licenseUrl:
      'https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds',
  },
};

/** Fire danger is fetched and served only when FIRE_DANGER_ENABLED is on. */
export function fireDangerOn(env = process.env) {
  return ['aan', 'on', 'true', '1'].includes(
    String(env.FIRE_DANGER_ENABLED ?? '')
      .trim()
      .toLowerCase(),
  );
}

const text = (v, max = 200) =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).trim().slice(0, max)
    : '';

const RATING_WORDS = new Map([
  ['none', 'No Rating'],
  ['no rating', 'No Rating'],
  ['moderate', 'Moderate'],
  ['high', 'High'],
  ['extreme', 'Extreme'],
  ['catastrophic', 'Catastrophic'],
]);

/**
 * A source's wording as an AFDRS rating. Empty means the source gave none
 * (null); a word we do not know is `undefined`, so the caller can skip the
 * record instead of guessing a rating.
 */
export function afdrsRating(value) {
  const word = text(value).toLowerCase().replace(/\s+/g, ' ');
  if (!word) return null;
  return RATING_WORDS.get(word);
}

function banFlag(value) {
  const word = text(value).toLowerCase();
  return word === 'yes' ? true : word === 'no' ? false : undefined;
}

/** The calendar day at `ms` in a time zone, plus `days`: "2026-11-19". */
export function localDay(ms, timeZone, days = 0) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  if (!days) return day;
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * NSW RFS fdrToban.xml. One <District> per fire area with today's and
 * tomorrow's rating and Total Fire Ban; region 8 is the ACT. The file has no
 * time of its own, so `issuedAt` is the Last-Modified the server gave.
 * A district we cannot read is skipped and counted; only a file in which
 * every district is rejected fails.
 */
export function parseNSWFireDanger(
  xml,
  { issuedAt = null, now = Date.now() } = {},
) {
  if (
    typeof xml !== 'string' ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    SyntaxValidator.validate(xml, { multipleRoots: false }) !== true
  )
    throw Error('Invalid NSW fire danger XML');
  const parsed = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: true,
    entityDecoder: new EntityDecoder({
      namedEntities: XML,
      numericAllowed: true,
    }),
  }).parse(xml);
  const map = parsed?.FireDangerMap;
  if (map == null || typeof map !== 'object')
    throw Error('Invalid NSW fire danger map');
  const rows = map.District
    ? Array.isArray(map.District)
      ? map.District
      : [map.District]
    : [];
  if (!rows.length) throw Error('NSW fire danger map without districts');
  if (rows.length > 200) throw Error('NSW fire danger map too large');
  const source = fireDangerSources['nsw-rfs'];
  const today = localDay(now, source.timeZone);
  const tomorrow = localDay(now, source.timeZone, 1);
  const skipped = skipCounter();
  const districts = new Map();
  for (const row of rows) {
    const name = text(row?.Name, 80);
    const number = text(row?.RegionNumber, 8);
    if (!name || !/^\d{1,3}$/.test(number)) {
      skipped.skip('Incomplete NSW fire district');
      continue;
    }
    const ratings = [
      afdrsRating(row.DangerLevelToday),
      afdrsRating(row.DangerLevelTomorrow),
    ];
    if (ratings.includes(undefined)) {
      skipped.skip('Unknown NSW fire danger rating');
      continue;
    }
    const bans = [banFlag(row.FireBanToday), banFlag(row.FireBanTomorrow)];
    if (bans.includes(undefined)) {
      skipped.skip('Unknown NSW fire ban value');
      continue;
    }
    // The ACT is published by the RFS as region 8 of the same map.
    const state = /^act$/i.test(name) ? 'act' : 'nsw';
    const districtId = `${state}:${Number(number)}`;
    if (districts.has(districtId)) {
      skipped.skip('Duplicate NSW fire district');
      continue;
    }
    districts.set(districtId, {
      state,
      district: name,
      districtId,
      councils: text(row.Councils, 2000)
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean),
      today: { date: today, rating: ratings[0], totalFireBan: bans[0] },
      tomorrow: { date: tomorrow, rating: ratings[1], totalFireBan: bans[1] },
      issuedAt,
      source: 'nsw-rfs',
      attribution: source.attribution,
    });
  }
  skipped.check(rows.length, 'NSW fire district');
  return { districts: [...districts.values()], skipped: skipped.summary() };
}

const parsers = { 'nsw-rfs': parseNSWFireDanger };

/** A council name reduced for matching: "Bayside (NSW)" → "bayside". */
function councilKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z]+/g, '');
}

/** "Southern parts of Murrumbidgee" → "Murrumbidgee", and that it is a part. */
function councilPart(name) {
  const m = String(name).match(/^(?:\w+ )?parts? of (.+)$/i);
  return m ? { name: m[1], part: true } : { name, part: false };
}

/** Furthest the nearest known locality may lie from the asked point. */
export const MAX_LOCALITY_KM = 60;
/** Furthest we look for a neighbour that settles a split or unlisted council. */
const MAX_NEIGHBOUR_KM = 250;
/** A failed source is tried again after this long. */
const RETRY_MS = 5 * 60_000;
/** How often the server calls refresh(); the sources decide what is due. */
export const TICK_MS = 5 * 60_000;

/**
 * Which district a point lies in. There are no district boundaries under a
 * licence we may use, so this goes by name: the nearest locality in the
 * bundled place list (GeoNames, CC BY 4.0) has a council, and the RFS file
 * lists the councils of each fire area. Near a council border the nearest
 * locality can be on the other side; `match` in the answer says how the
 * district was found, so the app never presents it as surveyed.
 *
 * - A council split over two fire areas ("Northern parts of Murrumbidgee")
 *   or one the file does not list (Unincorporated NSW) takes the district of
 *   the nearest locality whose council is unambiguous.
 * - A locality in the ACT is the ACT district.
 */
export function districtAt(districts, lat, lon, index) {
  const near = index.within(null, lat, lon, MAX_LOCALITY_KM)[0];
  if (!near) return { district: null, match: null };
  const { place, km } = near;
  const match = {
    method: 'nearest-locality',
    locality: place.name,
    council: place.lga || null,
    state: place.state,
    km: Math.round(km * 10) / 10,
  };
  const inState = districts.filter((d) => d.state === place.state);
  if (!inState.length) return { district: null, match };
  if (place.state === 'act') return { district: inState[0], match };

  // council key → the districts that name it, whole or in part
  const whole = new Map();
  const partial = new Map();
  for (const d of inState)
    for (const council of d.councils) {
      const { name, part } = councilPart(council);
      const key = councilKey(name);
      const into = part ? partial : whole;
      if (!into.has(key)) into.set(key, []);
      into.get(key).push(d);
    }
  const wholeFor = (lga) => {
    const key = councilKey(lga);
    if (!key) return null;
    const exact = whole.get(key);
    if (exact) return exact.length === 1 ? exact[0] : null;
    // "Nambucca" in the file is "Nambucca Valley" in the place list.
    const close = [...whole.entries()].filter(
      ([k]) => k.length >= 5 && (key.startsWith(k) || k.startsWith(key)),
    );
    return close.length === 1 && close[0][1].length === 1
      ? close[0][1][0]
      : null;
  };
  const direct = wholeFor(place.lga);
  if (direct) return { district: direct, match };

  const candidates = partial.get(councilKey(place.lga)) ?? null;
  for (const other of index.within(place.state, lat, lon, MAX_NEIGHBOUR_KM)) {
    const d = wholeFor(other.place.lga);
    if (!d || (candidates && !candidates.includes(d))) continue;
    return {
      district: d,
      match: {
        ...match,
        method: 'nearest-neighbouring-council',
        neighbour: other.place.lga,
      },
    };
  }
  return { district: null, match };
}

async function readBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit)
    throw Error('Source too large');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw Error('Source too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches the approved sources and keeps the last good answer of each in
 * memory. A source that fails keeps its previous districts and is reported
 * as failed; after `staleAfter` without a good answer its districts are
 * marked stale, because "today" may then be yesterday's.
 */
export class FireDangerService {
  constructor({
    fetcher = fetch,
    places = bundledPlaces,
    now = () => Date.now(),
    sources = fireDangerSources,
  } = {}) {
    this.fetcher = fetcher;
    this.places = places;
    this.now = now;
    this.sources = sources;
    this.state = new Map(
      Object.keys(sources).map((id) => [
        id,
        {
          districts: [],
          fetchedAt: null,
          lastAttemptAt: null,
          failures: 0,
          error: null,
          skipped: null,
        },
      ]),
    );
  }

  /**
   * One round over every source that is due: every `interval`, and five
   * minutes after a failed attempt. Called every few minutes. Never throws.
   */
  async refresh({ force = false } = {}) {
    const due = Object.keys(this.sources).filter((id) => {
      const s = this.state.get(id);
      const since = this.now() - Date.parse(s.lastAttemptAt || '');
      const wait = s.failures ? RETRY_MS : this.sources[id].interval;
      return force || !s.lastAttemptAt || since >= wait - 5000;
    });
    await Promise.all(due.map((id) => this.#collect(id)));
  }

  async #collect(id) {
    const config = this.sources[id];
    const s = this.state.get(id);
    const at = this.now();
    s.lastAttemptAt = new Date(at).toISOString();
    try {
      const response = await this.fetcher(config.url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/xml',
          'User-Agent': 'Dispatch/0.1 (public incident feed)',
        },
      });
      if (!response.ok) throw Error(`Source HTTP ${response.status}`);
      const body = await readBody(response, 1_000_000);
      const modified = Date.parse(response.headers.get('last-modified') || '');
      const result = parsers[id](body, {
        issuedAt: Number.isFinite(modified)
          ? new Date(modified).toISOString()
          : null,
        now: at,
      });
      s.districts = result.districts;
      s.skipped = result.skipped;
      s.fetchedAt = s.lastAttemptAt;
      s.failures = 0;
      s.error = null;
    } catch (error) {
      s.failures++;
      s.error =
        error instanceof Error
          ? error.message.slice(0, 160)
          : 'Source unavailable';
      console.warn(
        JSON.stringify({ fireDanger: id, error: s.error, at: s.lastAttemptAt }),
      );
    }
  }

  #stale(id) {
    const s = this.state.get(id);
    const fetched = Date.parse(s.fetchedAt || '');
    if (!Number.isFinite(fetched)) return true;
    if (this.now() - fetched > this.sources[id].staleAfter) return true;
    // Past midnight the last answer's "today" is yesterday.
    const day = localDay(this.now(), this.sources[id].timeZone);
    return s.districts.some((d) => d.today.date !== day);
  }

  #districts() {
    const out = [];
    for (const [id, s] of this.state) {
      const stale = this.#stale(id);
      for (const d of s.districts) out.push({ ...d, stale });
    }
    return out;
  }

  #sourceList() {
    return [...this.state.keys()].map((id) => {
      const config = this.sources[id];
      return {
        source: id,
        name: config.name,
        states: config.states,
        attribution: config.attribution,
        licenseUrl: config.licenseUrl,
        adviceUrl: config.adviceUrl,
        fetchedAt: this.state.get(id).fetchedAt,
        stale: this.#stale(id),
      };
    });
  }

  /** Every district we have, with the sources and their attribution. */
  all() {
    return {
      districts: this.#districts(),
      ratings: RATINGS,
      sources: this.#sourceList(),
    };
  }

  /** The district a point lies in (see districtAt), or `district: null`. */
  at(lat, lon) {
    const found = districtAt(this.#districts(), lat, lon, this.places());
    const sources = this.#sourceList();
    return {
      district: found.district,
      match: found.match,
      // Covered: a state we have a source for. Outside it there is no answer.
      covered: sources.some((s) => s.states.includes(found.match?.state)),
      sources: found.district
        ? sources.filter((s) => s.source === found.district.source)
        : sources,
    };
  }

  /** For /v1/status: per source whether it answered, and when. */
  status() {
    return [...this.state.entries()].map(([id, s]) => {
      const ready = !!s.fetchedAt;
      const stale = this.#stale(id);
      return {
        source: id,
        ready,
        stale,
        state: !ready ? 'unavailable' : stale ? 'delayed' : 'healthy',
        districts: s.districts.length,
        fetchedAt: s.fetchedAt,
        lastAttemptAt: s.lastAttemptAt,
        consecutiveFailures: s.failures,
        staleAfterMs: this.sources[id].staleAfter,
        pollIntervalMs: this.sources[id].interval,
        error: s.error,
        skipped: s.skipped,
      };
    });
  }
}
