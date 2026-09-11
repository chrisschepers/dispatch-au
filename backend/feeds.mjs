import { parseSA } from './sa.mjs';
import { actDate } from './time.mjs';
export { actDate } from './time.mjs';
import { XMLParser } from 'fast-xml-parser';
import { EntityDecoder, XML } from '@nodable/entities';
import { SyntaxValidator } from 'fast-xml-validator';
import { parseNSW, parseQLD, normalizeVICIdentity } from './regional.mjs';
import { normalizeFeed, categoryFor } from '../lib/incidents.ts';

export const sources = {
  sa: {
    name: 'SA Country Fire Service',
    interval: 300000,
    staleAfter: 900000,
    url: 'https://data.eso.sa.gov.au/prod/cfs/criimson/cfs_current_incidents.xml',
    adviceUrl: 'https://www.cfs.sa.gov.au/incidents/',
    attribution:
      'The Government of South Australia, CFS Current Incidents, https://www.cfs.sa.gov.au/warnings-restrictions/warnings/rss-feeds/. CC BY 4.0.',
    licenseUrl: 'https://www.cfs.sa.gov.au/home/copyright/',
    coverageNote:
      'CFS public incident list only, not CFSScan or all SA emergency calls. This feed has no coordinates: incidents are available in the state list, not nearby-radius views or map pins. See CFS for warnings.',
  },
  nsw: {
    name: 'NSW Rural Fire Service',
    interval: 1800000,
    staleAfter: 2400000,
    url: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json',
    adviceUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    attribution:
      '© State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au.',
    licenseUrl:
      'https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds',
    coverageNote:
      'RFS incidents; not all NSW emergency calls. Source updates about every 30 minutes. Unknown call times use the source update (Updated), or first observation (Seen). Alert levels appear with incident status; see RFS for warning areas.',
  },
  qld: {
    name: 'Queensland Fire Department',
    interval: 1800000,
    staleAfter: 2400000,
    url: 'https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json',
    adviceUrl: 'https://www.fire.qld.gov.au/Current-Incidents',
    attribution:
      '© State of Queensland (Queensland Fire Department), CC BY 4.0. Adapted for display.',
    licenseUrl:
      'https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents',
    coverageNote:
      'Vegetation fires, permitted burns and published QFD warnings; not all Queensland emergency calls. Source updates about every 30 minutes. Unknown call times use the source update (Updated), or first observation (Seen).',
  },
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
