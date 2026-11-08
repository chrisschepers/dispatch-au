/**
 * Kaart, ingezoomd op je eigen plek. Sinds 08-11 zoals de kaart van de grote
 * app (wens Chris): een filterpil bovenin met een filterblad (periode,
 * diensten, waarschuwingsniveau), een knop Kaartlagen (ondergrond en
 * overheidsvliegtuigen) en wat buiten het filter valt verdwijnt. Standaard
 * staat alleen wat nu loopt erop; een afgelopen melding verliest zijn
 * gekleurde vulling, niet zijn kleur.
 *
 * De hele feed is één verzoek voor heel Australië (api.ts), dus de kaart laadt
 * op elke zoom; groeperen houdt het tekenwerk klein (kaartGroepen.ts).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, AccessibilityInfo, AppState, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';
import { haalFeed, haalMelding, type Melding } from '../api';
import { vertaalMelding, plaatsRegel, type VertaaldeMelding } from '../vertaal';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { DIENSTEN, ALLE_DIENSTKEYS } from '../diensten';
import { kaartStijlVoor, appleKaartVoor } from '../kaartstijl';
import { BrandendIcoon, BotsingIcoon, VlammenIcoon, type BrandendObject } from '../components/IncidentIcoon';
import { opKaart, feedUren, filterActief, periodeVoluit, isAfgelopen } from '../kaartFilter';
import { useKaartKeuze } from '../kaartKeuze';
import { useLuchtBeeld } from '../vliegtuigen';
import { inLagen, zonderSignaal, type Vliegtuig } from '../vliegtuigData';
import { VliegtuigMarker } from '../components/VliegtuigMarker';

import { T, F, SCHADUW, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useMinderBeweging } from '../thema';
import { Icoon } from '../components/Icoon';
import { Drukbaar } from '../components/Drukbaar';
import { ZwevendVlak, useGlas } from '../components/ZwevendVlak';
import { KAART_BESCHIKBAAR } from '../kaartBeschikbaar';
import type { StapelParams } from '../navigatie';
import { MAX_SMAL } from '../inhoudMaat';
import { groepeer, zoomVan, opEenPlek, type GroepPunt, type KaartGroep } from '../kaartGroepen';
import { leesbaar, opKleur } from '../kleur';

/**
 * Pins die op het scherm dichter bij elkaar staan dan dit, worden één groep
 * (zie kaartGroepen.ts). Gelijk aan het kleinste tikvlak van het platform
 * (44 pt HIG, 48 dp M3): twee pins die dichter op elkaar staan, kun je toch
 * niet los aantikken.
 */
const GROEP_AFSTAND = Platform.OS === 'android' ? 48 : 44;
/**
 * Meer pins in beeld dan dit, dan groeperen we ruimer. Op Android lager:
 * daar is elke marker een bitmap die het toestel apart moet tekenen, en op
 * eenvoudige toestellen (en die zijn er op Android nu eenmaal veel) scheelt
 * dat merkbaar.
 */
const MAX_PINS = Platform.OS === 'android' ? 60 : 150;

/**
 * Heel Australië: het beeld waarmee de kaart opent als we nog niets weten, en
 * waar "Show all of Australia" in het filterblad heen gaat.
 */
const AU_REGIO = { latitude: -27.5, longitude: 133.5, latitudeDelta: 36, longitudeDelta: 44 };

/** Zo vaak de feed opnieuw ophalen zolang de kaart in beeld is. */
const VERVERS_MS = 60_000;

type Nav = NativeStackNavigationProp<StapelParams, 'Kaart'>;

/** Tot hoelang na binnenkomst een melding "vers" is en dus opvalt. */
const VERS_MINUTEN = 30;

function isVers(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < VERS_MINUTEN * 60_000;
}

/**
 * Eén melding op de kaart: een bol met het symbool van de dienst en een punt
 * die op de plek wijst. Verse meldingen zijn groter en krijgen een gloed, oude
 * blijven klein — zo zie je in één blik wat er nú speelt (wens Chris 18-08,
 * daarvoor was elke melding hetzelfde stipje van 16 pixels).
 *
 * Afgelopen (08-11, keuze Chris: niet grijs, de achtergrond verdwijnt): de bol
 * in de kaartkleur met een rand en symbool in de dienstkleur. Zo blijft te
 * zien wat het was, maar springt alleen wat nog loopt eruit.
 */
