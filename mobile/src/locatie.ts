/**
 * Locatiebepaling: één functie die de actuele plek geeft volgens het gekozen
 * model. Live volgen = bij elke aanroep een verse GPS-fix (alleen terwijl de
 * app open is, nooit op de achtergrond); handmatig = de vaste plek.
 * Valt de GPS weg, dan de laatst bekende plek zodat de lijst nooit leeg is.
 */
import * as Location from 'expo-location';
import type { Instellingen } from './instellingen';

export interface Plek { lat: number; lon: number; bron: 'live' | 'handmatig' | 'laatst-bekend' | 'geen'; }

let laatstBekend: { lat: number; lon: number } | null = null;

/** Hoe lang we hooguit op een verse GPS-fix wachten voor we iets tonen. */
const FIX_GEDULD_MS = 6000;

/**
 * Een plek zonder ergens op te wachten: de handmatige plaats, de laatste plek
 * uit deze sessie, of het punt dat het toestel zelf al in de cache heeft.
 * Levert null als er niets bekend is.
 *
 * Waarom: `bepaalPlek` vraagt een VERSE fix, en dat duurt binnenshuis of op een
 * eenvoudige telefoon zomaar seconden. Schermen die daarop wachten voelen traag
 * (melding Chris 18-08: de kaart bleef lang leeg). Eerst tonen wat we weten,
 * daarna bijstellen.
 */
export async function bepaalPlekSnel(inst: Instellingen): Promise<Plek | null> {
  if (!inst.volgLocatie && inst.handLat != null && inst.handLon != null) {
    return { lat: inst.handLat, lon: inst.handLon, bron: 'handmatig' };
  }
  if (laatstBekend) return { ...laatstBekend, bron: 'laatst-bekend' };
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      // Het toestel bewaart zelf een laatste positie; die komt meteen terug.
      const cache = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60_000 });
      if (cache) {
        laatstBekend = { lat: cache.coords.latitude, lon: cache.coords.longitude };
        return { ...laatstBekend, bron: 'laatst-bekend' };
      }
    }
  } catch { /* niets bekend: de aanroeper toont zolang iets anders */ }
  return null;
}

export async function bepaalPlek(inst: Instellingen): Promise<Plek> {
  if (!inst.volgLocatie && inst.handLat != null && inst.handLon != null) {
    return { lat: inst.handLat, lon: inst.handLon, bron: 'handmatig' };
  }
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      // Met geduldsgrens: een fix die maar niet komt (binnen, zwakke ontvanger)
      // mag het scherm niet gijzelen — dan liever de laatst bekende plek.
      const fix = await Promise.race([
        // Geen Google-dialoog "Location Accuracy" (Android): die kwam anders bij
        // élke verversing terug op toestellen waar die instelling uit staat
        // (emulatortest 27-09). Zonder is de fix iets grover; ruim genoeg
        // voor een straal in kilometers.
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), FIX_GEDULD_MS)),
      ]);
      if (fix) {
        laatstBekend = { lat: fix.coords.latitude, lon: fix.coords.longitude };
        return { ...laatstBekend, bron: 'live' };
      }
    }
  } catch { /* GPS-hapering → val door naar laatst bekend */ }
  if (laatstBekend) return { ...laatstBekend, bron: 'laatst-bekend' };
  const cache = await Location.getLastKnownPositionAsync({ maxAge: 60 * 60_000 }).catch(() => null);
  if (cache) {
    laatstBekend = { lat: cache.coords.latitude, lon: cache.coords.longitude };
    return { ...laatstBekend, bron: 'laatst-bekend' };
  }
  return { lat: -37.81, lon: 144.96, bron: 'geen' };  // Melbourne until we know better
}

export async function vraagLocatiePermissie(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}
