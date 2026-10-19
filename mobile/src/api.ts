/**
 * Data layer for Dispatch. The screens were built for 112 Meldingen and speak
 * in "meldingen" (incidents) with a discipline, a place and a coordinate. The
 * Australian feed service (backend/, run by the feed collector) delivers
 * incidents per state. This file is the adapter between the two: it fetches
 * the national feed once, keeps it for a short while, and filters it on the
 * device by distance and service.
 *
 * Push registration talks to the device endpoints described in
 * docs/PUSH-API.md. Until the backend serves them, registration fails quietly
 * and the app keeps working as a live list and map.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { parseFeed, type Feed, type Incident } from './feed-model';
import { vensters } from './diensten';

const BASE = String(Constants.expoConfig?.extra?.feedApiUrl || '').replace(/\/$/, '');
let installToken: string | null = null;
export function zetInstallToken(t: string | null): void { installToken = t; }

export interface Melding {
  id: string;
  timestamp: string;
  /** Warning level or status as published by the agency. */
  priority: string;
  /** Service key from diensten.ts: Fire, Ambulance, Rescue, Storm, Hazmat, Other. */
  discipline: string;
  city?: string | null;
  location?: string | null;
  rawMessage?: string | null;
  lat?: number | null;
  lon?: number | null;
  /** Some screens accept either name for longitude. */
  lng?: number | null;
  geoPrecision?: string | null;
  /** Australian extras. */
  title?: string;
  status?: string;
  agency?: string;
  officialUrl?: string;
  updated?: string | null;
  resources?: number | null;
  kind?: 'incident' | 'warning';
  level?: string | null;
  action?: string | null;
  sourceRegion?: string;
  /** Kept for screen compatibility; Australian feeds have no escalation ladder. */
  escalationLevel?: number | null;
  escalationCategory?: string | null;
  escalatedAt?: string | null;
  escalationHistory?: { ordinal: number; label: string; at: string }[] | null;
}

export interface Voertuig {
  vehicleId?: string | null;
  stationName?: string | null;
  description?: string | null;
  vehicleType?: string | null;
  etaSeconds?: number | null;
  eta?: { status?: string; totalSeconds?: number } | null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (installToken) h['x-install-token'] = installToken;
  return h;
}

// ── Feed ────────────────────────────────────────────────────────────────────

const DIENST_VAN_CATEGORIE: Record<string, string> = {
  fire: 'Fire',
  planned: 'Fire',
  ambulance: 'Ambulance',
  rescue: 'Rescue',
  storm: 'Storm',
  hazmat: 'Hazmat',
  other: 'Other',
};

/** "Buckley St, Stratford" → street "Buckley St", suburb "Stratford". */
function splitsPlek(locatie: string): { straat: string | null; plaats: string | null } {
  const delen = locatie.split(',').map((d) => d.trim()).filter(Boolean);
  if (delen.length === 0) return { straat: null, plaats: null };
  if (delen.length === 1) return { straat: null, plaats: delen[0] };
  return { straat: delen.slice(0, -1).join(', '), plaats: delen[delen.length - 1] };
}

// Agency codes as the feeds publish them → names people recognise.
const INSTANTIE: Array<[RegExp, string]> = [
  [/CFA/i, 'Country Fire Authority (CFA)'],
  [/FRV|MFB/i, 'Fire Rescue Victoria (FRV)'],
  [/ESTA/i, 'Triple Zero Victoria (ESTA)'],
  [/VICSES|\bSES\b/i, 'State Emergency Service (SES)'],
  [/RFS/i, 'NSW Rural Fire Service'],
  [/QFD|QFES|QFR/i, 'Queensland Fire Department'],
  [/CFS/i, 'SA Country Fire Service'],
  [/ACTAS/i, 'ACT Ambulance Service'],
  [/ACTF|ACTRS|ESA/i, 'ACT Emergency Services Agency'],
];
function instantieNaam(code: string | undefined): string | undefined {
  if (!code) return code;
  for (const [re, naam] of INSTANTIE) if (re.test(code)) return naam;
  return code;
}