function Pin({ kleur, icoon, groot, vers, afgelopen, vlammen, brandend, botsing }: {
  kleur: string; icoon: string; groot: boolean; vers: boolean; afgelopen: boolean;
  vlammen?: 1 | 2 | 3; brandend?: BrandendObject; botsing?: boolean;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const maat = !afgelopen && (vers || groot) ? 36 : 28;
  const vulling = afgelopen ? C.card : kleur;
  // Symbool in wit of bijna-zwart, wat het best leest op de dienstkleur: wit
  // op het amber van de ambulance haalt maar ~2:1. Op de lege bol de
  // dienstkleur zelf, zo ver verdonkerd dat hij 3:1 haalt (grafisch element).
  const glyph = afgelopen ? leesbaar(kleur, C.card, 3) : opKleur(kleur);
  const rand = afgelopen ? glyph : '#fff';
  return (
    <View style={styles.pinWrap}>
      {vers && !afgelopen && (
        <View
          style={[styles.halo, {
            backgroundColor: kleur,
            width: maat + 16, height: maat + 16, borderRadius: (maat + 16) / 2,
          }]}
        />
      )}
      <View style={[styles.bol, { backgroundColor: vulling, borderColor: rand, width: maat, height: maat, borderRadius: maat / 2 }]}>
        {brandend ? (
          <BrandendIcoon object={brandend} maat={Math.round(maat * 0.72)} kleur={glyph} fond={vulling} />
        ) : botsing ? (
          <BotsingIcoon maat={Math.round(maat * 0.72)} kleur={glyph} fond={vulling} />
        ) : vlammen ? (
          <VlammenIcoon vlammen={vlammen} maat={Math.round(maat * 0.68)} kleur={glyph} />
        ) : (
          <MaterialCommunityIcons name={icoon as never} size={Math.round(maat * 0.54)} color={glyph} />
        )}
      </View>
      {/* Driehoekje onder de bol, in de kleur van de rand: de punt staat op de coördinaat. */}
      <View style={[styles.punt, { borderTopColor: rand }]} />
    </View>
  );
}

/**
 * Een groepje pins: een bol met het aantal, groter naarmate er meer in
 * zitten. De doorzichtige rand eromheen maakt het tikvlak minstens 44 pt
 * (iOS) of 48 dp (Android), ook voor de kleinste bol. Zijn ze allemaal
 * afgelopen, dan net als een losse pin zonder vulling.
 */
function GroepBol({ aantal, vulling, afgelopen }: { aantal: number; vulling: string; afgelopen: boolean }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const maat = aantal < 10 ? 32 : aantal < 100 ? 38 : 44;
  const lijn = afgelopen ? leesbaar(vulling, C.card, 3) : '#fff';
  return (
    <View style={styles.groepVak}>
      <View style={[styles.groep, {
        width: maat, height: maat, borderRadius: maat / 2,
        backgroundColor: afgelopen ? C.card : vulling, borderColor: lijn,
      }]}
      >
        <Text style={[styles.groepTekst, { color: afgelopen ? C.textPrimary : opKleur(vulling) }]} maxFontSizeMultiplier={1.2}>
          {aantal > 99 ? '99+' : aantal}
        </Text>
      </View>
    </View>
  );
}

export default function KaartScreen() {
  // Android zonder Maps-sleutel: uitleg in plaats van een kaart die crasht.
  if (!KAART_BESCHIKBAAR) return <KaartNogNiet />;
  return <KaartMetMeldingen />;
}

function KaartNogNiet() {
  const C = useThema();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg, gap: 10 }}>
      <Icoon naam="kaart" grootte={40} kleur={C.textMuted} />
      <Text style={{ ...T.kop, color: C.textPrimary, textAlign: 'center' }} accessibilityRole="header">
        The map is coming soon on Android
      </Text>
      <Text style={{ ...T.body, color: C.textSecondary, textAlign: 'center' }}>
        You can already see every incident near you in the Nearby list.
      </Text>
    </View>
  );
}

