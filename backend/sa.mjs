import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { EntityDecoder, XML } from '@nodable/entities';
import {
  categoryFor,
  dateISO,
  safeGeometry,
  pointOf,
} from '../lib/incidents.ts';
import { actDate } from './time.mjs';
import { skipCounter } from './skipped.mjs';
const clean = (v) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 500)
    : '';
export function parseSA(xml, now = new Date().toISOString()) {
  if (
    typeof xml !== 'string' ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    SyntaxValidator.validate(xml, { multipleRoots: false }) !== true
  )
    throw Error('Invalid SA XML');
  const p = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: true,
    entityDecoder: new EntityDecoder({
      namedEntities: XML,
      numericAllowed: true,
    }),
  }).parse(xml);
  if (p?.feed) return parseCAPFeed(p.feed, now);
  const c = p?.rss?.channel;
  if (!c || typeof c.title !== 'string') throw Error('Invalid SA channel');
  const items = c.item ? (Array.isArray(c.item) ? c.item : [c.item]) : [];
  if (items.length > 15000) throw Error('SA source too large');
  const unique = new Map();
  const skipped = skipCounter();
  for (const item of items) {
    const id = clean(item.identifier);
    if (!/^\d+$/.test(id)) {
      skipped.skip('Invalid SA ID');
      continue;
    }
    const title = clean(item.title),
      m = title.match(/^(.*)\s+\(([^()]*)\)$/);
    if (!m) {
      skipped.skip('Invalid SA title');
      continue;
    }
    const d = Object.fromEntries(
      String(item.description || '')
        .split(/<br\s*\/?\s*>/i)
        .map((s) => {
          const i = s.indexOf(':');
          return [s.slice(0, i).trim(), clean(s.slice(i + 1))];
        }),
    );
    const created = actDate(
      (d['First Reported'] || '').replace(/^\w+,\s*/, ''),
      'Australia/Adelaide',
    );
    const n = /[+-]\d{4}$/.test(item.pubDate || '')
      ? Date.parse(item.pubDate)
      : NaN;
    unique.set(id, {
      id: 'sa:incident:' + id,
      sourceId: id,
      sourceFeed: 'sa-cfs',
      agency: d.Region === 'MFS' ? 'SA MFS via CFS' : 'SA Country Fire Service',
      title: m[2],
      location: m[1].trim(),
      status: d.Status || 'Status not supplied',
      category: /prescribed|burn off/i.test(m[2])
        ? 'planned'
        : categoryFor(m[2], ''),
      created,
      updated: Number.isFinite(n) ? new Date(n).toISOString() : null,
      resources: null,
      point: null,
      geometry: null,
      kind: 'incident',
      level: null,
      action: null,
      officialUrl: 'https://www.cfs.sa.gov.au/incidents/',
    });
  }
  skipped.check(items.length, 'SA');
  return {
    skipped: skipped.summary(),
    incidents: [...unique.values()],
    warnings: [],
    fetchedAt: now,
    sourceUpdated: null,
    stale: false,
  };
}

const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];