function naarMelding(i: Incident, region: string): Melding {
  const { straat, plaats } = splitsPlek(i.location || '');
  const [lat, lon] = i.point ?? [null, null];
  return {
    id: i.id,
    timestamp: i.created ?? i.firstSeen ?? i.updated ?? new Date().toISOString(),
    priority: i.level ?? i.status ?? '',
    discipline: DIENST_VAN_CATEGORIE[i.category] ?? 'Other',
    city: plaats,
    location: straat,
    rawMessage: [i.title, i.status].filter(Boolean).join(' · '),
    lat, lon,
    geoPrecision: i.point ? 'street' : 'none',
    title: i.title,
    status: i.status,
    agency: instantieNaam(i.agency),
    officialUrl: i.officialUrl,
    updated: i.updated,
    resources: i.resources,
    kind: i.kind,
    level: i.level,
    action: i.action,
    sourceRegion: region,
  };
}

// One request covers the whole country; the list, the map and the detail
// screen all read from it. Kept for 30 s so switching tabs does not refetch.
const BEWAAR_MS = 30_000;
const cache = new Map<number, { op: number; meldingen: Melding[]; feed: Feed }>();
const bezig = new Map<number, Promise<{ meldingen: Melding[]; feed: Feed }>>();

/** The feed service only knows 24, 72 and 168 hours. */
function vensterUren(uren: number): 24 | 72 | 168 {
  return uren <= 24 ? 24 : uren <= 72 ? 72 : 168;
}

