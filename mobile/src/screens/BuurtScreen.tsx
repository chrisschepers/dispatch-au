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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haalMeldingenPerVenster, type Melding } from '../api';
import { periodeVan } from '../vertaal';
import { afstandKm } from '../afstand';
import { MeldingRij } from '../components/MeldingRij';
import { useLive, type LiveStatus } from '../live';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { DIENSTEN, wisselDienst, straalVoor, straalTekst, LANDELIJK_KM } from '../diensten';
import { Drukbaar } from '../components/Drukbaar';
import { Icoon, DienstIcoon } from '../components/Icoon';
import { tikStap } from '../trilling';
import { leesbaar, mengKleur } from '../kleur';
import { useInhoudMaat } from '../inhoudMaat';

type Nav = NativeStackNavigationProp<{ Detail: { melding: Melding } }>;

interface Rij { m: Melding; km: number | null }

/** iOS: het vlak van een gekozen chip is de dienstkleur op 0x14 (8%). */
const TINT_IOS = '14';

export default function BuurtScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const { inst, zet } = useInstellingen();
  const navigation = useNavigation<Nav>();
  // Op een breed scherm een kolom in het midden in plaats van rand tot rand.
  const { marge, kolom } = useInhoudMaat();
  const [rijen, setRijen] = useState<Rij[]>([]);
  const [laden, setLaden] = useState(true);
  // Laatste keer laden mislukt: dan zegt een lege lijst dat, niet 'All quiet'.
  const [fout, setFout] = useState(false);
  // Alleen voor het trekken aan de lijst: live- en voorgrondverversingen
  // horen geen draaiertje bovenin te geven.
  const [verversen, setVerversen] = useState(false);
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
      // strikt: zonder dat wordt een mislukt verzoek stilletjes een lege
      // lijst, en dan stond er 'All quiet nearby' terwijl het netwerk weg
      // was. Zonder venster delen alle diensten één feedverzoek, dus het
      // lukt of mislukt in zijn geheel.
      const ms = await haalMeldingenPerVenster({
        lat: plek.lat, lon: plek.lon, radiusKm: inst.straalKm,
        disciplines: inst.lijstDiensten,
        straalPerDienst: inst.straalPerDienst,
        zonderVenster: true,
        limietPerVenster: 60,
        strikt: true,
      });
      const metAfstand = ms.map((m) => ({ m, km: afstandKm(plek.lat, plek.lon, m) }));
      metAfstand.sort((a, b) => +new Date(b.m.timestamp) - +new Date(a.m.timestamp));
      setRijen(metAfstand);
      setEindeBereikt(ms.length === 0);
      setFout(false);
    } catch {
      // Netwerkfout: de oude lijst blijft staan. Is er geen, dan toont de
      // lege lijst de foutkaart met 'Try again'.
      setFout(true);
    }
    setLaden(false);
  }, [inst]);

  /** Trekken aan de lijst: het draaiertje staat tot de herlading klaar is. */
  const ververs = useCallback(async () => {
    setVerversen(true);
    await laad();
    setVerversen(false);
  }, [laad]);

  /** 'Try again' op de foutkaart: het skelet als teken dat er iets gebeurt. */
  const opnieuw = useCallback(() => {
    setFout(false);
    setLaden(true);
    laad();
  }, [laad]);

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
        // Een netwerkfout is geen 'einde bereikt': die blijft dan staan.
        strikt: true,
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
   * iOS: de tekst van een gekozen chip blijft in de dienstkleur, maar zo
   * donker (in het donker: zo licht) dat hij 4.5:1 haalt op het getinte vlak
   * eronder. Puur amber op lichtgrijs was zo'n 2:1. Icoon en rand houden de
   * echte kleur.
   */
  const chipTekstIOS = useMemo(() => Object.fromEntries(DIENSTEN.map((d) => [
    d.key, leesbaar(d.kleur, mengKleur(d.kleur, C.bg, parseInt(TINT_IOS, 16) / 255)),
  ])) as Record<string, string>, [C.bg]);

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
          is sindsdien een eigen tabblad in de systeemtabbalk. */}
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
          // Een keuze die verspringt: selectietik, geen druktik.
          const wissel = () => {
            tikStap();
            zet('lijstDiensten', wisselDienst(inst.lijstDiensten, d.key));
          };
          if (isIOS) {
            return (
              <Drukbaar
                key={d.key}
                schaal={0.94}
                geselecteerd={aan}
                style={[styles.chip, aan && { backgroundColor: `${d.kleur}${TINT_IOS}`, borderColor: d.kleur }]}
                onPress={wissel}
              >
                <View style={styles.chipInhoud}>
                  <DienstIcoon dienst={d} grootte={15} kleur={aan ? d.kleur : C.textMuted} />
                  <Text style={[styles.chipTekst, aan && { color: chipTekstIOS[d.key], fontWeight: F.weightSemibold }]}>
                    {d.label}
                  </Text>
                </View>
              </Drukbaar>
            );
          }
          // Android: M3-filterchip. Gekozen is een getint vlak met een vinkje
          // vooraan, niet gekozen alleen een rand met het vakicoon. TalkBack
          // leest hem als aangevinkt of niet.
          return (
            <Drukbaar
              key={d.key}
              rol="checkbox"
              aan={aan}
              style={[styles.chip, aan && { backgroundColor: `${d.kleur}29`, borderColor: 'transparent' }]}
              onPress={wissel}
            >
              <View style={styles.chipInhoud}>
                {aan
                  ? <Icoon naam="gekozen" grootte={18} kleur={C.textPrimary} />
                  : <DienstIcoon dienst={d} grootte={18} kleur={d.kleur} />}
                <Text style={[styles.chipTekst, aan && { color: C.textPrimary }]}>{d.label}</Text>
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
        // iOS: de lijst loopt onder de tabbalk door en houdt er zelf ruimte
        // voor vrij. Android: de tabcontainer houdt de balk al vrij.
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={lijstKop}
        sections={secties}
        keyExtractor={(r) => r.m.id}
        stickySectionHeadersEnabled={false}
        refreshControl={(
          <RefreshControl
            refreshing={verversen}
            onRefresh={ververs}
            tintColor={C.textMuted}
            // Android: rood draaiend op een schijf in de kaartkleur. Zonder
            // deze twee is de schijf in het donker wit.
            colors={[C.accent]}
            progressBackgroundColor={C.card}
          />
        )}
        onEndReached={laadMeer}
        onEndReachedThreshold={0.6}
        ListFooterComponent={meerBezig ? (
          <ActivityIndicator color={C.textMuted} style={{ marginVertical: 18 }} />
        ) : eindeBereikt && rijen.length > 0 ? (
          <Text style={styles.eindeTekst}>That's everything we have for this area.</Text>
        ) : null}
        contentContainerStyle={[styles.lijst, kolom, { paddingHorizontal: marge }]}
        renderSectionHeader={({ section }) => <Text style={styles.sectieKop}>{section.title}</Text>}
        // Drie lege staten, en 'All quiet' alleen als het echt stil is: de
        // eerste keer laden een skelet in de vorm van de lijst, bij een
        // mislukte herlading zonder oude lijst de foutkaart.
        ListEmptyComponent={laden ? <Skelet /> : fout ? (
          <View style={[kaartStijl, styles.leeg]}>
            <Text style={styles.leegTitel}>Could not load incidents</Text>
            <Text style={styles.leegTekst}>Check your connection and try again.</Text>
            <Drukbaar style={styles.opnieuw} onPress={opnieuw}>
              <Text style={styles.opnieuwTekst}>Try again</Text>
            </Drukbaar>
          </View>
        ) : (
          <View style={[kaartStijl, styles.leeg]}>
            <Text style={styles.leegTitel}>All quiet nearby</Text>
            <Text style={styles.leegTekst}>
              No incidents within {straalLabel}. Increase your radius in Settings
              to look further.
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <MeldingRij m={item.m} km={item.km} onPress={() => navigation.navigate('Detail', { melding: item.m })} />
        )}
      />
    </SafeAreaView>
  );
}

