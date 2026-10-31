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
  index?: number;
  routes: ReadonlyArray<{ name: string; state?: StaatSchets }>;
}

/** Het tabblad waarin Detail voor een push-tik moet openen. */
export function tabVoorMelding(staat: StaatSchets | null | undefined): DetailTab {
  const huidig = staat?.routes[staat.index ?? 0]?.name;
  return huidig === 'KaartTab' || huidig === 'ZoekTab' ? huidig : 'BuurtTab';
}
