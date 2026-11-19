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
  View, Text, StyleSheet, SectionList, RefreshControl, AppState, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haalMeldingenPerVenster, haalBrandgevaar, type Melding } from '../api';
import { ratingKleur, ratingTekst, isErnstig, gevaarZin, type Brandgevaar, type DagGevaar } from '../brandgevaar';
import { periodeVan } from '../vertaal';
import { afstandKm } from '../afstand';
import { MeldingRij } from '../components/MeldingRij';
import { useLive, type LiveStatus } from '../live';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { binnenGebied, binnenTekst, vlakKleur } from '../gebied';
import { usePremium } from '../premiumPoort';
import { geldigePlekken, type Plek } from '../premium';
import { niveauVan, isAfgelopen } from '../kaartFilter';
import { T, F, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { DIENSTEN, wisselDienst, straalVoor, straalTekst, LANDELIJK_KM } from '../diensten';
import { Drukbaar } from '../components/Drukbaar';
import { DienstChip } from '../components/DienstChip';
import { useInhoudMaat } from '../inhoudMaat';
import { PUSH_BESCHIKBAAR } from '../pushBeschikbaar';

type Nav = NativeStackNavigationProp<{ Detail: { melding: Melding } }>;

interface Rij { m: Melding; km: number | null }

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
  // Dezelfde plek als state: de balk 'je zit in dit gebied' tekent ermee.
  const [plekNu, setPlekNu] = useState<{ lat: number; lon: number } | null>(null);

  // Premium: de lijst ook rond een van je extra plekken bekijken (thuis, het
  // vakantiehuis). null = je eigen plek. Dit wisselt alleen de lijst; je
  // meldingen gelden altijd voor al je plekken.
  const { premium } = usePremium();
  const extraPlekken = useMemo(() => (premium ? geldigePlekken(inst.extraPlekken) : []), [premium, inst.extraPlekken]);
  const [kijkPlek, setKijkPlek] = useState<Plek | null>(null);
  // De gekozen plek is weggehaald (of Premium is afgelopen): terug naar je eigen plek.
  useEffect(() => {
    if (kijkPlek && !extraPlekken.some((p) => p.naam === kijkPlek.naam && p.lat === kijkPlek.lat)) setKijkPlek(null);
  }, [kijkPlek, extraPlekken]);

  const laad = useCallback(async () => {
    try {
      // Eerst de plek die we al weten, anders wacht dit scherm tot zes seconden
      // op een verse GPS-fix voordat het ook maar begint met ophalen (melding
      // Wilbert 24-08: dienst uitzetten "duurt vrij lang, je krijgt het idee
      // dat het niet werkt"). De verse fix komt hieronder alsnog.
      const plek = kijkPlek
        ? { lat: kijkPlek.lat, lon: kijkPlek.lon, bron: 'handmatig' as const }
        : (await bepaalPlekSnel(inst)) ?? (await bepaalPlek(inst));
      setPlaatsLabel(kijkPlek ? kijkPlek.naam : plek.bron === 'handmatig' ? inst.handPlaats : null);
      setBuitenAu(plek.bron === 'buiten-au');
      plekRef.current = plek;
      setPlekNu((oud) => (oud && oud.lat === plek.lat && oud.lon === plek.lon ? oud : { lat: plek.lat, lon: plek.lon }));
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
  }, [inst, kijkPlek]);

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
      const plek = kijkPlek ?? await bepaalPlek(inst);
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
  }, [inst, rijen, laden, meerBezig, eindeBereikt, kijkPlek]);

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
  // Waarschuwingen waar je plek ín ligt, de zwaarste eerst. Dit is het
  // belangrijkste op het scherm en staat daarom boven alles, niet tussen de
  // autobranden van vanochtend.
  const binnen = React.useMemo(() => (plekNu
    ? rijen
      .filter((r) => !isAfgelopen(r.m) && niveauVan(r.m) >= 1 && binnenGebied(r.m.geometry, plekNu.lat, plekNu.lon))
      .sort((a, b) => niveauVan(b.m) - niveauVan(a.m))
      .slice(0, 3)
    : []), [rijen, plekNu]);

  // Brandgevaar van het district rond de plek waar je naar kijkt. Verandert
  // twee keer per dag, dus alleen opnieuw als de plek verandert.
  const [gevaar, setGevaar] = useState<Brandgevaar | null>(null);
  useEffect(() => {
    if (!plekNu) return;
    let geldig = true;
    haalBrandgevaar(plekNu.lat, plekNu.lon).then((g) => { if (geldig) setGevaar(g); });
    return () => { geldig = false; };
  }, [plekNu]);

  const gevaarDag = (naam: string, d: DagGevaar) => {
    const k = ratingKleur(d.rating);
    return (
      <View style={styles.gevaarDag}>
        <Text style={styles.gevaarNaam}>{naam}</Text>
        <View style={[styles.gevaarPil, { backgroundColor: k.vlak }]}>
          <Text style={[styles.gevaarPilTekst, { color: k.tekst }]}>{ratingTekst(d)}</Text>
        </View>
        {d.totalFireBan ? <Text style={styles.gevaarVerbod}>Total Fire Ban</Text> : null}
      </View>
    );
  };

  const lijstKop = (
    <>
      {binnen.map(({ m }) => {
        const niveau = niveauVan(m);
        return (
          <Drukbaar
            key={`binnen-${m.id}`}
            style={[styles.binnen, { borderLeftColor: vlakKleur(niveau).rand }]}
            label={`${binnenTekst(niveau)}. ${m.title ?? ''}`}
            hint="Opens the warning"
            onPress={() => navigation.navigate('Detail', { melding: m })}
          >
            <Text style={styles.binnenKop}>{binnenTekst(niveau)}</Text>
            <Text style={styles.binnenTitel} numberOfLines={2}>{m.title}</Text>
            {m.action ? <Text style={styles.binnenActie} numberOfLines={2}>{m.action}</Text> : null}
          </Drukbaar>
        );
      })}
      {/* Verbonden-status, zoals in de grote app (wens Chris 27-09). Zoeken
          is sindsdien een eigen tabblad in de systeemtabbalk. */}
      <View style={styles.bovenRij}>
        <StatusPil status={liveStatus} />
      </View>
      {gevaar ? (
        <Drukbaar
          style={[styles.gevaar, (isErnstig(gevaar.vandaag) || isErnstig(gevaar.morgen)) && styles.gevaarErnstig]}
          rol={gevaar.url ? 'link' : 'button'}
          label={gevaarZin(gevaar)}
          hint={gevaar.url ? `Opens ${gevaar.bron}` : undefined}
          onPress={() => { if (gevaar.url) Linking.openURL(gevaar.url).catch(() => {}); }}
        >
          <Text style={styles.gevaarKop}>Fire danger · {gevaar.district}</Text>
          <View style={styles.gevaarRij}>
            {gevaarDag('Today', gevaar.vandaag)}
            {gevaarDag('Tomorrow', gevaar.morgen)}
          </View>
          {gevaar.bron ? <Text style={styles.gevaarBron}>Source: {gevaar.bron}</Text> : null}
        </Drukbaar>
      ) : null}
      {/* Je plekken naast elkaar, alleen als je er meer dan één hebt. */}
      {extraPlekken.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRij} contentContainerStyle={styles.chips}>
          {[null, ...extraPlekken].map((p) => {
            const aan = p === null ? kijkPlek === null : kijkPlek?.naam === p.naam && kijkPlek.lat === p.lat;
            return (
              <Drukbaar
                key={p ? `${p.naam}-${p.lat}` : 'eigen'}
                style={[styles.plekChip, aan && { backgroundColor: C.accent, borderColor: C.accent }]}
                rol="button"
                geselecteerd={aan}
                label={p ? `Show incidents around ${p.naam}` : 'Show incidents around your own place'}
                onPress={() => { setLaden(true); setKijkPlek(p); }}
              >
                <Text style={[styles.plekChipTekst, aan && { color: '#ffffff' }]} numberOfLines={1}>{p ? p.naam : 'My place'}</Text>
              </Drukbaar>
            );
          })}
        </ScrollView>
      )}
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
        {DIENSTEN.map((d) => (
          <DienstChip
            key={d.key}
            dienst={d}
            aan={inst.lijstDiensten.includes(d.key)}
            onWissel={() => zet('lijstDiensten', wisselDienst(inst.lijstDiensten, d.key))}
          />
        ))}
      </ScrollView>

      {/* Zonder deze regel denk je dat je met de chips ook je meldingen
          uitzet. Zelfde uitleg als in de grote app (1.4.6), alleen zichtbaar
          als je daadwerkelijk iets hebt weggefilterd. */}
      {inst.lijstDiensten.length < DIENSTEN.length && (
        <Text style={styles.filterHint}>
          {PUSH_BESCHIKBAAR
            ? 'This only filters this list. What you get alerts for is set in Settings.'
            : 'This only filters this list.'}
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
        // Kopjes per periode als kop: de koppenrotor van VoiceOver en de
        // koppennavigatie van TalkBack springen er dan van dag naar dag.
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectieKop} accessibilityRole="header">{section.title}</Text>
        )}
        // Drie lege staten, en 'All quiet' alleen als het echt stil is: de
        // eerste keer laden een skelet in de vorm van de lijst, bij een
        // mislukte herlading zonder oude lijst de foutkaart.
        ListEmptyComponent={laden ? <Skelet /> : fout ? (
          <View style={[kaartStijl, styles.leeg]}>
            {/* Selecteerbaar: een foutmelding wil je kunnen doorsturen. */}
            <Text style={styles.leegTitel} accessibilityRole="header" selectable>Could not load incidents</Text>
            <Text style={styles.leegTekst} selectable>Check your connection and try again.</Text>
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

  lijst: { paddingHorizontal: 16, paddingBottom: 24 },
  sectieKop: {
    ...T.sectie, color: C.textSecondary,
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },


  leeg: { padding: 24, alignItems: 'center', marginTop: 12 },
  leegTitel: { ...T.kop, color: C.textPrimary },
  binnen: {
    marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 14, borderCurve: 'continuous',
    borderLeftWidth: 6, backgroundColor: C.accentSoft, gap: 2,
  },
  binnenKop: { ...T.kop, color: C.accentTekst },
  gevaar: {
    marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: C.card, gap: 8,
  },
  gevaarErnstig: { borderWidth: 1.5, borderColor: '#F78100' },
  gevaarKop: { ...T.klein, color: C.textSecondary },
  gevaarRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gevaarDag: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  gevaarNaam: { ...T.rij, color: C.textPrimary },
  gevaarPil: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderCurve: 'continuous' },
  gevaarPilTekst: { ...T.klein, fontWeight: F.weightBold },
  gevaarVerbod: { ...T.klein, color: C.accentTekst, fontWeight: F.weightBold },
  gevaarBron: { ...T.klein, color: C.textMuted },
  plekChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card, maxWidth: 200,
  },
  plekChipTekst: { ...T.klein, color: C.textPrimary, fontWeight: F.weightSemibold },
  binnenTitel: { ...T.rij, color: C.textPrimary },
  binnenActie: { ...T.klein, color: C.textSecondary },
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
