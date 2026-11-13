/**
 * Eén tocht of vlucht in een blad (VaartuigScreen, VliegtuigScreen): wanneer,
 * hoe lang en hoe ver, met eronder hoe het afliep. Heeft hij een spoor, dan
 * is de rij een knop die dat spoor op het kaartje zet; de gekozen rij krijgt
 * een vinkje. Zonder spoor (of als het niet getoond mag worden) is het
 * gewoon tekst.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T, isIOS, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { Drukbaar } from './Drukbaar';
import { Icoon } from './Icoon';

export function RitRij({ titel, maat, sub, gekozen, scheiding, onPress, children }: {
  /** "Today 9:21 pm". */
  titel: string;
  /** "16 min · 1.1 km", rechts. */
  maat?: string | null;
  sub?: string | null;
  gekozen?: boolean;
  scheiding?: boolean;
  /** Alleen als er een spoor te tonen is. */
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const inhoud = (
    <>
      <View style={styles.vink}>
        {gekozen ? <Icoon naam="gekozen" grootte={18} kleur={C.accentTekst} gewicht="semibold" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.boven}>
          <Text style={styles.titel}>{titel}</Text>
          {maat ? <Text style={styles.maat}>{maat}</Text> : null}
        </View>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        {children}
      </View>
    </>
  );
  const stijl = [styles.rij, scheiding && styles.scheiding];
  if (!onPress) return <View style={stijl} accessible>{inhoud}</View>;
  return (
    <Drukbaar
      style={stijl}
      markeer
      onPress={onPress}
      geselecteerd={gekozen}
      label={[titel, maat, sub].filter(Boolean).join(', ')}
      hint="Shows the track on the map above"
    >
      {inhoud}
    </Drukbaar>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  rij: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, minHeight: isIOS ? 44 : 56, gap: 8 },
  scheiding: isIOS ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator } : {},
  vink: { width: 20, paddingTop: 2 },
  boven: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  titel: { ...T.body, color: C.textPrimary, flex: 1 },
  maat: { ...T.klein, color: C.textSecondary, fontVariant: ['tabular-nums'], textAlign: 'right' },
  sub: { ...T.klein, color: C.textSecondary, marginTop: 2 },
});
