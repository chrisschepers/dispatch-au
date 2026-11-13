/**
 * Reddingsboten, waterpolitie, patrouille- en blusvaartuigen op de kaart
 * (13-11-2026): de vorm van /v1/vessels en /v1/vessels/{mmsi}/trips
 * (backend/vessels.mjs) en wat de kaart ermee doet. Los van react-native,
 * zodat de tests het zonder toestel nalopen (tests/vaartuigen.test.mjs).
 *
 * De backend bepaalt welke lagen er zijn (`categories`): de app toont alleen
 * die, zodat een nieuwe soort zonder nieuwe build op de kaart kan. Een oudere
 * backend zonder de route geeft geen lagen, en dan is er ook geen kopje.
 */
import {
  alsGetal, alsMoment, plekVan, parseSpoor, duurTekst, minutenTussen, klok, dagKlok,
  type Plek, type SpoorPunt,
} from './spoor.ts';

export type VaartSoort = 'rescue' | 'police' | 'patrol' | 'fire';
const SOORTEN: readonly VaartSoort[] = ['rescue', 'police', 'patrol', 'fire'];

export interface WaterLaagInfo {
  key: VaartSoort;
  label: string;
  /** Enkelvoud, voor het blad van één vaartuig. */
  enkel: string;
  sub: string;
  /**
   * Kleur van de romp op de kaart. Bewust geen kleur van een dienst of een
   * luchtlaag (rood, amber, blauw, groenblauw, paars, oranje): een schip is
   * een romp met een witte rand, geen rondje, en heeft zijn eigen tinten.
   */
  kleur: string;
  /** MDI-icoon voor het tegeltje in het blad Kaartlagen. */
  icoon: 'lifebuoy' | 'police-badge' | 'ferry' | 'fire';
  /** Aan bij een nieuwe installatie: alleen de reddingsboten. */
  standaard: boolean;
}

export const WATER_LAGEN: readonly WaterLaagInfo[] = [
  {
    key: 'rescue', label: 'Rescue vessels', enkel: 'Rescue vessel',
    sub: 'Volunteer marine rescue and coast guard boats',
    kleur: '#15803D', icoon: 'lifebuoy', standaard: true,
  },
  {
    key: 'police', label: 'Police vessels', enkel: 'Police vessel',
    sub: 'Water police',
    kleur: '#1E3A8A', icoon: 'police-badge', standaard: false,
  },
  {
    key: 'patrol', label: 'Patrol vessels', enkel: 'Patrol vessel',
    sub: 'Border Force, fisheries and maritime safety',
    kleur: '#475569', icoon: 'ferry', standaard: false,
  },
  {
    key: 'fire', label: 'Fire boats', enkel: 'Fire boat',
    sub: 'Firefighting vessels',
    kleur: '#BE185D', icoon: 'fire', standaard: false,
  },
];

export const STANDAARD_WATER: Record<VaartSoort, boolean> = Object.fromEntries(
  WATER_LAGEN.map((l) => [l.key, l.standaard]),
) as Record<VaartSoort, boolean>;

export function waterLaag(soort: VaartSoort): WaterLaagInfo {
  return WATER_LAGEN.find((l) => l.key === soort) ?? WATER_LAGEN[0]!;
}

export interface Vaartuig {
  mmsi: number;
  name: string;
  callsign: string | null;
  soort: VaartSoort;
  organisation: string | null;
  unit: string | null;
  lengthM: number | null;
  lat: number;
  lon: number;
  speedKn: number | null;
  /** Koers over de grond en waar de boeg heen wijst, in graden; vaak leeg bij stilliggen. */
  course: number | null;
  heading: number | null;
  moving: boolean;
  /** Moment van de laatste positie (ISO). */
  seenAt: string;
  /** Ligt stil en is al een half uur niet gehoord: laatst bekende plek. */
  stale: boolean;
  /** Aan de eigen ligplaats; null als de backend die plek nog niet kent. */
  atBerth: boolean | null;
  /** De tocht die nu loopt. */
  tocht: { id: number; startedAt: string } | null;
}

export interface VaartBeeld {
  vaartuigen: Vaartuig[];
  /** De lagen die de backend nu heeft; leeg bij een antwoord zonder `categories`. */
  soorten: VaartSoort[];
  bijgewerkt: string | null;
  /** Bronvermelding van de backend; null als die ontbreekt. */
  bron: string | null;
  aan: boolean;
  pauzeTot: string | null;
}

const tekst = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

const graden = (v: unknown): number | null => {
  const n = alsGetal(v);
  return n != null && n >= 0 && n <= 360 ? n : null;
};

