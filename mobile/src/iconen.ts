/**
 * Eén bron voor de iconen van de app-chrome (knoppen, rijen, meldingen): per
 * naam een SF Symbol voor iOS en een MaterialCommunityIcons-naam voor Android.
 *
 * - iOS tekent SF Symbols, via expo-symbols, en alleen in Icoon.ios.tsx.
 * - Android houdt MaterialCommunityIcons met de namen van vandaag. Dat font
 *   laadt synchroon (geen leeg eerste beeld), werkt in de bitmaps van de
 *   kaartmarkers en scheelt het Material Symbols-font van 0,95 MB.
 * - De vakiconen (diensten.ts, vertaal.ts) en de kaartpins blijven bewust MDI
 *   op beide platforms: dat is een eigen, gedeelde set, geen chrome.
 * - Importeer expo-symbols nooit vanuit een bestand zonder .ios-achtervoegsel.
 *   Hieronder staat alleen een type-import; Babel haalt die weg, dus Android
 *   bundelt het pakket niet.
 *
 * Elke SF-naam bestaat in SF Symbols 4.0 of eerder (iOS 16, de app draait
 * vanaf 16.4); tests/iconen.test.mjs controleert dat, en ook dat elke
 * Android-naam in het MDI-font zit. Dus geen namen uit SF 5 of later, zoals
 * dot.scope, mappin.and.ellipse.circle.fill of flask.
 */
import type React from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type MciNaam = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const ICONEN = {
  buurt: { ios: 'mappin.and.ellipse', android: 'map-marker-radius' },
  kaart: { ios: 'map', android: 'map-outline' },
  zoeken: { ios: 'magnifyingglass', android: 'magnify' },
  wissen: { ios: 'xmark.circle.fill', android: 'close-circle' },
  delen: { ios: 'square.and.arrow.up', android: 'share-variant-outline' },
  waarschuwing: { ios: 'exclamationmark.triangle.fill', android: 'alert' },
  straatbeeld: { ios: 'binoculars.fill', android: 'binoculars' },
  route: { ios: 'arrow.triangle.turn.up.right.diamond.fill', android: 'navigation-variant' },
  chevron: { ios: 'chevron.right', android: 'chevron-right' },
  terug: { ios: 'chevron.left', android: 'arrow-left' },
  uitklappen: { ios: 'chevron.down', android: 'chevron-down' },
  inklappen: { ios: 'chevron.up', android: 'chevron-up' },
  bron: { ios: 'checkmark.shield.fill', android: 'shield-check-outline' },
  status: { ios: 'clock.arrow.circlepath', android: 'progress-check' },
  eenheden: { ios: 'person.2.fill', android: 'account-group-outline' },
  extern: { ios: 'arrow.up.right.square', android: 'open-in-new' },
  alarmering: { ios: 'bolt.fill', android: 'flash' },
  opschaling: { ios: 'arrow.up', android: 'arrow-up-bold' },
  afgerond: { ios: 'flag.checkered', android: 'flag-checkered' },
  mijnPlek: { ios: 'location.fill', android: 'crosshairs-gps' },
  meldingen: { ios: 'bell.badge.fill', android: 'bell-ring' },
  alleenWaarschuwingen: { ios: 'bolt.fill', android: 'lightning-bolt' },
  noodwaarschuwing: { ios: 'exclamationmark.octagon.fill', android: 'alert-octagon' },
  perDienst: { ios: 'slider.horizontal.3', android: 'tune-variant' },
  beoordelen: { ios: 'star.fill', android: 'star' },
  privacy: { ios: 'hand.raised.fill', android: 'shield-lock-outline' },
  voorwaarden: { ios: 'doc.text.fill', android: 'file-document-outline' },
  gekozen: { ios: 'checkmark', android: 'check' },
  ontwikkelaar: { ios: 'person.fill', android: 'account-outline' },
  email: { ios: 'envelope.fill', android: 'email-outline' },
  plaats: { ios: 'mappin', android: 'map-marker' },
  plaatsZoeken: { ios: 'magnifyingglass', android: 'map-marker-outline' },
  wacht: { ios: 'clock', android: 'clock-outline' },
  fout: { ios: 'exclamationmark.circle', android: 'alert-circle-outline' },
  ontgrendeld: { ios: 'lock.open.fill', android: 'lock-open-variant' },
  inbegrepen: { ios: 'checkmark.circle.fill', android: 'check-circle' },
  signaal: { ios: 'cellularbars', android: 'signal-cellular-3' },
  wifi: { ios: 'wifi', android: 'wifi' },
  batterij: { ios: 'battery.100', android: 'battery-high' },
  tabBuurt: { ios: 'mappin.circle', android: 'map-marker-radius-outline' },
  tabBuurtActief: { ios: 'mappin.circle.fill', android: 'map-marker-radius' },
  tabKaart: { ios: 'map', android: 'map-outline' },
  tabKaartActief: { ios: 'map.fill', android: 'map' },
  tabInstellingen: { ios: 'gearshape', android: 'cog-outline' },
  tabInstellingenActief: { ios: 'gearshape.fill', android: 'cog' },
} as const satisfies Record<string, { ios: SFSymbol; android: MciNaam }>;

export type IcoonNaam = keyof typeof ICONEN;

/** Gewicht van het SF Symbol; Android negeert het (MDI heeft één dikte). */
export type IcoonGewicht = 'regular' | 'medium' | 'semibold' | 'bold';

export interface IcoonProps {
  naam: IcoonNaam;
  grootte: number;
  kleur: ColorValue;
  gewicht?: IcoonGewicht;
  style?: StyleProp<ViewStyle>;
}

/**
 * Het icoon van een dienst (DIENSTEN in diensten.ts) in de app-chrome: de
 * tegeltjes in Instellingen en de chips op iOS. Op iOS het SF Symbol `sf` als
 * dat er is, anders (en altijd op Android) het MDI-vakicoon `icoon`.
 */
export interface DienstIcoonProps {
  dienst: { icoon: string; sf?: SFSymbol };
  grootte: number;
  kleur: ColorValue;
  gewicht?: IcoonGewicht;
  style?: StyleProp<ViewStyle>;
}
