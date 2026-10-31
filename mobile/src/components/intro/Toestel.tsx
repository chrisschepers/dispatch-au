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
import { PALET_LICHT, isIOS } from '../../theme';
import { VastThema } from '../../thema';
import { Icoon } from '../Icoon';

export const SCHERM_B = 320;
export const SCHERM_H = 693;
const RAND = 7;

/**
 * Hoe breed mag het toestel zijn in een vak van b×h punten. Nooit hoger dan
 * het vak: de oude ondergrens van 120 breed maakte hem in een laag vak
 * hoger dan dat vak, en dan schoof hij over de titel. IntroSchil toont hem
 * pas vanaf een vak van 140 hoog.
 */
export function toestelBreedte(b: number, h: number): number {
  const opHoogte = (h - 2 * RAND) * (SCHERM_B / SCHERM_H) + 2 * RAND;
  return Math.min(b * 0.72, opHoogte, 340);
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

/**
 * De statusbalk van het platform. iOS: de tijd vet, het eiland in het midden
 * en rechts bereik, wifi en batterij, zoals op elke iPhone. Android: de tijd
 * in gewoon gewicht, een cameragaatje van 12 in het midden en rechts wifi,
 * bereik en batterij, zoals op een Pixel.
 */
function StatusBalk({ wit }: { wit: boolean }) {
  const kleur = wit ? '#fff' : '#000';
  const bereik = <Icoon naam="signaal" grootte={14} kleur={kleur} />;
  const wifi = <Icoon naam="wifi" grootte={14} kleur={kleur} />;
  return (
    <View style={[styles.statusBalk, !isIOS && styles.statusBalkAndroid]} pointerEvents="none">
      <Text style={[styles.klok, !isIOS && styles.klokAndroid, { color: kleur }]}>9:41</Text>
      <View style={isIOS ? styles.eiland : styles.gaatje} />
      <View style={styles.icoontjes}>
        {isIOS ? bereik : wifi}
        {isIOS ? wifi : bereik}
        {/* De MDI-batterij staat rechtop; SF battery.100 ligt al. */}
        <Icoon naam="batterij" grootte={17} kleur={kleur} style={isIOS ? undefined : { transform: [{ rotate: '90deg' }] }} />
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
  statusBalkAndroid: { paddingHorizontal: 22 },
  klok: { fontSize: 14, fontWeight: '600', width: 60 },
  klokAndroid: { fontWeight: '400' },
  eiland: {
    position: 'absolute', top: 11, left: SCHERM_B / 2 - 44,
    width: 88, height: 25, borderRadius: 13, backgroundColor: '#000',
  },
  // Op de hoogte van de klok: de balk is 46 hoog met 6 bovenin, dus het
  // midden ligt op 26.
  gaatje: {
    position: 'absolute', top: 20, left: SCHERM_B / 2 - 6,
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#000',
  },
  icoontjes: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60, justifyContent: 'flex-end' },
});
