/**
 * The services you can filter on, in one place. They map from the feed's
 * categories (api.ts): fire and planned burns → Fire, ambulance → Ambulance
 * (ACT only, the other states publish none), rescue → Rescue, storm/flood/SES
 * → Storm, hazmat → Hazmat, the rest → Other.
 */
import { C } from './theme';

export interface Dienst {
  key: string;
  /** Kort, voor de chips boven de lijst. */
  label: string;
  /** Voluit, voor de instellingen. */
  volleNaam: string;
  icoon: string;
  kleur: string;
}

export const DIENSTEN: Dienst[] = [
  { key: 'Fire', label: 'Fire', volleNaam: 'Fire and bushfire', icoon: 'fire-truck', kleur: C.brandweer },
  { key: 'Ambulance', label: 'Ambulance', volleNaam: 'Ambulance (ACT)', icoon: 'ambulance', kleur: C.ambulance },
  { key: 'Rescue', label: 'Rescue', volleNaam: 'Rescue and road crash', icoon: 'car-emergency', kleur: C.politie },
  { key: 'Storm', label: 'Storm & flood', volleNaam: 'Storm, flood and SES', icoon: 'weather-pouring', kleur: C.knrm },
  { key: 'Hazmat', label: 'Hazmat', volleNaam: 'Hazardous materials', icoon: 'biohazard', kleur: C.mmt },
  { key: 'Other', label: 'Other', volleNaam: 'Other incidents', icoon: 'alert-circle-outline', kleur: C.dienstOnbekend },
];

export const ALLE_DIENSTEN = DIENSTEN.length;

/**
 * How far back the list looks per service. A bushfire or flood from earlier
 * this week still matters to your area; a road crash or ambulance call from
 * days ago does not.
 */
export const TERUGBLIK_UREN: Record<string, number> = {
  Fire: 24 * 7,
  Storm: 24 * 7,
  Hazmat: 24 * 3,
  Rescue: 24,
  Ambulance: 24,
  Other: 24 * 3,
};

/** The map shows every service with its own, shorter window. */
export const KAART_TERUGBLIK_UREN: Record<string, number> = {
  Fire: 24 * 3,
  Storm: 24 * 3,
  Hazmat: 24,
  Rescue: 12,
  Ambulance: 6,
  Other: 24,
};

/** Alle diensten, voor de plekken die niet filteren (de kaart). */
export const ALLE_DIENSTKEYS = DIENSTEN.map((d) => d.key);

/** Largest radius the slider allows (bushfires travel far). */
export const MAX_STRAAL_KM = 100;

/** "Anywhere in Australia" as a radius. */
export const LANDELIJK_KM = 5000;

/** Services you can follow nationwide: rare enough not to flood you. */
export const LANDELIJK_MOGELIJK = new Set(['Hazmat']);

/** "12 km", or "Anywhere in Australia". */
export function straalTekst(km: number): string {
  return km >= LANDELIJK_KM ? 'Anywhere in Australia' : `${km} km`;
}

/** De straal die voor deze dienst geldt: eigen waarde, anders de algemene. */
export function straalVoor(dienst: string, basis: number, perDienst: Record<string, number>): number {
  const eigen = perDienst[dienst];
  return typeof eigen === 'number' && eigen > 0 ? eigen : basis;
}

/**
 * De gekozen diensten gebundeld, want in één verzoek past maar één tijdvenster
 * en één straal. Diensten met hetzelfde venster én dezelfde straal gaan samen,
 * dus in het eenvoudige geval (overal dezelfde straal) blijven het twee
 * verzoeken.
 */
export function vensters(
  gekozen: string[],
  basisStraal: number,
  perDienst: Record<string, number> = {},
  terugblik: Record<string, number> = TERUGBLIK_UREN,
): Array<{ diensten: string[]; uren: number; straalKm: number }> {
  const groepen = new Map<string, { diensten: string[]; uren: number; straalKm: number }>();
  for (const d of DIENSTEN) {
    if (!gekozen.includes(d.key)) continue;
    const uren = terugblik[d.key] ?? 24;
    const straalKm = straalVoor(d.key, basisStraal, perDienst);
    const sleutel = `${uren}|${straalKm}`;
    const bestaand = groepen.get(sleutel);
    if (bestaand) bestaand.diensten.push(d.key);
    else groepen.set(sleutel, { diensten: [d.key], uren, straalKm });
  }
  // Ruimste eerst: dan staat het zwaarste verzoek vooraan en zie je de trage
  // aanvulling niet als een lege lijst.
  return [...groepen.values()].sort((a, b) => b.uren - a.uren || b.straalKm - a.straalKm);
}

/** De dienstenlijst zoals de backend hem wil: leeg (= alles) of de selectie. */
export function dienstenParam(gekozen: string[]): string[] | undefined {
  return gekozen.length < ALLE_DIENSTEN ? gekozen : undefined;
}

/** Selectie bijwerken, in de vaste volgorde en nooit helemaal leeg. */
export function wisselDienst(gekozen: string[], key: string): string[] {
  const nu = new Set(gekozen);
  if (nu.has(key)) {
    if (nu.size === 1) return gekozen;   // minstens één dienst blijft aan
    nu.delete(key);
  } else nu.add(key);
  return DIENSTEN.map((d) => d.key).filter((k) => nu.has(k));
}
