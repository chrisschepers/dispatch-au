// Parsers for the optional sources (source-config.mjs, optionalSources):
// road crashes for NSW, Queensland and Victoria, Queensland's storm, flood
// and cyclone warnings, and Emergency WA. Same rules as the other parsers:
// a bad record is skipped and counted, and only a snapshot in which every
// record is rejected fails the source.
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { EntityDecoder, XML } from '@nodable/entities';
import {
  categoryFor,
  dateISO,
  safeGeometry,
  pointOf,
} from '../lib/incidents.ts';
import { skipCounter } from './skipped.mjs';
import { optionalSources } from './source-config.mjs';

const clean = (v, max = 500) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const LEVELS = ['Advice', 'Watch and Act', 'Emergency Warning'];
const levelOf = (text) =>
  /emergency warning/i.test(text)
    ? 'Emergency Warning'
    : /watch and act/i.test(text)
      ? 'Watch and Act'
      : /advice/i.test(text)
        ? 'Advice'
        : null;
// "NORTH JINDONG" → "North Jindong": the source shouts, the app does not.
const titleCase = (v) =>
  clean(v)
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const msISO = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
    ? new Date(v).toISOString()
    : null;
function collection(raw, source) {
  if (
    raw?.type !== 'FeatureCollection' ||
    !Array.isArray(raw.features) ||
    raw.features.length > 15000
  )
    throw Error(`Invalid ${source} snapshot`);
  return raw.features;
}
function row(key, id, geometry, fields) {
  const config = optionalSources[key];
  const g = safeGeometry(geometry);
  return {
    id: `${config.region}:incident:${id}`,
    sourceId: id,
    sourceFeed: key,
    created: null,
    updated: null,
    resources: null,
    geometry: g,
    point: pointOf(g),
    kind: 'incident',
    level: null,
    action: null,
    officialUrl: config.adviceUrl,
    ...fields,
  };
}
const snapshot = (skipped, incidents, warnings, now, sourceUpdated, stale) => ({
  skipped: skipped.summary(),
  incidents,
  warnings,
  fetchedAt: now,
  sourceUpdated,
  stale,
});
// Published more than 15 minutes ago, or in the future: not a live snapshot.
const late = (published, now) =>
  !!published &&
  (Date.parse(now) - Date.parse(published) > 900000 ||
    Date.parse(published) > Date.parse(now) + 120000);

/**
 * Live Traffic NSW (Transport for NSW), hazards/incident. Only crashes that
 * are still open: breakdowns, roadworks and changed traffic conditions are
 * traffic news, not an emergency. Road crews and tow trucks in
 * `attendingGroups` are kept as the status.
 */
export function parseLiveTraffic(raw, now = new Date().toISOString()) {
  const features = collection(raw, 'Live Traffic');
  const skipped = skipCounter();
  const unique = new Map();
  let crashes = 0;
  for (const f of features) {
    const p = f?.properties;
    if (p?.mainCategory !== 'CRASH') continue;
    crashes++;
    if (p.ended === true) continue;
    const id =
      typeof f.id === 'number' && Number.isFinite(f.id)
        ? String(Math.trunc(f.id))
        : '';
    const g = safeGeometry(f.geometry);
    if (!id || !pointOf(g)) {
      skipped.skip(
        id ? 'Missing Live Traffic location' : 'Missing Live Traffic ID',
      );
      continue;
    }
    const road = list(p.roads)[0] ?? {};
    // "CRASH Truck, Car": the vehicles are in subCategoryA, or only in the
    // display name while the report is new (subCategoryA is then "null").
    const named = clean(p.subCategoryA);
    const sub =
      named && named !== 'null'
        ? named
        : clean(p.displayName).replace(/^crash\s*/i, '');
    const groups = list(p.attendingGroups)
      .map((x) => clean(x))
      .filter(Boolean);
    const street = [
      clean(road.mainStreet),
      clean(road.crossStreet) &&
        `${clean(road.locationQualifier) || 'near'} ${clean(road.crossStreet)}`,
    ]
      .filter(Boolean)
      .join(' ');
    const r = row('nsw-traffic', `livetraffic-${id}`, g, {
      title: sub ? `Crash: ${sub.toLowerCase()}` : 'Crash',
      location:
        [street, clean(road.suburb)].filter(Boolean).join(', ') ||
        'Location not supplied',
      status: groups.length
        ? `Attending: ${groups.join(', ')}`.slice(0, 300)
        : 'Status not supplied',
      category: 'rescue',
      agency: 'Transport for NSW',
      created: msISO(p.created),
      updated: msISO(p.lastUpdated),
    });
    unique.set(r.id, r);
  }
  skipped.check(crashes, 'Live Traffic');
  const published = msISO(raw.lastPublished);
  return snapshot(
    skipped,
    [...unique.values()],
    [],
    now,
    published,
    late(published, now),
  );
}

