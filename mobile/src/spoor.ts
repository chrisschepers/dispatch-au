/**
 * Coördinaten en sporen (afgelegde routes) voor de kaart, gecontroleerd. Los
 * van react-native, zodat de tests het zonder toestel nalopen
 * (tests/spoor.test.mjs).
 *
 * Elke breedte en lengte die naar een kaartcomponent gaat, komt hierlangs. In
 * de grote app liet één coördinaat die als tekst binnenkwam de Android-kaart
 * crashen (10-11-2026): de native kant verwacht een getal. Dus: tekst met een
 * getal erin wordt een getal, en wat geen geldige plek is valt weg.
 */

/** Een getal, ook als het als tekst binnenkomt ("-33.9"); anders null. */
export function alsGetal(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface Plek {
  lat: number;
  lon: number;
}

/** Een geldige plek op aarde, of null. (0, 0) is geen plek maar een lege waarde. */
export function plekVan(lat: unknown, lon: unknown): Plek | null {
  const a = alsGetal(lat), o = alsGetal(lon);
  if (a == null || o == null) return null;
  if (Math.abs(a) > 90 || Math.abs(o) > 180) return null;
  if (a === 0 && o === 0) return null;
  return { lat: a, lon: o };
}

export interface SpoorPunt extends Plek {
  /** Unix-seconden; 0 als het punt geen tijd had. */
  t: number;
}

/** Zoveel punten tekent de kaart hooguit; een langer spoor wordt uitgedund. */
export const MAX_SPOOR = 600;

/**
 * Een spoor uit de backend. Schepen komen als [lat, lon, tijd], vluchten als
 * [tijd, lat, lon, hoogte]. Een punt dat niet klopt valt weg, de rest blijft
 * in volgorde staan.
 */
export function parseSpoor(raw: unknown, vorm: 'lat-lon-t' | 't-lat-lon'): SpoorPunt[] {
  if (!Array.isArray(raw)) return [];
  const uit: SpoorPunt[] = [];
  for (const p of raw.slice(0, 20_000)) {
    if (!Array.isArray(p)) continue;
    const plek = vorm === 'lat-lon-t' ? plekVan(p[0], p[1]) : plekVan(p[1], p[2]);
    if (!plek) continue;
    const t = alsGetal(vorm === 'lat-lon-t' ? p[2] : p[0]);
    uit.push({ ...plek, t: t != null && t > 0 ? t : 0 });
  }
  if (uit.length <= MAX_SPOOR) return uit;
  // Uitdunnen met een vaste stap; het laatste punt (waar hij nu is) blijft.
  const stap = uit.length / MAX_SPOOR;
  const dun: SpoorPunt[] = [];
  for (let i = 0; i < MAX_SPOOR - 1; i++) dun.push(uit[Math.floor(i * stap)]!);
  dun.push(uit[uit.length - 1]!);
  return dun;
}

export interface SpoorRegio {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Het kaartbeeld waar het hele spoor in past, met wat lucht eromheen. Null
 * zonder punten. Eén punt (of een schip dat stil ligt) krijgt een vast,
 * klein beeld in plaats van een delta van nul.
 */
export function spoorRegio(punten: readonly Plek[], minDelta = 0.02): SpoorRegio | null {
  const geldig = punten.filter((p) => plekVan(p.lat, p.lon) != null);
  if (geldig.length === 0) return null;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of geldig) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.min(120, Math.max(minDelta, (maxLat - minLat) * 1.4)),
    longitudeDelta: Math.min(120, Math.max(minDelta, (maxLon - minLon) * 1.4)),
  };
}

/** Een geldig ISO-moment, of null. */
export function alsMoment(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null;
}

/** "16 min", "1 h 20 min", "2 h". Null als de duur onbekend of negatief is. */
export function duurTekst(minuten: number | null): string | null {
  if (minuten == null || !Number.isFinite(minuten) || minuten < 0) return null;
  const m = Math.round(minuten);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const uur = Math.floor(m / 60), rest = m % 60;
  return rest ? `${uur} h ${rest} min` : `${uur} h`;
}

/** Minuten tussen twee momenten; null als een van beide ontbreekt. */
export function minutenTussen(van: string | null, tot: string | null): number | null {
  if (!van || !tot) return null;
  const d = (Date.parse(tot) - Date.parse(van)) / 60_000;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** "9:21 pm" in de tijd van het toestel. */
export function klok(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

/** "Today 9:21 pm", "Yesterday 3:05 pm", "Tue 10 Nov, 3:05 pm". */
export function dagKlok(iso: string, nu = Date.now()): string {
  const d = new Date(iso);
  if (new Date(nu).toDateString() === d.toDateString()) return `Today ${klok(iso)}`;
  if (new Date(nu - 86_400_000).toDateString() === d.toDateString()) return `Yesterday ${klok(iso)}`;
  const dag = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${dag}, ${klok(iso)}`;
}

/** "Just now", "12 min ago", "3 hours ago": hoe oud een positie is. */
export function geledenTekst(min: number): string {
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const uur = Math.floor(min / 60);
  return uur === 1 ? '1 hour ago' : `${uur} hours ago`;
}
