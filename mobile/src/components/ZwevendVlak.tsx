/**
 * Een vlak dat boven de kaart zweeft: de zoomhint en de knop 'My area'.
 * Drie gedaanten, elk volgens zijn eigen platform:
 *
 *  a. iOS 26 en nieuwer: Liquid Glass (GlassView). Het glas knipt zichzelf
 *     af op borderRadius; nooit overflow: 'hidden' of een geanimeerde
 *     dekking op het glas of een ouder, anders verdwijnt de rand of slaat
 *     UIKit het effect stil over.
 *  b. iOS daaronder: een blur in systemChromeMaterial, het materiaal van de
 *     kop- en tabbalken van het systeem, met een lichte schaduw eronder.
 *  c. Android, en iOS met "Verminder transparantie": een dicht vlak in de
 *     kaartkleur. Op Android is dat het M3-oppervlak; op iOS vraagt de
 *     gebruiker zelf om geen doorschijnend materiaal.
 *
 * expo-glass-effect laden we alleen als de native module in deze build zit:
 * isLiquidGlassAvailable() roept requireNativeModule aan en gooit in een
 * oudere binary een fout. Sommige bèta's van iOS 26 missen bovendien de
 * glas-API zelf (vandaar beide controles, zie expo/expo#40911).
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewProps } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { BlurView } from 'expo-blur';
import { SCHADUW, isIOS } from '../theme';
import { useThema } from '../thema';

type GlasModule = typeof import('expo-glass-effect');

let glas: GlasModule | null | undefined;

/** De module met glas, of null als dit toestel of deze build het niet kan. */
function glasModule(): GlasModule | null {
  if (glas !== undefined) return glas;
  glas = null;
  if (!isIOS) return glas;
  try {
    if (requireOptionalNativeModule('ExpoGlassEffect') == null) return glas;
    const m: GlasModule = require('expo-glass-effect');
    if (m.isLiquidGlassAvailable() && m.isGlassEffectAPIAvailable()) glas = m;
  } catch {
    glas = null;
  }
  return glas;
}

/** Kan dit toestel Liquid Glass tekenen? Eén keer bepaald, daarna onthouden. */
export function glasBeschikbaar(): boolean {
  return glasModule() != null;
}

/**
 * Momentopname van "Verminder transparantie", zoals mindeBeweging in
 * theme.ts: bij de start al opgehaald, zodat de kaart (een lui tabblad) niet
 * eerst glas toont en dan omslaat naar een dicht vlak.
 */
let minderDoorzichtig = false;
if (isIOS) {
  AccessibilityInfo.isReduceTransparencyEnabled?.()
    .then((aan) => { minderDoorzichtig = !!aan; })
    .catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (aan) => { minderDoorzichtig = !!aan; });
}

/**
 * "Verminder transparantie" (iOS) als haak: rendert opnieuw zodra je het in
 * de systeeminstellingen omzet. Android kent de instelling niet: altijd false.
 */
export function useMinderDoorzichtig(): boolean {
  const [aan, zetAan] = useState(isIOS && minderDoorzichtig);
  useEffect(() => {
    if (!isIOS) return;
    let actief = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((v) => { if (actief) zetAan(!!v); })
      .catch(() => {});
    const luisteraar = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v) => {
      if (actief) zetAan(!!v);
    });
    return () => {
      actief = false;
      luisteraar?.remove();
    };
  }, []);
  return aan;
}

/**
 * Tekent dit vlak nu als glas (gedaante a)? Knoppen erin geven dan zelf geen
 * drukreactie: interactief glas reageert al op de vinger.
 */
export function useGlas(): boolean {
  const minder = useMinderDoorzichtig();
  return glasBeschikbaar() && !minder;
}

export function ZwevendVlak({
  children, style, interactief = false, rond = 22, ...viewProps
}: ViewProps & {
  /** Glas dat op aanraking reageert; alleen voor knoppen, niet voor een hint. */
  interactief?: boolean;
  /** Hoekstraal; de hoek is op iOS de vloeiende (continuous) variant. */
  rond?: number;
}) {
  const C = useThema();
  const minder = useMinderDoorzichtig();
  const Glas = minder ? null : glasModule();
  const hoek = { borderRadius: rond, borderCurve: 'continuous' } as const;

  if (Glas) {
    return (
      <Glas.GlassView
        glassEffectStyle="regular"
        isInteractive={interactief}
        // Volgt het thema van de app, ook als dat afwijkt van de telefoon.
        colorScheme={C.donker ? 'dark' : 'light'}
        style={[hoek, style]}
        {...viewProps}
      >
        {children}
      </Glas.GlassView>
    );
  }

  if (isIOS && !minder) {
    // De schaduw op het buitenste vlak, de blur in een eigen laag die op de
    // hoeken afknipt. Zo valt de schaduw niet weg en geldt een padding uit
    // `style` alleen voor de inhoud, niet voor de blur.
    return (
      <View style={[hoek, { boxShadow: SCHADUW.zwevend }, style]} {...viewProps}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, hoek, { overflow: 'hidden' }]}>
          <BlurView
            tint={C.donker ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
            intensity={100}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {children}
      </View>
    );
  }

  return (
    <View
      style={[hoek, { backgroundColor: C.card, boxShadow: SCHADUW.zwevend }, style]}
      {...viewProps}
    >
      {children}
    </View>
  );
}