/**
 * QLDTraffic (Transport and Main Roads), /v2/events. Only crashes. Events
 * another road agency supplied (the feed also relays Transport for NSW) are
 * left out: the licence and the credit are TMR's.
 */
export function parseQLDTraffic(raw, now = new Date().toISOString()) {
  const features = collection(raw, 'QLDTraffic');
  const skipped = skipCounter();
  const unique = new Map();
  let crashes = 0;
  for (const f of features) {
    const p = f?.properties;
    if (p?.event_type !== 'Crash') continue;
    if (
      /transport for nsw/i.test(
        `${p.source?.provided_by ?? ''} ${p.source?.provided_by_url ?? ''}`,
      )
    )
      continue;
    crashes++;
    if (p.status === 'Reopened') continue;
    const id =
      typeof p.id === 'number' || typeof p.id === 'string'
        ? clean(String(p.id), 80)
        : '';
    const g = safeGeometry(f.geometry);
    // A crash is drawn as its stretch of road; the pin is its first point.
    const first = (x) =>
      !x
        ? null
        : x.type === 'Point'
          ? x.coordinates
          : x.type === 'LineString'
            ? x.coordinates[0]
            : x.type === 'GeometryCollection'
              ? x.geometries.map(first).find(Boolean)
              : null;
    const at = first(g);
    if (!/^[\w-]+$/.test(id) || !at) {
      skipped.skip(
        id ? 'Missing QLDTraffic location' : 'Missing QLDTraffic ID',
      );
      continue;
    }
    const sub = clean(p.event_subtype);
    const road = p.road_summary ?? {};
    const r = row('qld-traffic', `qldtraffic-${id}`, g, {
      title: sub && sub !== 'N/A' ? `Crash: ${sub.toLowerCase()}` : 'Crash',
      location:
        [clean(road.road_name), clean(road.locality)]
          .filter(Boolean)
          .join(', ') || 'Location not supplied',
      status:
        clean(p.impact?.impact_subtype || p.impact?.impact_type) ||
        'Status not supplied',
      category: 'rescue',
      agency: 'Queensland Transport and Main Roads',
      created: dateISO(p.duration?.start) || dateISO(p.published),
      updated: dateISO(p.last_updated),
      point: [at[1], at[0]],
    });
    unique.set(r.id, r);
  }
  skipped.check(crashes, 'QLDTraffic');
  const published = dateISO(raw.published);
  return snapshot(
    skipped,
    [...unique.values()],
    [],
    now,
    published,
    late(published, now),
  );
}

/**
 * Victoria, Unplanned Disruptions - Road v3 (Department of Transport and
 * Planning). Written from the published OpenAPI description: the API needs a
 * key, so no live response was seen yet. Only events whose type says crash
 * or collision, and only while active.
 */
