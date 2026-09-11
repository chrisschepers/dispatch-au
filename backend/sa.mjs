import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { EntityDecoder, XML } from '@nodable/entities';
import { categoryFor } from '../lib/incidents.ts';
import { actDate } from './time.mjs';
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
    parseTagValue: false,
    processEntities: true,
    entityDecoder: new EntityDecoder({
      namedEntities: XML,
      numericAllowed: true,
    }),
  }).parse(xml);
  const c = p?.rss?.channel;
  if (!c || typeof c.title !== 'string') throw Error('Invalid SA channel');
  const items = c.item ? (Array.isArray(c.item) ? c.item : [c.item]) : [];
  if (items.length > 15000) throw Error('SA source too large');
  const unique = new Map();
  for (const item of items) {
    const id = clean(item.identifier);
    if (!/^\d+$/.test(id)) throw Error('Invalid SA ID');
    const title = clean(item.title),
      m = title.match(/^(.*)\s+\(([^()]*)\)$/);
    if (!m) throw Error('Invalid SA title');
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
  return {
    incidents: [...unique.values()],
    warnings: [],
    fetchedAt: now,
    sourceUpdated: null,
    stale: false,
  };
}
