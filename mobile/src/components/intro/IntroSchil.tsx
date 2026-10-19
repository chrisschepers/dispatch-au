/**
 * Opmaak van het startscherm en de proefperiode (wens Chris 27-09, naar het
 * voorbeeld van Alarmeringen P2000): zwarte grond, bovenin een telefoon met
 * een voorbeeldscherm, daaronder een korte titel en uitleg, stippen voor de
 * voortgang en één grote rode knop.
 *
 * Altijd donker, los van het thema: zo springt het lichte telefoonscherm eruit
 * en voelt het als een welkom, niet als een instellingenscherm.
 *
 * Het toestel krijgt de ruimte die overblijft. Op een kleine iPhone wordt hij
 * dus kleiner, en de knop en de tekst blijven altijd volledig in beeld.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, ActivityIndicator, type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mindeBeweging } from '../../theme';
import { Drukbaar } from '../Drukbaar';
import { Toestel, toestelBreedte } from './Toestel';

export const INTRO = {
  grond: '#000000',
  tekst: '#ffffff',
  zacht: '#a1a1a6',
  knop: '#9b231c',
  knopRand: '#c8352c',
  stip: '#48484a',
};

interface Props {
  /** Voorbeeldscherm in het toestel. */
  scherm: React.ReactNode;
  /** Voorbeeldscherm heeft zelf een donkere grond (vergrendelscherm). */
  schermDonker?: boolean;
  titel: string;
  tekst?: React.ReactNode;
  /** Tussen tekst en stippen: meldingen als "betaling wordt verwerkt". */
  extra?: React.ReactNode;
  stap?: number;
  aantal?: number;
  knop: string;
  onKnop: () => void;
  bezig?: boolean;
  knopUit?: boolean;
  onTerug?: () => void;
  /** Onder de knop: herstellen, voorwaarden en dergelijke. */
  onder?: React.ReactNode;
  /** Wisselt per stap; laat het scherm zacht invloeien. */
  sleutel?: string | number;
}

export function IntroSchil({
  scherm, schermDonker, titel, tekst, extra, stap, aantal, knop, onKnop,
  bezig, knopUit, onTerug, onder, sleutel,
}: Props) {
  const [vak, setVak] = useState<{ b: number; h: number } | null>(null);
  const zicht = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (mindeBeweging) return;
    zicht.setValue(0);
    Animated.timing(zicht, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [sleutel, zicht]);

  function opMaat(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setVak((v) => (v && v.b === width && v.h === height ? v : { b: width, h: height }));
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Witte klok op de zwarte grond, ook als de app op licht staat. De
          laatst gemonteerde StatusBar wint, en dat is deze. */}
      <StatusBar style="light" />
      <View style={styles.kop}>
        {onTerug ? (
          <Drukbaar style={styles.terug} onPress={onTerug} label="Back" trillen={false} disabled={bezig}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={INTRO.tekst} />
          </Drukbaar>
        ) : null}
      </View>

      <Animated.View style={[styles.toestelVak, { opacity: zicht }]} onLayout={opMaat}>
        {vak ? (
          <Toestel breedte={toestelBreedte(vak.b, vak.h)} donker={schermDonker}>{scherm}</Toestel>
        ) : null}
      </Animated.View>

      <Animated.View style={[styles.tekstVak, { opacity: zicht }]}>
        <Text style={styles.titel} accessibilityRole="header">{titel}</Text>
        {typeof tekst === 'string' ? <Text style={styles.tekst}>{tekst}</Text> : tekst}
        {extra}
      </Animated.View>

      <View style={styles.voet}>
        {aantal != null && stap != null ? (
          <View style={styles.stippen} accessibilityLabel={`Step ${stap + 1} of ${aantal}`}>
            {Array.from({ length: aantal }, (_, i) => (
              <View key={i} style={[styles.stip, i === stap && styles.stipActief]} />
            ))}
          </View>
        ) : null}
        <Drukbaar style={[styles.knop, knopUit && styles.knopUit]} onPress={onKnop} disabled={bezig || knopUit} trillen>
          {bezig ? <ActivityIndicator color="#fff" /> : <Text style={styles.knopTekst}>{knop}</Text>}
        </Drukbaar>
        {onder}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INTRO.grond },
  kop: { height: 52, paddingHorizontal: 16, justifyContent: 'center' },
  terug: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e',
    alignItems: 'center', justifyContent: 'center',
  },
  toestelVak: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 160 },
  tekstVak: { paddingHorizontal: 26, paddingTop: 22 },
  titel: {
    fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5,
    color: INTRO.tekst, textAlign: 'center',
  },
  tekst: { fontSize: 16.5, lineHeight: 23, color: INTRO.zacht, textAlign: 'center', marginTop: 10 },
  voet: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 10, gap: 16 },
  stippen: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  stip: { width: 7, height: 7, borderRadius: 4, backgroundColor: INTRO.stip },
  stipActief: { width: 26, backgroundColor: INTRO.tekst },
  knop: {
    backgroundColor: INTRO.knop, borderRadius: 30, borderWidth: 1.5, borderColor: INTRO.knopRand,
    paddingVertical: 17, alignItems: 'center',
  },
  knopUit: { opacity: 0.5 },
  knopTekst: { fontSize: 18, fontWeight: '600', color: '#fff' },
});
