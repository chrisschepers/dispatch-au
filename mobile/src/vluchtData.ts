/**
 * Vluchten van een toestel en de toestellen bij een brand (13-11-2026): de
 * vorm van /v1/aircraft/{hex}/flights en /v1/incidents/{id}/aircraft
 * (backend/flights.mjs) en wat de app erover zegt. Los van react-native,
 * zodat de tests het zonder toestel nalopen (tests/vluchten.test.mjs).
 *
 * Reddings- en medische toestellen: nooit waar ze landden. De backend geeft
 * alleen "op de basis" of "elders", en na de landing een leeg spoor
 * (`trackHidden`). De app laat het daar niet van afhangen: van zo'n toestel
 * bewaart parseVluchten alleen het spoor van de vlucht die nog loopt, wat er
 * ook binnenkomt.
 */
import {
  alsMoment, parseSpoor, duurTekst, minutenTussen, klok, type SpoorPunt,
} from './spoor.ts';
import {
  GROEP_VAN_ROL, parseToestel, parseToestand, type Toestel, type VliegRol, type VliegToestand,
} from './vliegtuigData.ts';

const tekst = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/** Mag van deze rol ooit iets over de landingsplek of het spoor na de landing in beeld? */
export function landingGeheim(role: VliegRol): boolean {
  return role === 'rescue' || role === 'medical' || role === 'police';
}

/** "Large air tanker", "Water bomber", ...: zie rolTekst; een groot blusvliegtuig heet zo. */
export function grootLabel(t: Pick<Toestel, 'large' | 'role'>): string | null {
  return t.large && GROEP_VAN_ROL[t.role] === 'blussen' ? 'Large air tanker' : null;
}

// ── Toestellen bij een brand ────────────────────────────────────────────────

export interface BrandToestel {
  toestel: Toestel;
  /** Naam of registratie, zoals de backend hem noemt ("Bomber 210"). */
  naam: string;
  flightId: string | null;
  since: string | null;
  lastNear: string | null;
  /** In het laatste half uur bij de brand gezien en nog in de lucht. */
  working: boolean;
  spoor: SpoorPunt[];
}

/**
 * Het antwoord van /v1/incidents/{id}/aircraft. Alleen blustoestellen: een
 * rij met een andere rol hoort hier niet en valt weg, zodat een reddings- of
 * politietoestel nooit via een brand in beeld komt.
 */
export function parseBrandToestellen(json: unknown): { toestellen: BrandToestel[]; bron: string | null } {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rijen = Array.isArray(j.aircraft) ? j.aircraft.slice(0, 100) : [];
  const toestellen: BrandToestel[] = [];
  const gezien = new Set<string>();
  for (const r of rijen) {
    const toestel = parseToestel(r);
    if (!toestel || gezien.has(toestel.hex) || GROEP_VAN_ROL[toestel.role] !== 'blussen') continue;
    gezien.add(toestel.hex);
    const a = r as Record<string, unknown>;
    toestellen.push({
      toestel,
      naam: tekst(a.name, 40) ?? toestel.callsign,
      flightId: tekst(a.flightId, 40),
      since: alsMoment(a.since),
      lastNear: alsMoment(a.lastNear),
      working: a.working === true,
      spoor: parseSpoor(a.track, 't-lat-lon'),
    });
  }
  // Wie nu werkt bovenaan, daarna wie er het laatst was.
  toestellen.sort((x, y) => Number(y.working) - Number(x.working)
    || (Date.parse(y.lastNear ?? '') || 0) - (Date.parse(x.lastNear ?? '') || 0));
  return { toestellen, bron: tekst(j.attribution, 300) };
}

/** "Working now" of "Was here until 3:42 pm". */
export function brandToestelStand(b: Pick<BrandToestel, 'working' | 'lastNear'>): string {
  if (b.working) return 'Working now';
  return b.lastNear ? `Was here until ${klok(b.lastNear)}` : 'Was here earlier';
}

// ── Vluchten van één toestel ────────────────────────────────────────────────

export interface VluchtBrand {
  id: string;
  title: string;
  location: string;
  working: boolean;
}

export interface Vlucht {
  id: string;
  state: 'airborne' | 'landed' | 'lost';
  startedAt: string;
  /** False: het toestel kwam vliegend in beeld, de start zelf zagen we niet. */
  takeoffSeen: boolean;
  endedAt: string | null;
  lastSeenAt: string | null;
  /** Leeg als er niets te tonen is, of als het niet getoond mag worden. */
  spoor: SpoorPunt[];
  /** Alleen blustoestellen: de branden waar hij aan werkte. */
  branden: VluchtBrand[];
  /** Alleen reddings- en medische toestellen: terug op de basis of elders. Nooit een plek. */
  landing: 'base' | 'elsewhere' | null;
}