/**
 * Eerste keer laden: vijf kaarten in de vorm van een meldingsrij, met twee
 * grijze balkjes waar titel en plaats komen. Stil, zonder glinstering: die
 * trekt de aandacht naar iets dat nog niets zegt. Voor een schermlezer één
 * element.
 */
function Skelet() {
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading incidents">
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[kaartStijl, styles.skeletRij]}>
          <View style={[styles.skeletBalk, styles.skeletLang]} />
          <View style={[styles.skeletBalk, styles.skeletKort]} />
        </View>
      ))}
    </View>
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
  pilTekst: { ...T.klein, fontWeight: F.weightSemibold, color: C.textPrimary },
  kop: { ...T.display, color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  // marginBottom 2 + de 8 bovenin de chiprij = dezelfde 10 als voorheen.
  subkop: { ...T.klein, color: C.textSecondary, paddingHorizontal: 20, marginTop: 10, marginBottom: 2 },

  // flexGrow: 0, anders eist de schuifrij alle resterende hoogte op en blijft
  // er niets over voor de lijst eronder.
  chipsRij: { flexGrow: 0, flexShrink: 0 },
  filterHint: { ...T.klein, color: C.textSecondary, paddingHorizontal: 20, marginTop: -4, marginBottom: 10 },
  eindeTekst: { ...T.klein, color: C.textSecondary, textAlign: 'center', marginVertical: 18 },
  // paddingTop 8: een ScrollView neemt geen aanrakingen buiten zijn eigen
  // rand aan, dus zonder die ruimte viel de bovenste 8 van de hitSlop weg.
  // Zo is elke chip minstens 48 hoog te raken.
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  chip: isIOS ? {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  } : {
    // M3-filterchip: 32 hoog (48 met de hitSlop), hoek 8, vooraan 8 voor
    // het icoon en achteraan 16. De rand is M3's outlineVariant: 25% van de
    // tekstkleur over de grond. In Android-donker is dat precies C.border
    // (#474747); in licht haalt C.border op de grijze grond maar 1.1:1 en
    // viel de chip weg.
    minHeight: 32, paddingVertical: 0, justifyContent: 'center',
    borderRadius: 8, paddingLeft: 8, paddingRight: 16,
    backgroundColor: 'transparent', borderWidth: 1,
    borderColor: mengKleur(C.textPrimary, C.bg, 0.25),
  },
  chipInhoud: { flexDirection: 'row', alignItems: 'center', gap: isIOS ? 5 : 8 },
  chipTekst: isIOS
    ? { ...T.klein, color: C.textSecondary }
    // M3 labelLarge: 14/500 met letterafstand 0.1.
    : { fontSize: 14, fontWeight: F.weightMedium, letterSpacing: 0.1, lineHeight: 20, color: C.textSecondary },

  lijst: { paddingHorizontal: 16, paddingBottom: 24 },
  sectieKop: {
    ...T.sectie, color: C.textSecondary,
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },


  leeg: { padding: 24, alignItems: 'center', marginTop: 12 },
  leegTitel: { ...T.kop, color: C.textPrimary },
  leegTekst: { ...T.body, color: C.textSecondary, textAlign: 'center', marginTop: 6 },
  // Tekstknop in de accentkleur; de ronding staat op de Drukbaar zelf, zodat
  // de Android-drukstaat dezelfde vorm heeft.
  opnieuw: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, marginTop: 12 },
  opnieuwTekst: { ...T.kop, color: C.accentTekst },

  // Zelfde maat als een meldingsrij; de balkjes beginnen waar de titel staat
  // (4 kleurbalk + 44 icoonvak).
  skeletRij: { height: 72, marginBottom: 8, paddingLeft: 48, paddingRight: 16, justifyContent: 'center' },
  skeletBalk: { height: 12, borderRadius: 6, backgroundColor: C.chipBg },
  skeletLang: { width: '60%' },
  skeletKort: { width: '35%', height: 10, marginTop: 10 },
});
