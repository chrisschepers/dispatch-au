/**
 * Kaart, ingezoomd op je eigen plek. Meldingen volgen het kaartbeeld;
 * bij landelijk uitzicht laden en tekenen we geen pins. Geen lagen, geen
 * heli's, geen posten: dit is de kaart voor de vraag "waar is dat?".
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, AccessibilityInfo, useWindowDimensions,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';
import { haalMeldingenPerVenster, type Melding } from '../api';
import { kaartVenster } from '../kaartVenster';
import { vertaalMelding, plaatsRegel, type VertaaldeMelding } from '../vertaal';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { ALLE_DIENSTKEYS } from '../diensten';
import { kaartTerugblikUren } from '../appConfig';
import { kaartStijlVoor, appleKaartVoor } from '../kaartstijl';
import { BrandendIcoon, BotsingIcoon, VlammenIcoon, type BrandendObject } from '../components/IncidentIcoon';

import { T, F, SCHADUW, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useMinderBeweging } from '../thema';
import { Icoon } from '../components/Icoon';
import { Drukbaar } from '../components/Drukbaar';
import { ZwevendVlak, useGlas } from '../components/ZwevendVlak';
import { KAART_BESCHIKBAAR } from '../kaartBeschikbaar';
import type { StapelParams } from '../navigatie';
import { MAX_SMAL } from '../inhoudMaat';
import { groepeer, zoomVan, opEenPlek, type GroepPunt, type KaartGroep } from '../kaartGroepen';
import { opKleur } from '../kleur';

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

/** Landelijk uitzicht: het beeld waarmee de kaart opent als we nog niets weten. */
const NL_REGIO = { latitude: -28, longitude: 140, latitudeDelta: 32, longitudeDelta: 32 };

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
 */
function Pin({ kleur, icoon, groot, vers, vlammen, brandend, botsing }: {
  kleur: string; icoon: string; groot: boolean; vers: boolean;
  vlammen?: 1 | 2 | 3; brandend?: BrandendObject; botsing?: boolean;
}) {
  const styles = useStijlen(maak_styles);
  const maat = vers || groot ? 36 : 28;
  // Symbool in wit of bijna-zwart, wat het best leest op de dienstkleur: wit
  // op het amber van de ambulance haalt maar ~2:1.
  const glyph = opKleur(kleur);
  return (
    <View style={styles.pinWrap}>
      {vers && (
        <View
          style={[styles.halo, {
            backgroundColor: kleur,
            width: maat + 16, height: maat + 16, borderRadius: (maat + 16) / 2,
          }]}
        />
      )}
      <View style={[styles.bol, { backgroundColor: kleur, width: maat, height: maat, borderRadius: maat / 2 }]}>
        {brandend ? (
          <BrandendIcoon object={brandend} maat={Math.round(maat * 0.72)} kleur={glyph} fond={kleur} />
        ) : botsing ? (
          <BotsingIcoon maat={Math.round(maat * 0.72)} kleur={glyph} fond={kleur} />
        ) : vlammen ? (
          <VlammenIcoon vlammen={vlammen} maat={Math.round(maat * 0.68)} kleur={glyph} />
        ) : (
          <MaterialCommunityIcons name={icoon as never} size={Math.round(maat * 0.54)} color={glyph} />
        )}
      </View>
      {/* Wit driehoekje onder de bol: de punt staat op de coördinaat. */}
      <View style={styles.punt} />
    </View>
  );
}

/**
 * Een groepje pins: een bol met het aantal, groter naarmate er meer in
 * zitten. De doorzichtige rand eromheen maakt het tikvlak minstens 44 pt
 * (iOS) of 48 dp (Android), ook voor de kleinste bol.
 */