export function parseVICRoads(raw, now = new Date().toISOString()) {
  const features = collection(raw?.data, 'Victorian roads');
  const skipped = skipCounter();
  const unique = new Map();
  let crashes = 0;
  for (const f of features) {
    const p = f?.properties;
    if (!/crash|collision|accident/i.test(`${p?.eventType} ${p?.eventSubType}`))
      continue;
    crashes++;
    if (['Inactive', 'Reopened'].includes(p.eventLocationStatus)) continue;
    // One event can close several stretches (parent and child records).
    const id = clean(String(p.eventId ?? p.id ?? ''), 80);
    const g = safeGeometry(f.geometry);
    const at =
      g?.type === 'Point'
        ? g.coordinates
        : g?.type === 'LineString'
          ? g.coordinates[0]
          : null;
    if (!/^[\w-]+$/.test(id) || !at) {
      skipped.skip(
        id ? 'Missing Victorian roads location' : 'Missing Victorian roads ID',
      );
      continue;
    }
    const sub = clean(p.eventSubType);
    const ref = p.reference ?? {};
    const r = row('vic-traffic', `vicroads-${id}`, g, {
      title:
        sub && !/^(crash|collision)$/i.test(sub)
          ? `Crash: ${sub.toLowerCase()}`
          : 'Crash',
      location:
        [
          clean(p.closedRoadName || p.declaredRoadName || ref.localRoadName),
          titleCase(ref.startIntersectionLocality),
        ]
          .filter(Boolean)
          .join(', ') || 'Location not supplied',
      status:
        clean(p.impact?.impactType || p.roadAccessType) ||
        'Status not supplied',
      category: 'rescue',
      agency: 'Victorian Department of Transport and Planning',
      created: dateISO(p.created),
      updated: dateISO(p.lastUpdated),
      point: [at[1], at[0]],
    });
    if (!unique.has(r.id)) unique.set(r.id, r);
  }
  skipped.check(crashes, 'Victorian roads');
  return snapshot(skipped, [...unique.values()], [], now, null, false);
}

/**
 * Queensland storm, flood and cyclone warnings: CAP-AU alerts in an EDXL
 * envelope. The file is only rewritten when a warning changes, so its own
 * date says nothing about freshness; expired alerts simply stay in it.
 */