/**
 * Het antwoord van /v1/vessels, gecontroleerd. Een rij met een onbekende
 * soort of zonder geldige plek valt weg; de rest blijft staan.
 */
export function parseVaartBeeld(json: unknown): VaartBeeld {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rijen = Array.isArray(j.vessels) ? j.vessels.slice(0, 1000) : [];
  const vaartuigen: Vaartuig[] = [];
  const gezien = new Set<number>();
  for (const r of rijen) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    const mmsi = alsGetal(a.mmsi);
    const soort = a.category as VaartSoort;
    const plek = plekVan(a.lat, a.lon);
    const seenAt = alsMoment(a.seenAt);
    if (mmsi == null || !Number.isInteger(mmsi) || mmsi <= 0 || gezien.has(mmsi)) continue;
    if (!SOORTEN.includes(soort) || !plek || !seenAt) continue;
    gezien.add(mmsi);
    const t = (a.trip && typeof a.trip === 'object' ? a.trip : null) as Record<string, unknown> | null;
    const tochtId = t ? alsGetal(t.id) : null;
    const tochtStart = t ? alsMoment(t.startedAt) : null;
    const lengte = alsGetal(a.lengthM);
    const snelheid = alsGetal(a.speedKn);
    vaartuigen.push({
      mmsi,
      name: tekst(a.name, 60) ?? `MMSI ${mmsi}`,
      callsign: tekst(a.callsign, 20),
      soort,
      organisation: tekst(a.organisation, 80),
      unit: tekst(a.unit, 60),
      lengthM: lengte != null && lengte > 0 && lengte < 500 ? lengte : null,
      lat: plek.lat,
      lon: plek.lon,
      speedKn: snelheid != null && snelheid >= 0 && snelheid < 100 ? snelheid : null,
      course: graden(a.course),
      heading: graden(a.heading),
      moving: a.moving === true,
      seenAt,
      stale: a.stale === true,
      atBerth: typeof a.atBerth === 'boolean' ? a.atBerth : null,
      tocht: tochtId != null && tochtStart ? { id: tochtId, startedAt: tochtStart } : null,
    });
  }
  const status = (j.status && typeof j.status === 'object' ? j.status : {}) as Record<string, unknown>;
  return {
    vaartuigen,
    soorten: Array.isArray(j.categories) ? SOORTEN.filter((s) => (j.categories as unknown[]).includes(s)) : [],
    bijgewerkt: alsMoment(j.updatedAt),
    bron: tekst(j.attribution, 300),
    aan: status.enabled !== false,
    pauzeTot: alsMoment(status.pausedUntil),
  };
}

/**
 * De lagen die het blad Kaartlagen aanbiedt: alleen wat de backend nu heeft.
 * Zonder antwoord (oudere backend, geen verbinding) geen enkele laag.
 */
export function beschikbareWaterLagen(beeld: Pick<VaartBeeld, 'soorten'> | null): WaterLaagInfo[] {
  if (!beeld) return [];
  return WATER_LAGEN.filter((l) => beeld.soorten.includes(l.key));
}

/** De vaartuigen van de lagen die aan staan. */
export function inWaterLagen(vaartuigen: readonly Vaartuig[], lagen: Record<VaartSoort, boolean>): Vaartuig[] {
  return vaartuigen.filter((v) => lagen[v.soort] === true);
}

/**
 * Waar de romp op de kaart heen wijst: de koers als hij vaart, anders de
 * boegrichting. Null bij stilliggen of zonder richting: dan de rustige marker.
 */
export function koersVan(v: Pick<Vaartuig, 'moving' | 'course' | 'heading'>): number | null {
  if (!v.moving) return null;
  return v.course ?? v.heading;
}

/** "7.2 kn · 13 km/h" of null. */
export function knopenTekst(kn: number | null): string | null {
  if (kn == null) return null;
  const rond = kn < 10 ? Math.round(kn * 10) / 10 : Math.round(kn);
  return `${rond} kn · ${Math.round(kn * 1.852)} km/h`;
}

/** "59 m" of null. */
export function lengteTekst(v: Pick<Vaartuig, 'lengthM'>): string | null {
  return v.lengthM == null ? null : `${Math.round(v.lengthM)} m`;
}

/** "Rescue vessel · Marine Rescue NSW · Port Stephens 31". */
export function vaartuigRegel(v: Pick<Vaartuig, 'soort' | 'organisation' | 'unit' | 'name'>): string {
  // De eenheid is vaak gewoon de naam zonder voorvoegsel: dan niet nog eens.
  const unit = v.unit && !v.name.toLowerCase().includes(v.unit.toLowerCase()) ? v.unit : null;
  return [waterLaag(v.soort).enkel, v.organisation, unit].filter(Boolean).join(' · ');
}

