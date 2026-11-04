/**
 * De navigatiebalk van het systeem (de drie knoppen of het veegstreepje
 * onderin) kleuren we alleen op Android; zie Navigatiebalk.android.tsx. Op
 * iOS, en voor tsc, doet dit component niets.
 */

/**
 * `stijl` zoals bij expo-status-bar: 'light' geeft lichte knoppen (voor een
 * donkere grond), 'dark' donkere knoppen (voor een lichte grond).
 */
export function Navigatiebalk(_props: { stijl: 'light' | 'dark' }): null {
  return null;
}
