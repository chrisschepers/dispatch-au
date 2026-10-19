/**
 * Aanraakbaar element dat reageert zoals iOS dat doet, volgens de
 * Apple-ontwerprichtlijnen:
 *
 *  - Reactie op het INDRUKKEN, niet op het loslaten. Wachten tot iemand
 *    loslaat voelt dood; het moment dat de vinger het glas raakt moet er al
 *    iets gebeuren.
 *  - Beweging via een veer, niet via een vaste duur. Een veer start altijd
 *    vanaf de huidige waarde, dus je kunt hem halverwege onderbreken zonder
 *    zichtbare sprong.
 *  - Kritisch gedempt (geen doorschot): een knop die terugveert voelt
 *    speels waar het niet hoort. Doorschot bewaren we voor beweging die zelf
 *    momentum had.
 *  - Een tik geeft een korte trilling op het moment van indrukken, zodat het
 *    gevoel en het beeld op dezelfde frame vallen.
 *  - Bij "verminder beweging" vervalt het schalen; de tik blijft.
 */
import React, { useRef } from 'react';
import { Animated, Pressable, type ViewStyle, type StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';
import { VEER, mindeBeweging } from '../theme';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Uitgeschakeld: geen tik, geen veer, gedempt. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Hoe ver het element inzakt bij indrukken. 1 = niet. */
  schaal?: number;
  /** Trilling bij het indrukken (standaard aan voor echte acties). */
  trillen?: boolean;
  /** Wat een schermlezer voorleest. Zonder label leest hij de tekst in het
   *  element voor; zet dit bij rijen waar losse tekstjes samen pas een zin
   *  vormen, en bij knoppen die alleen een icoon tonen. */
  label?: string;
  /** Rol voor de schermlezer. Vrijwel alles hier is een knop. */
  rol?: 'button' | 'link' | 'tab' | 'none';
}

export function Drukbaar({ children, onPress, onLongPress, disabled, style, schaal = 0.98, trillen = true, label, rol = 'button' }: Props) {
  const s = useRef(new Animated.Value(1)).current;

  function naar(waarde: number) {
    if (mindeBeweging) return;
    Animated.spring(s, {
      toValue: waarde,
      useNativeDriver: true,
      ...VEER.standaard,
    }).start();
  }

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        naar(schaal);
        if (trillen) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }}
      onPressOut={() => naar(1)}
      onPress={onPress}
      onLongPress={onLongPress}
      // Ruime raakzone rond het element: tikken mag onnauwkeurig zijn.
      hitSlop={8}
      // Zonder rol is elke rij voor VoiceOver/TalkBack een naamloos ding:
      // de audit van 20-08 vond precies drie gelabelde elementen in de app.
      accessibilityRole={rol === 'none' ? undefined : rol}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Animated.View style={[style, { opacity: disabled ? 0.5 : 1, transform: [{ scale: s }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
