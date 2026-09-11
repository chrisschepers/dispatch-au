// Generated from the web domain. Run npm run sync:domain; do not edit here.
import type { Geometry } from 'geojson';
export type Category =
  | 'fire'
  | 'rescue'
  | 'storm'
  | 'hazmat'
  | 'planned'
  | 'other';
export type Incident = {
  id: string;
  sourceId: string;
  title: string;
  location: string;
  status: string;
  category: Category;
  agency: string;
  sourceFeed: string;
  created: string | null;
  updated: string | null;
  resources: number | null;
  point: [number, number] | null;
  geometry: Geometry | null;
  kind: 'incident' | 'warning';
  level: string | null;
  action: string | null;
  officialUrl: string;
};
export type Feed = {
  incidents: Incident[];
  warnings: Incident[];
  fetchedAt: string;
  sourceUpdated: string | null;
  stale: boolean;
  source: 'VicEmergency';
  error?: string;
};
const string = (v: unknown, max = 300) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, max)
    : '';
export function dateISO(v: unknown): string | null {
  if (typeof v !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/.test(v)) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
export function categoryFor(primary: string, secondary: string): Category {
  const x = `${primary} ${secondary}`.toLowerCase();
  if (/planned burn/.test(x)) return 'planned';
  if (/hazardous|hazmat|chemical|gas leak/.test(x)) return 'hazmat';
  if (/fire/.test(x)) return 'fire';
  if (/rescue|accident|collision/.test(x)) return 'rescue';
  if (/storm|flood|tree down|building damage|power lines|wind/.test(x))
    return 'storm';
  return 'other';
}
function position(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}
export function safeGeometry(v: unknown, depth = 0): Geometry | null {
  if (!v || typeof v !== 'object' || depth > 4) return null;
  const g = v as { type: string; coordinates: unknown; geometries: unknown[] };
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    const geometries = g.geometries
      .map((x) => safeGeometry(x, depth + 1))
      .filter((x): x is Geometry => !!x);
    return { type: 'GeometryCollection', geometries };
  }
  const coordinates = g.coordinates;
  if (g.type === 'Point' && position(coordinates))
    return { type: 'Point', coordinates: coordinates.slice(0, 2) };
  const line = (x: unknown) =>
    Array.isArray(x) && x.length >= 2 && x.every(position);
  const ring = (x: unknown) =>
    line(x) &&
    (x as number[][]).length >= 4 &&
    (x as number[][])[0][0] === (x as number[][]).at(-1)![0] &&
    (x as number[][])[0][1] === (x as number[][]).at(-1)![1];
  const polygon = (x: unknown) =>
    Array.isArray(x) && x.length > 0 && x.every(ring);
  if (g.type === 'Polygon' && polygon(coordinates))
    return { type: 'Polygon', coordinates: coordinates as number[][][] };
  if (
    g.type === 'MultiPolygon' &&
    Array.isArray(coordinates) &&
    coordinates.every(polygon)
  )
    return { type: 'MultiPolygon', coordinates: coordinates as number[][][][] };
  if (
    g.type === 'MultiPoint' &&
    Array.isArray(coordinates) &&
    coordinates.every(position)
  )
    return { type: 'MultiPoint', coordinates };
  if (g.type === 'LineString' && line(coordinates))
    return { type: 'LineString', coordinates: coordinates as number[][] };
  return null;
}
export function pointOf(g: Geometry | null): [number, number] | null {
  if (g?.type === 'Point') return [g.coordinates[1], g.coordinates[0]];
  if (g?.type === 'GeometryCollection') {
    for (const child of g.geometries) {
      const p = pointOf(child);
      if (p) return p;
    }
  }
  return null;
}
export function normalizeFeed(raw: unknown, now = new Date()): Feed {
  if (!raw || typeof raw !== 'object') throw Error('Invalid source data');
  const data = raw as {
    type: string;
    features: unknown[];
    properties?: { lastUpdated?: unknown; featureCount?: number };
  };
  if (
    data.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length > 15000
  )
    throw Error('Invalid source data');
  if (
    typeof data.properties?.featureCount === 'number' &&
    data.properties.featureCount !== data.features.length
  )
    throw Error('Incomplete source snapshot');
  const unique = new Map<string, Incident>();
  for (const f of data.features) {
    if (!f || typeof f !== 'object') continue;
    const feature = f as {
      properties?: Record<string, unknown>;
      geometry?: unknown;
    };
    const p = feature.properties;
    if (!p) continue;
    const agency = string(p.sourceOrg);
    const kind =
      p.feedType === 'warning'
        ? 'warning'
        : p.feedType === 'incident'
          ? 'incident'
          : null;
    if (
      !kind ||
      (!agency.startsWith('VIC/') &&
        !['EMV', 'BOM', 'VIC', 'ESTA'].includes(agency))
    )
      continue;
    if (typeof p.id !== 'number' && typeof p.id !== 'string') continue;
    const sourceId = String(p.id).slice(0, 160);
    if (!sourceId) continue;
    const primary = string(p.category1);
    const secondary = string(p.category2);
    const geometry = safeGeometry(feature.geometry);
    const id = `vic:${kind}:${agency}:${sourceId}`;
    const row: Incident = {
      id,
      sourceId,
      title:
        kind === 'warning'
          ? primary
          : !secondary || secondary === 'Other' || secondary === 'Undefined'
            ? primary === 'Fire'
              ? 'Fire incident'
              : primary || 'Incident'
            : secondary,
      location: string(p.location) || 'Location not supplied',
      status: string(p.status) || 'Status not supplied',
      category: categoryFor(primary, secondary),
      agency,
      sourceFeed: string(p.sourceFeed),
      created: dateISO(p.created),
      updated: dateISO(p.updated),
      resources:
        typeof p.resources === 'number' &&
        Number.isInteger(p.resources) &&
        p.resources >= 0
          ? p.resources
          : null,
      point: pointOf(geometry),
      geometry,
      kind,
      level: kind === 'warning' ? primary : null,
      action: string(p.action) || null,
      officialUrl: 'https://emergency.vic.gov.au/respond/',
    };
    const previous = unique.get(id);
    if (
      !previous ||
      Date.parse(row.updated ?? '') >= Date.parse(previous.updated ?? '') ||
      !previous.updated
    )
      unique.set(id, row);
  }
  const rows = [...unique.values()].sort(
    (a, b) =>
      (Date.parse(b.updated ?? '') || 0) - (Date.parse(a.updated ?? '') || 0),
  );
  const sourceUpdated = dateISO(data.properties?.lastUpdated);
  const stale =
    !sourceUpdated ||
    now.getTime() - Date.parse(sourceUpdated) > 300000 ||
    Date.parse(sourceUpdated) > now.getTime() + 120000;
  return {
    incidents: rows.filter((x) => x.kind === 'incident'),
    warnings: rows.filter((x) => x.kind === 'warning'),
    fetchedAt: now.toISOString(),
    sourceUpdated,
    stale,
    source: 'VicEmergency',
  };
}
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const q =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) *
      Math.cos(b[0] * rad) *
      Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, q)), Math.sqrt(Math.max(0, 1 - q)))
  );
}
export type Filters = {
  query: string;
  category: Category | 'all';
  includePlanned: boolean;
  respondingOnly: boolean;
  centre: [number, number] | null;
  radius: number;
};
export function filterIncidents(rows: Incident[], f: Filters): Incident[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q ||
        `${r.title} ${r.location} ${r.agency}`.toLowerCase().includes(q)) &&
      (f.category === 'all' || r.category === f.category) &&
      (f.includePlanned || r.category !== 'planned') &&
      (!f.respondingOnly ||
        /responding|on scene|not yet|going|under control/i.test(r.status)) &&
      (!f.centre ||
        (r.point !== null && distanceKm(f.centre, r.point) <= f.radius)),
  );
}
export function feedIsStale(feed: Feed, now = Date.now()): boolean {
  return (
    feed.stale ||
    now - Date.parse(feed.fetchedAt) > 300000 ||
    !feed.sourceUpdated ||
    now - Date.parse(feed.sourceUpdated) > 300000
  );
}
