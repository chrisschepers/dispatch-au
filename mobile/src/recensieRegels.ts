/**
 * Wanneer de app om een beoordeling of feedback vraagt (recensie.ts). Los van
 * react-native, zodat tests/recensie.test.mjs het kan draaien.
 *
 * 25-11 (Chris): de app is net gestart, dus eerder dan eerst (5× openen en 4
 * dagen): na de 3e keer openen en 2 dagen, en daarna hooguit eens per 4
 * maanden.
 */
export const MIN_KEREN = 3;
export const MIN_DAGEN = 2;
export const TUSSENPOOS_DAGEN = 120;
const DAG = 24 * 3600 * 1000;

export interface RecensieStand { keren: number; eerste: number; gevraagd: number | null }

export function magVragen(s: RecensieStand, nu: number): boolean {
  if (s.keren < MIN_KEREN) return false;
  if (nu - s.eerste < MIN_DAGEN * DAG) return false;
  if (s.gevraagd && nu - s.gevraagd < TUSSENPOOS_DAGEN * DAG) return false;
  return true;
}

/** De tekst van de vraag: Chris is net begonnen en wil graag horen wat beter kan. */
export const VRAAG = {
  titel: 'Hi, I’m Chris',
  tekst: 'I just started Emergencies Near Me and I build it on my own. A rating helps other people find the app, and your feedback is more than welcome: what is missing, what could be better, what you like.',
  beoordelen: 'Rate the app',
  feedback: 'Send feedback',
  later: 'Not now',
} as const;
