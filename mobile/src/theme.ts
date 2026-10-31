/**
 * Thema van 112 Meldingen, met een lichte en een donkere variant.
 *
 * De app was bewust licht: de grote Alarmeringen P2000-app is donker voor de
 * liefhebber die 's nachts meekijkt, deze is licht voor de buurtbewoner die
 * overdag even kijkt wat er aan de hand is. Maar wie 's avonds in bed nog even
 * kijkt wat die sirene was, kijkt tegen een witte lamp aan — vandaar de
 * donkere variant (wens Chris 24-08). Standaard volgt de app het systeem;
 * in Instellingen kun je hem vastzetten op licht of donker.
 *
 * Opzet blijft Apples eigen Instellingen-app: gegroepeerde kaarten op een
 * ondergrond, in het donker omgekeerd (zwarte grond, iets lichtere kaarten).
 */
import { AccessibilityInfo, Platform } from 'react-native';
import { PALET_LICHT, PALET_DONKER, type Palet } from './palet';

// De paletten zelf staan in palet.ts (zonder react-native, voor de tests);
// hier ongewijzigd doorgegeven zodat elke bestaande import blijft werken.
export { PALET_LICHT, PALET_DONKER };
export type { Palet };

export const isIOS = Platform.OS === 'ios';

/**
 * iOS 26 of nieuwer: Liquid Glass, en het gedrag van kopbalk en tabbalk dat
 * daarbij hoort. Platform.Version is op iOS een tekst als '26.0'.
 */
export const isIOS26 = isIOS && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Het lichte palet blijft de standaard-export, zodat modules die géén
 * component zijn (diensten.ts, vertaal.ts) hun disciplinekleuren gewoon op
 * moduleniveau kunnen ophalen. Schermen halen hun kleuren via useThema().
 */
export const C = PALET_LICHT;

export const F = {
  // Systeemfont: op iOS San Francisco, op Android Roboto. Geen eigen fonts,
  // dat scheelt megabytes en het font brengt zijn eigen optische maatvoering
  // en letterafstandtabellen mee.
  weightRegular: '400' as const,
  weightMedium: '500' as const,
  weightSemibold: '600' as const,
  weightBold: '700' as const,
};

/**
 * Typografie volgens Apples eigen regels: letterafstand is maatafhankelijk.
 * Grote tekst leest te ijl en wil negatieve tracking, kleine tekst wil juist
 * iets ruimte. Eén vaste letterSpacing is per definitie ergens verkeerd.
 * Regelhoogte gaat de andere kant op: strak bij koppen, ruimer bij lopende
 * tekst.
 */
export const T = {
  display: { fontSize: 32, fontWeight: F.weightBold, letterSpacing: -0.6, lineHeight: 38 },
  titel:   { fontSize: 26, fontWeight: F.weightBold, letterSpacing: -0.4, lineHeight: 32 },
  kop:     { fontSize: 17, fontWeight: F.weightSemibold, letterSpacing: -0.2, lineHeight: 22 },
  rij:     { fontSize: 16, fontWeight: F.weightSemibold, letterSpacing: -0.1, lineHeight: 21 },
  body:    { fontSize: 15, fontWeight: F.weightRegular, letterSpacing: 0, lineHeight: 21 },
  klein:   { fontSize: 13, fontWeight: F.weightRegular, letterSpacing: 0.1, lineHeight: 18 },
  // Kapitalen hebben altijd extra ruimte nodig, ongeacht de maat.
  sectie:  { fontSize: 13, fontWeight: F.weightSemibold, letterSpacing: 0.5, lineHeight: 18 },
};

/** Afgeronde kaart zoals in iOS-instellingen, in de kleur van het thema. */
export function kaartVoor(palet: Palet) {
  return {
    backgroundColor: palet.card,
    borderRadius: 12,
    overflow: 'hidden' as const,
  };
}

/** Lichte variant als losse constante — voor plekken zonder thema-context. */
export const kaartStijl = kaartVoor(PALET_LICHT);

/**
 * Schaduwen voor nieuwe code, als boxShadow-tekst (niet de oude shadow*- en
 * elevation-props). zwevend: kaartknoppen boven de kaart. fab: M3-niveau 3
 * voor de zwevende actieknop op Android.
 */
export const SCHADUW = {
  zwevend: '0px 2px 8px rgba(0, 0, 0, 0.16)',
  fab: '0px 1px 3px 0px rgba(0, 0, 0, 0.30), 0px 4px 8px 3px rgba(0, 0, 0, 0.15)',
} as const;

/**
 * Veerwaarden uit de Apple-ontwerprichtlijnen: standaard kritisch gedempt
 * (geen doorschot), en alleen veren wanneer de beweging zelf momentum had.
 * Doorschot bij een menu dat alleen verschijnt voelt verkeerd; bij iets dat
 * je hebt weggeduwd voelt het goed.
 */
export const VEER = {
  standaard: { damping: 26, stiffness: 320, mass: 0.9 },   // ~kritisch gedempt
  momentum:  { damping: 18, stiffness: 300, mass: 0.9 },   // lichte bounce
};

/**
 * Respecteert "verminder beweging" uit de systeeminstellingen. Dit is een
 * momentopname voor code buiten React; een component gebruikt
 * useMinderBeweging() uit thema.tsx, die opnieuw rendert bij een wissel.
 */
export let mindeBeweging = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((aan) => { mindeBeweging = !!aan; })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (aan) => { mindeBeweging = !!aan; });
