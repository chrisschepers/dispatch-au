import {
  distanceKm,
  safeGeometry,
  type Incident as BaseIncident,
  type Category as BaseCategory,
} from './domain/incidents.ts';
import { suggestedPlaces, type Place } from './domain/places.ts';
export type Region = 'vic' | 'act';
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
  vic: {
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
      !r.id.startsWith(region + ':') ||
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
      officialUrl: regions[region].adviceUrl,
      action: typeof r.action === 'string' ? r.action.slice(0, 1000) : null,
      resources:
        Number.isInteger(r.resources) && r.resources! >= 0 ? r.resources : null,
    };
  };
  return {
    ...f,
    source: regions[region].source,
    adviceUrl: regions[region].adviceUrl,
    staleAfterMs: 300000,
    sourceUpdated: date(f.sourceUpdated) ? f.sourceUpdated : null,
    incidents: f.incidents.map(parseRow),
    warnings: f.warnings.map(parseRow).filter((r) => r.listed),
  };
}
export function incidentTime(row: Incident) {
  return row.created || row.firstSeen;
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
  return rows.filter(
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
  );
}
