/**
 * Het openingsscherm: wat gebeurt er bij mij in de buurt.
 *
 * Indeling geleend van wat aantoonbaar werkt bij de concurrent (Chris 15-08),
 * maar zonder hun jargon: zij zetten "A1 Ambu 07126 Rit 252363" als titel, wij
 * "Ambulance met spoed". Wat we wél overnemen is de rustige, zakelijke opzet:
 * gekleurde balk links per dienst, vakicoon in plaats van emoji, urgentie in
 * gewone taal eronder, en tijd rechts uitgelijnd.
 *
 * Gesorteerd op tijd met kopjes per periode: eerder stond dichtstbij bovenaan
 * en dan kwam een ongeval van drie weken geleden boven een brand van vanmiddag.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, RefreshControl, AppState, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haalMeldingenPerVenster, type Melding } from '../api';
import { periodeVan } from '../vertaal';
import { afstandKm } from '../afstand';
import { MeldingRij } from '../components/MeldingRij';
import { useLive, type LiveStatus } from '../live';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { T, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { DIENSTEN, wisselDienst, straalVoor, straalTekst, LANDELIJK_KM } from '../diensten';
import { Drukbaar } from '../components/Drukbaar';

type Nav = NativeStackNavigationProp<{ Detail: { melding: Melding } }>;

interface Rij { m: Melding; km: number | null }

export default function BuurtScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const { inst, zet } = useInstellingen();
  const navigation = useNavigation<Nav>();
  const [rijen, setRijen] = useState<Rij[]>([]);
  const [laden, setLaden] = useState(true);
  const [plaatsLabel, setPlaatsLabel] = useState<string | null>(null);
  // Outside Australia the list shows Melbourne; the header then says so.
  const [buitenAu, setBuitenAu] = useState(false);
  const [meerBezig, setMeerBezig] = useState(false);
  const [eindeBereikt, setEindeBereikt] = useState(false);
  // Laatst gebruikte plek: de live-verbinding toetst daar nieuwe meldingen aan.
  const plekRef = useRef<{ lat: number; lon: number } | null>(null);

  const laad = useCallback(async () => {
    try {
      // Eerst de plek die we al weten, anders wacht dit scherm tot zes seconden
      // op een verse GPS-fix voordat het ook maar begint met ophalen (melding
      // Wilbert 24-08: dienst uitzetten "duurt vrij lang, je krijgt het idee
      // dat het niet werkt"). De verse fix komt hieronder alsnog.
      const plek = (await bepaalPlekSnel(inst)) ?? (await bepaalPlek(inst));
      setPlaatsLabel(plek.bron === 'handmatig' ? inst.handPlaats : null);
      setBuitenAu(plek.bron === 'buiten-au');
      plekRef.current = plek;
      // Geen tijdvenster in de lijst (keuze Chris 16-08): het venster is er om
      // de kaart behapbaar te houden, hier wil je gewoon terug kunnen scrollen.
      const ms = await haalMeldingenPerVenster({
        lat: plek.lat, lon: plek.lon, radiusKm: inst.straalKm,
        disciplines: inst.lijstDiensten,
        straalPerDienst: inst.straalPerDienst,
        zonderVenster: true,
        limietPerVenster: 60,
      });
      const metAfstand = ms.map((m) => ({ m, km: afstandKm(plek.lat, plek.lon, m) }));
      metAfstand.sort((a, b) => +new Date(b.m.timestamp) - +new Date(a.m.timestamp));
      setRijen(metAfstand);
      setEindeBereikt(ms.length === 0);
    } catch { /* netwerkfout: oude lijst laten staan */ }
    setLaden(false);
  }, [inst]);

  /** Onderaan aangekomen: oudere meldingen erbij halen. */
  const laadMeer = useCallback(async () => {
    if (laden || meerBezig || eindeBereikt || rijen.length === 0) return;
    setMeerBezig(true);
    try {
      const plek = await bepaalPlek(inst);
      const oudste = rijen[rijen.length - 1]!.m.timestamp;
      const ms = await haalMeldingenPerVenster({
        lat: plek.lat, lon: plek.lon, radiusKm: inst.straalKm,
        disciplines: inst.lijstDiensten,
        straalPerDienst: inst.straalPerDienst,
        zonderVenster: true,
        voor: new Date(new Date(oudste).getTime() - 1000),
        limietPerVenster: 60,
      });
      if (ms.length === 0) { setEindeBereikt(true); return; }
      setRijen((oud) => {
        // Op id ontdubbelen: bij gelijke tijdstempels kan er overlap zijn.
        const gezien = new Set(oud.map((r) => r.m.id));
        const nieuw = ms.filter((m) => !gezien.has(m.id))
          .map((m) => ({ m, km: afstandKm(plek.lat, plek.lon, m) }));
        if (nieuw.length === 0) setEindeBereikt(true);
        return [...oud, ...nieuw];
      });
    } catch { /* stil: volgende scroll probeert opnieuw */ }
    finally { setMeerBezig(false); }
  }, [inst, rijen, laden, meerBezig, eindeBereikt]);

  useEffect(() => { laad(); }, [laad]);

  /**
   * Live: valt een nieuwe melding binnen jouw diensten en straal, dan de lijst
   * verversen. Niet de melding zelf erin plakken: de lijst hoort precies te
   * zijn wat de backend voor deze plek teruggeeft (vertaald, ontdubbeld,
   * gesorteerd). Kort wachten vangt een reeks alarmeringen voor één incident
   * op in één verversing.
   */
  const verversTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveStatus = useLive((m) => {
    const plek = plekRef.current;
    if (!plek) return;
    const aan = inst.lijstDiensten;
    const dienstAan = aan.length === 0 || aan.includes(m.discipline);
    if (!dienstAan) return;
    const km = afstandKm(plek.lat, plek.lon, m);
    if (km == null || km > straalVoor(m.discipline, inst.straalKm, inst.straalPerDienst)) return;
    if (verversTimer.current) clearTimeout(verversTimer.current);
    verversTimer.current = setTimeout(() => { verversTimer.current = null; laad(); }, 1200);
  });
  useEffect(() => () => { if (verversTimer.current) clearTimeout(verversTimer.current); }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') laad(); });
    return () => sub.remove();
  }, [laad]);

  // Bij een straal per dienst is één getal een leugen; toon dan de reeks.
  const straalLabel = useMemo(() => {
    const waarden = inst.lijstDiensten.map((d) => straalVoor(d, inst.straalKm, inst.straalPerDienst));
    const min = Math.min(...waarden), max = Math.max(...waarden);
    if (min === max) return straalTekst(max);
    // "10 km tot heel Nederland", niet "10 tot 500 km" (KNRM/traumaheli landelijk).
    return max >= LANDELIJK_KM ? `${min} km to anywhere in Australia` : `${min} to ${max} km`;
  }, [inst.lijstDiensten, inst.straalKm, inst.straalPerDienst]);

  /**
   * De lijst volgt de schakelaars METEEN, zonder op het netwerk te wachten.
   *
   * Melding Wilbert 24-08: ambulance uitzetten en dan blijven de ambulance-
   * meldingen nog seconden staan, "je krijgt het idee dat het niet werkt".
   * Klopte: een schakelaar startte een volledige herlading (plaatsbepaling +
   * vijf vensters ophalen) en pas het antwoord daarvan verving de lijst. Nu
   * verdwijnt de dienst op het moment dat je hem uitzet en vult de herlading
   * de rest daarna aan.
   *
   * MMT staat nooit in het discipline-veld (de traumaheli rijdt mee op een
   * ambulance-alarmering en is alleen aan de tekst te herkennen), dus die
   * toetsen we net als de vertaler op de meldtekst.
   */
  const zichtbaar = useMemo(() => {
    const aan = new Set(inst.lijstDiensten);
    if (aan.size === 0) return rijen; // geen keuze gemaakt = alles tonen
    return rijen.filter((r) => aan.has(r.m.discipline));
  }, [rijen, inst.lijstDiensten]);


  const secties = useMemo(() => {
    const groepen: Array<{ title: string; data: Rij[] }> = [];
    for (const r of zichtbaar) {
      const p = periodeVan(r.m.timestamp);
      const laatste = groepen[groepen.length - 1];
      if (laatste && laatste.title === p) laatste.data.push(r);
      else groepen.push({ title: p, data: [r] });
    }
    return groepen;
  }, [zichtbaar]);

  /**
   * De kop scrollt mee met de lijst in plaats van er vast boven te staan
   * (01-09). Hij nam ~150 van de 874 punten permanent in beslag — een vijfde
   * van het scherm, oftewel ruim één meldingskaart die je nooit zag.
   *
   * "In de buurt" is helemaal weg: die stond drie centimeter boven de tab die
   * óók "In de buurt" heet. De regel eronder zegt al waar je kijkt en hoe ver.
   *
   * De dienst-chips blijven wél staan, alleen niet meer permanent: wie alleen
   * brandweer volgt gebruikt ze dagelijks, dus verstoppen in Instellingen is
   * geen verbetering. Bij aankomst zichtbaar, bij lezen uit de weg.
   */
  const lijstKop = (
    <>
      {/* Verbonden-status, zoals in de grote app (wens Chris 27-09). Zoeken
          zit sindsdien onderin de tabbalk. */}
      <View style={styles.bovenRij}>
        <StatusPil status={liveStatus} />
      </View>
      <Text style={styles.subkop}>
        {plaatsLabel ? `Around ${plaatsLabel}` : buitenAu ? 'Outside Australia, showing Melbourne' : 'Around your current location'} · {straalLabel}
      </Text>

      {/* Vijf diensten passen niet meer naast elkaar op een telefoon, dus
          schuifbaar in plaats van afgekapt of over twee regels. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRij}
        contentContainerStyle={styles.chips}
      >
        {DIENSTEN.map((d) => {
          const aan = inst.lijstDiensten.includes(d.key);
          return (
            <Drukbaar
              key={d.key}
              schaal={0.94}
              style={[styles.chip, aan && { backgroundColor: `${d.kleur}14`, borderColor: d.kleur }]}
              onPress={() => zet('lijstDiensten', wisselDienst(inst.lijstDiensten, d.key))}
            >
              <View style={styles.chipInhoud}>
                <MaterialCommunityIcons
                  name={d.icoon as never}
                  size={15}
                  color={aan ? d.kleur : C.textMuted}
                />
                <Text style={[styles.chipTekst, aan && { color: d.kleur, fontWeight: '600' }]}>
                  {d.label}
                </Text>
              </View>
            </Drukbaar>
          );
        })}
      </ScrollView>

      {/* Zonder deze regel denk je dat je met de chips ook je meldingen
          uitzet. Zelfde uitleg als in de grote app (1.4.6), alleen zichtbaar
          als je daadwerkelijk iets hebt weggefilterd. */}
      {inst.lijstDiensten.length < DIENSTEN.length && (
        <Text style={styles.filterHint}>
          This only filters this list. What you get alerts for is set in Settings.
        </Text>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <SectionList
        ListHeaderComponent={lijstKop}
        sections={secties}
        keyExtractor={(r) => r.m.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={laden} onRefresh={laad} tintColor={C.textMuted} />}
        onEndReached={laadMeer}
        onEndReachedThreshold={0.6}
        ListFooterComponent={meerBezig ? (
          <ActivityIndicator color={C.textMuted} style={{ marginVertical: 18 }} />
        ) : eindeBereikt && rijen.length > 0 ? (
          <Text style={styles.eindeTekst}>That's everything we have for this area.</Text>
        ) : null}
        contentContainerStyle={styles.lijst}
        renderSectionHeader={({ section }) => <Text style={styles.sectieKop}>{section.title}</Text>}
        ListEmptyComponent={!laden ? (
          <View style={[kaartStijl, styles.leeg]}>
            <Text style={styles.leegTitel}>All quiet nearby</Text>
            <Text style={styles.leegTekst}>
              No incidents within {straalLabel}. Increase your radius in Settings
              to look further.
            </Text>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <MeldingRij m={item.m} km={item.km} onPress={() => navigation.navigate('Detail', { melding: item.m })} />
        )}
      />
    </SafeAreaView>
  );
}

/** "Verbonden" met een groene stip; eerlijk als het even niet lukt. */
function StatusPil({ status }: { status: LiveStatus }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kleur = status === 'verbonden' ? C.success : status === 'verbinden' ? C.ambulance : C.dienstOnbekend;
  const tekst = status === 'verbonden' ? 'Live' : status === 'verbinden' ? 'Updating…' : 'Offline';
  return (
    <View
      style={styles.pil}
      accessible
      accessibilityLabel={status === 'verbonden' ? 'Live, new incidents appear automatically' : tekst}
    >
      <View style={[styles.pilStip, { backgroundColor: kleur }]} />
      <Text style={styles.pilTekst}>{tekst}</Text>
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  bovenRij: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  pil: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.card, borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  pilStip: { width: 8, height: 8, borderRadius: 4 },
  pilTekst: { ...T.klein, fontWeight: '600', color: C.textPrimary },
  kop: { ...T.display, color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  subkop: { ...T.klein, color: C.textSecondary, paddingHorizontal: 20, marginTop: 10, marginBottom: 10 },

  // flexGrow: 0, anders eist de schuifrij alle resterende hoogte op en blijft
  // er niets over voor de lijst eronder.
  chipsRij: { flexGrow: 0, flexShrink: 0 },
  filterHint: { ...T.klein, color: C.textMuted, paddingHorizontal: 20, marginTop: -4, marginBottom: 10 },
  eindeTekst: { ...T.klein, color: C.textMuted, textAlign: 'center', marginVertical: 18 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  chipInhoud: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipTekst: { ...T.klein, color: C.textSecondary },

  lijst: { paddingHorizontal: 16, paddingBottom: 96 },
  sectieKop: {
    ...T.sectie, color: C.textSecondary, textTransform: 'uppercase',
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },


  leeg: { padding: 24, alignItems: 'center', marginTop: 12 },
  leegTitel: { ...T.kop, color: C.textPrimary },
  leegTekst: { ...T.body, color: C.textSecondary, textAlign: 'center', marginTop: 6 },
});