export async function haalFeed(uren = 24): Promise<{ meldingen: Melding[]; feed: Feed }> {
  const h = vensterUren(uren);
  const c = cache.get(h);
  if (c && Date.now() - c.op < BEWAAR_MS) return c;
  const lopend = bezig.get(h);
  if (lopend) return lopend;
  const p = (async () => {
    if (!/^https:\/\//.test(BASE)) throw new Error('Feed service unavailable');
    const res = await fetch(`${BASE}/v1/feed?region=au&hours=${h}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`feed → ${res.status}`);
    const feed = parseFeed(await res.json(), 'au');
    const meldingen = [...feed.incidents, ...feed.warnings]
      .map((i) => naarMelding(i, (i.id.split(':')[0] || 'au')))
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    const uit = { op: Date.now(), meldingen, feed };
    cache.set(h, uit);
    return uit;
  })();
  bezig.set(h, p);
  try { return await p; } finally { bezig.delete(h); }
}

export function afstandKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Incidents around a point, filtered on the device. */
export async function haalMeldingen(opts: {
  lat: number; lon: number; radiusKm: number;
  disciplines?: string[]; limit?: number; vanaf?: Date; voor?: Date;
}): Promise<Melding[]> {
  const uren = opts.vanaf ? (Date.now() - opts.vanaf.getTime()) / 3600_000 : 168;
  const { meldingen } = await haalFeed(uren);
  return meldingen.filter((m) => {
    if (opts.disciplines?.length && !opts.disciplines.includes(m.discipline)) return false;
    const t = +new Date(m.timestamp);
    if (opts.vanaf && t < opts.vanaf.getTime()) return false;
    if (opts.voor && t >= opts.voor.getTime()) return false;
    if (m.lat == null || m.lon == null) return false;
    return afstandKm(opts.lat, opts.lon, m.lat, m.lon) <= opts.radiusKm;
  }).slice(0, opts.limit ?? 200);
}

/**
 * Incidents with each service's own look-back window and radius (diensten.ts),
 * merged and newest first. Same contract as in 112 Meldingen.
 */
export async function haalMeldingenPerVenster(opts: {
  lat: number; lon: number; radiusKm: number;
  disciplines: string[];
  straalPerDienst?: Record<string, number>;
  extraKm?: number;
  limietPerVenster?: number;
  strikt?: boolean;
  zonderVenster?: boolean;
  voor?: Date;
  terugblikUren?: Record<string, number>;
}): Promise<Melding[]> {
  const nu = Date.now();
  const delen = await Promise.all(
    vensters(opts.disciplines, opts.radiusKm, opts.straalPerDienst ?? {}, opts.terugblikUren).map((v) => haalMeldingen({
      lat: opts.lat, lon: opts.lon,
      radiusKm: v.straalKm + (opts.extraKm ?? 0),
      disciplines: v.diensten,
      vanaf: opts.zonderVenster ? new Date(nu - 168 * 3600_000) : new Date(nu - v.uren * 3600_000),
      voor: opts.voor,
      limit: opts.limietPerVenster ?? 200,
    }).catch((error) => { if (opts.strikt) throw error; return [] as Melding[]; })),
  );
  const gezien = new Set<string>();
  const uit: Melding[] = [];
  for (const m of delen.flat()) {
    if (gezien.has(m.id)) continue;
    gezien.add(m.id);
    uit.push(m);
  }
  uit.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  return uit;
}

/** Free-text search over the last week: every word must appear somewhere. */
export async function zoekMeldingen(
  vraag: string,
  filter?: { lat: number; lon: number; radiusKm: number; disciplines?: string[] },
): Promise<Melding[]> {
  const { meldingen } = await haalFeed(168);
  const woorden = vraag.toLowerCase().split(/\s+/).filter(Boolean);
  return meldingen.filter((m) => {
    const tekst = [m.title, m.status, m.location, m.city, m.agency, m.discipline].join(' ').toLowerCase();
    if (!woorden.every((w) => tekst.includes(w))) return false;
    if (filter?.disciplines?.length && !filter.disciplines.includes(m.discipline)) return false;
    if (filter && m.lat != null && m.lon != null) {
      return afstandKm(filter.lat, filter.lon, m.lat, m.lon) <= filter.radiusKm;
    }
    return true;
  }).slice(0, 60);
}

export async function haalMelding(id: string): Promise<Melding> {
  for (const uren of [24, 168]) {
    const { meldingen } = await haalFeed(uren);
    const m = meldingen.find((x) => x.id === id);
    if (m) return m;
  }
  throw new Error('Incident no longer in the feed');
}

/** Australian feeds publish a resource count, not individual vehicles. */
export async function haalVoertuigen(_id: string): Promise<Voertuig[]> {
  return [];
}

export type VerloopRegel = {
  at: string;
  soort: 'alarmering' | 'opschaling' | 'afsluiting' | 'intrekking';
  kop?: string;
  tekst: string;
};

/** Timeline built from what the feed tells us: reported, last update, status. */
export async function haalVerloop(id: string): Promise<VerloopRegel[]> {
  const m = await haalMelding(id);
  const regels: VerloopRegel[] = [{
    at: m.timestamp, soort: 'alarmering', kop: 'Reported',
    tekst: `${m.title ?? 'Incident'} reported${m.agency ? ` by ${m.agency}` : ''}.`,
  }];
  if (m.updated && m.updated !== m.timestamp) {
    const klaar = /safe|complete|closed|under control/i.test(m.status ?? '');
    regels.push({
      at: m.updated, soort: klaar ? 'afsluiting' : 'opschaling', kop: m.status || 'Update',
      tekst: m.action ? m.action : `Status: ${m.status || 'updated'}${m.resources ? ` · ${m.resources} resources assigned` : ''}.`,
    });
  }
  return regels;
}

// ── Push (see docs/PUSH-API.md) ─────────────────────────────────────────────

function appVersieVelden(): { appVersion?: string; appBuild?: number } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('expo-application');
    const bouw = Number(app.nativeBuildVersion);
    return {
      appVersion: app.nativeApplicationVersion ?? undefined,
      appBuild: Number.isFinite(bouw) && bouw > 0 ? bouw : undefined,
    };
  } catch {
    return {};
  }
}

export async function registreerGebruiker(opts: {
  deviceId: string; fcmToken: string; lat?: number; lon?: number;
}): Promise<{ id: string; installationToken?: string }> {
  const res = await fetch(`${BASE}/v1/devices/register`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({
      deviceId: opts.deviceId, pushToken: opts.fcmToken, platform: Platform.OS,
      lat: opts.lat, lon: opts.lon,
      ...appVersieVelden(),
    }),
  });
  if (!res.ok) throw new Error(`register → ${res.status}`);
  const j = await res.json();
  return j.data ?? j;
}

export async function zetPushFilter(userId: string, filter: {
  lat?: number; lon?: number; radius: number;
  radiusPerDienst?: Record<string, number>;
  disciplines: string[]; priorityLevel: 'all' | 'p1';
  geluid?: string;
  geluidPerDienst?: Record<string, string>;
  notificationsEnabled: boolean;
  gripOnly?: boolean;
}): Promise<void> {
  const res = await fetch(`${BASE}/v1/devices/${userId}/filter`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({
      lat: filter.lat, lon: filter.lon,
      radiusKm: filter.radius,
      radiusPerService: filter.radiusPerDienst ?? {},
      services: filter.disciplines,
      warningsOnly: filter.priorityLevel === 'p1',
      emergencyWarningsAnywhere: filter.gripOnly ?? false,
      sound: filter.geluid,
      notificationsEnabled: filter.notificationsEnabled,
    }),
  });
  if (!res.ok) throw new Error(`filter → ${res.status}`);
}

export const API_BASE = BASE;
