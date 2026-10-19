/**
 * Het telefoontje op het startscherm (wens Chris 27-09, naar het voorbeeld van
 * Alarmeringen P2000): een toestel met een nagebouwd scherm van de app erin.
 *
 * De schermpjes worden getekend op een vaste "telefoonmaat" van 320×693 punten
 * en dan in hun geheel geschaald naar het frame. Zo zien ze er op een iPhone
 * SE en een Pro Max hetzelfde uit, en hoeft geen enkel schermpje zelf te
 * rekenen. Bewust nagebouwd in plaats van screenshots: scherp op elk toestel,
 * en ze lopen niet achter zodra de app verandert.
 */
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PALET_LICHT } from '../../theme';
import { VastThema } from '../../thema';

export const SCHERM_B = 320;
export const SCHERM_H = 693;
const RAND = 7;

/** Hoe breed mag het toestel zijn in een vak van b×h punten. */
export function toestelBreedte(b: number, h: number): number {
  const opHoogte = (h - 2 * RAND) * (SCHERM_B / SCHERM_H) + 2 * RAND;
  return Math.max(120, Math.min(b * 0.72, opHoogte, 340));
}

export function Toestel({ breedte, children, donker = false }: {
  breedte: number;
  children: React.ReactNode;
  /** Scherm met donkere achtergrond (vergrendelscherm): witte statusbalk. */
  donker?: boolean;
}) {
  const schaal = (breedte - 2 * RAND) / SCHERM_B;
  const hoogte = SCHERM_H * schaal + 2 * RAND;
  return (
    <View
      style={[styles.toestel, { width: breedte, height: hoogte, borderRadius: 48 * schaal + RAND }]}
      // Voor VoiceOver is dit een plaatje; de uitleg staat eronder.
      accessible
      accessibilityRole="image"
      accessibilityLabel="Preview of the app"
    >
      <View style={[styles.scherm, { borderRadius: 42 * schaal, backgroundColor: donker ? '#000' : PALET_LICHT.bg }]}>
        <View style={[styles.vast, { transform: [{ scale: schaal }] }]} pointerEvents="none">
          <VastThema palet={PALET_LICHT}>
            {children}
            <StatusBalk wit={donker} />
          </VastThema>
        </View>
      </View>
    </View>
  );
}

/** Tijd, eiland en de drie icoontjes rechts, zoals op elke iPhone. */
function StatusBalk({ wit }: { wit: boolean }) {
  const kleur = wit ? '#fff' : '#000';
  return (
    <View style={styles.statusBalk} pointerEvents="none">
      <Text style={[styles.klok, { color: kleur }]}>9:41</Text>
      <View style={styles.eiland} />
      <View style={styles.icoontjes}>
        <MaterialCommunityIcons name="signal-cellular-3" size={14} color={kleur} />
        <MaterialCommunityIcons name="wifi" size={14} color={kleur} />
        <MaterialCommunityIcons name="battery-high" size={17} color={kleur} style={{ transform: [{ rotate: '90deg' }] }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toestel: {
    padding: RAND - 2,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  scherm: { flex: 1, overflow: 'hidden' },
  vast: {
    width: SCHERM_B, height: SCHERM_H,
    transformOrigin: 'top left',
  },
  statusBalk: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 46,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 26, paddingTop: 6,
  },
  klok: { fontSize: 14, fontWeight: '600', width: 60 },
  eiland: {
    position: 'absolute', top: 11, left: SCHERM_B / 2 - 44,
    width: 88, height: 25, borderRadius: 13, backgroundColor: '#000',
  },
  icoontjes: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60, justifyContent: 'flex-end' },
});
