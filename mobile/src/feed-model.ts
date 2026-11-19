import {
  distanceKm,
  safeGeometry,
  type Incident as BaseIncident,
  type Category as BaseCategory,
} from './domain/incidents.ts';
import { suggestedPlaces, type Place } from './domain/places.ts';
export type Region = 'au' | 'vic' | 'act' | 'nsw' | 'qld' | 'sa' | 'wa';
/** De staten die de app kent. Een rij uit een onbekende staat wordt overgeslagen. */
export const STATEN = ['vic', 'act', 'nsw', 'qld', 'sa', 'wa'] as const;
/**
 * Wie een rij publiceert, zoals de feed het zegt (`credits`, sinds 19-11-2026).
 * Nodig sinds er meer dan één bron per staat kan zijn: een verkeersongeval van
 * Live Traffic NSW mag niet "Source: NSW Rural Fire Service" krijgen.
 */
export type Credit = {
  sourceFeed: string;
  name: string;
  attribution: string;
  licenseUrl: string;
  adviceUrl: string;
};
export type Category = BaseCategory | 'ambulance';
export type Incident = Omit<BaseIncident, 'category'> & {
  category: Category;
  /** De bron van precies deze rij, als de feed die noemt. */
  credit?: Credit | null;
  firstSeen: string;
  lastSeen: string;
  listed: boolean;
};
export type Feed = {
  region: Region;
  incidents: Incident[];
  warnings: Incident[];
  credits?: Credit[];
  source: string;
  attribution: string;
  licenseUrl: string;
  adviceUrl: string;
  coverageNote: string | null;
  fetchedAt: string;
  sourceUpdated: string | null;
  historyStartedAt: string;
  historyHours: number;
  stale: boolean;
  staleAfterMs: number;
  sources?: {
    region: Exclude<Region, 'au'>;
    ready: boolean;
    stale: boolean;
    fetchedAt: string | null;
  }[];
};
export const regions = {
  sa: {
    label: 'South Australia',
    all: 'All South Australia',
    source: 'SA Country Fire Service',
    adviceUrl: 'https://www.cfs.sa.gov.au/incidents/',
    timeZone: 'Australia/Adelaide',
    timeLabel: 'South Australia time',
    centre: {
      latitude: -30,
      longitude: 135,
      latitudeDelta: 13,
      longitudeDelta: 13,
    },
    places: [] as Place[],
  },
  wa: {
    label: 'Western Australia',
    all: 'All Western Australia',
    source: 'Emergency WA',
    adviceUrl: 'https://www.emergency.wa.gov.au/',
    timeZone: 'Australia/Perth',
    timeLabel: 'Western Australia time',
    centre: {
      latitude: -26,
      longitude: 121,
      latitudeDelta: 24,
      longitudeDelta: 24,
    },
    places: [
      { id: 'perth', name: 'Perth', lat: -31.9523, lng: 115.8613, radius: 25 },
      { id: 'bunbury', name: 'Bunbury', lat: -33.3271, lng: 115.6414, radius: 25 },
    ] as Place[],
  },
  au: {
    label: 'Australia',
    all: 'All Australia',
    source: 'Australian emergency sources',
    adviceUrl: 'https://www.australia.gov.au/',
    timeZone: 'Australia/Sydney',
    timeLabel: 'Sydney time',
    centre: {
      latitude: -28,
      longitude: 140,
      latitudeDelta: 32,
      longitudeDelta: 32,
    },
    places: [] as Place[],
  },
  nsw: {
    label: 'New South Wales',
    all: 'All NSW',
    source: 'NSW Rural Fire Service',
    adviceUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    timeZone: 'Australia/Sydney',
    timeLabel: 'NSW time',
    centre: {
      latitude: -32,
      longitude: 147,
      latitudeDelta: 11,
      longitudeDelta: 11,
    },
    places: [
      {
        id: 'sydney',
        name: 'Sydney',
        lat: -33.8688,
        lng: 151.2093,
        radius: 25,
      },
      {
        id: 'newcastle',
        name: 'Newcastle',
        lat: -32.9283,
        lng: 151.7817,
        radius: 25,
      },
      {
        id: 'wollongong',
        name: 'Wollongong',
        lat: -34.4278,
        lng: 150.8931,
        radius: 25,
      },
      {
        id: 'albury',
        name: 'Albury',
        lat: -36.0737,
        lng: 146.9135,
        radius: 25,
      },
      {
        id: 'wagga',
        name: 'Wagga Wagga',
        lat: -35.1082,
        lng: 147.3598,
        radius: 25,
      },
    ] as Place[],
  },
  qld: {
    label: 'Queensland',
    all: 'All Queensland',
    source: 'Queensland Fire Department',
    adviceUrl: 'https://www.fire.qld.gov.au/Current-Incidents',
    timeZone: 'Australia/Brisbane',
    timeLabel: 'Queensland time',
    centre: {
      latitude: -22.5,
      longitude: 145,
      latitudeDelta: 21,
      longitudeDelta: 21,
    },
    places: [
      {
        id: 'brisbane',
        name: 'Brisbane',
        lat: -27.4698,
        lng: 153.0251,
        radius: 25,
      },
      {
        id: 'gold-coast',
        name: 'Gold Coast',
        lat: -28.0167,
        lng: 153.4,
        radius: 25,
      },
      {
        id: 'sunshine-coast',
        name: 'Sunshine Coast',
        lat: -26.65,
        lng: 153.0667,
        radius: 25,
      },
      {
        id: 'townsville',
        name: 'Townsville',
        lat: -19.259,
        lng: 146.8169,
        radius: 25,
      },
      {
        id: 'cairns',
        name: 'Cairns',
        lat: -16.9186,
        lng: 145.7781,
        radius: 25,
      },
    ] as Place[],
  },
  vic: {
    timeZone: 'Australia/Melbourne',
    timeLabel: 'Victoria time',
    label: 'Victoria',
    all: 'All Victoria',
    source: 'VicEmergency',
    adviceUrl: 'https://emergency.vic.gov.au/respond/',
    centre: {
      latitude: -37.2,
      longitude: 145,
      latitudeDelta: 6,
      longitudeDelta: 6,
    },
    places: suggestedPlaces,
  },
  act: {
    timeZone: 'Australia/Sydney',
    timeLabel: 'Canberra time',
    label: 'Canberra / ACT',
    all: 'All ACT',
    source: 'ACT Emergency Services Agency',
    adviceUrl: 'https://esa.act.gov.au/',
    centre: {
      latitude: -35.3,
      longitude: 149.1,
      latitudeDelta: 0.65,
      longitudeDelta: 0.65,
    },
    places: [
      {
        id: 'canberra',
        name: 'Canberra',
        lat: -35.2809,
        lng: 149.13,
        radius: 25,
      },
      {
        id: 'belconnen',
        name: 'Belconnen',
        lat: -35.237,
        lng: 149.066,
        radius: 10,
      },
      {
        id: 'gungahlin',
        name: 'Gungahlin',
        lat: -35.184,
        lng: 149.133,
        radius: 10,
      },
      {
        id: 'tuggeranong',
        name: 'Tuggeranong',
        lat: -35.415,
        lng: 149.067,
        radius: 10,
      },
      {
        id: 'woden',
        name: 'Woden Valley',
        lat: -35.346,
        lng: 149.087,
        radius: 10,
      },
    ] as Place[],
  },
};
regions.au.places = [
  ...regions.vic.places,
  ...regions.act.places,
  ...regions.nsw.places,
  ...regions.qld.places,
  ...regions.wa.places,
];
export function rowRegion(row: Incident): Exclude<Region, 'au'> {
  return row.id.split(':')[0] as Exclude<Region, 'au'>;
}
const date = (v: unknown): v is string =>
  typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v));