function KaartMetMeldingen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const { inst } = useInstellingen();
  const keuze = useKaartKeuze();
  const navigation = useNavigation<Nav>();
  // Alleen ophalen en verversen zolang de kaart echt in beeld is: niet onder
  // Detail of een blad, en niet in een ander tabblad.
  const inBeeld = useIsFocused();
  const { width } = useWindowDimensions();
  // Bovenrand op Android, voor de knoppenlaag en de kaartpadding. Uit
  // safe-area-context en niet de SafeAreaView van react-native-screens: op
  // Android mag die maar één keer per tabblad (zie androidLaag in
  // navigatie.tsx).
  const insets = useSafeAreaInsets();
  // Camerabewegingen volgen "Verminder beweging": dan springt de kaart
  // meteen naar het nieuwe beeld (duur 0) in plaats van te vliegen. Via een
  // ref, zodat het plek-effect hieronder niet opnieuw hoeft te draaien.
  const minderBeweging = useMinderBeweging();
  const minderBewegingRef = useRef(minderBeweging);
  minderBewegingRef.current = minderBeweging;
  const duur = (ms: number) => (minderBewegingRef.current ? 0 : ms);
  // Android: het kompas onder de statusbalk in plaats van erachter. iOS houdt
  // het kompas zelf binnen zijn veilige zone. Vast object per inset, zodat de
  // kaart niet bij elke render een nieuwe padding krijgt.
  const kaartPadding = React.useMemo(
    () => (isIOS ? undefined : { top: insets.top, right: 0, bottom: 0, left: 0 }),
    [insets.top],
  );
  // Vanuit een melding gekomen? Dan daarop inzoomen in plaats van op de buurt.
  const params = useRoute<RouteProp<StapelParams, 'Kaart'>>().params ?? {};
  const mapRef = useRef<MapView>(null);
  /** De hele feed (alles wat loopt plus het venster); het filter komt hieronder. */
  const [alle, setAlle] = useState<Melding[]>([]);
  const [laden, setLaden] = useState(true);
  const [start, setStart] = useState<{ lat: number; lon: number } | null>(null);
  // Je eigen buurt staat los van het punt waar de kaart op begint. Kwam je via
  // een melding binnen, dan begint de kaart daar, maar "Mijn buurt" moet je
  // nog steeds naar huis brengen (melding Chris 15-08).
  const [mijnPlek, setMijnPlek] = useState<{ lat: number; lon: number } | null>(null);
  const [regio, setRegio] = useState<Region | null>(null);
  // De melding waar je vandaan komt (Detail → kaart) staat er altijd op, ook
  // als hij buiten het filter valt of al lang is afgelopen: anders zoomt de
  // kaart in op een lege plek.
  const [focus, setFocus] = useState<Melding | null>(null);

  const beeldDelta = 0.45;
  const [kaartStatus, setKaartStatus] = useState('');
  const uren = feedUren(keuze.periode);

  // Mislukt het laden, dan hoort VoiceOver dat ook. Android leest de hint
  // zelf voor (accessibilityLiveRegion); iOS kent geen live regions.
  useEffect(() => {
    if (isIOS && kaartStatus.startsWith('Could not load')) {
      AccessibilityInfo.announceForAccessibility(kaartStatus);
    }
  }, [kaartStatus]);

  // De feed is één verzoek voor heel Australië (30 s bewaard in api.ts). Bij
  // binnenkomst, elke minuut zolang de kaart in beeld is, en terug uit de
  // achtergrond. Cleanup voorkomt dat een oud antwoord (ander venster) een
  // nieuw overschrijft.
  useEffect(() => {
    if (!inBeeld) return;
    let geldig = true;
    const haal = async () => {
      try {
        const { meldingen } = await haalFeed(uren);
        if (!geldig) return;
        setAlle(meldingen.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon ?? m.lng)));
        setKaartStatus('');
      } catch {
        if (geldig) setKaartStatus('Could not load incidents. Trying again in a minute.');
      } finally {
        if (geldig) setLaden(false);
      }
    };
    void haal();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void haal(); }, VERVERS_MS);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void haal(); });
    return () => { geldig = false; clearInterval(timer); sub.remove(); };
  }, [inBeeld, uren]);

  useEffect(() => {
    let levend = true;
    if (!params.id) { setFocus(null); return; }
    haalMelding(params.id)
      .then((m) => { if (levend) setFocus(m); })
      .catch(() => { if (levend) setFocus(null); });
    return () => { levend = false; };
  }, [params.id]);

  useEffect(() => {
    let levend = true;
    (async () => {
      // Kom je vanuit een melding, dan weten we de plek al: meteen tekenen.
      // Anders eerst wat we zónder wachten weten (handmatige plaats of de
      // laatst bekende plek). De kaart stond hiervoor te wachten op een verse
      // GPS-fix en bleef daardoor seconden leeg — op een eenvoudige Android
      // het verschil tussen "traag" en "meteen open" (melding Chris 18-08).
      const vanMelding = params.lat != null && params.lon != null
        ? { lat: params.lat, lon: params.lon }
        : null;
      const snel = await bepaalPlekSnel(inst);
      if (!levend) return;
      if (snel && snel.bron !== 'buiten-au') setMijnPlek({ lat: snel.lat, lon: snel.lon });
      const eersteBeeld = vanMelding ?? (snel ? { lat: snel.lat, lon: snel.lon } : null);
      if (eersteBeeld) {
        setStart(eersteBeeld);
        const beeld = { latitude: eersteBeeld.lat, longitude: eersteBeeld.lon,
          latitudeDelta: params.id ? 0.03 : beeldDelta, longitudeDelta: params.id ? 0.03 : beeldDelta };
        setRegio(beeld);
        mapRef.current?.animateToRegion(beeld, duur(350));
      }

      // En dan pas de verse fix. Alleen bijstellen als het echt iets uitmaakt:
      // een paar honderd meter verschil is geen reden om de kaart te verzetten
      // of alles opnieuw op te halen.
      const eigen = await bepaalPlek(inst);
      if (!levend) return;
      setMijnPlek(eigen.bron === 'buiten-au' ? null : { lat: eigen.lat, lon: eigen.lon });
      const verschoven = !snel
        || Math.abs(eigen.lat - snel.lat) > 0.02
        || Math.abs(eigen.lon - snel.lon) > 0.03;
      if (!eersteBeeld) {
        // De kaart staat dan op het landelijke beeld: inzoomen op de plek.
        setStart({ lat: eigen.lat, lon: eigen.lon });
        mapRef.current?.animateToRegion({
          latitude: eigen.lat, longitude: eigen.lon,
          latitudeDelta: beeldDelta, longitudeDelta: beeldDelta,
        }, duur(450));

      } else if (!vanMelding && verschoven) {
        mapRef.current?.animateToRegion({
          latitude: eigen.lat, longitude: eigen.lon,
          latitudeDelta: beeldDelta, longitudeDelta: beeldDelta,
        }, duur(350));

      }
    })();
    return () => { levend = false; };
    // params.t: ook opnieuw inzoomen als je vanuit Detail twee keer dezelfde
    // plek opent (de kaart kan intussen verschoven zijn).
  }, [inst.handLat, inst.handLon, inst.volgLocatie, params.lat, params.lon, params.t]);

  // "Show all of Australia" in het filterblad (een volgnummer, zodat het
  // ook een tweede keer werkt).
  useEffect(() => {
    if (!params.overzicht) return;
    mapRef.current?.animateToRegion(AU_REGIO, duur(500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.overzicht]);

  function naarMij() {
    if (!mijnPlek) return;
    mapRef.current?.animateToRegion(
      { latitude: mijnPlek.lat, longitude: mijnPlek.lon, latitudeDelta: beeldDelta, longitudeDelta: beeldDelta }, duur(350),
    );
  }

  /**
   * Wat op de kaart komt: het filter uit het filterblad (kaartFilter.ts). Wat
   * erbuiten valt verdwijnt (keuze Chris 08-11); alleen de melding waar je
   * vandaan komt blijft altijd staan.
   */
  const meldingen = React.useMemo(() => {
    const nu = Date.now();
    const uit = alle.filter((m) => m.id === params.id || opKaart(m, keuze, nu));
    if (focus && Number.isFinite(focus.lat) && !uit.some((m) => m.id === focus.id)) uit.push(focus);
    return uit;
  }, [alle, keuze, params.id, focus]);

  // Geen enkele melding weglaten (keuze Chris 16-08), maar honderden losse
  // pins leggen de kaart plat — de app bevroor (16-08). Daarom groeperen we
  // wat op het scherm te dicht op elkaar staat om los aan te tikken: één
  // bolletje met een aantal, dat bij inzoomen weer uit elkaar valt. Er
  // verdwijnt niets, je ziet het alleen samengevat tot het zin heeft ze los
  // te tekenen.
  //
  // Eén keer per melding vertalen: groeperen en tekenen hebben allebei de
  // kleur en de grootte nodig.
  const vertaald = React.useMemo(() => {
    const per = new Map<string, VertaaldeMelding>();
    for (const m of meldingen) per.set(m.id, vertaalMelding(m));
    return per;
  }, [meldingen]);
  // Zoom op halve stappen: slepen laat hem gelijk, dus groeperen gebeurt
  // alleen bij zoomen of nieuwe meldingen.
  const zoom = regio ? zoomVan(regio.longitudeDelta, width) : null;
  const puntVan = React.useCallback((m: Melding): GroepPunt => {
    const v = vertaald.get(m.id);
    // Wat nog loopt wint: dat wordt het middelpunt van een groep, niet een
    // brand van gisteren.
    const loopt = v ? !v.afgelopen : true;
    return {
      id: m.id,
      lat: m.lat as number,
      lon: (m.lon ?? m.lng) as number,
      gewicht: (loopt ? 4 : 0) + (loopt && isVers(m.timestamp) ? 2 : 0) + (v?.groot ? 1 : 0),
      tijd: Date.parse(m.timestamp),
    };
  }, [vertaald]);
  const alleGroepen = React.useMemo(
    () => (zoom == null ? [] : groepeer(meldingen, puntVan, zoom, GROEP_AFSTAND)),
    [meldingen, puntVan, zoom],
  );

  /** De groepen in beeld (met wat marge), zo nodig ruimer gegroepeerd. */
  const groepen = React.useMemo(() => {
    if (!regio || zoom == null) return [];
    const marge = 1.15;
    const dLat = (regio.latitudeDelta / 2) * marge;
    const dLon = (regio.longitudeDelta / 2) * marge;
    const inBeeldVak = (gs: KaartGroep<Melding>[]) => gs.filter((g) =>
      Math.abs(g.lat - regio.latitude) <= dLat && Math.abs(g.lon - regio.longitude) <= dLon);
    let uit = inBeeldVak(alleGroepen);
    // Nog te veel voor een vloeiende kaart: tot drie keer 1,5 × zo ruim.
    let afstand = GROEP_AFSTAND;
    for (let i = 0; i < 3 && uit.length > MAX_PINS; i++) {
      afstand *= 1.5;
      uit = inBeeldVak(groepeer(meldingen, puntVan, zoom, afstand));
    }
    return uit;
  }, [alleGroepen, meldingen, puntVan, regio, zoom]);

  // Android tekent een marker als bitmap en bevriest die daarna. Met een kale
  // stip ging dat goed, maar deze pins bevatten een icoonfont en die is soms
  // nét niet klaar op het moment van de opname: lege pins. Daarom na elke
  // wijziging van de pinnenset kort blijven her-tekenen en het dan weer
  // uitzetten (les uit de kaart-overhaul van de grote app). Sleutelen op de
  // ID-set, niet op de meldingenlijst: die krijgt bij elke verversing een
  // nieuwe identiteit en dan knippert de kaart continu. Het aantal hoort
  // erbij: een groep met dezelfde sleutel maar een ander getal moet ook
  // opnieuw getekend worden, en een melding die net afliep ook (andere vulling).
  const pinsSleutel = groepen
    .map((g) => `${g.sleutel}:${g.leden.length}:${g.leden.every((m) => vertaald.get(m.id)?.afgelopen) ? 'a' : ''}`)
    .join('|');
  const [herteken, setHerteken] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setHerteken(true);
    const t = setTimeout(() => setHerteken(false), 1200);
    return () => clearTimeout(t);
  }, [pinsSleutel]);

  // Overheidsvliegtuigen (08-11): alleen ophalen als er een luchtlaag aan staat
  // en de kaart in beeld is (vliegtuigen.ts).
  const luchtAan = Object.values(keuze.lucht).some(Boolean);
  const luchtBeeld = useLuchtBeeld(luchtAan && inBeeld);
  const toestellen = React.useMemo(
    () => (luchtAan && luchtBeeld ? inLagen(luchtBeeld.vliegtuigen, keuze.lucht) : []),
    [luchtAan, luchtBeeld, keuze.lucht],
  );
  const stilVan = React.useMemo(
    () => new Map(toestellen.map((v) => [v.hex, zonderSignaal(v)])),
    // luchtBeeld: elke verversing opnieuw rekenen, ook als de posities gelijk bleven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toestellen, luchtBeeld],
  );
  // Zelfde puls als de pins: Android tekent het toestel opnieuw na een
  // nieuwe positie, koers of signaalstand.
  const luchtSleutel = toestellen.map((v) => `${v.hex}:${v.lat}:${v.lon}:${v.track}:${stilVan.get(v.hex) ? 's' : ''}`).join('|');
  const [luchtHerteken, setLuchtHerteken] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setLuchtHerteken(true);
    const t = setTimeout(() => setLuchtHerteken(false), 1200);
    return () => clearTimeout(t);
  }, [luchtSleutel]);
  const openToestel = React.useCallback(
    (v: Vliegtuig) => navigation.navigate('Vliegtuig', { vliegtuig: v }),
    [navigation],
  );

  // Nooit meer een leeg scherm terwijl we op een plek wachten: weten we nog
  // niets, dan opent de kaart op heel Australië en zoomt hij in zodra de plek
  // binnen is (het effect gaat via animateToRegion, want initialRegion geldt
  // alleen bij het opbouwen).
  const beginRegio = start
    ? {
      latitude: start.lat, longitude: start.lon,
      latitudeDelta: params.id ? 0.03 : beeldDelta,
      longitudeDelta: params.id ? 0.03 : beeldDelta,
    }
    : AU_REGIO;

  // De filterpil: wat er aan staat, in woorden, met het aantal op de kaart.
  const actief = filterActief(keuze, ALLE_DIENSTKEYS);
  const dienstTekst = keuze.diensten.length >= DIENSTEN.length
    ? 'All services'
    : keuze.diensten.length <= 2
      ? DIENSTEN.filter((d) => keuze.diensten.includes(d.key)).map((d) => d.label).join(', ')
      : `${keuze.diensten.length} services`;
  const samenvatting = [
    periodeVoluit(keuze.periode),
    dienstTekst,
    keuze.niveau === 'watch' ? 'Watch and Act+' : keuze.niveau === 'emergency' ? 'Emergency Warnings' : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={beginRegio}
        onRegionChangeComplete={setRegio}
        showsUserLocation={inst.volgLocatie}
        // Android: geen eigen mijn-plekknop van Google. Die verschijnt alleen
        // als showsUserLocation aan staat, en precies dan brengt 'My area' je
        // al naar je GPS-plek: twee knoppen voor hetzelfde.
        showsMyLocationButton={false}
        mapPadding={kaartPadding}
        toolbarEnabled={false}
        // iOS: Apple Maps met het plaatsenfilter en het thema van de app
        // (kaartstijl.ts). Eerst, zodat de kaartsoort hieronder wint.
        {...appleKaartVoor(C.donker)}
        // Standard of Satellite (blad Kaartlagen). Standard is op iOS Apples
        // gedempte ondergrond; satelliet is hybride, met straatnamen.
        mapType={keuze.kaartType === 'hybrid' ? 'hybrid' : isIOS ? 'mutedStandard' : 'standard'}
        // Rustige, getekende ondergrond zonder winkels en wijknamen. Alleen
        // Android tekent hiermee, en niet over de satellietfoto.
        customMapStyle={keuze.kaartType === 'standard' ? kaartStijlVoor(C.donker) : undefined}
      >
        {/* De straalcirkel stond hier tot 18-08. Die hoorde bij een kaart die
            jouw meldingsinstellingen volgde; nu de kaart alles toont, tekende
            hij een grens die nergens meer over gaat (wens Chris). */}
        {groepen.map((g) => {
          const eerste = g.leden[0]!;
          const v = vertaald.get(eerste.id) ?? vertaalMelding(eerste);
          const aantal = g.leden.length;
          const vers = !v.afgelopen && isVers(eerste.timestamp);
          if (aantal === 1) {
            const plaats = plaatsRegel(eerste.location, eerste.city);
            return (
              <Marker
                key={g.sleutel}
                coordinate={{ latitude: g.lat, longitude: g.lon }}
                // De punt van de pin staat op de plek.
                anchor={{ x: 0.5, y: 1 }}
                // Vers boven groot boven wat loopt en groepjes, afgelopen onderop.
                zIndex={vers ? 3 : v.groot ? 2 : v.afgelopen ? 0 : 1}
                // VoiceOver: een knop, met wat hij doet als hint en alleen de
                // inhoud in het label.
                accessibilityRole="button"
                accessibilityLabel={`${v.titel}${plaats ? ', ' + plaats : ''}${v.afgelopen ? ', ended' : ''}`}
                accessibilityHint="Opens the incident"
                // Doorlopend her-tekenen kost bij honderden pins de vloeiendheid
                // van het slepen; alleen de korte puls hieronder staat het toe.
                tracksViewChanges={Platform.OS === 'android' ? herteken : false}
                onPress={() => navigation.navigate('Detail', { melding: eerste })}
              >
                <Pin
                  kleur={v.kleur} icoon={v.kaartIcoon} groot={v.groot} vers={vers} afgelopen={v.afgelopen}
                  vlammen={v.kaartVlammen} brandend={v.kaartBrandend} botsing={v.kaartBotsing}
                />
              </Marker>
            );
          }
          // Eén dienst in de groep: zijn kleur. Gemengd: een neutrale bol.
          const kleuren = new Set(g.leden.map((m) => vertaald.get(m.id)?.kleur ?? v.kleur));
          const vulling = kleuren.size === 1 ? v.kleur : C.groepVlak;
          const allesAf = g.leden.every((m) => vertaald.get(m.id)?.afgelopen ?? isAfgelopen(m));
          const coords = g.leden.map((m) => ({ latitude: m.lat as number, longitude: (m.lon ?? m.lng) as number }));
          const eenPlek = (zoom ?? 0) >= 16 || opEenPlek(coords.map((c) => ({ lat: c.latitude, lon: c.longitude })));
          return (
            <Marker
              key={g.sleutel}
              coordinate={{ latitude: g.lat, longitude: g.lon }}
              // Een groepje is een bolletje en staat dus gecentreerd.
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={allesAf ? 0 : 1}
              accessibilityRole="button"
              accessibilityLabel={eenPlek ? `${aantal} incidents here` : `${aantal} incidents`}
              accessibilityHint={eenPlek ? 'Lists the incidents here' : 'Zooms in'}
              tracksViewChanges={Platform.OS === 'android' ? herteken : false}
              onPress={() => {
                if (eenPlek) {
                  // Inzoomen maakt ze niet los (één coördinaat, of al zo
                  // ver ingezoomd als zinnig is): dan een blad met de lijst.
                  navigation.navigate('Groep', { leden: g.leden });
                  return;
                }
                // Groepje: precies zo ver inzoomen dat alle leden in beeld
                // staan, met ruimte voor de filterpil bovenin en 'My area' onderin.
                mapRef.current?.fitToCoordinates(coords, {
                  edgePadding: { top: 120, right: 60, bottom: 160, left: 60 },
                  animated: duur(1) > 0,
                });
              }}
            >
              <GroepBol aantal={aantal} vulling={vulling} afgelopen={allesAf} />
            </Marker>
          );
        })}
        {toestellen.map((v) => (
          <VliegtuigMarker
            key={`lucht-${v.hex}`}
            v={v}
            stil={stilVan.get(v.hex) ?? false}
            tracksViewChanges={Platform.OS === 'android' ? luchtHerteken : false}
            onPress={openToestel}
          />
        ))}
      </MapView>
      <KnoppenLaag>
        <FilterPil
          tekst={samenvatting}
          aantal={meldingen.length}
          laden={laden}
          actief={actief}
          onPress={() => navigation.navigate('KaartFilters')}
        />
        {kaartStatus ? (
          <ZwevendVlak
            rond={20}
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={styles.hint}
          >
            <Text style={styles.hintTekst}>{kaartStatus}</Text>
          </ZwevendVlak>
        ) : null}
        <View style={styles.knoppenRechts} pointerEvents="box-none">
          <LagenKnop aan={luchtAan || keuze.kaartType === 'hybrid'} onPress={() => navigation.navigate('KaartLagen')} />
          <MijnPlekKnop aan={!!mijnPlek} onPress={naarMij} />
        </View>
      </KnoppenLaag>
    </View>
  );
}

