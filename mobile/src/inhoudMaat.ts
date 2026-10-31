/**
 * Inhoudsbreedte voor grote schermen: een tablet, een opengevouwen toestel
 * of een breed venster (gesplitst scherm, vrije vensters op Android).
 * Lijsten en instellingen rekken dan niet uit over de hele breedte, maar
 * staan in een kolom van hoogstens MAX_INHOUD in het midden (M3: inhoud
 * loopt op brede schermen niet van rand tot rand). Op een telefoon in
 * staande stand verandert er niets: daar is de kolom de volle breedte en
 * de marge de bekende 16.
 *
 * Reageert op de venstermaat, dus ook op vouwen, draaien en het schuiven
 * van de scheidslijn bij een gesplitst scherm.
 */
import { useWindowDimensions } from 'react-native';

/** Breedste kolom voor lijsten, instellingen en de detailpagina. */
export const MAX_INHOUD = 720;

/**
 * Breedste losse tekstblok, knop of melding: de tekst en de knop van het
 * startscherm en de betaalmuur, de zoomhint op de kaart.
 */
export const MAX_SMAL = 480;

/** Vanaf deze vensterbreedte de M3-marge voor middelgrote vensters. */
const BREED_VANAF = 600;

const KOLOM = { width: '100%', maxWidth: MAX_INHOUD, alignSelf: 'center' } as const;

export function useInhoudMaat() {
  const { width } = useWindowDimensions();
  // M3: 16 aan de zijkant op een smal venster, 24 vanaf 600 breed.
  return { marge: width >= BREED_VANAF ? 24 : 16, kolom: KOLOM };
}
