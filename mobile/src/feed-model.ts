import {
  distanceKm,
  safeGeometry,
  type Incident as BaseIncident,
  type Category as BaseCategory,
} from './domain/incidents.ts';
import { suggestedPlaces, type Place } from './domain/places.ts';
export type Region = 'au' | 'vic' | 'act' | 'nsw' | 'qld' | 'sa';
export type Category = BaseCategory | 'ambulance';
export type Incident = Omit<BaseIncident, 'category'> & {
  category: Category;
  firstSeen: string;
  lastSeen: string;
  listed: boolean;
};
export type Feed = {
  region: Region;
  incidents: Incident[];
  warnings: Incident[];
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
  const parseRow = (r: Incident): Incident => {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !(region === 'au'
        ? ['vic', 'act', 'nsw', 'qld', 'sa'].includes(r.id.split(':')[0])
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
      officialUrl: regions[rowRegion(r)].adviceUrl,
      action: typeof r.action === 'string' ? r.action.slice(0, 1000) : null,
      resources:
        Number.isInteger(r.resources) && r.resources! >= 0 ? r.resources : null,
    };
  };
  return {
    ...f,
    source: regions[region].source,
    adviceUrl: regions[region].adviceUrl,
    staleAfterMs: ['nsw', 'qld'].includes(region)
      ? 2400000
      : region === 'sa'
        ? 900000
        : 300000,
    sourceUpdated: date(f.sourceUpdated) ? f.sourceUpdated : null,
    incidents: f.incidents.map(parseRow),
    warnings: f.warnings.map(parseRow).filter((r) => r.listed),
  };
}
export function incidentTime(row: Incident) {
  return row.created || row.updated || row.firstSeen;
}
export function isStale(feed: Feed, now = Date.now()) {
  return (
    feed.stale ||
    now - Date.parse(feed.fetchedAt) > feed.staleAfterMs ||
    Date.parse(feed.fetchedAt) > now + 120000
  );
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
