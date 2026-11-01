import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { pushBeschikbaarOp } from './pushRegels';

/**
 * Of de app push mag beloven en om meldingstoestemming mag vragen.
 *
 * Een Android-build zonder google-services.json heeft geen push: het ophalen
 * van het FCM-token gooit een fout. Toch vroeg de onboarding om toestemming
 * en beloofde hij meldingen, en Instellingen toonde "Receive alerts" (met
 * "Alerts are coming soon") en "Emergency Warnings anywhere", dat zelfs stil
 * aan kon gaan (controle 01-11-2026, vóór de Play-productieaanvraag).
 * Zonder push verbergen we dat allemaal en vragen we nooit om toestemming.
 * Zelfde opzet als kaartBeschikbaar.ts (extra.androidMapsConfigured).
 * iOS: altijd true, daar verandert niets.
 */
export function pushBeschikbaar(): boolean {
  return pushBeschikbaarOp(Platform.OS, Constants.expoConfig?.extra);
}

export const PUSH_BESCHIKBAAR = pushBeschikbaar();