function GroepBol({ aantal, vulling }: { aantal: number; vulling: string }) {
  const styles = useStijlen(maak_styles);
  const maat = aantal < 10 ? 32 : aantal < 100 ? 38 : 44;
  return (
    <View style={styles.groepVak}>
      <View style={[styles.groep, { width: maat, height: maat, borderRadius: maat / 2, backgroundColor: vulling }]}>
        <Text style={[styles.groepTekst, { color: opKleur(vulling) }]} maxFontSizeMultiplier={1.2}>
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
  const navigation = useNavigation<Nav>();
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
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
  const [start, setStart] = useState<{ lat: number; lon: number } | null>(null);
  // Je eigen buurt staat los van het punt waar de kaart op begint. Kwam je via
  // een melding binnen, dan begint de kaart daar, maar "Mijn buurt" moet je
  // nog steeds naar huis brengen (melding Chris 15-08).
  const [mijnPlek, setMijnPlek] = useState<{ lat: number; lon: number } | null>(null);
  const [regio, setRegio] = useState<Region | null>(null);

  const beeldDelta = 0.45;
  const ingezoomd = regio ? kaartVenster(regio).laden : false;
  const [kaartStatus, setKaartStatus] = useState('');
  const geladenGebied = useRef<{ lat: number; lon: number; radiusKm: number; tijd: number } | null>(null);

  // Mislukt het laden, dan hoort VoiceOver dat ook. Android leest de hint
  // zelf voor (accessibilityLiveRegion); iOS kent geen live regions.
  useEffect(() => {
    if (isIOS && kaartStatus.startsWith('Could not load')) {
      AccessibilityInfo.announceForAccessibility(kaartStatus);
    }
  }, [kaartStatus]);

  // Alleen het huidige kaartbeeld laden. Cleanup voorkomt dat een oud antwoord
  // een nieuw kaartbeeld overschrijft, ook wanneer de gebruiker snel uitzoomt.
  useEffect(() => {
    let geldig = true;
    if (!regio || !ingezoomd) return;
    const beeld = regio;
    const nodig = kaartVenster(beeld).radiusKm;
    const vorig = geladenGebied.current;
    // De buffer bevat ook de randen na een kleine verschuiving. Houd dezelfde
    // markers gemonteerd en haal alleen opnieuw op buiten dit gebied of na 1 min.
    if (vorig) {
      const afstand = Math.hypot((beeld.latitude - vorig.lat) * 111.32,
        (beeld.longitude - vorig.lon) * 111.32 * Math.cos(beeld.latitude * Math.PI / 180));
      if (afstand + nodig <= vorig.radiusKm && Date.now() - vorig.tijd < 60_000) return;
    }
    if (!vorig) setKaartStatus('Loading incidents…');
    const timer = setTimeout(async () => {
      try {
        const ms = await haalMeldingenPerVenster({
          lat: beeld.latitude, lon: beeld.longitude,
          radiusKm: nodig * 1.5,
          disciplines: ALLE_DIENSTKEYS,
          terugblikUren: kaartTerugblikUren(),
          limietPerVenster: 800,
          strikt: true,
        });
        if (!geldig) return;
        geladenGebied.current = { lat: beeld.latitude, lon: beeld.longitude,
          radiusKm: nodig * 1.5, tijd: Date.now() };
        setMeldingen(ms.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon ?? m.lng)));
        setKaartStatus('');
      } catch {
        if (geldig) setKaartStatus('Could not load incidents. Move the map to try again.');
      }
    }, 400);
    return () => { geldig = false; clearTimeout(timer); };
  }, [regio, ingezoomd]);

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

  function naarMij() {
    if (!mijnPlek) return;
    mapRef.current?.animateToRegion(
      { latitude: mijnPlek.lat, longitude: mijnPlek.lon, latitudeDelta: beeldDelta, longitudeDelta: beeldDelta }, duur(350),
    );
    // Kwam je van een melding ver weg, dan staan er pins uit die omgeving.
    // Terug naar huis hoort ook de meldingen van thuis te tonen.

  }

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
  const zoom = regio && ingezoomd ? zoomVan(regio.longitudeDelta, width) : null;
  const puntVan = React.useCallback((m: Melding): GroepPunt => {
    const v = vertaald.get(m.id);
    return {
      id: m.id,
      lat: m.lat as number,
      lon: (m.lon ?? m.lng) as number,
      gewicht: (isVers(m.timestamp) ? 2 : 0) + (v?.groot ? 1 : 0),
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
    const inBeeld = (gs: KaartGroep<Melding>[]) => gs.filter((g) =>
      Math.abs(g.lat - regio.latitude) <= dLat && Math.abs(g.lon - regio.longitude) <= dLon);
    let uit = inBeeld(alleGroepen);
    // Nog te veel voor een vloeiende kaart: tot drie keer 1,5 × zo ruim.
    let afstand = GROEP_AFSTAND;
    for (let i = 0; i < 3 && uit.length > MAX_PINS; i++) {
      afstand *= 1.5;
      uit = inBeeld(groepeer(meldingen, puntVan, zoom, afstand));
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
  // opnieuw getekend worden.
  const pinsSleutel = groepen.map((g) => `${g.sleutel}:${g.leden.length}`).join('|');
  const [herteken, setHerteken] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setHerteken(true);
    const t = setTimeout(() => setHerteken(false), 1200);
    return () => clearTimeout(t);
  }, [pinsSleutel]);

  // Nooit meer een leeg scherm terwijl we op een plek wachten: weten we nog
  // niets, dan opent de kaart op Nederland en zoomt hij in zodra de plek
  // binnen is (het effect gaat via animateToRegion, want initialRegion geldt
  // alleen bij het opbouwen).
  const beginRegio = start
    ? {
      latitude: start.lat, longitude: start.lon,
      latitudeDelta: params.id ? 0.03 : beeldDelta,
      longitudeDelta: params.id ? 0.03 : beeldDelta,
    }
    : NL_REGIO;

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
        // Rustige, getekende ondergrond zonder winkels en wijknamen. Alleen
        // Android tekent hiermee; iOS houdt Apple Maps (zie kaartstijl.ts).
        customMapStyle={kaartStijlVoor(C.donker)}
        {...appleKaartVoor(C.donker)}
      >
        {/* De straalcirkel stond hier tot 18-08. Die hoorde bij een kaart die
            jouw meldingsinstellingen volgde; nu de kaart alles toont, tekende
            hij een grens die nergens meer over gaat (wens Chris). */}
        {groepen.map((g) => {
          const eerste = g.leden[0]!;
          const v = vertaald.get(eerste.id) ?? vertaalMelding(eerste);
          const aantal = g.leden.length;
          const vers = isVers(eerste.timestamp);
          if (aantal === 1) {
            const plaats = plaatsRegel(eerste.location, eerste.city);
            return (
              <Marker
                key={g.sleutel}
                coordinate={{ latitude: g.lat, longitude: g.lon }}
                // De punt van de pin staat op de plek.
                anchor={{ x: 0.5, y: 1 }}
                // Vers boven groot boven groepjes boven de rest.
                zIndex={vers ? 3 : v.groot ? 2 : 0}
                // VoiceOver: een knop, met wat hij doet als hint en alleen de
                // inhoud in het label.
                accessibilityRole="button"
                accessibilityLabel={`${v.titel}${plaats ? ', ' + plaats : ''}`}
                accessibilityHint="Opens the incident"
                // Doorlopend her-tekenen kost bij honderden pins de vloeiendheid
                // van het slepen; alleen de korte puls hieronder staat het toe.
                tracksViewChanges={Platform.OS === 'android' ? herteken : false}
                onPress={() => navigation.navigate('Detail', { melding: eerste })}
              >
                <Pin kleur={v.kleur} icoon={v.kaartIcoon} groot={v.groot} vers={vers} vlammen={v.kaartVlammen} brandend={v.kaartBrandend} botsing={v.kaartBotsing} />
              </Marker>
            );
          }
          // Eén dienst in de groep: zijn kleur. Gemengd: een neutrale bol.
          const kleuren = new Set(g.leden.map((m) => vertaald.get(m.id)?.kleur ?? v.kleur));
          const vulling = kleuren.size === 1 ? v.kleur : C.groepVlak;
          const coords = g.leden.map((m) => ({ latitude: m.lat as number, longitude: (m.lon ?? m.lng) as number }));
          const eenPlek = (zoom ?? 0) >= 16 || opEenPlek(coords.map((c) => ({ lat: c.latitude, lon: c.longitude })));
          return (
            <Marker
              key={g.sleutel}
              coordinate={{ latitude: g.lat, longitude: g.lon }}
              // Een groepje is een bolletje en staat dus gecentreerd.
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={1}
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
                // staan, met ruimte voor de hint bovenin en 'My area' onderin.
                mapRef.current?.fitToCoordinates(coords, {
                  edgePadding: { top: 120, right: 60, bottom: 160, left: 60 },
                  animated: duur(1) > 0,
                });
              }}
            >
              <GroepBol aantal={aantal} vulling={vulling} />
            </Marker>
          );
        })}
      </MapView>
      <KnoppenLaag>
        {(!ingezoomd || kaartStatus) ? (
          <ZwevendVlak
            rond={20}
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={styles.hint}
          >
            <Text style={styles.hintTekst}>{!ingezoomd ? 'Zoom in to see incidents' : kaartStatus}</Text>
          </ZwevendVlak>
        ) : null}
        <MijnPlekKnop aan={!!mijnPlek} onPress={naarMij} />
      </KnoppenLaag>
    </View>
  );
}