export function parseQLDWarnings(xml, now = new Date().toISOString()) {
  if (
    typeof xml !== 'string' ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    SyntaxValidator.validate(xml, { multipleRoots: false }) !== true
  )
    throw Error('Invalid Queensland warnings XML');
  const parsed = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: true,
    entityDecoder: new EntityDecoder({
      namedEntities: XML,
      numericAllowed: true,
    }),
  }).parse(xml);
  const root = parsed?.EDXLDistribution;
  if (!root || !clean(root.distributionID))
    throw Error('Invalid Queensland warnings envelope');
  const alerts = list(root.contentObject).flatMap((o) =>
    list(o?.xmlContent).flatMap((x) =>
      list(x?.embeddedXMLContent).flatMap((e) => list(e?.alert)),
    ),
  );
  if (alerts.length > 15000) throw Error('Queensland warnings too large');
  const skipped = skipCounter();
  const unique = new Map();
  const config = optionalSources['qld-warnings'];
  for (const alert of alerts) {
    const sourceId = clean(alert?.identifier, 160);
    const sent = dateISO(alert?.sent);
    if (!/^[\w.-]+$/.test(sourceId) || !sent) {
      skipped.skip('Incomplete Queensland CAP alert');
      continue;
    }
    // Tests, exercises and cancellations are not live public warnings.
    if (
      alert.status !== 'Actual' ||
      alert.scope !== 'Public' ||
      !['Alert', 'Update'].includes(alert.msgType)
    )
      continue;
    const info = list(alert.info).find(
      (i) => !i.language || /^en(?:-|$)/i.test(i.language),
    );
    const expires = info?.expires ? dateISO(info.expires) : null;
    if (!info || (info.expires && !expires)) {
      skipped.skip('Invalid Queensland CAP information');
      continue;
    }
    if (expires && Date.parse(expires) <= Date.parse(now)) continue;
    const parameters = Object.fromEntries(
      list(info.parameter).map((p) => [clean(p.valueName), clean(p.value)]),
    );
    const headline = clean(info.headline);
    const level = LEVELS.find(
      (l) => l.toLowerCase() === (parameters.AlertLevel || '').toLowerCase(),
    );
    if (!level || !headline) {
      skipped.skip('Missing Queensland warning level');
      continue;
    }
    const areas = list(info.area);
    const shapes = areas
      .flatMap((area) =>
        list(area.polygon).map((poly) =>
          typeof poly === 'string'
            ? safeGeometry({
                type: 'Polygon',
                coordinates: [
                  poly
                    .trim()
                    .split(/\s+/)
                    .map((pair) => pair.split(',').map(Number).reverse()),
                ],
              })
            : null,
        ),
      )
      .filter(Boolean);
    // The circle is the middle of the area, not an incident: no pin.
    const centre = areas
      .flatMap((area) => list(area.circle))
      .map((c) =>
        typeof c === 'string'
          ? c.trim().match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s/)
          : null,
      )
      .find(Boolean);
    // "WATCH AND ACT - MONITOR CONDITIONS - Burdekin LGA - Flood - Issued …"
    const parts = headline.split(' - ');
    const event = clean(info.event);
    unique.set(sourceId, {
      id: `qld:warning:sfc-${sourceId}`,
      sourceId: `sfc-${sourceId}`,
      sourceFeed: 'qld-warnings',
      agency:
        parameters.ControlAuthority ||
        clean(info.senderName) ||
        'Queensland Government',
      title: headline,
      location:
        parameters.Location ||
        clean(areas[0]?.areaDesc) ||
        'Location not supplied',
      status: level,
      category: /cyclone/i.test(event)
        ? 'storm'
        : categoryFor(event, parameters.Hazard || ''),
      created: dateISO(info.onset) || dateISO(info.effective),
      updated: sent,
      resources: null,
      point: null,
      areaPoint: centre ? [Number(centre[1]), Number(centre[2])] : null,
      geometry:
        shapes.length === 1
          ? shapes[0]
          : shapes.length > 1
            ? safeGeometry({ type: 'GeometryCollection', geometries: shapes })
            : null,
      kind: 'warning',
      level,
      action: parts.length > 2 && levelOf(parts[0]) === level ? parts[1] : null,
      text: clean(info.description) || null,
      officialUrl: config.adviceUrl,
    });
  }
  skipped.check(alerts.length, 'Queensland CAP');
  return snapshot(skipped, [], [...unique.values()], now, null, false);
}

function waGeometry(source) {
  const shapes = list(source?.features)
    .map((f) => safeGeometry(f?.geometry))
    .filter(Boolean);
  return shapes.length === 1
    ? shapes[0]
    : shapes.length > 1
      ? safeGeometry({ type: 'GeometryCollection', geometries: shapes })
      : null;
}
function waPlace(item) {
  const suburbs = list(item.suburbs).map(titleCase).filter(Boolean);
  return { suburbs, lga: list(item.lga).map(titleCase).filter(Boolean) };
}
function waRecords(raw, key) {
  const records = raw?.[key];
  if (!Array.isArray(records) || records.length > 15000)
    throw Error('Invalid Emergency WA snapshot');
  return records;
}

