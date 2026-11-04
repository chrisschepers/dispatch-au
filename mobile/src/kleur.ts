/**
 * Kleurrekenwerk zonder react-native, zodat de node-tests het kunnen laden.
 *
 * Alles volgt WCAG 2: relatieve luminantie per kanaal (sRGB terug naar
 * lineair licht), contrast als (licht + 0.05) / (donker + 0.05). Tekst wil
 * minstens 4.5:1, grote tekst en iconen 3:1.
 *
 * Kleuren komen binnen als '#rrggbb' of als 'rgb(r, g, b)' (de vorm die
 * mengKleur teruggeeft), zodat een gemengde ondergrond ook kan meedoen.
 */

type Rgb = [number, number, number];

function leesKleur(kleur: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(kleur.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(kleur.trim());
  if (rgb) {
    const kanalen = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] as Rgb;
    return kanalen.every((k) => k <= 255) ? kanalen : null;
  }
  return null;
}

function alsHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((k) => k.toString(16).padStart(2, '0')).join('');
}

/** WCAG-luminantie: 0 is zwart, 1 is wit. */
function luminantie([r, g, b]: Rgb): number {
  const lin = (k: number) => {
    const s = k / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function verhouding(a: Rgb, b: Rgb): number {
  const la = luminantie(a), lb = luminantie(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WIT: Rgb = [255, 255, 255];
const ZWART: Rgb = [0, 0, 0];
const INKT: Rgb = [28, 28, 30];  // textPrimary van het lichte thema (#1c1c1e)

/**
 * Contrastverhouding tussen twee kleuren, van 1 (gelijk) tot 21 (zwart op
 * wit). Een onleesbare kleur geeft 1: dan faalt elke toets, in plaats van
 * dat een tikfout stilletjes slaagt.
 */
export function contrast(a: string, b: string): number {
  const ka = leesKleur(a), kb = leesKleur(b);
  return ka && kb ? verhouding(ka, kb) : 1;
}

/**
 * Tekst- of iconkleur bovenop een gekleurd vlak: wit of bijna-zwart,
 * welke het meeste contrast geeft. Het amber van de ambulance krijgt dus
 * donkere tekst, het brandweerrood witte. Onleesbare invoer geeft wit.
 */
export function opKleur(hex: string): string {
  const k = leesKleur(hex);
  if (!k) return '#ffffff';
  return verhouding(k, INKT) > verhouding(k, WIT) ? '#1c1c1e' : '#ffffff';
}

/**
 * `kleur` voor een deel `aandeel` (0-1) over een dekkende `grond`, als één
 * dekkende kleur: 'rgb(r, g, b)'. Handig waar doorzichtigheid niet kan, zoals
 * de uitspaarrand in BrandendIcoon. Onleesbare invoer geeft `kleur` terug.
 */
export function mengKleur(kleur: string, grond: string, aandeel: number): string {
  const k = leesKleur(kleur), g = leesKleur(grond);
  if (!k || !g) return kleur;
  const meng = (i: number) => Math.round(g[i] + (k[i] - g[i]) * aandeel);
  return `rgb(${meng(0)}, ${meng(1)}, ${meng(2)})`;
}

/**
 * Maakt een dienstkleur leesbaar als TEKST op `grond`: in kleine stapjes
 * richting zwart (lichte grond) of wit (donkere grond), tot hij `doel`
 * haalt. De tint blijft herkenbaar; iconen, stippen en randen houden de
 * echte kleur. Geeft '#rrggbb'; onleesbare invoer komt ongewijzigd terug.
 */
export function leesbaar(kleur: string, grond: string, doel = 4.5): string {
  const k = leesKleur(kleur), g = leesKleur(grond);
  if (!k || !g) return kleur;
  const naar = verhouding(g, ZWART) >= verhouding(g, WIT) ? ZWART : WIT;
  for (let stap = 0; stap <= 100; stap++) {
    const deel = stap / 100;
    const kandidaat = k.map((c, i) => Math.round(c + (naar[i] - c) * deel)) as Rgb;
    if (verhouding(kandidaat, g) >= doel) return alsHex(kandidaat);
  }
  return alsHex(naar);
}
