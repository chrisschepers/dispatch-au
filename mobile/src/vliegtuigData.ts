/**
 * Overheidsvliegtuigen boven Australië (wens Chris 08-11-2026): de vorm van
 * /v1/aircraft (backend/aircraft.mjs) en wat de kaart ermee doet. Los van
 * react-native, zodat de tests het zonder toestel nalopen
 * (tests/vliegtuigen.test.mjs).
 *
 * De backend bepaalt welke toestellen er zijn: blusvliegtuigen en
 * blushelikopters alleen in de buurt van een actieve bush- of grasbrand (veel
 * van die toestellen sproeien ook gewassen), reddingshelikopters altijd.
 * Politie en de Flying Doctor komen erbij zodra de backend ze kent; de app
 * toont hun laag pas als ze in `roles` staan, zodat dat zonder nieuwe build kan.
 */

import { alsMoment, plekVan } from './spoor.ts';

export type VliegRol = 'bomber' | 'helitak' | 'transport' | 'scanner' | 'rescue' | 'police' | 'medical';
const ROLLEN: readonly VliegRol[] = ['bomber', 'helitak', 'transport', 'scanner', 'rescue', 'police', 'medical'];

/** De lagen in het blad Kaartlagen; elke rol hoort bij precies één laag. */
export type LuchtGroep = 'blussen' | 'redding' | 'politie' | 'rfds';

export const GROEP_VAN_ROL: Record<VliegRol, LuchtGroep> = {
  bomber: 'blussen',
  helitak: 'blussen',
  transport: 'blussen',
  scanner: 'blussen',
  rescue: 'redding',
  police: 'politie',
  medical: 'rfds',
};

export interface LuchtGroepInfo {
  key: LuchtGroep;
  label: string;
  sub: string;
  /** Kleur van het rondje op de kaart, zoals de heli's in de grote app. */
  kleur: string;
  /** MDI-icoon voor het tegeltje in het blad. */
  icoon: 'airplane' | 'helicopter' | 'police-badge' | 'medical-bag';
  /** Aan bij een nieuwe installatie. De Flying Doctor vliegt de hele dag: uit. */
  standaard: boolean;
}

export const LUCHT_GROEPEN: readonly LuchtGroepInfo[] = [
  {
    key: 'blussen', label: 'Firefighting aircraft',
    sub: 'Water bombers and fire helicopters near an active bushfire',
    kleur: '#E85A16', icoon: 'airplane', standaard: true,
  },
  {
    key: 'redding', label: 'Rescue helicopters',
    sub: 'Rescue and medical retrieval',
    kleur: '#F5B324', icoon: 'helicopter', standaard: true,
  },
  {
    key: 'politie', label: 'Police aircraft',
    sub: 'Police air wings',
    kleur: '#2E6BE6', icoon: 'police-badge', standaard: true,
  },
  {
    key: 'rfds', label: 'Royal Flying Doctor Service',
    sub: 'Many flights a day, so it starts switched off',
    kleur: '#8E4FD8', icoon: 'medical-bag', standaard: false,
  },
];

export const STANDAARD_LUCHT: Record<LuchtGroep, boolean> = Object.fromEntries(
  LUCHT_GROEPEN.map((g) => [g.key, g.standaard]),
) as Record<LuchtGroep, boolean>;

export interface Brandplek {
  id: string;
  title: string;
  location: string;
  distanceKm: number;
}

/**
 * Wat het toestel doet volgens de backend (flights.mjs). Voor reddings- en
 * medische toestellen alleen "op de basis" of "elders geland": nooit waar.
 */
export type VliegToestand = 'airborne' | 'at_base' | 'landed_elsewhere' | 'landed' | 'unknown';
const TOESTANDEN: readonly VliegToestand[] = ['airborne', 'at_base', 'landed_elsewhere', 'landed', 'unknown'];

/** De brand waar een blustoestel nu aan werkt. */
export interface Werkplek {
  id: string;
  title: string;
  location: string;
  since: string | null;
}