export function parseFeed(value: unknown, region: Region): Feed {
  if (!value || typeof value !== 'object') throw Error('Invalid feed');
  const f = value as Feed;
  if (
    f.region !== region ||
    !date(f.fetchedAt) ||
    !date(f.historyStartedAt) ||
    !Array.isArray(f.incidents) ||
    !Array.isArray(f.warnings) ||
    f.incidents.length + f.warnings.length > 15000 ||
    typeof f.stale !== 'boolean'
  )
    throw Error('Invalid feed');
  for (const key of ['attribution', 'licenseUrl'] as const)
    if (typeof f[key] !== 'string' || f[key].length > 1000)
      throw Error('Invalid attribution');
  if (
    f.coverageNote !== null &&
    (typeof f.coverageNote !== 'string' || f.coverageNote.length > 1000)
  )
    throw Error('Invalid coverage');
  if (![24, 72, 168].includes(f.historyHours)) throw Error('Invalid history');
  const credits = parseCredits(f.credits);
  // De landelijke feed mag een staat bevatten die deze versie nog niet kent:
  // die rijen vallen weg in plaats van dat de hele feed wordt afgekeurd
  // (tot 1.2.0 gooide één rij uit een nieuwe staat alles weg).
  const bekend = (r: Incident) =>
    region !== 'au' || (STATEN as readonly string[]).includes(String(r?.id ?? '').split(':')[0]);
  const parseRow = (r: Incident): Incident => {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !(region === 'au'
        ? (STATEN as readonly string[]).includes(r.id.split(':')[0])
        : r.id.startsWith(region + ':')) ||
      ![
        'fire',
        'rescue',
        'storm',
        'hazmat',
        'planned',
        'other',
        'ambulance',
      ].includes(r.category) ||
      !['incident', 'warning'].includes(r.kind) ||
      !date(r.firstSeen) ||
      !date(r.lastSeen) ||
      typeof r.listed !== 'boolean'
    )
      throw Error('Invalid incident');
    for (const key of [
      'title',
      'location',
      'status',
      'agency',
      'sourceId',
      'sourceFeed',
    ] as const)
      if (typeof r[key] !== 'string' || r[key].length > 500)
        throw Error('Invalid incident text');
    const p = r.point;
    const point: [number, number] | null =
      Array.isArray(p) &&
      p.length === 2 &&
      p.every(Number.isFinite) &&
      Math.abs(p[0]) <= 90 &&
      Math.abs(p[1]) <= 180
        ? [p[0], p[1]]
        : null;
    return {
      ...r,
      point,
      geometry: safeGeometry(r.geometry),
      created: date(r.created) ? r.created : null,
      updated: date(r.updated) ? r.updated : null,
      officialUrl: credits.get(r.sourceFeed)?.adviceUrl ?? regions[rowRegion(r)].adviceUrl,
      credit: credits.get(r.sourceFeed) ?? null,
      action: typeof r.action === 'string' ? r.action.slice(0, 1000) : null,
      resources:
        Number.isInteger(r.resources) && r.resources! >= 0 ? r.resources : null,
    };
  };
  return {
    ...f,
    sources: parseSourceStatus(f.sources),
    source: regions[region].source,
    adviceUrl: regions[region].adviceUrl,
    staleAfterMs: ['nsw', 'qld'].includes(region)
      ? 2400000
      : ['sa', 'wa'].includes(region)
        ? 900000
        : 300000,
    sourceUpdated: date(f.sourceUpdated) ? f.sourceUpdated : null,
    credits: [...credits.values()],
    incidents: f.incidents.filter(bekend).map(parseRow),
    warnings: f.warnings.filter(bekend).map(parseRow).filter((r) => r.listed),
  };
}
export function incidentTime(row: Incident) {
  return row.created || row.updated || row.firstSeen;
}
export function isStale(feed: Feed, now = Date.now()) {
  return (
    feed.stale ||
    !!feed.sources?.some((s) => sourceDelayed(s, now)) ||
    now - Date.parse(feed.fetchedAt) > feed.staleAfterMs ||
    Date.parse(feed.fetchedAt) > now + 120000
  );
}
function sourceLimit(region: Region) {
  return ['nsw', 'qld'].includes(region)
    ? 2400000
    : ['sa', 'wa'].includes(region)
      ? 900000
      : 300000;
}
/**
 * De bronvermeldingen uit de feed, op `sourceFeed`. Alleen https-links en
 * korte teksten; een oudere backend stuurt ze niet, dan is de lijst leeg en
 * geldt de bron van de staat.
 */