/**
 * Bovenin: wat de kaart toont, in één regel, met het aantal meldingen erop.
 * Tik = het filterblad. Een rand in het accent zolang het filter afwijkt van
 * de standaard (alles wat loopt, alle diensten), zoals in de grote app.
 *
 * iOS: glas, zoals de knoppen in Apple Kaarten. Android: een M3-oppervlak met
 * de vorm van een zoekbalk (hoek 28, niveau 3).
 */
function FilterPil({ tekst, aantal, laden, actief, onPress }: {
  tekst: string; aantal: number; laden: boolean; actief: boolean; onPress: () => void;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const glas = useGlas();
  const label = `Filters: ${tekst}. ${laden ? 'Loading' : `${aantal} ${aantal === 1 ? 'incident' : 'incidents'} on the map`}`;
  const inhoud = (
    <>
      <Icoon naam="filter" grootte={18} kleur={actief ? C.accentTekst : C.textSecondary} />
      <Text style={styles.pilTekst} numberOfLines={1}>{tekst}</Text>
      <View style={styles.pilTeller}>
        {laden
          ? <ActivityIndicator size="small" color={C.textSecondary} />
          : <Text style={styles.pilTellerTekst}>{aantal}</Text>}
      </View>
    </>
  );
  if (isIOS) {
    return (
      <ZwevendVlak interactief rond={22} style={[styles.pilVlak, actief && styles.pilActief]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.pil, pressed && !glas ? { opacity: 0.6 } : null]}
        >
          {inhoud}
        </Pressable>
      </ZwevendVlak>
    );
  }
  return (
    <Drukbaar onPress={onPress} label={label} style={[styles.pil, styles.pilAndroid, actief && styles.pilActief]}>
      {inhoud}
    </Drukbaar>
  );
}