/** Wat een toestel ís, los van waar het nu vliegt; ook bekend uit een vlucht of bij een brand. */
export interface Toestel {
  hex: string;
  registration: string;
  callsign: string;
  role: VliegRol;
  rotor: boolean;
  /** De organisatie (politie, Flying Doctor, reddingsdienst); null bij NAFC-toestellen. */
  operator: string | null;
  /** NAFC-categorie, bijvoorbeeld "FW - Type 4 SEAT". */
  klasse: string | null;
  type: string | null;
  model: string | null;
  /** Large air tanker (NAFC "FW - Type 1"). */
  large: boolean;
}

export interface Vliegtuig extends Toestel {
  lat: number;
  lon: number;
  altFt: number | null;
  onGround: boolean;
  gsKts: number | null;
  track: number | null;
  flight: string | null;
  /** Moment van de laatste positie (ISO). */
  seenAt: string;
  nearFire: Brandplek | null;
  /** Null bij een oudere backend, of bij een toestel dat niet gevolgd wordt (politie). */
  state: VliegToestand | null;
  flightId: string | null;
  airborneSince: string | null;
  workingOn: Werkplek | null;
}

export interface LuchtBeeld {
  vliegtuigen: Vliegtuig[];
  bijgewerkt: string | null;
  bron: string;
  /** Rollen in de vloot van de backend; null bij een backend van voor `roles`. */
  rollen: VliegRol[] | null;
  /** Staat de laag aan, is hij gepauzeerd na een 429, en de laatste fout. */
  aan: boolean;
  pauzeTot: string | null;
  fout: string | null;
}

const tekst = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function brandplek(v: unknown): Brandplek | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const id = tekst(b.id, 200);
  if (!id) return null;
  return {
    id,
    title: tekst(b.title, 200) ?? 'Fire',
    location: tekst(b.location, 300) ?? '',
    distanceKm: getal(b.distanceKm) ?? 0,
  };
}

function werkplek(v: unknown): Werkplek | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const id = tekst(b.id, 200);
  if (!id) return null;
  return {
    id,
    title: tekst(b.title, 200) ?? 'Fire',
    location: tekst(b.location, 300) ?? '',
    since: alsMoment(b.since),
  };
}

/**
 * De vaste gegevens van een toestel, uit elke route die ze levert (/v1/aircraft,
 * de toestellen bij een brand, de vluchten). Null bij een onbekende rol of hex.
 */
export function parseToestel(v: unknown): Toestel | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  const hex = tekst(a.hex, 6)?.toLowerCase();
  const role = a.role as VliegRol;
  if (!hex || !/^[0-9a-f]{6}$/.test(hex) || !ROLLEN.includes(role)) return null;
  const registration = tekst(a.registration, 12) ?? '';
  return {
    hex,
    registration,
    // De roepnaam van NAFC ("Bomber 210"); de rest heet zoals hij uitzendt,
    // en anders naar zijn registratie.
    callsign: tekst(a.callsign, 40) ?? tekst(a.flight, 12) ?? tekst(a.name, 40) ?? (registration || hex.toUpperCase()),
    role,
    rotor: a.rotor === true,
    operator: tekst(a.operator, 80),
    klasse: tekst(a.class, 60),
    type: tekst(a.type, 10),
    model: tekst(a.model, 80),
    large: a.large === true,
  };
}

/** Een toestand die de app kent, anders null (een nieuwe waarde van de backend zegt dan niets). */
export function parseToestand(v: unknown): VliegToestand | null {
  return TOESTANDEN.includes(v as VliegToestand) ? (v as VliegToestand) : null;
}

/**
 * Het antwoord van /v1/aircraft, gecontroleerd. Een rij met een onbekende rol
 * of zonder geldige plek valt weg; de rest blijft staan.
 */
