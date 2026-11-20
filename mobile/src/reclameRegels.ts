/**
 * Where ads may go (20-11-2026, keuze Chris: the free version shows ads, and
 * those are there mainly to make Premium attractive; Premium has none).
 *
 * The rule behind both functions: whoever is in a fire area or a flood gets
 * no ad between or under their warnings.
 * - List: an ad after every ELKE incidents, but never directly next to a
 *   Watch and Act or an Emergency Warning. Is a spot taken, then the ad moves
 *   down until it is free.
 * - Detail: one ad at the bottom, not under a Watch and Act or Emergency
 *   Warning, and not when the incident opened from an alert: then someone
 *   tapped because something is happening near them.
 *
 * Free of react-native so the tests can run it (tests/reclame.test.mjs).
 */

/** An ad after this many incidents in the list. */
export const RECLAME_ELKE = 8;

/** niveauVan (kaartFilter.ts): 1 Advice, 2 Watch and Act, 3 Emergency Warning. */
export const GEVOELIG_VANAF = 2;

/** The incidents after which an ad comes, by key. */
export function reclameNa<T>(
  rijen: readonly T[],
  niveau: (r: T) => number,
  sleutel: (r: T) => string,
  elke: number = RECLAME_ELKE,
): Set<string> {
  const na = new Set<string>();
  let sinds = 0;
  for (let i = 0; i < rijen.length; i++) {
    sinds++;
    if (sinds < elke) continue;
    const volgende = rijen[i + 1];
    // Not as the very last thing in the list, and not next to a warning.
    if (volgende === undefined) break;
    if (niveau(rijen[i]) >= GEVOELIG_VANAF || niveau(volgende) >= GEVOELIG_VANAF) continue;
    na.add(sleutel(rijen[i]));
    sinds = 0;
  }
  return na;
}

/** An ad at the bottom of an incident? */
export function reclameOnderMelding(niveau: number, vanAlert: boolean): boolean {
  return !vanAlert && niveau < GEVOELIG_VANAF;
}
