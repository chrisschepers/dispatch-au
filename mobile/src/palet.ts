/**
 * De kleurenpaletten, los van react-native. Zo kunnen de node-tests ze laden
 * (contrast nameten) zonder de app te starten; theme.ts exporteert ze
 * ongewijzigd door, dus alle bestaande imports blijven werken.
 */

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
  /** Accent als TEKST: haalt 4.5:1 op bg, kaart en accentSoft (accent zelf niet). */
  accentTekst: string;
  /** Android: M3-drukstaat en rimpel over een vlak dat je indrukt. */
  rimpel: string;
  /** iOS: rijmarkering zolang je drukt (systemGray4). */
  ingedrukt: string;
  /** Dicht zwevend vlak (kaartknoppen) waar geen glas of blur beschikbaar is. */
  zwevend: string;
  /** Android-schakelaar in de uit-stand: baan, rand en knop. */
  schakelBaan: string; schakelRand: string; schakelKnop: string;
  /** Neutrale vulling voor een kaartgroep met gemengde diensten. */
  groepVlak: string;
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
  accentTekst: '#c62d23',   // een tik donkerder: 5.5:1 op wit, 4.8:1 op accentSoft

  chipBg: '#eeeef2',
  /** Schaduw onder kaarten: in het licht subtiel, in het donker niets. */
  schaduw: 'rgba(0,0,0,0.06)',

  rimpel: 'rgba(28,28,30,0.10)',    // M3-statelaag: 10% van de tekstkleur
  ingedrukt: '#d1d1d6',             // systemGray4, zoals een ingedrukte iOS-rij
  zwevend: 'rgba(255,255,255,0.92)',
  schakelBaan: '#e4e4e9',           // gelijk aan de oude vaste waarden in
  schakelRand: '#b2b2ba',           // Schakelaar.tsx, dus licht verandert niet
  schakelKnop: '#8e8e96',
  groepVlak: '#3a3a3c',             // donkere bol, valt op tussen gekleurde pins
};

/**
 * Donker volgt de systeemkleuren van iOS: zwarte grond met iets lichtere
 * kaarten erop, precies andersom dan licht. Puur zwart (#000) is bewust: op
 * OLED-schermen scheelt dat stroom én het geeft de kaarten hun eigen vlak.
 * Dat OLED-zwart blijft iOS (systemBackground); Android legt hier
 * DONKER_ANDROID overheen (zie theme.ts).
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
  accentTekst: '#ff5247',   // het lichtere accent leest al: 5.3:1 op de kaart

  chipBg: '#2c2c2e',
  schaduw: 'transparent',

  rimpel: 'rgba(255,255,255,0.10)', // M3-statelaag: 10% wit op donker
  ingedrukt: '#3a3a3c',             // systemGray4 in het donker
  zwevend: 'rgba(28,28,30,0.92)',
  schakelBaan: '#36343b',           // M3-donker: surfaceContainerHighest
  schakelRand: '#938f99',           // M3-donker: outline
  schakelKnop: '#938f99',
  groepVlak: '#d1d1d6',             // lichte bol op de donkere kaart
};

/**
 * Donker op Android: Material 3 kent geen puur zwart. De grond is een heel
 * donker grijs en elk vlak dat erboven ligt een tint lichter, zodat kaarten
 * zich zonder schaduw van de grond losmaken. Dit zijn de neutrale M3-tonen
 * 6, 12, 17, 30, 90, 80 en 60. Accent, de disciplines en de overige tokens
 * blijven gelijk, en alles blijft hex: Schakelaar interpoleert ermee en
 * schermen plakken er `${kleur}14` achter. Daarom ook geen Material You.
 */
export const DONKER_ANDROID: Partial<Palet> = {
  bg: '#131313',            // N6: surface
  card: '#1f1f1f',          // N12: surfaceContainer
  chipBg: '#2a2a2a',        // N17: surfaceContainerHigh
  border: '#474747',        // N30: outlineVariant
  separator: '#474747',
  textPrimary: '#e2e2e2',   // N90: onSurface
  textSecondary: '#c6c6c6', // N80: onSurfaceVariant
  textMuted: '#919191',     // N60: outline
};