export function parseLuchtBeeld(json: unknown): LuchtBeeld {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rijen = Array.isArray(j.aircraft) ? j.aircraft.slice(0, 1000) : [];
  const vliegtuigen: Vliegtuig[] = [];
  for (const r of rijen) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    const toestel = parseToestel(a);
    // Een plek die als tekst binnenkomt wordt een getal (spoor.ts); wat geen
    // plek is valt weg, zodat de kaart nooit een ongeldige coördinaat krijgt.
    const plek = plekVan(a.lat, a.lon);
    const seenAt = alsMoment(a.seenAt);
    if (!toestel || !plek || !seenAt) continue;
    // Medische toestellen horen nooit bij een brand (de backend geeft ze ook niet).
    const blust = GROEP_VAN_ROL[toestel.role] === 'blussen';
    vliegtuigen.push({
      ...toestel,
      lat: plek.lat,
      lon: plek.lon,
      altFt: getal(a.altFt),
      onGround: a.onGround === true,
      gsKts: getal(a.gsKts),
      track: getal(a.track),
      flight: tekst(a.flight, 12),
      seenAt,
      nearFire: toestel.role === 'medical' ? null : brandplek(a.nearFire),
      state: parseToestand(a.state),
      flightId: tekst(a.flightId, 40),
      airborneSince: alsMoment(a.airborneSince),
      workingOn: blust ? werkplek(a.workingOn) : null,
    });
  }
  const status = (j.status && typeof j.status === 'object' ? j.status : {}) as Record<string, unknown>;
  const rollen = Array.isArray(j.roles)
    ? ROLLEN.filter((r) => (j.roles as unknown[]).includes(r))
    : null;
  return {
    vliegtuigen,
    bijgewerkt: tekst(j.updatedAt, 40),
    bron: tekst(j.attribution, 200) ?? 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.',
    rollen,
    aan: status.enabled !== false,
    pauzeTot: tekst(status.pausedUntil, 40),
    fout: tekst(status.error, 80),
  };
}

/**
 * De lagen die het blad Kaartlagen aanbiedt: alleen groepen waar de backend
 * toestellen voor heeft. Een backend zonder `roles` kent alleen bluswerk en
 * redding (de NAFC-lijst).
 */
export function beschikbareGroepen(rollen: readonly VliegRol[] | null): LuchtGroepInfo[] {
  const groepen = new Set<LuchtGroep>(
    (rollen ?? ['bomber', 'rescue']).map((r) => GROEP_VAN_ROL[r]),
  );
  return LUCHT_GROEPEN.filter((g) => groepen.has(g.key));
}

/** Minuten sinds de laatste positie. */
export function minutenStil(v: Pick<Vliegtuig, 'seenAt'>, nu = Date.now()): number {
  return Math.max(0, Math.floor((nu - Date.parse(v.seenAt)) / 60_000));
}

/**
 * Langer dan dit geen positie: "no signal". De backend vraagt elke 3 minuten
 * op, dus een positie van 4 minuten oud is gewoon de vorige ronde.
 */
export const STIL_NA_MIN = 8;

export function zonderSignaal(v: Pick<Vliegtuig, 'seenAt'>, nu = Date.now()): boolean {
  return minutenStil(v, nu) >= STIL_NA_MIN;
}

/** "Water bomber", "Rescue helicopter": wat voor toestel het is, in gewone taal. */
export function rolTekst(v: Pick<Vliegtuig, 'role' | 'rotor'>): string {
  switch (v.role) {
    case 'bomber': return v.rotor ? 'Firefighting helicopter' : 'Water bomber';
    case 'helitak': return 'Firefighting helicopter';
    case 'transport': return v.rotor ? 'Fire support helicopter' : 'Fire support aircraft';
    case 'scanner': return 'Fire mapping aircraft';
    case 'rescue': return v.rotor ? 'Rescue helicopter' : 'Rescue aircraft';
    case 'police': return v.rotor ? 'Police helicopter' : 'Police aircraft';
    case 'medical': return 'Royal Flying Doctor Service';
  }
}

/** De toestellen van de lagen die aan staan. */
export function inLagen(vliegtuigen: readonly Vliegtuig[], lagen: Record<LuchtGroep, boolean>): Vliegtuig[] {
  return vliegtuigen.filter((v) => lagen[GROEP_VAN_ROL[v.role]]);
}

/** "1,500 ft", "On the ground" of null. */
export function hoogteTekst(v: Pick<Vliegtuig, 'altFt' | 'onGround'>): string | null {
  if (v.onGround) return 'On the ground';
  if (v.altFt == null) return null;
  return `${Math.round(v.altFt).toLocaleString('en-AU')} ft`;
}

/** "120 kn · 222 km/h" of null. */
export function snelheidTekst(v: Pick<Vliegtuig, 'gsKts'>): string | null {
  if (v.gsKts == null) return null;
  return `${Math.round(v.gsKts)} kn · ${Math.round(v.gsKts * 1.852)} km/h`;
}
