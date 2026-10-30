import { parseSA } from './sa.mjs';
import { actDate } from './time.mjs';
export { actDate } from './time.mjs';
import { XMLParser } from 'fast-xml-parser';
import { EntityDecoder, XML } from '@nodable/entities';
import { SyntaxValidator } from 'fast-xml-validator';
import { parseNSW, parseQLD, normalizeVICIdentity } from './regional.mjs';
import { normalizeFeed, categoryFor } from '../lib/incidents.ts';

import { sources } from './source-config.mjs';
import { skipCounter } from './skipped.mjs';
export { sources } from './source-config.mjs';

const text = (v, max = 300) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, max)
    : '';
export function parseACT(xml, now = new Date().toISOString()) {
  if (
    typeof xml !== 'string' ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    SyntaxValidator.validate(xml, { multipleRoots: false }) !== true
  )
    throw Error('Invalid ACT XML');
  const parsed = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: true,
    entityDecoder: new EntityDecoder({
      namedEntities: XML,
      numericAllowed: true,
    }),
  }).parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel || typeof channel.title !== 'string')
    throw Error('Invalid ACT channel');
  const items = channel.item
    ? Array.isArray(channel.item)
      ? channel.item
      : [channel.item]
    : [];
  if (items.length > 15000) throw Error('ACT feed too large');
  const unique = new Map();
  const skipped = skipCounter();
  for (const item of items) {
    const sourceId = text(item.cadid || item.guid, 160);
    const type = text(item.type);
    if (!sourceId || !type) {
      skipped.skip('Incomplete ACT incident');
      continue;
    }
    const description = text(item.description, 5000);
    const field = (label) =>
      text(
        description.match(
          new RegExp('(?:^|\\n)' + label + ':\\s*([^\\r\\n]*)'),
        )?.[1],
      );
    const xy = text(item['georss:point']).split(/\s+/).map(Number);
    const point =
      xy.length === 2 &&
      xy.every(Number.isFinite) &&
      Math.abs(xy[0]) <= 90 &&
      Math.abs(xy[1]) <= 180
        ? xy
        : null;
    const ambulance = /ambulance/i.test(item.agency || type);
    const category = ambulance
      ? 'ambulance'
      : /hazard reduction|planned|burn off/i.test(type)
        ? 'planned'
        : categoryFor(type, '');
    const created = actDate(field('Time of Call'));
    const updated = actDate(field('Updated'));
    // Only the public suburb is retained for ambulance calls; no patient details.
    unique.set(sourceId, {
      id: `act:incident:${sourceId}`,
      sourceId,
      title: ambulance
        ? 'Ambulance response'
        : type.toLowerCase().replace(/^./, (s) => s.toUpperCase()),
      location: field('Suburb') || 'Location not supplied',
      status: text(item.resourceStatus) || 'Status not supplied',
      category,
      agency: `ACT ${text(item.agency) || 'ESA'}`,
      sourceFeed: 'act-esa',
      created,
      updated,
      resources: null,
      point,
      geometry: point
        ? { type: 'Point', coordinates: [point[1], point[0]] }
        : null,
      kind: 'incident',
      level: null,
      action: null,
      officialUrl: sources.act.adviceUrl,
    });
  }
  skipped.check(items.length, 'ACT');
  return {
    skipped: skipped.summary(),
    incidents: [...unique.values()],
    warnings: [],
    fetchedAt: now,
    sourceUpdated: null,
    stale: false,
  };
}

export async function fetchSource(region, fetcher = fetch, now = new Date()) {
  const config = sources[region];
  const response = await fetcher(config.url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: ['act', 'sa'].includes(region)
        ? 'application/xml'
        : 'application/json',
      'User-Agent': 'Dispatch/0.1 (public incident feed)',
    },
  });
  if (!response.ok) throw Error(`Source HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 6000000)
    throw Error('Source too large');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 6000000) {
        await reader.cancel();
        throw Error('Source too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks).toString('utf8');
  const feed =
    region === 'sa'
      ? parseSA(body, now.toISOString())
      : region === 'act'
        ? parseACT(body, now.toISOString())
        : region === 'nsw'
          ? parseNSW(JSON.parse(body), now.toISOString())
          : region === 'qld'
            ? parseQLD(JSON.parse(body), now.toISOString())
            : normalizeVICIdentity(normalizeFeed(JSON.parse(body), now));
  const httpDate = Date.parse(response.headers.get('date') || '');
  const age = Number(response.headers.get('age') || '0');
  // An unchanged incident is not a stale feed. Check the transport clock as well.
  if (
    !Number.isFinite(httpDate) ||
    Math.abs(now.getTime() - httpDate) > config.staleAfter ||
    !Number.isFinite(age) ||
    age > config.staleAfter / 1000
  )
    feed.stale = true;
  return { ...feed, region, receivedAt: now.toISOString() };
}
