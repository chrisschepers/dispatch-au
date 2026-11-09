// Places for the website: which suburb or locality an incident is in, so it
// can be listed on that place's page (/incidents/nsw/penrith), and which
// places lie nearby. The list is au-places.json (scripts/au-places.mjs,
// GeoNames postal codes, CC BY 4.0).
//
// The agencies write the place last: "Ivanhoe Rd, Balranald 2715" (NSW),
// "Oakview Pde, Caroline Springs" (VIC), "PINE RD & ORCHARD RD, RICHLANDS"
// (QLD), "ELIZABETH, MORPHETT VALE" (SA), "KAMBAH" (ACT). That name matches
// about 98% of incidents; the postcode or the point covers most of the rest.
import { readFileSync } from 'node:fs';

/** Furthest a matched name may lie from the incident's own point. */
const MAX_NAME_KM = 60;
/** Furthest the nearest place may be when the text names no place. */
const MAX_NEAREST_KM = 20;
const CELL = 0.25;

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) *
      Math.cos(lat2 * r) *
      Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// The feeds abbreviate where the gazetteer does not ("MT ELIZA", "PT COOK").
const ABBREV = { mt: 'mount', pt: 'point', nth: 'north', sth: 'south' };

/** A name reduced for matching: lower case, no punctuation, abbreviations written out. */
export function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => ABBREV[w] ?? w)
    .join(' ');
}

/** URL part: "St Kilda East" → "st-kilda-east", "O'Connor" → "oconnor". */
export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The place name in an agency's location text, plus a postcode if there is
 * one. "5.6Km Ne Of Noojee" and "SOUTH OF SPEEWAH" name the town after "of";
 * "Black Range (Stawell)" names a place and the town it is near.
 */
export function placeText(location) {
  const parts = String(location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let postcode = null;
  for (let k = parts.length - 1; k >= 0; k--) {
    let p = parts[k];
    const pc = p.match(/\b(\d{4})\s*$/);
    if (pc) {
      postcode ??= pc[1];
      p = p.slice(0, pc.index).trim();
    }
    p = p.replace(/\b(NSW|VIC|QLD|SA|ACT|NT|WA|TAS)\s*$/i, '').trim();
    if (!p) continue;
    // Warning areas: "Cloncurry and surrounding areas", "areas around Gayndah".
    p = p
      .replace(
        /\s+(?:and|&)\s+(?:the\s+)?surround(?:ing|s)(?:\s+areas?)?\s*$/i,
        '',
      )
      .replace(/^(?:the\s+)?(?:areas?|communities)\s+(?:around|near)\s+/i, '')
      .trim();
    const near = p.match(/\b(?:of|near)\s+(.+)$/i);
    if (near) p = near[1].trim();
    const bracket = p.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    return {
      names: bracket ? [bracket[1], bracket[2]] : [p],
      postcode,
    };
  }
  return { names: [], postcode };
}

export class PlaceIndex {
  constructor(rows) {
    this.byName = new Map();
    this.byPostcode = new Map();
    this.bySlug = new Map();
    this.grid = new Map();
    for (const [state, name, slug, lga, postcodes, lat, lon] of rows) {
      const place = {
        state,
        name,
        slug,
        lga,
        postcodes: postcodes ? postcodes.split(' ') : [],
        lat,
        lon,
      };
      const key = `${state}|${normName(name)}`;
      if (!this.byName.has(key)) this.byName.set(key, []);
      this.byName.get(key).push(place);
      for (const pc of place.postcodes) {
        const k = `${state}|${pc}`;
        if (!this.byPostcode.has(k)) this.byPostcode.set(k, []);
        this.byPostcode.get(k).push(place);
      }
      this.bySlug.set(`${state}/${slug}`, place);
      const cell = this.#cell(lat, lon);
      if (!this.grid.has(cell)) this.grid.set(cell, []);
      this.grid.get(cell).push(place);
    }
  }

  #cell(lat, lon) {
    return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
  }

  get size() {
    return this.bySlug.size;
  }

  get(state, slug) {
    return this.bySlug.get(`${state}/${slug}`) ?? null;
  }

  /** Places within `km` of a point, nearest first. */
  within(state, lat, lon, km) {
    const span = Math.ceil(km / (111 * CELL)) + 1;
    const ci = Math.floor(lat / CELL),
      cj = Math.floor(lon / CELL);
    const out = [];
    for (let di = -span; di <= span; di++)
      for (let dj = -span; dj <= span; dj++)
        for (const p of this.grid.get(`${ci + di}:${cj + dj}`) ?? []) {
          if (state && p.state !== state) continue;
          const d = distanceKm([lat, lon], [p.lat, p.lon]);
          if (d <= km) out.push({ place: p, km: d });
        }
    return out.sort((a, b) => a.km - b.km);
  }

  /** The place an incident is in, or null. `region` is the state key (nsw). */
  match(region, location, point = null) {
    const { names, postcode } = placeText(location);
    const closest = (list) => {
      if (!point) return list[0];
      let best = null;
      for (const p of list) {
        const d = distanceKm(point, [p.lat, p.lon]);
        if (!best || d < best.d) best = { p, d };
      }
      return best.d <= MAX_NAME_KM ? best.p : null;
    };
    for (const n of names) {
      const list = this.byName.get(`${region}|${normName(n)}`);
      const hit = list && closest(list);
      if (hit) return hit;
    }
    if (postcode) {
      const list = this.byPostcode.get(`${region}|${postcode}`);
      const hit = list && closest(list);
      if (hit) return hit;
    }
    if (point)
      return (
        this.within(region, point[0], point[1], MAX_NEAREST_KM)[0]?.place ??
        null
      );
    return null;
  }
}

let shared = null;

/** The bundled place list, loaded once. */
export function places(path = new URL('./au-places.json', import.meta.url)) {
  if (!shared)
    shared = new PlaceIndex(JSON.parse(readFileSync(path, 'utf8')).places);
  return shared;
}
