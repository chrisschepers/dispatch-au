import { XMLParser } from 'fast-xml-parser';
import { EntityDecoder, XML } from '@nodable/entities';
import { SyntaxValidator } from 'fast-xml-validator';
import { normalizeFeed, categoryFor } from '../lib/incidents.ts';

export const sources = {
  vic: {
    name: 'VicEmergency',
    interval: 60000,
    staleAfter: 300000,
    url: 'https://emergency.vic.gov.au/public/events-geojson.json',
    adviceUrl: 'https://emergency.vic.gov.au/respond/',
    attribution: 'Data © State of Victoria. Source: VicEmergency.',
    licenseUrl:
      'https://www.emv.vic.gov.au/responsibilities/victorias-warning-system/emergency-data',
  },
  act: {
    name: 'ACT Emergency Services Agency',
    interval: 60000,
    staleAfter: 300000,
    url: 'https://esa.act.gov.au/feeds/currentincidents.xml',
    adviceUrl: 'https://esa.act.gov.au/',
    attribution:
      'Data © ACT Emergency Services Agency, licensed under CC BY 4.0. Adapted for display.',
    licenseUrl:
      'https://data.esa.act.gov.au/be-emergency-ready/warnings-alerts',
    coverageNote: 'ACT incident feed only. See ESA for official warnings.',
  },
};
const text = (v, max = 300) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, max)
    : '';
const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ACT's description uses Canberra wall time without an offset; Intl applies DST.
export function actDate(value) {
  const m = String(value)
    .trim()
    .match(
      /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
    );
  if (!m || !months.includes(m[2])) return null;
  const parts = [+m[3], months.indexOf(m[2]) + 1, +m[1], +m[4], +m[5], +m[6]];
  const wanted = Date.UTC(parts[0], parts[1] - 1, ...parts.slice(2));
  const utc = new Date(wanted);
  if (
    utc.getUTCFullYear() !== parts[0] ||
    utc.getUTCMonth() + 1 !== parts[1] ||
    utc.getUTCDate() !== parts[2] ||
    utc.getUTCHours() !== parts[3] ||
    utc.getUTCMinutes() !== parts[4] ||
    utc.getUTCSeconds() !== parts[5]
  )
    return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = wanted - 10 * 3600000;
  const localParts = (n) =>
    Object.fromEntries(fmt.formatToParts(n).map((p) => [p.type, p.value]));
  for (let i = 0; i < 3; i++) {
    const p = localParts(candidate);
    const actual = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    if (actual === wanted) return new Date(candidate).toISOString();
    candidate += wanted - actual;
  }
  return null;
}

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
  for (const item of items) {
    const sourceId = text(item.cadid || item.guid, 160);
    const type = text(item.type);
    if (!sourceId || !type) throw Error('Incomplete ACT incident');
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
  return {
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
      Accept: region === 'act' ? 'application/xml' : 'application/json',
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
    region === 'act'
      ? parseACT(body, now.toISOString())
      : normalizeFeed(JSON.parse(body), now);
  const httpDate = Date.parse(response.headers.get('date') || '');
  const age = Number(response.headers.get('age') || '0');
  // An unchanged incident is not a stale feed. Check the transport clock as well.
  if (
    !Number.isFinite(httpDate) ||
    Math.abs(now.getTime() - httpDate) > 300000 ||
    !Number.isFinite(age) ||
    age > 300
  )
    feed.stale = true;
  return { ...feed, region, receivedAt: now.toISOString() };
}
