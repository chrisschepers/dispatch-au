/**
 * Kaartlagen (wens Chris 08-11-2026), zoals in de grote app: de ondergrond
 * (Standard of Satellite) en per groep overheidsvliegtuigen een schakelaar.
 * Alleen de groepen die de backend kent (vliegtuigData.ts); met de
 * bronvermelding eronder, want de posities vallen onder ODbL en die eist
 * naamsvermelding zolang je ze toont.
 *
 * Sinds 13-11 ook "On the water": per soort vaartuig die de backend nu heeft
 * een schakelaar (vaartuigData.ts), met de bronvermelding van de AIS-gegevens.
 * Geeft de backend geen vaartuigen (oudere versie, of de route faalt), dan
 * staat het kopje er niet. Het blad schuift, want met beide groepen past het
 * niet meer op elk scherm.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StapelParams } from '../navigatie';
import { useKaartKeuze, zetKaartKeuze } from '../kaartKeuze';
import { useLuchtBeeld } from '../vliegtuigen';
import { beschikbareGroepen, GROEP_VAN_ROL, type LuchtGroep } from '../vliegtuigData';
import { useVaartBeeld } from '../vaartuigen';
import { beschikbareWaterLagen, type VaartSoort } from '../vaartuigData';
import type { MciNaam } from '../iconen';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { BladGreep } from '../components/BladGreep';
import { Segment, BladKop } from '../components/Segment';
import { Schakelaar } from '../components/Schakelaar';
import { Drukbaar } from '../components/Drukbaar';
import { tikSchakel } from '../trilling';

type Nav = NativeStackNavigationProp<StapelParams, 'KaartLagen'>;

export default function KaartLagenScreen() {
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const navigation = useNavigation<Nav>();
  const keuze = useKaartKeuze();
  // Ook hier ophalen: het aantal per laag, en welke lagen er zijn.
  const beeld = useLuchtBeeld(true);
  const groepen = beschikbareGroepen(beeld?.rollen ?? null);
  const aantal = (g: LuchtGroep) => beeld?.vliegtuigen.filter((v) => GROEP_VAN_ROL[v.role] === g).length ?? null;
  const iets = groepen.some((g) => keuze.lucht[g.key]);
  // Vaartuigen: ook hier ophalen, voor de lagen die er zijn en het aantal per laag.
  const water = useVaartBeeld(true);
  const waterLagen = beschikbareWaterLagen(water);
  const aantalWater = (s: VaartSoort) => water?.vaartuigen.filter((v) => v.soort === s).length ?? null;
  const ietsWater = waterLagen.some((l) => keuze.water[l.key]);
  const waterMelding = !water || waterLagen.length === 0 ? null
    : !water.aan ? 'Vessel positions are not available at the moment.'
      : water.pauzeTot ? `Vessel positions are paused until ${new Date(water.pauzeTot).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}.`
        : null;

  // Eerlijk als de posities er even niet zijn: gepauzeerd na een limiet, of
  // geen sleutel op de server.
  const melding = !beeld ? null
    : !beeld.aan ? 'Aircraft positions are not available at the moment.'
      : beeld.pauzeTot ? `Aircraft positions are paused until ${new Date(beeld.pauzeTot).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}, to stay within the data limit.`
        : null;

  const inhoud = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.root}
      // Android: de lijst geeft het slepen door aan het blad.
      nestedScrollEnabled
    >
      <Text style={styles.titel} accessibilityRole="header">Map layers</Text>

      <BladKop>Map</BladKop>
      <Segment
        opties={[
          { waarde: 'standard', label: 'Standard', icoon: 'map-outline' },
          { waarde: 'hybrid', label: 'Satellite', icoon: 'satellite-variant' },
        ] as const}
        waarde={keuze.kaartType}
        onKies={(kaartType) => zetKaartKeuze({ kaartType })}
      />

      <BladKop>In the air</BladKop>
      <View style={kaartStijl}>
        {groepen.map((g, i) => (
          <LaagRij
            key={g.key}
            groep={g}
            telling={aantal(g.key)}
            aan={keuze.lucht[g.key]}
            scheiding={i > 0}
            onWissel={(v) => zetKaartKeuze({ lucht: { ...keuze.lucht, [g.key]: v } })}
          />
        ))}
      </View>
      {melding ? <Text style={styles.waarschuwing}>{melding}</Text> : null}
      <Text style={styles.voet}>
        {iets && beeld ? `${beeld.bron} Updated every few minutes; aircraft can switch off their transponder.` : 'Positions update every few minutes.'}
      </Text>

      {waterLagen.length > 0 ? (
        <>
          <BladKop>On the water</BladKop>
          <View style={kaartStijl}>
            {waterLagen.map((l, i) => (
              <LaagRij
                key={l.key}
                groep={l}
                telling={aantalWater(l.key)}
                aan={keuze.water[l.key]}
                scheiding={i > 0}
                onWissel={(v) => zetKaartKeuze({ water: { ...keuze.water, [l.key]: v } })}
              />
            ))}
          </View>
          {waterMelding ? <Text style={styles.waarschuwing}>{waterMelding}</Text> : null}
          <Text style={styles.voet}>
            {ietsWater && water?.bron ? `${water.bron} ` : ''}Vessels that send AIS; a boat can switch it off, and a
            boat at its berth often has.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );

  if (isIOS) return inhoud;
  return (
    <View style={{ flex: 1 }}>
      <BladGreep onPress={() => navigation.goBack()} />
      {inhoud}
    </View>
  );
}

/**
 * Eén laag: gekleurd tegeltje, naam met het aantal in de lucht, uitleg en
 * een schakelaar. Dezelfde regels als de rijen in Instellingen: op Android is
 * de hele rij de schakelaar (M3), op iOS draagt de Switch naam en uitleg.
 */
