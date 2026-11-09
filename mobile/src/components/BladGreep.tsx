/**
 * M3-sleepgreep bovenin een blad op Android (32 × 4 dp, 22 dp van de
 * bovenrand). Ook een knop: TalkBack kan niet slepen, en zo is er een manier
 * om het blad te sluiten zonder gebaar. Het tikvlak is 48 × 48. iOS tekent
 * zijn eigen greep (sheetGrabberVisible), daar is dit niets.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { isIOS, type Palet } from '../theme';
import { useStijlen } from '../thema';

export function BladGreep({ onPress }: { onPress: () => void }) {
  const styles = useStijlen(maak_styles);
  if (isIOS) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      style={styles.greepVak}
    >
      <View style={styles.greep} />
    </Pressable>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  greepVak: { alignSelf: 'center', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  greep: { width: 32, height: 4, borderRadius: 2, backgroundColor: C.textSecondary, opacity: 0.4 },
});