/**
 * Kaartlagen, boven 'My area'. Gevuld in het accent als er een laag of de
 * satelliet aan staat: dan zie je ook dicht dat er iets extra's op de kaart
 * ligt.
 */
function LagenKnop({ aan, onPress }: { aan: boolean; onPress: () => void }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const glas = useGlas();
  if (isIOS) {
    return (
      <ZwevendVlak interactief rond={22} style={styles.lagenVlak}>
        <Pressable
          onPress={onPress}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Map layers"
          style={({ pressed }) => [styles.lagenKnopIOS, pressed && !glas ? { opacity: 0.6 } : null]}
        >
          <Icoon naam="lagen" grootte={20} kleur={aan ? C.accentTekst : C.textPrimary} />
        </Pressable>
      </ZwevendVlak>
    );
  }
  // M3: een kleine FAB (40 dp, hoek 12) in de oppervlakvariant, 48 dp te raken.
  return (
    <Drukbaar onPress={onPress} label="Map layers" style={styles.lagenFab}>
      <Icoon naam="lagen" grootte={24} kleur={aan ? C.accentTekst : C.textPrimary} />
    </Drukbaar>
  );
}

/**
 * De laag met de zwevende bediening boven de kaart: de filterpil (en zo
 * nodig een melding) bovenaan, Kaartlagen en 'My area' rechtsonder. iOS: de SafeAreaView van react-native-screens, die
 * de statusbalk (of het Dynamic Island) en de tabbalk met de thuisbalk als
 * marge meerekent. Android: een gewone View met de bovenrand uit
 * safe-area-context, want androidLaag houdt de navigatiebalk onderin al vrij
 * (en een tweede SafeAreaView van screens in dit tabblad zou zijn inzetten
 * overnemen).
 */