function LaagRij({ groep: g, telling, aan, scheiding, onWissel }: {
  groep: { label: string; sub: string; kleur: string; icoon: MciNaam };
  telling: number | null;
  aan: boolean;
  scheiding: boolean;
  onWissel: (v: boolean) => void;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const titel = telling != null && telling > 0 ? `${g.label} (${telling})` : g.label;
  const inhoud = (
    <>
      <View style={[styles.tegel, { backgroundColor: isIOS ? g.kleur : 'transparent' }]}>
        <MaterialCommunityIcons name={g.icoon} size={isIOS ? 18 : 24} color={isIOS ? '#fff' : g.kleur} />
      </View>
      <View style={styles.midden} accessibilityElementsHidden={isIOS}>
        <Text style={styles.label}>{titel}</Text>
        <Text style={styles.sub}>{g.sub}</Text>
      </View>
      {isIOS
        ? <Schakelaar value={aan} onValueChange={onWissel} label={titel} hint={g.sub} />
        : (
          <View pointerEvents="none">
            <Schakelaar value={aan} onValueChange={onWissel} verborgenVoorLezer />
          </View>
        )}
    </>
  );
  if (isIOS) {
    return <View style={[styles.rij, scheiding && styles.scheiding]}>{inhoud}</View>;
  }
  return (
    <Drukbaar
      style={styles.rij}
      rol="switch"
      aan={aan}
      label={titel}
      hint={g.sub}
      trillen={false}
      onPress={() => {
        tikSchakel(!aan);
        onWissel(!aan);
      }}
    >
      {inhoud}
    </Drukbaar>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: isIOS ? 20 : 0, paddingBottom: 32 },
  titel: isIOS
    ? { fontSize: 22, fontWeight: F.weightBold, letterSpacing: -0.3, lineHeight: 28, color: C.textPrimary, minHeight: 44, textAlignVertical: 'center' }
    : { fontSize: 22, fontWeight: F.weightRegular, lineHeight: 28, color: C.textPrimary, paddingVertical: 8 },
  rij: {
    flexDirection: 'row', alignItems: 'center', gap: isIOS ? 12 : 16,
    paddingHorizontal: 16, paddingVertical: isIOS ? 10 : 12, minHeight: isIOS ? 44 : 72,
  },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  tegel: isIOS
    ? { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' }
    : { width: 24, alignItems: 'center', justifyContent: 'center' },
  midden: { flex: 1 },
  label: { ...T.body, fontSize: 16, color: C.textPrimary },
  sub: { ...T.klein, color: C.textSecondary, marginTop: 2 },
  waarschuwing: { ...T.klein, color: C.textPrimary, marginTop: 10, marginHorizontal: 4 },
  voet: { ...T.klein, color: C.textSecondary, marginTop: 8, marginHorizontal: 4 },
});