function parseCredits(value: unknown): Map<string, Credit> {
  const uit = new Map<string, Credit>();
  if (!Array.isArray(value)) return uit;
  const tekst = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const link = (v: unknown) => tekst(v, 300) && /^https:\/\//.test(v as string);
  for (const c of value.slice(0, 30) as Credit[]) {
    if (!c || !tekst(c.sourceFeed, 40) || !tekst(c.name, 80) || !tekst(c.attribution, 400) || !link(c.licenseUrl) || !link(c.adviceUrl)) continue;
    uit.set(c.sourceFeed, {
      sourceFeed: c.sourceFeed, name: c.name, attribution: c.attribution,
      licenseUrl: c.licenseUrl, adviceUrl: c.adviceUrl,
    });
  }
  return uit;
}
function parseSourceStatus(value: unknown): Feed['sources'] {
  if (value === undefined) return undefined; // Compatible with older collector responses.
  if (!Array.isArray(value) || value.length > 12)
    throw Error('Invalid source status');
  const seen = new Set();
  // Een staat die deze versie niet kent telt niet mee, en keurt niets af.
  return value.filter((s) => (STATEN as readonly string[]).includes(s?.region)).map((s) => {
    if (
      !s ||
      seen.has(s.region) ||
      typeof s.ready !== 'boolean' ||
      typeof s.stale !== 'boolean' ||
      !(s.fetchedAt === null || date(s.fetchedAt))
    )
      throw Error('Invalid source status');
    seen.add(s.region);
    return {
      region: s.region,
      ready: s.ready,
      stale: s.stale,
      fetchedAt: s.fetchedAt,
    };
  });
}
function sourceDelayed(s: NonNullable<Feed['sources']>[number], now: number) {
  const t = Date.parse(s.fetchedAt || '');
  return (
    !s.ready ||
    s.stale ||
    !Number.isFinite(t) ||
    now - t > sourceLimit(s.region) ||
    t > now + 120000
  );
}
export function delayedSourceText(feed: Feed | null, now = Date.now()) {
  if (!feed) return '';
  const delayed = feed.sources?.filter((s) => sourceDelayed(s, now));
  if (delayed?.length)
    return delayed
      .map((s) => {
        const age = Math.max(
          0,
          Math.floor((now - Date.parse(s.fetchedAt || '')) / 60000),
        );
        const last = !s.fetchedAt
          ? 'No successful update yet'
          : `Last received ${age < 1 ? 'just now' : age < 60 ? `${age} min ago` : `${Math.floor(age / 60)}h ago`}`;
        return `${regions[s.region].label}: updates delayed. ${last}.`;
      })
      .join('\n');
  return isStale(feed, now)
    ? 'Updates delayed. Showing the last received information.'
    : '';
}
export function filterIncidents(
  rows: Incident[],
  f: {
    query: string;
    category: Category | 'all';
    includePlanned: boolean;
    respondingOnly: boolean;
    centre: [number, number] | null;
    radius: number;
  },
) {
  const q = f.query.trim().toLowerCase();
  return rows
    .filter(
      (r) =>
        (!q ||
          `${r.title} ${r.location} ${r.agency}`.toLowerCase().includes(q)) &&
        (f.category === 'all' || r.category === f.category) &&
        (f.includePlanned || r.category !== 'planned') &&
        (!f.respondingOnly ||
          (r.listed &&
            /responding|on scene|not yet|going|under control|resource allocation pending/i.test(
              r.status,
            ))) &&
        (!f.centre || (r.point && distanceKm(f.centre, r.point) <= f.radius)),
    )
    .sort((a, b) => Date.parse(incidentTime(b)) - Date.parse(incidentTime(a)));
}
