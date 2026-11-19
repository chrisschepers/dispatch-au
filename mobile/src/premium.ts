/**
 * What is free and what is Premium (19-11-2026, keuze Chris).
 *
 * Until now the whole app sat behind the subscription after a three-day
 * trial, while every official emergency app in Australia is free. Now the
 * safety part is free: the list, the map with the warning areas and alerts
 * for official warnings at your own place. Premium is everything that makes
 * the app better than the official ones.
 *
 * Free of react-native so the tests can run it (tests/premium.test.mjs).
 */

/** Extra places next to your own; the backend keeps the same number (MAX_PLACES). */
export const MAX_EXTRA_PLEKKEN = 5;

export interface Plek { naam: string; lat: number; lon: number }

export type PremiumReden = 'intro' | 'incidenten' | 'plekken' | 'straal' | 'landelijk' | 'vliegtuigen' | 'geluid' | 'verlopen';

export interface PremiumFunctie {
  sleutel: Exclude<PremiumReden, 'intro' | 'verlopen'>;
  /** Naam in iconen.ts. */
  icoon: 'meldingen' | 'plaats' | 'blusvliegtuig' | 'perDienst' | 'noodwaarschuwing';
  titel: string;
  tekst: string;
}

/** The order is the order on the paywall: the strongest reason first. */
export const PREMIUM_FUNCTIES: PremiumFunctie[] = [
  {
    sleutel: 'incidenten', icoon: 'meldingen',
    titel: 'An alert for every incident',
    tekst: 'Fire trucks, crashes, storm damage and hazmat near you, minutes before it becomes an official warning.',
  },
  {
    sleutel: 'plekken', icoon: 'plaats',
    titel: `Watch ${MAX_EXTRA_PLEKKEN} extra places`,
    tekst: 'Home, the beach house, your parents, the farm. In any state, which the official apps cannot do.',
  },
  {
    sleutel: 'vliegtuigen', icoon: 'blusvliegtuig',
    titel: 'Follow the aircraft and rescue boats',
    tekst: 'See which water bombers work a fire, their flights of the past week, and get an alert when a large air tanker takes off.',
  },
  {
    sleutel: 'straal', icoon: 'perDienst',
    titel: 'Your own distance per service',
    tekst: 'Bushfires from 100 km, road crashes only within 10. Fewer alerts, and none you did not want.',
  },
  {
    sleutel: 'landelijk', icoon: 'noodwaarschuwing',
    titel: 'Emergency Warnings anywhere in Australia',
    tekst: 'Hear about the highest warning level wherever it is, also far from your own places.',
  },
];

/** The paywall list with the reason someone came for on top. */
export function functiesVoor(reden: PremiumReden | undefined): PremiumFunctie[] {
  const eerst = PREMIUM_FUNCTIES.find((f) => f.sleutel === reden);
  return eerst ? [eerst, ...PREMIUM_FUNCTIES.filter((f) => f !== eerst)] : PREMIUM_FUNCTIES;
}

export function titelVoor(reden: PremiumReden | undefined, heeftProef: boolean): string {
  if (reden === 'verlopen') return 'Your Premium has ended';
  const f = PREMIUM_FUNCTIES.find((x) => x.sleutel === reden);
  if (f) return `${f.titel} is part of Premium`;
  return heeftProef ? 'Try Premium free' : 'Get more with Premium';
}

/** The settings that count for alerts. */
export interface MeldingInstellingen {
  alleenGroot: boolean;
  straalPerDienst: Record<string, number>;
  gripAlarm: boolean;
  blusvliegtuigen: boolean;
  geluidPerDienst: Record<string, string>;
  extraPlekken: Plek[];
}

/**
 * What goes to the server. Without Premium: official warnings only, one
 * radius, no extra places. The settings themselves stay as they were on the
 * phone, so everything is back the moment someone subscribes (again).
 */
export function effectief<T extends MeldingInstellingen>(inst: T, premium: boolean): T {
  if (premium) return { ...inst, extraPlekken: geldigePlekken(inst.extraPlekken) };
  return {
    ...inst,
    alleenGroot: true,
    straalPerDienst: {},
    gripAlarm: false,
    blusvliegtuigen: false,
    geluidPerDienst: {},
    extraPlekken: [],
  };
}

export function geldigePlekken(plekken: unknown): Plek[] {
  if (!Array.isArray(plekken)) return [];
  return plekken
    .filter((p): p is Plek => !!p && typeof p.naam === 'string' && !!p.naam.trim()
      && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
    .map((p) => ({ naam: p.naam.trim().slice(0, 40), lat: p.lat, lon: p.lon }))
    .slice(0, MAX_EXTRA_PLEKKEN);
}

/** Add a place: no doubles (same name or within about 500 m), never more than the maximum. */
export function metPlek(plekken: Plek[], nieuw: Plek): Plek[] {
  const schoon = geldigePlekken(plekken);
  const [n] = geldigePlekken([nieuw]);
  if (!n) return schoon;
  const dubbel = schoon.some((p) => p.naam.toLowerCase() === n.naam.toLowerCase()
    || (Math.abs(p.lat - n.lat) < 0.005 && Math.abs(p.lon - n.lon) < 0.005));
  if (dubbel || schoon.length >= MAX_EXTRA_PLEKKEN) return schoon;
  return [...schoon, n];
}

/**
 * Premium while the store has not answered yet? Yes when it was active last
 * time: a paying user must not see locks flash at every start, and the alert
 * filter must not be cut back for a moment.
 */
export function isPremium(vereist: boolean, toegang: string, wasActief: boolean): boolean {
  if (!vereist) return true;
  if (toegang === 'actief') return true;
  return toegang === 'onbekend' && wasActief;
}