export interface Vluchten {
  toestel: Toestel;
  state: VliegToestand | null;
  vluchten: Vlucht[];
  bron: string | null;
}

/** Het antwoord van /v1/aircraft/{hex}/flights, nieuwste vlucht eerst. Null als het toestel ontbreekt. */
export function parseVluchten(json: unknown): Vluchten | null {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const toestel = parseToestel(j.aircraft);
  if (!toestel) return null;
  const geheim = landingGeheim(toestel.role);
  const blust = GROEP_VAN_ROL[toestel.role] === 'blussen';
  const rijen = Array.isArray(j.flights) ? j.flights.slice(0, 200) : [];
  const vluchten: Vlucht[] = [];
  for (const r of rijen) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    const id = tekst(a.id, 40);
    const startedAt = alsMoment(a.startedAt);
    const state = a.state === 'airborne' || a.state === 'landed' || a.state === 'lost' ? a.state : null;
    if (!id || !startedAt || !state) continue;
    // Reddings- en medische vluchten: alleen het spoor van de vlucht die nog
    // loopt. Zodra hij geland of uit beeld is, eindigt het spoor waar hij
    // neerkwam, en dat tonen we nooit, ook niet als de backend het meestuurt.
    const verborgen = a.trackHidden === true || (geheim && state !== 'airborne');
    const branden: VluchtBrand[] = [];
    if (blust && Array.isArray(a.fires)) {
      for (const f of a.fires.slice(0, 20)) {
        if (!f || typeof f !== 'object') continue;
        const b = f as Record<string, unknown>;
        const brandId = tekst(b.id, 200);
        if (!brandId) continue;
        branden.push({
          id: brandId,
          title: tekst(b.title, 200) ?? 'Fire',
          location: tekst(b.location, 300) ?? '',
          working: b.working === true,
        });
      }
    }
    vluchten.push({
      id,
      state,
      startedAt,
      takeoffSeen: a.takeoffSeen !== false,
      endedAt: alsMoment(a.endedAt),
      lastSeenAt: alsMoment(a.lastSeenAt),
      spoor: verborgen ? [] : parseSpoor(a.track, 't-lat-lon'),
      branden,
      landing: geheim && (a.landing === 'base' || a.landing === 'elsewhere') ? a.landing : null,
    });
  }
  return { toestel, state: parseToestand(j.state), vluchten, bron: tekst(j.attribution, 300) };
}

/**
 * Wat het toestel nu doet, in gewone woorden. Nooit een plaats: "At base" of
 * "Landed away from base" is alles wat er over een landing gezegd wordt.
 * Null als er niets zinnigs te zeggen is (onbekend, of een oudere backend).
 */
export function toestandTekst(
  state: VliegToestand | null,
  sinds: string | null,
  startGezien: boolean | null = null,
): string | null {
  switch (state) {
    case 'airborne':
      if (!sinds) return 'Airborne';
      return startGezien === false ? `Airborne, in view since ${klok(sinds)}` : `Airborne since ${klok(sinds)}`;
    case 'at_base': return 'At base';
    case 'landed_elsewhere': return 'Landed away from base';
    case 'landed': return 'On the ground';
    default: return null;
  }
}

/** "42 min": hoe lang de vlucht duurde, of tot nu toe duurt. */
export function vluchtDuur(v: Pick<Vlucht, 'startedAt' | 'endedAt' | 'lastSeenAt' | 'state'>, nu = Date.now()): string | null {
  const tot = v.state === 'airborne' ? new Date(nu).toISOString() : (v.endedAt ?? v.lastSeenAt);
  return duurTekst(minutenTussen(v.startedAt, tot));
}

/**
 * De regel onder een vlucht: "In the air now", "Returned to base", "Landed
 * away from base", "Signal lost" of "Landed". Bij een blustoestel staan de
 * branden er los onder.
 */
export function vluchtAfloop(v: Pick<Vlucht, 'state' | 'landing' | 'takeoffSeen'>): string {
  if (v.state === 'airborne') return v.takeoffSeen ? 'In the air now' : 'In the air now, take-off not seen';
  if (v.state === 'lost') return 'Signal lost';
  if (v.landing === 'base') return 'Returned to base';
  if (v.landing === 'elsewhere') return 'Landed away from base';
  return 'Landed';
}

/** Heeft deze vlucht een spoor dat op de kaart kan? Twee punten is het minste voor een lijn. */
export function heeftSpoor(v: Pick<Vlucht, 'spoor'>): boolean {
  return v.spoor.length >= 2;
}
