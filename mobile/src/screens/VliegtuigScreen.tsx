/**
 * Het blad van één toestel (plan 08-11-2026, zoals het heli-kaartje van de
 * grote app): roepnaam, soort, hoogte, snelheid, registratie, bij welke brand
 * hij werkt en hoe oud de positie is. Ververst mee zolang het open is.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StapelParams } from '../navigatie';
import { haalMelding } from '../api';
import { useLuchtBeeld } from '../vliegtuigen';
import {
  rolTekst, hoogteTekst, snelheidTekst, minutenStil, zonderSignaal,
} from '../vliegtuigData';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { BladGreep } from '../components/BladGreep';
import { Drukbaar } from '../components/Drukbaar';
import { Icoon } from '../components/Icoon';
import { ToestelRondje } from '../components/VliegtuigMarker';
import type { IcoonNaam } from '../iconen';

type Nav = NativeStackNavigationProp<StapelParams, 'Vliegtuig'>;

function stilTekst(min: number): string {
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const uur = Math.floor(min / 60);
  return uur === 1 ? '1 hour ago' : `${uur} hours ago`;
}

export default function VliegtuigScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const navigation = useNavigation<Nav>();
  const { vliegtuig } = useRoute<RouteProp<StapelParams, 'Vliegtuig'>>().params;
  const beeld = useLuchtBeeld(true);
  // De nieuwste stand van dit toestel; is het uit beeld, dan de laatste die we hadden.
  const v = beeld?.vliegtuigen.find((x) => x.hex === vliegtuig.hex) ?? vliegtuig;
  const [openen, setOpenen] = useState(false);
  const stil = zonderSignaal(v);
  const min = minutenStil(v);

  const rijen: Array<{ icoon: IcoonNaam; titel: string; waarde: string }> = [];
  const hoogte = hoogteTekst(v);
  if (hoogte) rijen.push({ icoon: 'hoogte', titel: 'Altitude', waarde: hoogte });
  const snelheid = snelheidTekst(v);
  if (snelheid && !v.onGround) rijen.push({ icoon: 'snelheid', titel: 'Speed', waarde: snelheid });
  if (v.registration) rijen.push({ icoon: 'registratie', titel: 'Registration', waarde: [v.registration, v.type].filter(Boolean).join(' · ') });
  // Zoals de grote app: "geen signaal sinds" met de kloktijd van de laatste positie.
  rijen.push(stil
    ? {
      icoon: 'geenSignaal', titel: 'No signal since',
      waarde: new Date(v.seenAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }),
    }
    : { icoon: 'positie', titel: 'Last position', waarde: stilTekst(min) });

  async function openBrand() {
    if (!v.nearFire || openen) return;
    setOpenen(true);
    try {
      const melding = await haalMelding(v.nearFire.id);
      // Eerst het blad dicht, dan Detail in de kaartstapel (zoals GroepScreen).
      navigation.goBack();
      navigation.navigate('Detail', { melding });
    } catch {
      // Melding niet meer in de feed: dan blijft het blad gewoon staan.
    } finally {
      setOpenen(false);
    }
  }

  return (
    <View style={styles.root}>
      <BladGreep onPress={() => navigation.goBack()} />
      <View style={styles.kop}>
        <ToestelRondje v={v} maat={44} stil={stil} />
        <View style={{ flex: 1 }}>
          <Text style={styles.titel} accessibilityRole="header" selectable>{v.callsign}</Text>
          <Text style={styles.sub} selectable>{[rolTekst(v), v.operator, v.model].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <View style={[kaartStijl, styles.blok]}>
        {rijen.map((r, i) => (
          <View key={r.titel} style={[styles.rij, i > 0 && styles.scheiding]} accessible>
            <Icoon naam={r.icoon} grootte={20} kleur={C.textSecondary} style={styles.rijIcoon} />
            <Text style={styles.rijTitel}>{r.titel}</Text>
            <Text style={styles.rijWaarde} selectable>{r.waarde}</Text>
          </View>
        ))}
      </View>

      {v.nearFire ? (
        <Drukbaar
          style={[kaartStijl, styles.brand]}
          markeer
          onPress={openBrand}
          label={`Working near ${v.nearFire.title}, ${v.nearFire.location}, ${v.nearFire.distanceKm} kilometres away`}
          hint="Opens the incident"
        >
          <Icoon naam="brand" grootte={20} kleur={C.brandweer} style={styles.rijIcoon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandKop}>Working near</Text>
            <Text style={styles.brandTitel} numberOfLines={2}>
              {[v.nearFire.title, v.nearFire.location].filter(Boolean).join(', ')}
            </Text>
            <Text style={styles.brandSub}>{`${v.nearFire.distanceKm.toLocaleString('en-AU')} km away`}</Text>
          </View>
          {openen
            ? <ActivityIndicator color={C.textMuted} />
            : isIOS ? <Icoon naam="chevron" grootte={18} kleur={C.textMuted} gewicht="semibold" /> : null}
        </Drukbaar>
      ) : null}

      <Text style={styles.voet}>
        {beeld?.bron ?? 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.'} Positions can be a few minutes old,
        and aircraft can switch off their transponder.
      </Text>
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: isIOS ? 20 : 0, paddingBottom: 24 },
  kop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  titel: isIOS
    ? { fontSize: 22, fontWeight: F.weightBold, letterSpacing: -0.3, lineHeight: 28, color: C.textPrimary }
    : { fontSize: 22, fontWeight: F.weightRegular, lineHeight: 28, color: C.textPrimary },
  sub: { ...T.klein, color: C.textSecondary, marginTop: 2 },
  blok: { paddingVertical: 2 },
  rij: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, gap: 12 },
  scheiding: isIOS ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator } : {},
  rijIcoon: { width: 22 },
  rijTitel: { ...T.body, color: C.textPrimary, flex: 1 },
  rijWaarde: { ...T.body, color: C.textSecondary, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, marginTop: 12 },
  brandKop: { ...T.klein, color: C.textSecondary },
  brandTitel: { ...T.rij, color: C.textPrimary, marginTop: 1 },
  brandSub: { ...T.klein, color: C.textSecondary, marginTop: 1 },
  voet: { ...T.klein, color: C.textSecondary, marginTop: 12, marginHorizontal: 4 },
});