function KnoppenLaag({ children }: { children: React.ReactNode }) {
  const styles = useStijlen(maak_styles);
  const insets = useSafeAreaInsets();
  return isIOS ? (
    <SafeAreaView
      edges={{ top: true, bottom: true }}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.laag]}
    >
      {children}
    </SafeAreaView>
  ) : (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.laag, { paddingTop: insets.top + 8 }]}>
      {children}
    </View>
  );
}

/**
 * 'My area' brengt de kaart terug naar je eigen buurt. Uitgeschakeld zolang
 * we die plek nog niet weten (of als je buiten Australië bent).
 *
 * iOS: een knop van glas, zoals de knoppen in Apple Kaarten. Interactief
 * glas reageert zelf op de vinger; alleen op blur of het dichte vlak dimt de
 * inhoud tijdens het indrukken.
 *
 * Android: een uitgebreide M3-FAB in de oppervlakvariant (surface FAB): het
 * kaartvlak met het accent voor icoon en label, in plaats van de standaard
 * primaryContainer. Zo staat er geen tweede gekleurde vlek naast de pins.
 */
function MijnPlekKnop({ aan, onPress }: { aan: boolean; onPress: () => void }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const glas = useGlas();

  if (isIOS) {
    return (
      <ZwevendVlak interactief={aan} rond={22} style={styles.mijnVlak}>
        <Pressable
          onPress={onPress}
          disabled={!aan}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Show my area"
          accessibilityState={{ disabled: !aan }}
          style={({ pressed }) => [
            styles.mijnKnopIOS,
            // Vaste dekking op de inhoud, niet op het glas (dat mag nooit).
            !aan ? { opacity: 0.4 } : pressed && !glas ? { opacity: 0.6 } : null,
          ]}
        >
          <Icoon naam="mijnPlek" grootte={17} kleur={C.accentTekst} />
          <Text style={styles.mijnTekstIOS} maxFontSizeMultiplier={1.5}>My area</Text>
        </Pressable>
      </ZwevendVlak>
    );
  }

  return (
    <Drukbaar onPress={onPress} disabled={!aan} label="Show my area" style={styles.mijnFab}>
      <Icoon naam="mijnPlek" grootte={24} kleur={C.accentTekst} />
      <Text style={styles.mijnTekstFab}>My area</Text>
    </Drukbaar>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  // Minstens het tikvlak van het platform. Alleen boven en opzij ruimte, zodat
  // de punt onderaan op de plek blijft (anchor y: 1); flex-end houdt de bol
  // onderin als de pin kleiner is dan het vak. De bovenruimte van 8 is ook
  // waar de gloed van een verse pin in valt, zodat Android die niet afknipt
  // in de bitmap van de marker.
  pinWrap: {
    alignItems: 'center', justifyContent: 'flex-end',
    minWidth: 44, minHeight: GROEP_AFSTAND, paddingHorizontal: 8, paddingTop: 8,
  },
  // top 0 valt binnen de bovenruimte: de gloed (bol + 16) staat zo gecentreerd
  // om de bol, die op 8 begint.
  halo: { position: 'absolute', top: 0, opacity: 0.22 },
  // De randkleur komt per pin (wit, of de dienstkleur als hij is afgelopen).
  bol: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  punt: {
    width: 0, height: 0, marginTop: -1.5,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  groepVak: {
    minWidth: GROEP_AFSTAND, minHeight: GROEP_AFSTAND,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  groep: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  groepTekst: { fontWeight: F.weightBold, fontSize: 13 },
  // Insets komen als marge op de SafeAreaView (iOS) of als paddingTop (Android);
  // dit is de ruimte daarbinnen. Kinderen staan in de flow, niet absoluut,
  // anders tellen die insets niet mee.
  laag: { padding: 16, paddingTop: 8 },
  hint: { alignSelf: 'center', maxWidth: MAX_SMAL, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  hintTekst: { ...T.body, color: C.textPrimary, textAlign: 'center' },
  // Filterpil: zo breed als de tekst, nooit breder dan de smalle kolom.
  pilVlak: { alignSelf: 'center', maxWidth: MAX_SMAL },
  pil: {
    minHeight: isIOS ? 44 : 48, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: isIOS ? 14 : 16, paddingRight: 8,
  },
  // M3: een oppervlak in de vorm van een zoekbalk (hoek 28) op niveau 3.
  pilAndroid: {
    alignSelf: 'center', maxWidth: MAX_SMAL, borderRadius: 28,
    backgroundColor: C.card, boxShadow: SCHADUW.fab,
  },
  // Rand in het accent zolang het filter afwijkt (ook op glas, zoals in de grote app).
  pilActief: { borderWidth: 1.5, borderColor: C.accent },
  pilTekst: isIOS
    ? { flexShrink: 1, fontSize: 15, fontWeight: F.weightSemibold, color: C.textPrimary }
    // M3 labelLarge.
    : { flexShrink: 1, fontSize: 14, fontWeight: F.weightMedium, letterSpacing: 0.1, color: C.textPrimary },
  pilTeller: {
    minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.chipBg,
  },
  pilTellerTekst: { fontSize: 13, fontWeight: F.weightSemibold, color: C.textSecondary, fontVariant: ['tabular-nums'] },
  // marginTop auto: de knoppen blijven onderin, met of zonder melding erboven.
  knoppenRechts: { marginTop: 'auto', alignItems: 'flex-end', gap: 12 },
  lagenVlak: { alignSelf: 'flex-end' },
  lagenKnopIOS: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // M3-FAB in de oppervlakvariant, net als 'My area' eronder: 56, hoek 16.
  lagenFab: {
    width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, boxShadow: SCHADUW.fab,
  },
  mijnVlak: { alignSelf: 'flex-end' },
  mijnKnopIOS: {
    minHeight: 44, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  mijnTekstIOS: { color: C.accentTekst, fontSize: 15, fontWeight: F.weightSemibold },
  // M3 extended FAB: 56 hoog, hoek 16, icoon 24, 12 tussen icoon en label.
  mijnFab: {
    alignSelf: 'flex-end',
    minHeight: 56, borderRadius: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, boxShadow: SCHADUW.fab,
  },
  // M3 labelLarge.
  mijnTekstFab: { color: C.accentTekst, fontSize: 14, fontWeight: F.weightMedium, letterSpacing: 0.1, lineHeight: 20 },
});