/**
 * De laag met de zwevende bediening boven de kaart: de zoomhint bovenaan,
 * 'My area' rechtsonder. iOS: de SafeAreaView van react-native-screens, die
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
  bol: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  punt: {
    width: 0, height: 0, marginTop: -1.5,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff',
  },
  groepVak: {
    minWidth: GROEP_AFSTAND, minHeight: GROEP_AFSTAND,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  groep: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  groepTekst: { fontWeight: F.weightBold, fontSize: 13 },
  // Insets komen als marge op de SafeAreaView (iOS) of als paddingTop (Android);
  // dit is de ruimte daarbinnen. Kinderen staan in de flow, niet absoluut,
  // anders tellen die insets niet mee.
  laag: { padding: 16, paddingTop: 8 },
  hint: { alignSelf: 'center', maxWidth: MAX_SMAL, paddingHorizontal: 14, paddingVertical: 10 },
  hintTekst: { ...T.body, color: C.textPrimary, textAlign: 'center' },
  // marginTop auto: de knop blijft onderin, ook als de hint erboven weg is.
  mijnVlak: { alignSelf: 'flex-end', marginTop: 'auto' },
  mijnKnopIOS: {
    minHeight: 44, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  mijnTekstIOS: { color: C.accentTekst, fontSize: 15, fontWeight: F.weightSemibold },
  // M3 extended FAB: 56 hoog, hoek 16, icoon 24, 12 tussen icoon en label.
  mijnFab: {
    alignSelf: 'flex-end', marginTop: 'auto',
    minHeight: 56, borderRadius: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, boxShadow: SCHADUW.fab,
  },
  // M3 labelLarge.
  mijnTekstFab: { color: C.accentTekst, fontSize: 14, fontWeight: F.weightMedium, letterSpacing: 0.1, lineHeight: 20 },
});
