import { actDate } from './time.mjs';
import {
  safeGeometry,
  pointOf,
  categoryFor,
  dateISO,
} from '../lib/incidents.ts';
const clean = (v) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 500)
    : '';
const fields = (v) =>
  Object.fromEntries(
    String(v || '')
      .split(/<br\s*\/?\s*>|\r?\n/i)
      .map((x) => {
        const i = x.indexOf(':');
        return [x.slice(0, i).trim(), clean(x.slice(i + 1))];
      }),
  );
export const advice = {
  nsw: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
  qld: 'https://www.fire.qld.gov.au/Current-Incidents',
};
export function canonicalVIC(row) {
  return row.kind === 'incident' && /^ESTA:\d+$/.test(row.sourceId)
    ? `vic:incident:${row.sourceId}`
    : row.id;
}
// Only explicit shared CAD identifiers are merged. Proximity/name matching could
// silently combine separate calls at the same address.
export function normalizeVICIdentity(feed) {
  const unique = new Map();
  for (const r of feed.incidents) {
    const row = { ...r, id: canonicalVIC(r) };
    const old = unique.get(row.id);
    if (
      !old ||
      Date.parse(row.updated || '') >= Date.parse(old.updated || '') ||
      !old.updated
    )
      unique.set(row.id, row);
  }
  return { ...feed, incidents: [...unique.values()] };
}
function features(raw) {
  if (
    raw?.type !== 'FeatureCollection' ||
    !Array.isArray(raw.features) ||
    raw.features.length > 15000
  )
    throw Error('Invalid regional snapshot');
  return raw.features;
}
function base(region, id, geometry) {
  const g = safeGeometry(geometry);
  return {
    id: `${region}:incident:${id}`,
    sourceId: id,
    sourceFeed: region,
    agency: region === 'nsw' ? 'NSW RFS' : 'Queensland Fire Department',
    created: null,
    updated: null,
    resources: null,
    geometry: g,
    point: pointOf(g),
    kind: 'incident',
    level: null,
    action: null,
    officialUrl: advice[region],
  };
}
export function parseNSW(raw, now = new Date().toISOString()) {
  const unique = new Map();
  for (const f of features(raw)) {
    const p = f.properties;
    const id =
      typeof p?.guid === 'string'
        ? p.guid.match(/\/incidents\/(\d+)\/?$/)?.[1]
        : null;
    if (!id) throw Error('Missing NSW incident ID');
    const d = fields(p.description),
      type = d.TYPE;
    if (!type) throw Error('Missing NSW incident type');
    const level = ['Advice', 'Watch and Act', 'Emergency Warning'].includes(
      p.category,
    )
      ? p.category
      : null;
    const planned = /hazard reduction|planned|burn off/i.test(type);
    const row = {
      ...base('nsw', id, f.geometry),
      title: clean(type),
      location: d.LOCATION || clean(p.title) || 'Location not supplied',
      category: planned
        ? 'planned'
        : /MVA|transport/i.test(type)
          ? 'rescue'
          : categoryFor(type, ''),
      status:
        [level, d.STATUS].filter(Boolean).join(' · ') || 'Status not supplied',
      level,
      updated: d.UPDATED ? actDate(d.UPDATED + ':00') : null,
    };
    // pubDate has no zone and represents an update, not the call time. Do not
    // reinterpret it as a newly reported incident. Preserve first-seen instead.
    unique.set(row.id, row);
  }
  return {
    incidents: [...unique.values()],
    warnings: [...unique.values()]
      .filter((r) => ['Watch and Act', 'Emergency Warning'].includes(r.level))
      .map((r) => ({
        ...r,
        id: 'nsw:warning:' + r.sourceId,
        kind: 'warning',
        geometry: null,
        point: null,
        action: r.level,
      })),
    fetchedAt: now,
    sourceUpdated: null,
    stale: false,
  };
}
export function parseQLD(raw, now = new Date().toISOString()) {
  const incidents = [],
    warnings = [];
  let published = null;
  const seen = new Set();
  for (const f of features(raw)) {
    const p = f.properties,
      id = clean(p?.UniqueID);
    if (!id || seen.has(id)) throw Error('Missing or duplicate Queensland ID');
    seen.add(id);
    const issued = dateISO(p.PublishDateLocal_ISO);
    if (issued && (!published || issued > published)) published = issued;
    const warning = id.startsWith('WARN-');
    const expired = dateISO(p.ItemExpiryDateTimeLocal_ISO);
    if (warning && expired && Date.parse(expired) <= Date.parse(now)) continue;
    const planned = /PERMITTED BURN/i.test(p.GroupedType || '');
    const row = {
      ...base('qld', id, f.geometry),
      title: warning
        ? clean(p.WarningTitle)
        : planned
          ? 'Planned burn'
          : 'Vegetation fire',
      location:
        clean(
          warning
            ? p.WarningArea
            : [p.Location, p.Locality].filter(Boolean).join(', '),
        ) || 'Location not supplied',
      category: planned ? 'planned' : categoryFor(clean(p.GroupedType), ''),
      status:
        clean(warning ? p.WarningLevel : p.CurrentStatus) ||
        'Status not supplied',
      updated: dateISO(p.ItemDateTimeLocal_ISO),
      level: warning ? clean(p.WarningLevel) : null,
      action: warning ? clean(p.CallToAction) : null,
    };
    if (warning) {
      row.id = `qld:warning:${id}`;
      row.kind = 'warning';
      row.point = null;
      warnings.push(row);
    } else {
      row.resources =
        Number.isInteger(p.VehiclesAssigned) && p.VehiclesAssigned >= 0
          ? p.VehiclesAssigned
          : null;
      incidents.push(row);
    }
  }
  return {
    incidents,
    warnings,
    fetchedAt: now,
    sourceUpdated: published,
    stale:
      !!published &&
      (Date.parse(now) - Date.parse(published) > 2400000 ||
        Date.parse(published) > Date.parse(now) + 120000),
  };
}
