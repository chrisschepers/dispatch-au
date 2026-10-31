/**
 * Icoon op iOS: een SF Symbol via expo-symbols, met de namen uit iconen.ts.
 * Dit is het enige bestand dat expo-symbols echt importeert.
 */
import React from 'react';
import { View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ICONEN, type IcoonGewicht, type IcoonProps, type DienstIcoonProps, type MciNaam,
} from '../iconen';

/**
 * Zit de native module in deze build? In een oudere binary zonder
 * expo-symbols tekent SymbolView een niet-bestaande native view: zijn
 * `fallback` springt alleen in als de viewmanager null is, en dat gebeurt nooit
 * (requireNativeViewManager in expo-modules-core geeft altijd een component).
 * Dan dus zelf terugvallen op de MDI-glyph.
 */
const SYMBOLEN = requireOptionalNativeModule('SymbolModule') != null;

/**
 * Een SF Symbol vult zijn vak, een MDI-glyph gebruikt ongeveer 20/24 ervan.
 * Daarom tekenen we het symbool op 5/6 in een ongewijzigd vak van `grootte`:
 * zo verspringt er niets in de opmaak.
 */
const OPTISCH = 5 / 6;

function Symbool({ sf, grootte, kleur, gewicht, style }: {
  sf: SFSymbol; grootte: number; kleur: IcoonProps['kleur']; gewicht: IcoonGewicht; style: IcoonProps['style'];
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: grootte, height: grootte, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <SymbolView name={sf} size={Math.round(grootte * OPTISCH)} tintColor={kleur} weight={gewicht} />
    </View>
  );
}

function Glyph({ naam, grootte, kleur, style }: {
  naam: MciNaam; grootte: number; kleur: IcoonProps['kleur']; style: IcoonProps['style'];
}) {
  return (
    <MaterialCommunityIcons
      name={naam}
      size={grootte}
      color={kleur}
      style={[{ textAlign: 'center' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function Icoon({ naam, grootte, kleur, gewicht = 'regular', style }: IcoonProps) {
  const icoon = ICONEN[naam];
  return SYMBOLEN
    ? <Symbool sf={icoon.ios} grootte={grootte} kleur={kleur} gewicht={gewicht} style={style} />
    : <Glyph naam={icoon.android} grootte={grootte} kleur={kleur} style={style} />;
}

/** Dienst-icoon: het SF Symbol van de dienst als die er een heeft, anders MDI. */
export function DienstIcoon({ dienst, grootte, kleur, gewicht = 'regular', style }: DienstIcoonProps) {
  return SYMBOLEN && dienst.sf
    ? <Symbool sf={dienst.sf} grootte={grootte} kleur={kleur} gewicht={gewicht} style={style} />
    : <Glyph naam={dienst.icoon as MciNaam} grootte={grootte} kleur={kleur} style={style} />;
}
