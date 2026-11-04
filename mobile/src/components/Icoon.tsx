/**
 * Icoon op Android (en wat tsc ziet voor './Icoon'): MaterialCommunityIcons
 * met de namen uit iconen.ts. Geen omhullende View, dus de opmaak blijft
 * precies zoals hij was. `gewicht` geldt alleen voor de SF Symbols op iOS.
 */
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ICONEN, type IcoonProps, type DienstIcoonProps } from '../iconen';

export function Icoon({ naam, grootte, kleur, style }: IcoonProps) {
  return (
    <MaterialCommunityIcons
      name={ICONEN[naam].android}
      size={grootte}
      color={kleur}
      style={[{ textAlign: 'center' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Dienst-icoon: op Android altijd het MDI-vakicoon. */
export function DienstIcoon({ dienst, grootte, kleur, style }: DienstIcoonProps) {
  return (
    <MaterialCommunityIcons
      name={dienst.icoon as never}
      size={grootte}
      color={kleur}
      style={[{ textAlign: 'center' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
