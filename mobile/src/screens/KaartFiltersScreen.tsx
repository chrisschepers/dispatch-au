/**
 * Het filterblad van de kaart (wens Chris 08-11-2026: "de kaart beetje
 * zelfde maken als wat we hebben op de grote app"). Periode, diensten en
 * waarschuwingsniveau, en een knop voor heel Australië in beeld, zoals het
 * filterpaneel van Alarmeringen P2000. Wat buiten het filter valt verdwijnt
 * van de kaart; dit filter staat los van de lijst Nearby en van je meldingen.
 *
 * Het blad zelf is een formSheet van het systeem (navigatie.tsx), zo hoog als
 * zijn inhoud.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StapelParams } from '../navigatie';
import { DIENSTEN, ALLE_DIENSTKEYS, wisselDienst } from '../diensten';
import {
  PERIODES, NIVEAUS, periodeLabel, periodeVoluit, niveauLabel, filterActief, standaardKeuze,
} from '../kaartFilter';
import { useKaartKeuze, zetKaartKeuze } from '../kaartKeuze';
import { T, F, isIOS, type Palet } from '../theme';
import { mengKleur } from '../kleur';
import { useThema, useStijlen } from '../thema';
import { BladGreep } from '../components/BladGreep';
import { Segment, BladKop } from '../components/Segment';
import { DienstChip } from '../components/DienstChip';
import { Drukbaar } from '../components/Drukbaar';
import { Icoon } from '../components/Icoon';

type Nav = NativeStackNavigationProp<StapelParams, 'KaartFilters'>;

export default function KaartFiltersScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const navigation = useNavigation<Nav>();
  const keuze = useKaartKeuze();
  const actief = filterActief(keuze, ALLE_DIENSTKEYS);

  function wis() {
    const s = standaardKeuze(ALLE_DIENSTKEYS);
    // Alleen het filter terug; de ondergrond en de lagen horen bij Kaartlagen.
    zetKaartKeuze({ periode: s.periode, diensten: s.diensten, niveau: s.niveau });
  }

  return (
    <View style={styles.root}>
      <BladGreep onPress={() => navigation.goBack()} />
      <View style={styles.kopRij}>
        <Text style={styles.titel} accessibilityRole="header">Filters</Text>
        {actief ? (
          <Drukbaar onPress={wis} schaal={0.96} style={styles.wisKnop} label="Reset filters">
            <Text style={styles.wisTekst}>Reset</Text>
          </Drukbaar>
        ) : null}
      </View>

      <BladKop>Period</BladKop>
      <Segment
        opties={PERIODES.map((p) => ({ waarde: p, label: periodeLabel(p), voluit: periodeVoluit(p) }))}
        waarde={keuze.periode}
        onKies={(periode) => zetKaartKeuze({ periode })}
      />
      <Text style={styles.voet}>
        Incidents that are still going always show. A longer period adds the ones that have ended.
      </Text>

      <BladKop>Services</BladKop>
      <View style={styles.chips}>
        {DIENSTEN.map((d) => (
          <DienstChip
            key={d.key}
            dienst={d}
            aan={keuze.diensten.includes(d.key)}
            onWissel={() => zetKaartKeuze({ diensten: wisselDienst(keuze.diensten, d.key) })}
          />
        ))}
      </View>

      <BladKop>Warning level</BladKop>
      <Segment
        opties={NIVEAUS.map((n) => ({
          waarde: n,
          label: niveauLabel(n),
          voluit: n === 'alle' ? 'All warning levels' : n === 'watch' ? 'Watch and Act or higher' : 'Emergency Warning only',
        }))}
        waarde={keuze.niveau}
        onKies={(niveau) => zetKaartKeuze({ niveau })}
      />

      <Drukbaar
        style={styles.actie}
        markeer
        onPress={() => navigation.popTo('Kaart', { overzicht: Date.now() }, { merge: true })}
      >
        <Icoon naam="kaart" grootte={20} kleur={C.accentTekst} />
        <Text style={styles.actieTekst}>Show all of Australia</Text>
      </Drukbaar>
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: isIOS ? 20 : 0, paddingBottom: 24 },
  kopRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  // iOS: vet zoals de titel van een blad in Kaarten; Android: M3 titleLarge.
  titel: isIOS
    ? { fontSize: 22, fontWeight: F.weightBold, letterSpacing: -0.3, lineHeight: 28, color: C.textPrimary }
    : { fontSize: 22, fontWeight: F.weightRegular, lineHeight: 28, color: C.textPrimary },
  wisKnop: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 22 },
  wisTekst: { ...T.body, color: C.accentTekst, fontWeight: F.weightSemibold },
  voet: { ...T.klein, color: C.textSecondary, marginTop: 8, marginHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actie: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, marginTop: 24, borderRadius: isIOS ? 12 : 24, borderCurve: 'continuous',
    backgroundColor: isIOS ? C.chipBg : 'transparent',
    // Android: een M3-outlined button, rand in outline.
    borderWidth: isIOS ? 0 : 1, borderColor: mengKleur(C.textPrimary, C.bg, 0.45),
  },
  actieTekst: { ...T.body, color: C.accentTekst, fontWeight: F.weightSemibold },
});
