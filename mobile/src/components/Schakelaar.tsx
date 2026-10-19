/**
 * Schakelaar: op iOS de native Switch (die hoort daar en oogt goed), op
 * Android een eigen schuifje naar de Material 3-specificatie. De native
 * Android-Switch kleurt de knop mee met het systeemaccent van het toestel,
 * wat botste met onze rode baan (groene knop op rode baan, melding Chris
 * 17-08) en er per merk anders uitziet.
 *
 * M3-maten: baan 52x32 met ronde hoeken; uit een kleine knop (16) met een
 * omlijnde baan, aan een grote witte knop (24) op een gevulde baan. Samsung
 * One UI volgt dezelfde basis, dus dit oogt op elk Android-toestel vertrouwd.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Switch } from 'react-native';
import { type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

const BAAN_B = 52;
const BAAN_H = 32;
const KNOP_UIT = 16;
const KNOP_AAN = 24;

export function Schakelaar({ value, onValueChange, disabled }: Props) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,   // we animeren kleur en maat, dat kan niet native
    }).start();
  }, [value, anim]);

  if (Platform.OS !== 'android') {
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: C.accent }}
      />
    );
  }

  const knopMaat = anim.interpolate({ inputRange: [0, 1], outputRange: [KNOP_UIT, KNOP_AAN] });
  // Knop-linkerkant: uit gecentreerd in de baan, aan tegen de rechterrand.
  const knopLinks = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [(BAAN_H - KNOP_UIT) / 2, BAAN_B - KNOP_AAN - 4],
  });
  const baanKleur = anim.interpolate({ inputRange: [0, 1], outputRange: ['#e4e4e9', C.accent] });
  const randKleur = anim.interpolate({ inputRange: [0, 1], outputRange: ['#b2b2ba', C.accent] });
  const knopKleur = anim.interpolate({ inputRange: [0, 1], outputRange: ['#8e8e96', '#ffffff'] });

  return (
    <Pressable
      onPress={() => { if (!disabled) onValueChange(!value); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: disabled ?? false }}
      hitSlop={8}
      style={disabled && { opacity: 0.4 }}
    >
      <Animated.View style={[styles.baan, { backgroundColor: baanKleur, borderColor: randKleur }]}>
        <Animated.View
          style={[styles.knop, {
            width: knopMaat, height: knopMaat, borderRadius: 12,
            left: knopLinks, backgroundColor: knopKleur,
          }]}
        />
      </Animated.View>
    </Pressable>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  baan: {
    width: BAAN_B, height: BAAN_H, borderRadius: BAAN_H / 2,
    borderWidth: 2, justifyContent: 'center',
  },
  knop: { position: 'absolute', elevation: 1 },
});
