/**
 * Welk tabblad een push-tik opent. Los van react-native, zodat de tests het
 * zonder toestel kunnen nalopen (tests/navigatie.test.mjs).
 *
 * Elk tabblad heeft sinds de systeemtabbalk zijn eigen stapel. Detail zit in
 * Buurt, Kaart en Zoeken; Instellingen heeft er geen. Een tik op een melding
 * opent Detail in het tabblad waar je al bent, zodat je met 'terug' weer
 * uitkomt waar je was. Sta je in Instellingen (of weten we het nog niet),
 * dan gaat hij naar Buurt.
 */

/** Tabbladen met een Detail in hun stapel. */
export type DetailTab = 'BuurtTab' | 'KaartTab' | 'ZoekTab';

/** Het deel van een navigatiestaat dat we nodig hebben (ook een gedeeltelijke). */
export interface StaatSchets {
  key?: string;
  index?: number;
  routes: ReadonlyArray<{ name: string; state?: StaatSchets }>;
}

/** Waar een push-tik heen gaat, en wat daarvoor eerst dicht moet. */
export interface MeldingDoel {
  tab: DetailTab;
  /**
   * De key van de stapel van dat tabblad als daar een blad van de kaart
   * bovenop ligt (BLADEN), anders null. Dat blad moet eerst dicht: een
   * Detail die erbovenop komt, opent anders ín het halve blad.
   */
  sluitBladIn: string | null;
}

/** De bladen van de kaartstapel (navigatie.tsx): formSheets boven de kaart. */
export const BLADEN: ReadonlySet<string> = new Set(['Groep', 'KaartFilters', 'KaartLagen', 'Vliegtuig']);

/** Het tabblad waarin Detail voor een push-tik moet openen. */
export function tabVoorMelding(staat: StaatSchets | null | undefined): DetailTab {
  return doelVoorMelding(staat).tab;
}

/** Tabblad plus het groepsblad dat eerst dicht moet (zie MeldingDoel). */
export function doelVoorMelding(staat: StaatSchets | null | undefined): MeldingDoel {
  const route = staat?.routes[staat.index ?? 0];
  const huidig = route?.name;
  const tab: DetailTab = huidig === 'KaartTab' || huidig === 'ZoekTab' ? huidig : 'BuurtTab';
  // Een stapel heeft het bovenste scherm in focus; zonder index het laatste.
  const stapel = huidig === tab ? route?.state : undefined;
  const boven = stapel?.routes[stapel.index ?? stapel.routes.length - 1]?.name;
  return { tab, sluitBladIn: boven && BLADEN.has(boven) ? stapel?.key ?? null : null };
}
