/**
 * Het blad van één vaartuig (13-11-2026), zoals dat van een toestel: naam,
 * organisatie, wat het nu doet, snelheid en lengte, het spoor van de tocht
 * die loopt, en de tochten van de laatste 7 dagen. Tik op een tocht en zijn
 * spoor staat op het kaartje. Ververst mee zolang het open is.
 *
 * Ontbreekt de tochtenroute (oudere backend) of mislukt het ophalen, dan
 * blijven kaartje en tochten gewoon weg.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StapelParams } from '../navigatie';
import { useVaartBeeld, haalTochten } from '../vaartuigen';
import {
  vaartuigRegel, vaartToestand, knopenTekst, lengteTekst, waterLaag, tochtMaat, tochtVerloop,
  type Tochten,
} from '../vaartuigData';
import { dagKlok, geledenTekst } from '../spoor';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { BladGreep } from '../components/BladGreep';
import { Icoon } from '../components/Icoon';
import { VaartuigTeken } from '../components/VaartuigMarker';
import { SpoorKaart } from '../components/SpoorKaart';
import { RitRij } from '../components/RitRij';
import type { IcoonNaam } from '../iconen';

type Nav = NativeStackNavigationProp<StapelParams, 'Vaartuig'>;

export default function VaartuigScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const navigation = useNavigation<Nav>();
  const { vaartuig } = useRoute<RouteProp<StapelParams, 'Vaartuig'>>().params;
  const beeld = useVaartBeeld(true);
  // De nieuwste stand van dit vaartuig; is het uit beeld, dan de laatste die we hadden.
  const v = beeld?.vaartuigen.find((x) => x.mmsi === vaartuig.mmsi) ?? vaartuig;
  const laag = waterLaag(v.soort);

  // De tochten: bij het openen, en opnieuw als er een tocht begint of eindigt
  // of er een nieuwe positie is (het spoor van de lopende tocht groeit mee).
  const [tochten, setTochten] = useState<Tochten | null>(null);
  const [gekozen, setGekozen] = useState<number | null>(null);
  const loopt = v.tocht?.id ?? null;
  const ververs = loopt != null ? v.seenAt : '';
  useEffect(() => {
    let levend = true;
    haalTochten(v.mmsi).then((t) => { if (levend && t) setTochten(t); }).catch(() => {});
    return () => { levend = false; };
  }, [v.mmsi, loopt, ververs]);

  const lijst = tochten?.tochten ?? [];
  const lopend = lijst.find((t) => t.running) ?? null;
  // Zonder keuze: de tocht die loopt. Een gekozen tocht die niet meer bestaat telt niet.
  const getoond = lijst.find((t) => t.id === gekozen) ?? lopend;
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(v.seenAt)) / 60_000));

  const rijen: Array<{ icoon: IcoonNaam; titel: string; waarde: string }> = [];
  const snelheid = knopenTekst(v.speedKn);
  if (snelheid && v.moving && !v.stale) rijen.push({ icoon: 'snelheid', titel: 'Speed', waarde: snelheid });
  const lengte = lengteTekst(v);
  if (lengte) rijen.push({ icoon: 'lengte', titel: 'Length', waarde: lengte });
  if (v.callsign) rijen.push({ icoon: 'registratie', titel: 'Call sign', waarde: v.callsign });
  // Een stilligger die lang niet gehoord is: dat staat al in de regel
  // erboven ("Last seen ..."), dus niet nog een keer.
  const toestand = vaartToestand(v, lopend ? lopend.departureSeen : null);
  if (!v.stale) rijen.push({ icoon: 'positie', titel: 'Last position', waarde: geledenTekst(min) });
  else if (!toestand.startsWith('Last seen')) rijen.push({ icoon: 'geenSignaal', titel: 'Last heard', waarde: dagKlok(v.seenAt) });

  const bron = tochten?.bron ?? beeld?.bron ?? null;

  const inhoud = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.inhoud}
      // Android: de lijst geeft het slepen door aan het blad.
      nestedScrollEnabled
    >
      <View style={styles.kop}>
        <View style={styles.teken}>
          {/* Loopt er een tocht, dan de romp, ook als hij even stilligt. */}
          <VaartuigTeken v={{ ...v, stale: false, moving: v.moving || v.tocht != null }} maat={40} draai={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titel} accessibilityRole="header" selectable>{v.name}</Text>
          <Text style={styles.sub} selectable>{vaartuigRegel(v)}</Text>
        </View>
      </View>

      <View style={[styles.stand, { backgroundColor: C.chipBg }]}>
        <Icoon naam="toestand" grootte={18} kleur={C.textSecondary} />
        <Text style={styles.standTekst} selectable>{toestand}</Text>
      </View>

      {getoond && getoond.spoor.length > 0 ? (
        <View style={styles.kaart}>
          <SpoorKaart
            spoor={getoond.spoor}
            kleur={laag.kleur}
            label={getoond.running ? `Track of the trip under way, from ${dagKlok(getoond.startedAt)}` : `Track of the trip of ${dagKlok(getoond.startedAt)}`}
          />
          <Text style={styles.kaartSub}>
            {getoond.running ? 'The trip under way' : `Trip of ${dagKlok(getoond.startedAt)}`}
            {tochtMaat(getoond) ? ` · ${tochtMaat(getoond)}` : ''}
          </Text>
        </View>
      ) : null}

      {rijen.length > 0 ? (
      <View style={[kaartStijl, styles.blok]}>
        {rijen.map((r, i) => (
          <View key={r.titel} style={[styles.rij, i > 0 && styles.scheiding]} accessible>
            <Icoon naam={r.icoon} grootte={20} kleur={C.textSecondary} style={styles.rijIcoon} />
            <Text style={styles.rijTitel}>{r.titel}</Text>
            <Text style={styles.rijWaarde} selectable>{r.waarde}</Text>
          </View>
        ))}
      </View>
      ) : null}

      {/* Alleen als de route antwoordde: anders geen kopje boven niets. */}
      {tochten ? (
        <>
          <Text style={styles.blokKop} accessibilityRole="header">Trips in the last 7 days</Text>
          <View style={[kaartStijl, styles.blok]}>
            {lijst.length === 0 ? (
              <Text style={styles.leeg}>No trips seen in the last 7 days.</Text>
            ) : lijst.map((t, i) => (
              <RitRij
                key={t.id}
                titel={dagKlok(t.startedAt)}
                maat={tochtMaat(t)}
                sub={tochtVerloop(t)}
                gekozen={getoond?.id === t.id && t.spoor.length > 0}
                scheiding={i > 0}
                onPress={t.spoor.length > 0 ? () => setGekozen(t.id) : undefined}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.voet}>
        {bron ? `${bron} ` : ''}Positions come from the vessel's own AIS transmitter. They can be minutes old,
        and a vessel can switch AIS off.
      </Text>
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

const maak_styles = (C: Palet) => StyleSheet.create({
  inhoud: { paddingHorizontal: 16, paddingTop: isIOS ? 20 : 0, paddingBottom: 32 },
  kop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  teken: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titel: isIOS
    ? { fontSize: 22, fontWeight: F.weightBold, letterSpacing: -0.3, lineHeight: 28, color: C.textPrimary }
    : { fontSize: 22, fontWeight: F.weightRegular, lineHeight: 28, color: C.textPrimary },
  sub: { ...T.klein, color: C.textSecondary, marginTop: 2 },
  stand: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  standTekst: { ...T.rij, color: C.textPrimary, flex: 1 },
  kaart: { marginBottom: 12 },
  kaartSub: { ...T.klein, color: C.textSecondary, marginTop: 6, marginHorizontal: 4 },
  blok: { paddingVertical: 2 },
  blokKop: { ...T.sectie, color: C.textSecondary, marginTop: 20, marginBottom: 8, marginHorizontal: 4 },
  rij: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, gap: 12 },
  scheiding: isIOS ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator } : {},
  rijIcoon: { width: 22 },
  rijTitel: { ...T.body, color: C.textPrimary, flex: 1 },
  rijWaarde: { ...T.body, color: C.textSecondary, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
  leeg: { ...T.body, color: C.textSecondary, paddingHorizontal: 16, paddingVertical: 14 },
  voet: { ...T.klein, color: C.textSecondary, marginTop: 12, marginHorizontal: 4 },
});
