import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Of er een kaart getekend mag worden.
 *
 * Google Maps op Android heeft een API-sleutel nodig. Zonder sleutel crasht
 * react-native-maps zodra er een kaart verschijnt ("API key not found").
 * Build 3 van de gesloten test (28-10) had er geen: elke tik op een melding
 * en het tabblad Map gooide testers uit de app (Rick, Wilbert).
 * app.config.ts zet extra.androidMapsConfigured alleen als de sleutel er is;
 * zonder sleutel tonen we geen kaart in plaats van te crashen. iOS gebruikt
 * Apple Maps en heeft geen sleutel nodig.
 */
export const KAART_BESCHIKBAAR =
  Platform.OS !== 'android' || Boolean(Constants.expoConfig?.extra?.androidMapsConfigured);