/**
 * Wat het vaartuig nu doet, in gewone woorden: "Under way since 9:21 pm",
 * "At its berth" of "Last seen Today 2:51 pm". `vertrekGezien` komt uit de
 * tochten: zagen we hem niet vertrekken, dan is het begin het moment dat hij
 * in beeld kwam, niet het vertrek.
 */
export function vaartToestand(
  v: Pick<Vaartuig, 'moving' | 'stale' | 'atBerth' | 'tocht' | 'seenAt'>,
  vertrekGezien: boolean | null = null,
  nu = Date.now(),
): string {
  if (v.tocht && !v.stale) {
    return vertrekGezien === false
      ? `Under way, in view since ${klok(v.tocht.startedAt)}`
      : `Under way since ${klok(v.tocht.startedAt)}`;
  }
  if (v.moving && !v.stale) return 'Under way';
  if (v.atBerth === true) return 'At its berth';
  return `Last seen ${dagKlok(v.seenAt, nu)}`;
}

export interface Tocht {
  id: number;
  running: boolean;
  startedAt: string;
  /** False: hij kwam varend in beeld, het vertrek zelf zagen we niet. */
  departureSeen: boolean;
  from: 'berth' | 'elsewhere' | null;
  endedAt: string | null;
  end: 'berth' | 'stopped' | 'lost' | null;
  durationMin: number | null;
  distanceKm: number | null;
  maxKn: number | null;
  spoor: SpoorPunt[];
}

export interface Tochten {
  tochten: Tocht[];
  ligplaats: Plek | null;
  bron: string | null;
}

/** Het antwoord van /v1/vessels/{mmsi}/trips: de lopende tocht eerst, dan 7 dagen. */
export function parseTochten(json: unknown): Tochten {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rijen = Array.isArray(j.trips) ? j.trips.slice(0, 200) : [];
  const tochten: Tocht[] = [];
  for (const r of rijen) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    const id = alsGetal(a.id);
    const startedAt = alsMoment(a.startedAt);
    if (id == null || !startedAt) continue;
    const endedAt = alsMoment(a.endedAt);
    const duur = alsGetal(a.durationMin);
    const km = alsGetal(a.distanceKm);
    const max = alsGetal(a.maxKn);
    tochten.push({
      id,
      running: a.running === true,
      startedAt,
      departureSeen: a.departureSeen !== false,
      from: a.from === 'berth' || a.from === 'elsewhere' ? a.from : null,
      endedAt,
      end: a.end === 'berth' || a.end === 'stopped' || a.end === 'lost' ? a.end : null,
      durationMin: duur != null && duur >= 0 ? duur : minutenTussen(startedAt, endedAt ?? alsMoment(a.lastSeenAt)),
      distanceKm: km != null && km >= 0 ? km : null,
      maxKn: max != null && max >= 0 && max < 100 ? max : null,
      spoor: parseSpoor(a.track, 'lat-lon-t'),
    });
  }
  const b = (j.berth && typeof j.berth === 'object' ? j.berth : null) as Record<string, unknown> | null;
  return { tochten, ligplaats: b ? plekVan(b.lat, b.lon) : null, bron: tekst(j.attribution, 300) };
}

/** "16 min · 1.1 km": duur en afstand van een tocht, wat er van bekend is. */
export function tochtMaat(t: Pick<Tocht, 'durationMin' | 'distanceKm'>): string {
  const km = t.distanceKm == null ? null
    : `${(t.distanceKm < 10 ? Math.round(t.distanceKm * 10) / 10 : Math.round(t.distanceKm)).toLocaleString('en-AU')} km`;
  return [duurTekst(t.durationMin), km].filter(Boolean).join(' · ');
}

/** "From its berth, back at its berth", "Under way now", "Signal lost". */
export function tochtVerloop(t: Pick<Tocht, 'running' | 'from' | 'end' | 'departureSeen'>): string {
  if (t.running) return t.departureSeen ? 'Under way now' : 'Under way now, departure not seen';
  const van = t.from === 'berth' ? 'From its berth' : null;
  const eind = t.end === 'berth' ? (van ? 'and back' : 'Ended at its berth')
    : t.end === 'lost' ? (van ? 'then the signal was lost' : 'Signal lost')
      : t.end === 'stopped' ? (van ? 'stopped elsewhere' : 'Stopped away from its berth')
        : null;
  if (van && eind) return t.end === 'berth' ? `${van} ${eind}` : `${van}, ${eind}`;
  return van ?? eind ?? 'Ended';
}
