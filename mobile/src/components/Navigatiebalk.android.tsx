/**
 * De navigatiebalk van Android in de kleur van de app, niet van de telefoon.
 * Anders staan er lichte knoppen op de lichte tabbalk zodra de app op licht
 * staat en de telefoon op donker (of andersom).
 *
 * Dit is het enige bestand dat expo-navigation-bar laadt, en alleen als de
 * native module in deze build zit: in een oudere binary gooit de module al
 * bij het laden een fout (requireNativeModule), en dan doen we liever niets.
 *
 * Zonder `enforceContrast: false` (app.config.ts) legt Android bij drie
 * knoppen zijn eigen waas over de balk; de kleur van de knoppen volgt dan
 * nog steeds deze stijl.
 *
 * Er mogen meerdere balken tegelijk bestaan: de laatst gemonteerde wint, net
 * als bij StatusBar. Zo zet het startscherm witte knoppen op zijn zwarte grond.
 */
import React from 'react';
import { requireOptionalNativeModule } from 'expo';

const NavigationBar: typeof import('expo-navigation-bar').NavigationBar | null =
  requireOptionalNativeModule('ExpoNavigationBar') != null
    ? require('expo-navigation-bar').NavigationBar
    : null;

/**
 * `stijl` zoals bij expo-status-bar: 'light' geeft lichte knoppen (voor een
 * donkere grond), 'dark' donkere knoppen (voor een lichte grond).
 */
export function Navigatiebalk({ stijl }: { stijl: 'light' | 'dark' }) {
  return NavigationBar ? <NavigationBar style={stijl} /> : null;
}
