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

/**
 * Kleuren die in BEIDE thema's gelijk blijven: de disciplines. Dat zijn
 * herkenningskleuren, geen decoratie — brandweerrood hoort brandweerrood te
 * blijven, ook 's nachts. Ze zijn verzadigd genoeg om op wit én op zwart te
 * lezen. Hierdoor kunnen diensten.ts en vertaal.ts hun kleuren gewoon op
 * moduleniveau blijven gebruiken.
 */
const VAST = {
  brandweer: '#e5372c',
  ambulance: '#f4a814',
  politie: '#2f6fde',
  knrm: '#0d9488',          // waterhulp: KNRM en reddingsbrigades
  mmt: '#7c4dbe',           // traumahelikopter, apart van de gele ambulance
  success: '#34c759',
  /** Neutrale stip voor een onbekende dienst; leesbaar op beide gronden. */
  dienstOnbekend: '#8e8e93',
} as const;

export interface Palet {
  donker: boolean;
  bg: string; card: string; border: string; separator: string;
  textPrimary: string; textSecondary: string; textMuted: string;
  accent: string; accentSoft: string; chipBg: string; schaduw: string;
  brandweer: string; ambulance: string; politie: string; knrm: string; mmt: string;
  success: string; dienstOnbekend: string;
}

export const PALET_LICHT: Palet = {
  ...VAST,
  donker: false,
  bg: '#f2f2f7',            // systeemgrijs van iOS-instellingen
  card: '#ffffff',
  border: '#e5e5ea',
  separator: '#e5e5ea',

  textPrimary: '#1c1c1e',
  textSecondary: '#6e6e73',
  textMuted: '#aeaeb2',

  accent: '#e5372c',        // zelfde rood-familie als het grote merk, iets warmer
  accentSoft: '#fdeceb',

  chipBg: '#eeeef2',
  /** Schaduw onder kaarten: in het licht subtiel, in het donker niets. */
  schaduw: 'rgba(0,0,0,0.06)',
};

/**
 * Donker volgt de systeemkleuren van iOS: zwarte grond met iets lichtere
 * kaarten erop, precies andersom dan licht. Puur zwart (#000) is bewust: op
 * OLED-schermen scheelt dat stroom én het geeft de kaarten hun eigen vlak.
 * Het accentrood is een tint lichter, want #e5372c is op zwart te donker om
 * als knopkleur te lezen.
 */
export const PALET_DONKER: Palet = {
  ...VAST,
  donker: true,
  bg: '#000000',
  card: '#1c1c1e',
  border: '#38383a',
  separator: '#38383a',

  textPrimary: '#ffffff',
  textSecondary: '#98989f',
  textMuted: '#6c6c70',

  accent: '#ff5247',
  accentSoft: '#3a1512',

  chipBg: '#2c2c2e',
  schaduw: 'transparent',
};

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
 * Veerwaarden uit de Apple-ontwerprichtlijnen: standaard kritisch gedempt
 * (geen doorschot), en alleen veren wanneer de beweging zelf momentum had.
 * Doorschot bij een menu dat alleen verschijnt voelt verkeerd; bij iets dat
 * je hebt weggeduwd voelt het goed.
 */
export const VEER = {
  standaard: { damping: 26, stiffness: 320, mass: 0.9 },   // ~kritisch gedempt
  momentum:  { damping: 18, stiffness: 300, mass: 0.9 },   // lichte bounce
};

/** Respecteert "verminder beweging" uit de systeeminstellingen. */
export let mindeBeweging = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((aan) => { mindeBeweging = !!aan; })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (aan) => { mindeBeweging = !!aan; });

export const isIOS = Platform.OS === 'ios';
