/**
 * Het blad van één toestel (plan 08-11-2026, zoals het heli-kaartje van de
 * grote app): roepnaam, soort, hoogte, snelheid, registratie, bij welke brand
 * hij werkt en hoe oud de positie is. Ververst mee zolang het open is.
 *
 * Sinds 13-11 ook wat hij doet in gewone woorden ("Airborne since ...", "At
 * base"), de brand waar hij aan werkt als link, en zijn vluchten van de
 * laatste 7 dagen met het spoor op een kaartje. Het blad opent vanaf de kaart
 * (een toestel dat nu vliegt) of vanaf een brand (een toestel dat er was, met
 * het spoor van die vlucht).
 *
 * Reddings- en medische toestellen: nooit waar ze landden. Alleen "At base"
 * of "Landed away from base", en alleen het spoor van een vlucht die nog
 * loopt (vluchtData.ts). Politie heeft geen vluchten.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StapelParams } from '../navigatie';
import { haalMelding } from '../api';
import { useLuchtBeeld } from '../vliegtuigen';
import { haalVluchten } from '../vluchten';
import {
  rolTekst, hoogteTekst, snelheidTekst, minutenStil, zonderSignaal, type Toestel, type Vliegtuig,
} from '../vliegtuigData';
import {
  toestandTekst, vluchtDuur, vluchtAfloop, heeftSpoor, grootLabel, landingGeheim, type Vluchten,
} from '../vluchtData';
import { dagKlok, geledenTekst, klok } from '../spoor';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { BladGreep } from '../components/BladGreep';
import { Drukbaar } from '../components/Drukbaar';
import { Icoon } from '../components/Icoon';
import { ToestelRondje, kleurVan } from '../components/VliegtuigMarker';
import { SpoorKaart } from '../components/SpoorKaart';
import { RitRij } from '../components/RitRij';
import type { IcoonNaam } from '../iconen';

type Nav = NativeStackNavigationProp<StapelParams, 'Vliegtuig'>;

export default function VliegtuigScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const navigation = useNavigation<Nav>();
  const params = useRoute<RouteProp<StapelParams, 'Vliegtuig'>>().params;
  // Vanaf de kaart: blijven verversen. Vanaf een brand niet: elk verzoek aan
  // /v1/aircraft telt bij de backend als "er kijkt iemand" en kost daar
  // verzoeken aan de bron. Wat de kaart al ophaalde, lezen we wel mee.
  const beeld = useLuchtBeeld(params.vliegtuig != null);
  const hex = (params.vliegtuig ?? params.toestel)!.hex;
  // De nieuwste stand van dit toestel; is het uit beeld, dan de laatste die we hadden.
  // Vanaf een brand telt alleen een vers beeld: een stand van een uur geleden
  // uit het geheugen zou "Airborne" zeggen over een toestel dat al lang staat.
  const vers = params.vliegtuig != null
    || (beeld?.bijgewerkt != null && Date.now() - Date.parse(beeld.bijgewerkt) < 3 * 60_000);
  const live: Vliegtuig | null = (vers ? beeld?.vliegtuigen.find((x) => x.hex === hex) : null) ?? params.vliegtuig ?? null;
  const t: Toestel = live ?? params.toestel!;
  const [openen, setOpenen] = useState<string | null>(null);
  const stil = live ? zonderSignaal(live) : false;

  // Vluchten: niet voor politie (die volgt de backend niet). Opnieuw ophalen
  // als de vlucht of de toestand verandert; faalt het, dan geen blok.
  const [vluchten, setVluchten] = useState<Vluchten | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(params.vlucht ?? null);
  const volgbaar = t.role !== 'police';
  const liveVlucht = live?.flightId ?? null;
  const liveStand = live?.state ?? null;
  useEffect(() => {
    if (!volgbaar) return;
    let levend = true;
    haalVluchten(hex).then((v) => { if (levend && v) setVluchten(v); }).catch(() => {});
    return () => { levend = false; };
  }, [hex, volgbaar, liveVlucht, liveStand]);

  const lijst = vluchten?.vluchten ?? [];
  const lopend = lijst.find((v) => v.state === 'airborne') ?? null;
  const gekozenVlucht = lijst.find((v) => v.id === gekozen && heeftSpoor(v)) ?? null;
  // Het spoor op het kaartje: de gekozen vlucht, anders de vlucht die loopt.
  // Kwam je van een brand en is er (nog) geen vlucht om te tonen, dan het
  // spoor dat de brand meegaf. Dat komt alleen van blustoestellen.
  const getoond = gekozenVlucht ?? (lopend && heeftSpoor(lopend) ? lopend : null);
  const voorlopig = !getoond && !landingGeheim(t.role) && (params.spoor?.length ?? 0) >= 2
    ? params.spoor! : null;
  const spoor = getoond?.spoor ?? voorlopig;

  // Toestand: van het live toestel, anders uit de vluchten. Zagen we de start
  // niet, dan is "sinds" het moment dat hij in beeld kwam.
  const stand = toestandTekst(
    liveStand ?? vluchten?.state ?? null,
    live?.airborneSince ?? lopend?.startedAt ?? null,
    lopend ? lopend.takeoffSeen : null,
  );
  const groot = grootLabel(t);

  const rijen: Array<{ icoon: IcoonNaam; titel: string; waarde: string }> = [];
  if (live) {
    const hoogte = hoogteTekst(live);
    if (hoogte) rijen.push({ icoon: 'hoogte', titel: 'Altitude', waarde: hoogte });
    const snelheid = snelheidTekst(live);
    if (snelheid && !live.onGround) rijen.push({ icoon: 'snelheid', titel: 'Speed', waarde: snelheid });
  }
  if (t.registration) rijen.push({ icoon: 'registratie', titel: 'Registration', waarde: [t.registration, t.type].filter(Boolean).join(' · ') });
  if (live) {
    // Zoals de grote app: "geen signaal sinds" met de kloktijd van de laatste positie.
    rijen.push(stil
      ? { icoon: 'geenSignaal', titel: 'No signal since', waarde: klok(live.seenAt) }
      : { icoon: 'positie', titel: 'Last position', waarde: geledenTekst(minutenStil(live)) });
  }

  async function openBrand(id: string) {
    if (openen) return;
    setOpenen(id);
    try {
      const melding = await haalMelding(id);
      // Eerst het blad dicht, dan Detail in dezelfde stapel (zoals GroepScreen).
      navigation.goBack();
      navigation.navigate('Detail', { melding });
    } catch {
      // Melding niet meer in de feed: dan blijft het blad gewoon staan.
    } finally {
      setOpenen(null);
    }
  }

  // De brand waar hij nu aan werkt (gekoppeld door de backend), anders de
  // brand waar hij bij in de buurt vliegt.
  const werk = live?.workingOn ?? null;
  const dichtbij = !werk ? live?.nearFire ?? null : null;
  const bron = vluchten?.bron ?? beeld?.bron ?? 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.';

  const inhoud = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.inhoud}
      // Android: de lijst geeft het slepen door aan het blad.
      nestedScrollEnabled
    >
      <View style={styles.kop}>
        <ToestelRondje v={{ role: t.role, rotor: t.rotor, track: live?.track ?? null }} maat={44} stil={stil} />
        <View style={{ flex: 1 }}>
          <Text style={styles.titel} accessibilityRole="header" selectable>{t.callsign}</Text>
          <Text style={styles.sub} selectable>{[groot, rolTekst(t), t.operator, t.model].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      {stand ? (
        <View style={[styles.stand, { backgroundColor: C.chipBg }]}>
          <Icoon naam="toestand" grootte={18} kleur={C.textSecondary} />
          <Text style={styles.standTekst} selectable>{stand}</Text>
        </View>
      ) : null}

      {spoor ? (
        <View style={styles.kaart}>
          <SpoorKaart
            spoor={spoor}
            kleur={kleurVan(t)}
            label={getoond
              ? `Track of the flight of ${dagKlok(getoond.startedAt)}`
              : 'Track of the flight at this fire'}
          />
          <Text style={styles.kaartSub}>
            {getoond
              ? `${getoond.state === 'airborne' ? 'The flight in the air now' : `Flight of ${dagKlok(getoond.startedAt)}`}${vluchtDuur(getoond) ? ` · ${vluchtDuur(getoond)}` : ''}`
              : 'The flight at this fire'}
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

      {werk ? (
        <Drukbaar
          style={[kaartStijl, styles.brand]}
          markeer
          onPress={() => openBrand(werk.id)}
          label={`Working on ${werk.title}, ${werk.location}${werk.since ? `, since ${klok(werk.since)}` : ''}`}
          hint="Opens the incident"
        >
          <Icoon naam="brand" grootte={20} kleur={C.brandweer} style={styles.rijIcoon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandKop}>Working on this fire</Text>
            <Text style={styles.brandTitel} numberOfLines={2}>
              {[werk.title, werk.location].filter(Boolean).join(', ')}
            </Text>
            {werk.since ? <Text style={styles.brandSub}>{`Since ${klok(werk.since)}`}</Text> : null}
          </View>
          {openen === werk.id
            ? <ActivityIndicator color={C.textMuted} />
            : isIOS ? <Icoon naam="chevron" grootte={18} kleur={C.textMuted} gewicht="semibold" /> : null}
        </Drukbaar>
      ) : null}

      {dichtbij ? (
        <Drukbaar
          style={[kaartStijl, styles.brand]}
          markeer
          onPress={() => openBrand(dichtbij.id)}
          label={`Working near ${dichtbij.title}, ${dichtbij.location}, ${dichtbij.distanceKm} kilometres away`}
          hint="Opens the incident"
        >
          <Icoon naam="brand" grootte={20} kleur={C.brandweer} style={styles.rijIcoon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandKop}>Working near</Text>
            <Text style={styles.brandTitel} numberOfLines={2}>
              {[dichtbij.title, dichtbij.location].filter(Boolean).join(', ')}
            </Text>
            <Text style={styles.brandSub}>{`${dichtbij.distanceKm.toLocaleString('en-AU')} km away`}</Text>
          </View>
          {openen === dichtbij.id
            ? <ActivityIndicator color={C.textMuted} />
            : isIOS ? <Icoon naam="chevron" grootte={18} kleur={C.textMuted} gewicht="semibold" /> : null}
        </Drukbaar>
      ) : null}

      {/* Alleen als de route antwoordde: anders geen kopje boven niets. */}
      {vluchten ? (
        <>
          <Text style={styles.blokKop} accessibilityRole="header">Flights in the last 7 days</Text>
          <View style={[kaartStijl, styles.blok]}>
            {lijst.length === 0 ? (
              <Text style={styles.leeg}>No flights seen in the last 7 days.</Text>
            ) : lijst.map((v, i) => (
              <RitRij
                key={v.id}
                titel={dagKlok(v.startedAt)}
                maat={vluchtDuur(v)}
                sub={vluchtAfloop(v)}
                gekozen={getoond?.id === v.id}
                scheiding={i > 0}
                onPress={heeftSpoor(v) ? () => setGekozen(v.id) : undefined}
              >
                {v.branden.map((b) => (
                  <Drukbaar
                    key={b.id}
                    style={styles.vluchtBrand}
                    onPress={() => openBrand(b.id)}
                    rol="link"
                    label={`${b.working ? 'Working on' : 'Worked on'} ${b.title}, ${b.location}`}
                    hint="Opens the incident"
                  >
                    <Icoon naam="brand" grootte={15} kleur={C.brandweer} />
                    <Text style={styles.vluchtBrandTekst} numberOfLines={2}>
                      {[b.title, b.location].filter(Boolean).join(', ')}
                    </Text>
                    {openen === b.id ? <ActivityIndicator size="small" color={C.textMuted} /> : null}
                  </Drukbaar>
                ))}
              </RitRij>
            ))}
          </View>
          {landingGeheim(t.role) ? (
            <Text style={styles.voet}>
              For rescue and medical aircraft the app never shows where a flight landed, only whether
              the aircraft is back at its base.
            </Text>
          ) : null}
        </>
      ) : null}

      <Text style={styles.voet}>
        {bron} Positions can be a few minutes old, and aircraft can switch off their transponder.
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, marginTop: 12 },
  brandKop: { ...T.klein, color: C.textSecondary },
  brandTitel: { ...T.rij, color: C.textPrimary, marginTop: 1 },
  brandSub: { ...T.klein, color: C.textSecondary, marginTop: 1 },
  // Een brand onder een vlucht: een link van minstens 44 hoog.
  vluchtBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginTop: 2 },
  vluchtBrandTekst: { ...T.klein, color: C.accentTekst, flex: 1 },
  leeg: { ...T.body, color: C.textSecondary, paddingHorizontal: 16, paddingVertical: 14 },
  voet: { ...T.klein, color: C.textSecondary, marginTop: 12, marginHorizontal: 4 },
});