/** Emergency WA (DFES): incidents. Burn offs are planned, not a fire call. */
export function parseWAIncidents(raw, now = new Date().toISOString()) {
  const records = waRecords(raw, 'incidents');
  const skipped = skipCounter();
  const unique = new Map();
  for (const item of records) {
    const id = clean(
      String(item?.['cad-id'] ?? item?.['incident-id'] ?? item?.id ?? ''),
      80,
    );
    const type = clean(item?.name) || clean(item?.['incident-type']);
    if (!/^[\w-]+$/.test(id) || !type) {
      skipped.skip(id ? 'Missing WA incident type' : 'Missing WA incident ID');
      continue;
    }
    if (item['publishing-status'] !== 'Published') continue;
    const geometry = waGeometry(item['geo-source']);
    const lat = Number(item.location?.latitude),
      lon = Number(item.location?.longitude);
    const point =
      item.location?.latitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
        ? [lat, lon]
        : pointOf(geometry);
    const { suburbs, lga } = waPlace(item);
    const r = row('wa', id, geometry, {
      title: type,
      location:
        [titleCase(item.location?.value), suburbs[0] || lga[0]]
          .filter(Boolean)
          .join(', ') || 'Location not supplied',
      status: clean(item['incident-status']) || 'Status not supplied',
      category: /burn off|prescribed|planned/i.test(type)
        ? 'planned'
        : /crash|rescue/i.test(type)
          ? 'rescue'
          : /cyclone|storm|flood/i.test(type)
            ? 'storm'
            : categoryFor(clean(item['incident-type']), type),
      agency: 'DFES (Emergency WA)',
      created: dateISO(item['start-date-time']),
      updated:
        dateISO(item['updated-date-time']) || dateISO(item['issued-date-time']),
      point,
    });
    unique.set(r.id, r);
  }
  skipped.check(records.length, 'Emergency WA');
  return snapshot(skipped, [...unique.values()], [], now, null, false);
}

/**
 * Emergency WA warnings (CC BY-ND 4.0). The words are DFES's own: the
 * warning type as title, their headline and action statement, their area.
 * Nothing is reworded or merged.
 */
export function parseWAWarnings(raw, now = new Date().toISOString()) {
  const records = waRecords(raw, 'warnings');
  const skipped = skipCounter();
  const unique = new Map();
  const config = optionalSources['wa-warnings'];
  for (const item of records) {
    const sourceId = clean(String(item?.id ?? ''), 80);
    const type = clean(item?.['warning-type']) || clean(item?.name);
    if (!/^[\w-]+$/.test(sourceId) || !type) {
      skipped.skip(
        sourceId ? 'Missing WA warning type' : 'Missing WA warning ID',
      );
      continue;
    }
    if (item['publishing-status'] !== 'Published') continue;
    const geometry = waGeometry(item['geo-source']);
    const { suburbs, lga } = waPlace(item);
    const level = levelOf(type);
    const hazard = `${clean(item['cap-category'])} ${list(
      item['cap-event-type'],
    )
      .map((x) => clean(x))
      .join(' ')}`;
    unique.set(sourceId, {
      id: `wa:warning:${sourceId}`,
      sourceId,
      sourceFeed: 'wa-warnings',
      agency: 'DFES (Emergency WA)',
      title: type,
      location:
        [clean(item.headline), suburbs.join(', ') || lga[0]]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 300) || 'Location not supplied',
      status: level || type,
      category: /fire|smoke/i.test(`${hazard} ${type}`)
        ? 'fire'
        : /cyclone|storm|flood/i.test(`${hazard} ${type}`)
          ? 'storm'
          : categoryFor(hazard, type),
      created: null,
      updated:
        dateISO(item['issued-date-time']) ||
        dateISO(item['published-date-time']),
      resources: null,
      // A warning covers its area; the point DFES adds marks that area.
      point: null,
      areaPoint: pointOf(geometry),
      geometry,
      kind: 'warning',
      level,
      action: clean(item['action-statement']) || null,
      text: clean(item['alert-line']) || null,
      officialUrl: config.adviceUrl,
    });
  }
  skipped.check(records.length, 'Emergency WA warnings');
  return snapshot(skipped, [], [...unique.values()], now, null, false);
}

export const optionalParsers = {
  'nsw-traffic': (body, now) => parseLiveTraffic(JSON.parse(body), now),
  'qld-traffic': (body, now) => parseQLDTraffic(JSON.parse(body), now),
  'vic-traffic': (body, now) => parseVICRoads(JSON.parse(body), now),
  'qld-warnings': parseQLDWarnings,
  wa: (body, now) => parseWAIncidents(JSON.parse(body), now),
  'wa-warnings': (body, now) => parseWAWarnings(JSON.parse(body), now),
};