/** Public CAP fields only; never expose sender/contact or arbitrary free text. */
function parseCAPFeed(feed, now) {
  const sourceUpdated = dateISO(feed.updated);
  if (!clean(feed.title) || !sourceUpdated) throw Error('Invalid SA CAP feed');
  const entries = list(feed.entry);
  if (entries.length > 15000) throw Error('SA source too large');
  const unique = new Map();
  const cancelled = new Map();
  const skipped = skipCounter();
  for (const entry of entries) {
    const alert = entry.content?.alert;
    if (
      !alert ||
      !clean(alert.identifier) ||
      !dateISO(alert.sent) ||
      !alert.status ||
      !alert.scope
    ) {
      skipped.skip('Incomplete SA CAP alert');
      continue;
    }
    // Test/exercise/private messages are not live public incidents.
    if (alert.status !== 'Actual' || alert.scope !== 'Public') continue;
    const sourceId = clean(alert.identifier).replace(
      /-\d{4}-\d{2}-\d{2}T.*$/,
      '',
    );
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(sourceId)) {
      skipped.skip('Invalid SA CAP identity');
      continue;
    }
    if (alert.msgType === 'Cancel') {
      const sent = Date.parse(alert.sent);
      cancelled.set(sourceId, Math.max(cancelled.get(sourceId) || 0, sent));
      continue;
    }
    if (!['Alert', 'Update'].includes(alert.msgType)) {
      skipped.skip('Unsupported SA CAP message');
      continue;
    }
    const info = list(alert.info).find(
      (i) => !i.language || /^en(?:-|$)/i.test(i.language),
    );
    if (!info) {
      skipped.skip('Missing SA CAP information');
      continue;
    }
    const expires = info.expires ? dateISO(info.expires) : null;
    if (info.expires && !expires) {
      skipped.skip('Invalid SA CAP expiry');
      continue;
    }
    if (expires && Date.parse(expires) <= Date.parse(now)) continue;
    const parameters = Object.fromEntries(
      list(info.parameter).map((p) => [clean(p.valueName), clean(p.value)]),
    );
    // CFS leaves WarningLevel off some plain incidents. On 30-10 a grass fire
    // and a structure fire without it made this throw, and all of SA stood
    // still for 21 hours. Warnings always carry a level; missing = incident.
    const level = parameters.WarningLevel || '';
    const warning = !!level && !/^incident$/i.test(level);
    const kind = warning ? 'warning' : 'incident';
    const title =
      parameters.SubCategory || parameters.Category || clean(info.event);
    if (!title) {
      skipped.skip('Missing SA CAP incident type');
      continue;
    }
    const areas = list(info.area);
    const geometries = areas.flatMap((area) => {
      const shapes = list(area.polygon).map((poly) => {
        if (typeof poly !== 'string') return null;
        return safeGeometry({
          type: 'Polygon',
          coordinates: [
            poly
              .trim()
              .split(/\s+/)
              .map((pair) => pair.split(',').map(Number).reverse()),
          ],
        });
      });
      for (const circle of list(area.circle)) {
        if (typeof circle !== 'string') continue;
        const match = circle
          .trim()
          .match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
        // A zero-radius CAP circle is a supplied location. A positive-radius
        // area must not silently become an exact incident pin.
        if (match && Number(match[3]) === 0)
          shapes.push(
            safeGeometry({
              type: 'Point',
              coordinates: [Number(match[2]), Number(match[1])],
            }),
          );
      }
      return shapes.filter(Boolean);
    });
    const geometry =
      geometries.length === 1
        ? geometries[0]
        : geometries.length > 1
          ? safeGeometry({ type: 'GeometryCollection', geometries })
          : null;
    const updated = dateISO(entry.updated) || dateISO(alert.sent);
    const row = {
      id: `sa:${kind}:${sourceId}`,
      sourceId,
      sourceFeed: 'sa-cfs-cap',
      agency:
        parameters.ControlAuthority ||
        clean(info.senderName) ||
        'SA Country Fire Service',
      title: warning ? clean(info.headline) || title : title,
      location:
        parameters.Location ||
        clean(areas[0]?.areaDesc) ||
        parameters.IncidentName ||
        'Location not supplied',
      status: parameters.Status || 'Status not supplied',
      category: /prescribed|burn\s*off/i.test(title)
        ? 'planned'
        : categoryFor(parameters.Category || '', title),
      // CAP sent/effective are publication times, not the first dispatch time.
      created: dateISO(info.onset),
      updated,
      resources: null,
      point: pointOf(geometry),
      geometry,
      kind,
      level: warning ? level : null,
      action: warning
        ? parameters.CallToAction || clean(info.instruction) || null
        : null,
      officialUrl:
        'https://www.cfs.sa.gov.au/warnings-restrictions/warnings/incidents-warnings/',
    };
    const previous = unique.get(row.id);
    if (!previous || Date.parse(updated) >= Date.parse(previous.updated))
      unique.set(row.id, row);
  }
  const rows = [...unique.values()].filter(
    (row) => (cancelled.get(row.sourceId) || 0) < Date.parse(row.updated),
  );
  skipped.check(entries.length, 'SA CAP');
  return {
    skipped: skipped.summary(),
    incidents: rows.filter((r) => r.kind === 'incident'),
    warnings: rows.filter((r) => r.kind === 'warning'),
    fetchedAt: now,
    sourceUpdated,
    stale:
      Date.parse(now) - Date.parse(sourceUpdated) > 900000 ||
      Date.parse(sourceUpdated) > Date.parse(now) + 120000,
  };
}
