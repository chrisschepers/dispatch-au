/**
 * Instellingen in de stijl van iOS-instellingen: gegroepeerde kaarten, per
 * groep een kopje. Het locatiepatroon volgt wat Chris koos (15-08): "Huidige
 * locatie" aan = live volgen; uit = de rij "Handmatige locatie" verschijnt.
 *
 * Op Android Material 3-lijstitems (keuze eigenaar, alleen Android): geen
 * gekleurde tegeltjes maar 24 dp-iconen, rijen die zelf hun schakelaar
 * omzetten, "Theme" als keuzerondjes en kopjes in de accentkleur. iOS houdt
 * de tegeltjes van iOS-instellingen.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Linking, Platform, Alert, Share, ToastAndroid, PlatformColor, Keyboard,
  type ColorValue,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useInstellingen } from '../instellingen';
import { vraagLocatiePermissie } from '../locatie';
import {
  registreerVoorPushMetInstellingen, huidigeGebruiker, werkPushFilterBij, zorgVoorGebruiker,
} from '../push';
import { PUSH_BESCHIKBAAR } from '../pushBeschikbaar';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import {
  DIENSTEN, wisselDienst, straalVoor, straalTekst, MAX_STRAAL_KM, LANDELIJK_KM, LANDELIJK_MOGELIJK,
  type Dienst,
} from '../diensten';
import { StraalSchuif } from '../components/StraalSchuif';
import { Drukbaar } from '../components/Drukbaar';
import { PlaatsZoeker } from '../components/PlaatsZoeker';
import { Schakelaar } from '../components/Schakelaar';
import { Icoon, DienstIcoon } from '../components/Icoon';
import type { IcoonNaam } from '../iconen';
import { openRecensiePagina } from '../recensie';
import { useAbonnement } from '../abonnement';
import { BRONNEN } from '../bronnen';
import { tikSchakel } from '../trilling';
import { useInhoudMaat } from '../inhoudMaat';
import { leesbaar } from '../kleur';

const SITE = 'https://emergenciesnearme.online';
const CONTACT = {
  ontwikkelaar: 'Chris Schepers',
  email: 'chrisschepers22@gmail.com',
} as const;

// Versie ÉN buildnummer: bij een testersmelding wil je precies weten welke
// build iemand draait. Uit expo-application (de écht geïnstalleerde build),
// met de bundelversie als terugval — op 26-08 kostte het een dag zoeken naar
// een traagheid die al gefixt was, omdat niemand kon zien wie wat draaide.
const VERSIE = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('expo-application');
    const v = app.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
    return app.nativeBuildVersion ? `${v} (${app.nativeBuildVersion})` : String(v);
  } catch {
    return String(Constants.expoConfig?.version ?? '1.0.0');
  }
})();

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

/**
 * Tegelkleur uit de iOS-systeemkleuren: die passen zich aan licht, donker en
 * verhoogd contrast aan, net als de tegeltjes in iOS-instellingen. Android
 * tekent bij deze rijen geen tegeltje, dus daar doet de kleur niets.
 */
const systeemKleur = (naam: string): ColorValue => (isIOS ? PlatformColor(naam) : 'transparent');

export default function InstellingenScreen() {
  const C = useThema();
  const abonnement = useAbonnement();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const { inst, zet, zetVeel } = useInstellingen();
  const navigation = useNavigation<Nav>();
  // Op een breed scherm een kolom in het midden in plaats van rand tot rand.
  const { marge, kolom } = useInhoudMaat();

  /**
   * Mail met de supportgegevens er al in. Het gebruikers-id is het enige
   * waarmee een melding in de database terug te vinden is; vraag je dat
   * achteraf, dan moet de gebruiker eerst uitzoeken waar het staat.
   */
  async function mailSupport() {
    const userId = await huidigeGebruiker();
    const body = [
      'Write your question or report below.',
      '',
      '',
      '--- details for support, please keep ---',
      `User: ${userId ?? 'not registered yet'}`,
      `App: Emergencies Near Me ${VERSIE}`,
      `Device: ${Platform.OS} ${Platform.Version}`,
    ].join('\n');
    const url = `mailto:${CONTACT.email}`
      + `?subject=${encodeURIComponent('Emergencies Near Me')}`
      + `&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      // Geen mailapp is geen fout om weg te tikken: op Android een toast die
      // vanzelf verdwijnt. De meldingen die er wel toe doen (zie hieronder)
      // blijven Alert, op Android een AppCompat-dialoog.
      if (isIOS) Alert.alert('No mail app', `Send your message to ${CONTACT.email}.`);
      else ToastAndroid.show(`No mail app. Send your message to ${CONTACT.email}.`, ToastAndroid.LONG);
    }
  }

  async function toggleVolgLocatie(aan: boolean) {
    if (aan) {
      const ok = await vraagLocatiePermissie();
      if (!ok) return;             // geweigerd → schakelaar blijft uit
    }
    zet('volgLocatie', aan);
  }

  /**
   * De belangrijkste schakelaar van de app, dus hier geen stil falen.
   *
   * Melding Geert 24-08: "had voor vannacht het knopje meldingen ontvangen op
   * uit gezet, maar kreeg evengoed meldingen binnen". Het uitzetten liep via
   * de gewone, uitgestelde synchronisatie die alle fouten inslikt; kwam die
   * niet aan, dan toonde de app "uit" terwijl de server bleef pushen. Dat is
   * dezelfde foutklasse als de kritiek-schakelaar in de grote app: aanzetten
   * is zichtbaar, uitzetten onzichtbaar, dus een mislukking merk je nooit.
   *
   * Nu wordt het uitzetten meteen en gecontroleerd doorgegeven, en draaien we
   * de schakelaar terug met een uitleg als dat niet lukt.
   */
  async function toggleNotificaties(aan: boolean) {
    zet('notificaties', aan);
    if (aan) {
      try {
        const ok = await registreerVoorPushMetInstellingen({ ...inst, notificaties: true });
        if (!ok) zet('notificaties', false);
      } catch {
        // The push service is still being built (docs/PUSH-API.md). Say so
        // instead of showing a switch that is on but does nothing.
        zet('notificaties', false);
        Alert.alert(
          'Alerts are coming soon',
          'Push alerts are not available yet. The list and the map work, and they update every minute.',
        );
      }
      return;
    }
    try {
      await werkPushFilterBij({ ...inst, notificaties: false });
    } catch {
      zet('notificaties', true);
      Alert.alert(
        'That did not work',
        'Turning alerts off did not reach the server, so you may still get alerts. '
        + 'Check your connection and try again.',
      );
    }
  }

  /**
   * Grote blusvliegtuigen (13-11). Zelfde regel als de hoofdschakelaar: de
   * keuze gaat meteen en gecontroleerd naar de server, en komt hij daar niet
   * aan, dan gaat de schakelaar terug met een uitleg. Zo toont de app nooit
   * een stand die de server niet heeft.
   */
  async function toggleBlusvliegtuigen(aan: boolean) {
    zet('blusvliegtuigen', aan);
    try {
      if (!(await huidigeGebruiker())) throw new Error('not registered');
      await werkPushFilterBij({ ...inst, blusvliegtuigen: aan });
    } catch {
      zet('blusvliegtuigen', !aan);
      Alert.alert(
        'That did not work',
        aan
          ? 'Turning this alert on did not reach the server. Check your connection and try again.'
          : 'Turning this alert off did not reach the server, so you may still get it. '
            + 'Check your connection and try again.',
      );
    }
  }

  function toggleDienst(key: string) {
    zet('disciplines', wisselDienst(inst.disciplines, key));
  }

  const perDienstAan = Object.keys(inst.straalPerDienst).length > 0;

  /** Aanzetten vult elke dienst met de huidige straal, zodat er niets
   *  verspringt; uitzetten wist alles en de hoofdschuif geldt weer. */
  function zetPerDienst(aan: boolean) {
    setOpen(null);
    if (!aan) { zet('straalPerDienst', {}); return; }
    const gevuld: Record<string, number> = {};
    for (const d of DIENSTEN) gevuld[d.key] = inst.straalKm;
    zet('straalPerDienst', gevuld);
  }

  function zetDienstStraal(key: string, km: number) {
    zet('straalPerDienst', { ...inst.straalPerDienst, [key]: km });
  }

  // Gebruikers-ID in beeld (wens Chris 27-09): bij een supportvraag noemt
  // iemand dat nummer, en dan is zijn melding in de database terug te vinden.
  const [gebruikerId, setGebruikerId] = useState<string | null>(null);
  useEffect(() => { huidigeGebruiker().then(setGebruikerId).catch(() => {}); }, [inst.notificaties]);

  // Android: de app loopt van rand tot rand, dus het venster krimpt niet
  // voor het toetsenbord en automaticallyAdjustKeyboardInsets is alleen iOS.
  // Zonder ruimte onderin bleven PlaatsZoeker en zijn suggesties onder het
  // toetsenbord liggen. Zelfde aanpak als ZoekScreen.
  const [toetsenbord, setToetsenbord] = useState(0);
  useEffect(() => {
    if (isIOS) return;
    const aan = Keyboard.addListener('keyboardDidShow', (e) => setToetsenbord(e.endCoordinates.height));
    const uit = Keyboard.addListener('keyboardDidHide', () => setToetsenbord(0));
    return () => { aan.remove(); uit.remove(); };
  }, []);

  /** Welke dienst zijn schuif open heeft, en de waarde tijdens het slepen. */
  const [open_, setOpen] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, number>>({});

  // Straal per dienst als tekst in de dienstkleur, maar zo donker (in het
  // donker: zo licht) dat hij 4.5:1 haalt op de kaart. Puur amber op wit was
  // 2:1. Iconen en schuifbalken houden de echte kleur.
  const dienstTekst = useMemo(
    () => Object.fromEntries(DIENSTEN.map((d) => [d.key, leesbaar(d.kleur, C.card)])) as Record<string, string>,
    [C.card],
  );

  /**
   * GRIP landelijk aan: er moet een gebruiker met pushtoestemming zijn, ook
   * als de gewone meldingen uit staan. Zelfde regel als bij capcodes volgen
   * (zorgVoorGebruiker). Weigert iemand de toestemming, dan blijft hij uit.
   */
  async function toggleGrip(aan: boolean) {
    if (aan && !(await zorgVoorGebruiker(inst))) return;
    zet('gripAlarm', aan);
  }

  return (
    // De titel staat in de kop van de stapel (op iOS groot). Tikken blijven
    // werken met het toetsenbord open, zodat een plaats uit PlaatsZoeker met
    // één tik gekozen is; iOS schuift de inhoud boven het toetsenbord uit.
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.inhoud, kolom, { paddingHorizontal: marge },
        toetsenbord > 0 && { paddingBottom: 32 + toetsenbord },
      ]}
    >
      {/* Opzet gelijk aan het voorbeeld op het startscherm (wens Chris
          27-09): elke rij een icoon (op iOS in een gekleurd tegeltje), een
          naam en eronder in één regel wat hij doet. Hoofdschakelaar bovenaan
          (17-08): uit = de meldingen-laag klapt in; de lijst en de kaart
          blijven gewoon werken. */}
      {/* Zonder push (Android zonder google-services.json) geen schakelaars
          die meldingen beloven, alleen één eerlijke regel. "Receive alerts"
          antwoordde daar "Alerts are coming soon" en "Emergency Warnings
          anywhere" kon stil aan gaan (controle 01-11). */}
      {PUSH_BESCHIKBAAR ? (
        <>
          <GroepKop>Alerts</GroepKop>
          <View style={kaartStijl}>
            <Rij
              icoon="meldingen" tegelKleur={C.accent}
              titel="Receive alerts"
              sub={inst.notificaties
                ? 'An alert when something happens near you'
                : 'The app keeps working, you just get no alerts'}
              schakelaar={{ aan: inst.notificaties, wissel: toggleNotificaties }}
            />
            {inst.notificaties && (
              <>
                {/* Heette "Alleen grote incidenten", maar filtert op spoed:
                    Chris miste een ambulance op 4 km omdat die als A2 binnenkwam
                    (15-08). Zelfde woorden als in de lijst. */}
                <Rij
                  icoon="alleenWaarschuwingen" tegelKleur={systeemKleur('systemOrange')} scheiding
                  titel="Warnings only"
                  sub="Only Advice, Watch and Act or Emergency Warning"
                  schakelaar={{ aan: inst.alleenGroot, wissel: (v) => zet('alleenGroot', v) }}
                />
                {/* Grote blusvliegtuigen (13-11): volgt je eigen filter voor
                    Fire, dus alleen zinvol met de gewone meldingen aan. */}
                <Rij
                  icoon="blusvliegtuig" tegelKleur="#E85A16" scheiding
                  titel="Large air tankers taking off"
                  sub={inst.disciplines.includes('Fire')
                    ? 'When one heads to a bushfire within your Fire radius'
                    : 'Switch on Fire under "Alerts for" to get these'}
                  schakelaar={{ aan: inst.blusvliegtuigen, wissel: toggleBlusvliegtuigen }}
                />
              </>
            )}
            {/* GRIP landelijk, zoals de "GRIP-opschaling alert" van de grote app
                (wens Chris 27-09). Staat los van straal en diensten, en werkt
                ook als de gewone meldingen uit staan (backend gripOnly is een
                override), dus altijd zichtbaar. Het amber is een eigen kleur,
                geen iOS-systeemkleur, en blijft daarom vast. */}
            <Rij
              icoon="noodwaarschuwing" tegelKleur="#f59e0b" scheiding
              titel="Emergency Warnings anywhere"
              sub="An alert for every Emergency Warning in Australia"
              schakelaar={{ aan: inst.gripAlarm, wissel: toggleGrip }}
            />
          </View>
        </>
      ) : (
        <>
          <GroepKop>Alerts</GroepKop>
          <View style={kaartStijl}>
            <Rij
              icoon="meldingenUit" tegelKleur={systeemKleur('systemGray')}
              titel="Push alerts are not available on Android yet."
            />
          </View>
        </>
      )}

      {/* Afstand: eerst één hoofdschuif die ook "In de buurt" bepaalt, en
          pas als je wilt per dienst verfijnen (wens Chris 27-09). Staat altijd
          in beeld: de straal geldt ook voor de lijst, niet alleen voor pushes. */}
      <GroepKop>Distance</GroepKop>
      <View style={kaartStijl}>
        <Rij
          icoon="buurt" tegelKleur={C.accent}
          titel="Radius"
          sub={perDienstAan
            ? 'Set per service'
            : PUSH_BESCHIKBAAR ? 'Applies to your alerts and to Nearby' : 'Applies to Nearby'}
          rechts={perDienstAan ? null : <Text style={[styles.waarde, { color: C.accentTekst, fontWeight: F.weightSemibold }]}>{straalTekst(live.__ ?? inst.straalKm)}</Text>}
        />
        {!perDienstAan && (
          <View style={styles.schuifVak}>
            <StraalSchuif
              zonderKop
              waarde={inst.straalKm}
              max={MAX_STRAAL_KM}
              onLive={(v) => setLive((l) => ({ ...l, __: v }))}
              onKlaar={(v) => {
                setLive((l) => { const n = { ...l }; delete n.__; return n; });
                zet('straalKm', v);
              }}
            />
          </View>
        )}
        <Rij
          icoon="perDienst" tegelKleur={systeemKleur('systemIndigo')} scheiding
          titel="Set per service"
          sub="For example bushfires 100 km and road crashes 10 km"
          schakelaar={{ aan: perDienstAan, wissel: zetPerDienst }}
        />
        {perDienstAan && DIENSTEN.map((d) => {
          const km = live[d.key] ?? straalVoor(d.key, inst.straalKm, inst.straalPerDienst);
          const open = open_ === d.key;
          return (
            <View key={d.key}>
              <Rij
                icoon={{ dienst: d }} tegelKleur={d.kleur} scheiding
                titel={d.label}
                sub={open && LANDELIJK_MOGELIJK.has(d.key) ? 'All the way right: anywhere in Australia' : undefined}
                onPress={() => setOpen(open ? null : d.key)}
                uitgeklapt={open}
                label={`${d.volleNaam}, ${straalTekst(km)}. Tap to choose the distance`}
                rechts={(
                  <View style={styles.rechtsWaarde}>
                    <Text style={[styles.waarde, { color: dienstTekst[d.key], fontWeight: F.weightSemibold }]}>{straalTekst(km)}</Text>
                    <Icoon naam={open ? 'inklappen' : 'uitklappen'} grootte={20} kleur={C.textMuted} gewicht="semibold" />
                  </View>
                )}
              />
              {open && (
                <View style={styles.schuifVak}>
                  <StraalSchuif
                    zonderKop
                    label={`${d.volleNaam} radius`}
                    waarde={straalVoor(d.key, inst.straalKm, inst.straalPerDienst)}
                    max={MAX_STRAAL_KM}
                    kleur={d.kleur}
                    landelijk={LANDELIJK_MOGELIJK.has(d.key)}
                    onLive={(v) => setLive((l) => ({ ...l, [d.key]: v }))}
                    onKlaar={(v) => {
                      setLive((l) => { const n = { ...l }; delete n[d.key]; return n; });
                      zetDienstStraal(d.key, v);
                    }}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Welke diensten je gepusht krijgt. Over meldingen, niet over de
          lijst: de chips boven de lijst zijn een ander filter (16-08). */}
      {PUSH_BESCHIKBAAR && inst.notificaties && (
        <>
          <GroepKop>Alerts for</GroepKop>
          <View style={kaartStijl}>
            {DIENSTEN.map((d, i) => {
              const aan = inst.disciplines.includes(d.key);
              const km = straalVoor(d.key, inst.straalKm, inst.straalPerDienst);
              return (
                <Rij
                  key={d.key}
                  icoon={{ dienst: d }} tegelKleur={d.kleur} scheiding={i > 0}
                  titel={d.label}
                  sub={aan ? (km >= LANDELIJK_KM ? 'Anywhere in Australia' : `Within ${km} km`) : 'Off'}
                  schakelaar={{ aan, wissel: () => toggleDienst(d.key) }}
                />
              );
            })}
          </View>
          <Text style={styles.voetnoot}>
            Coverage depends on what each state publishes. Victoria publishes the most;
            ambulance calls are only public in the ACT, and police incidents are not published.
          </Text>
        </>
      )}

      <GroepKop>Location</GroepKop>
      <View style={kaartStijl}>
        <Rij
          icoon="mijnPlek" tegelKleur={systeemKleur('systemBlue')}
          titel="Current location"
          sub={inst.volgLocatie
            ? 'Incidents around where you are'
            : inst.handPlaats ? `Fixed place: ${inst.handPlaats}` : 'Choose a fixed place below'}
          schakelaar={{ aan: inst.volgLocatie, wissel: toggleVolgLocatie }}
        />
        {!inst.volgLocatie && (
          <View style={[styles.rij, styles.scheiding, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <PlaatsZoeker
              waarde={inst.handPlaats}
              onKies={(k) => {
                // Naam én coördinaat in één keer: anders bestaat er kort
                // een halve plaats en synchroniseert de app die.
                zetVeel({ handPlaats: k.naam, handLat: k.lat, handLon: k.lon });
              }}
              onWis={() => {
                zetVeel({ handPlaats: null, handLat: null, handLon: null });
              }}
            />
          </View>
        )}
      </View>

      {/* Uiterlijk. "Automatisch" staat voorop en is de standaard: wie zijn
          telefoon 's avonds op donker zet, wil dat hier ook. De twee andere
          keuzes zijn voor wie het juist vast wil hebben. Op Android heet dit
          "Theme" met keuzerondjes, de M3-keuze uit één (R1.9); iOS houdt
          "Appearance" met een vinkje, zoals iOS-instellingen. */}
      <GroepKop>{isIOS ? 'Appearance' : 'Theme'}</GroepKop>
      {isIOS ? (
        <View style={kaartStijl}>
          {([
            ['automatisch', 'Automatic', 'Follows your phone'],
            ['licht', 'Light', null],
            ['donker', 'Dark', null],
          ] as const).map(([sleutel, label, hint], i) => (
            <Drukbaar
              key={sleutel}
              style={[styles.rij, i > 0 && styles.scheiding]}
              onPress={() => zet('thema', sleutel)}
              geselecteerd={inst.thema === sleutel}
              markeer
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{label}</Text>
                {hint && <Text style={styles.hint}>{hint}</Text>}
              </View>
              {inst.thema === sleutel && (
                <Icoon naam="gekozen" grootte={20} kleur={C.accent} gewicht="semibold" />
              )}
            </Drukbaar>
          ))}
        </View>
      ) : (
        <View style={kaartStijl} accessibilityRole="radiogroup">
          {([
            ['automatisch', 'System default'],
            ['licht', 'Light'],
            ['donker', 'Dark'],
          ] as const).map(([sleutel, label]) => {
            const gekozen = inst.thema === sleutel;
            return (
              <Drukbaar
                key={sleutel}
                style={[styles.rij, styles.rijLijst]}
                rol="radio"
                aan={gekozen}
                onPress={() => zet('thema', sleutel)}
              >
                <MaterialCommunityIcons
                  name={gekozen ? 'radiobox-marked' : 'radiobox-blank'}
                  size={24}
                  color={gekozen ? C.accent : C.textSecondary}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={[styles.label, styles.rijMidden]}>{label}</Text>
              </Drukbaar>
            );
          })}
        </View>
      )}

      {/* Bronnen. Google Play keurde de app op 26-10 af ("Missing Source
          Link for Government Information"): bij overheidsinformatie hoort
          de officiële site met link, en in gewone woorden dat de app geen
          overheid is. De vermeldingen eronder vragen de CC BY-licenties. */}
      <GroepKop>Sources</GroepKop>
      <View style={kaartStijl}>
        {BRONNEN.map((b, i) => (
          <Rij
            key={b.regio}
            icoon="bron" tegelKleur={systeemKleur('systemGreen')} scheiding={i > 0}
            titel={b.naam}
            sub={`${b.staat} · ${b.domein}`}
            onPress={() => { Linking.openURL(b.url).catch(() => {}); }}
            rol="link"
            label={`${b.naam}, ${b.domein}. Opens the official website`}
            rechts={<Icoon naam="extern" grootte={18} kleur={C.textMuted} />}
          />
        ))}
      </View>
      <Text style={styles.voetnoot}>
        Emergencies Near Me is an independent app and does not represent any government or
        emergency service. Incidents come from the public feeds of the services above and can be
        delayed or incomplete. In an emergency, call 000.
      </Text>
      {/* Elke vermelding opent de licentiepagina van die bron: Victoria
          eist bij herpublicatie een link naar die pagina. Elk een eigen
          link met een volle raakzone (44 pt iOS, 48 dp Android): in één
          doorlopende tekst waren het smalle regels die je niet raakte. */}
      <View style={styles.vermeldingen}>
        {BRONNEN.map((b) => (
          <Drukbaar
            key={b.regio}
            style={styles.vermelding}
            rol="link"
            markeer
            onPress={() => { Linking.openURL(b.licentieUrl).catch(() => {}); }}
          >
            <Text style={styles.vermeldingTekst}>{b.vermelding}</Text>
          </Drukbaar>
        ))}
        {/* Plaats zoeken loopt via Nominatim; de ODbL vraagt naamsvermelding. */}
        <Drukbaar
          style={styles.vermelding}
          rol="link"
          markeer
          onPress={() => { Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {}); }}
        >
          <Text style={styles.vermeldingTekst}>
            Place search: Nominatim, © OpenStreetMap contributors, licensed under the ODbL.
          </Text>
        </Drukbaar>
      </View>

      {/* iOS: een tegel van 34 en een pijltje; Android: een M3-lijstitem
          met een icoon van 24 en geen pijltje (de rimpel zegt al dat je
          kunt tikken). */}
      <View style={kaartStijl}>
        <View style={isIOS ? styles.rij : [styles.rij, styles.rijLijst, styles.rijLijstTwee]}>
          {isIOS ? (
            <View style={[styles.tegel, { backgroundColor: C.chipBg }]}>
              <Icoon naam="ontwikkelaar" grootte={19} kleur={C.textSecondary} />
            </View>
          ) : (
            <View style={styles.voorIcoon}>
              <Icoon naam="ontwikkelaar" grootte={24} kleur={C.textSecondary} />
            </View>
          )}
          <View style={isIOS ? styles.midden : styles.rijMidden}>
            <Text style={styles.tegelLabel}>Developer</Text>
            <Text style={styles.tegelWaarde}>{CONTACT.ontwikkelaar}</Text>
          </View>
        </View>

        {/* De mail wordt voorgeschreven mét het gebruikers-id: zonder dat
            nummer kan Chris een melding niet terugvinden in de database en
            begint elk supportgesprek met heen-en-weer (wens Chris 16-08). */}
        <Drukbaar
          style={isIOS ? [styles.rij, styles.scheiding] : [styles.rij, styles.rijLijst, styles.rijLijstTwee]}
          onPress={mailSupport}
          kopieerbaar
          markeer
        >
          {isIOS ? (
            <View style={[styles.tegel, { backgroundColor: C.accentSoft }]}>
              <Icoon naam="email" grootte={19} kleur={C.accent} />
            </View>
          ) : (
            <View style={styles.voorIcoon}>
              <Icoon naam="email" grootte={24} kleur={C.accent} />
            </View>
          )}
          <View style={isIOS ? styles.midden : styles.rijMidden}>
            <Text style={styles.tegelLabel}>Email</Text>
            <Text style={[styles.tegelWaarde, { color: C.accentTekst }]} selectable>{CONTACT.email}</Text>
          </View>
          {isIOS && <Icoon naam="chevron" grootte={20} kleur={C.textMuted} gewicht="semibold" />}
        </Drukbaar>
      </View>

      {/* Abonnement beheren (01-11): wie abonnee is, kon in de app nergens
          opzeggen. Op iOS opent dit het eigen blad van Apple; alleen dat
          blad toont ook TestFlight-abonnementen. Android opent de
          abonnementenpagina van Google Play. */}
      {abonnement.vereist && abonnement.toegang === 'actief' ? (
        <View style={kaartStijl}>
          <Rij
            icoon="abonnement" tegelKleur={systeemKleur('systemGreen')}
            titel="Manage subscription"
            sub={abonnement.verlengt ? 'Renews every year' : 'Cancelled, runs until the end of the period'}
            onPress={() => { void abonnement.beheer(); }}
            rol={isIOS ? 'button' : 'link'}
            rechts={isIOS
              ? <Icoon naam="chevron" grootte={20} kleur={C.textMuted} gewicht="semibold" />
              : <Icoon naam="extern" grootte={18} kleur={C.textMuted} />}
          />
        </View>
      ) : null}

      <View style={kaartStijl}>
        <Rij
          icoon="beoordelen" tegelKleur={systeemKleur('systemYellow')}
          titel="Rate Emergencies Near Me"
          sub="A review helps others find the app"
          onPress={openRecensiePagina}
          rol="link"
          rechts={<Icoon naam="extern" grootte={18} kleur={C.textMuted} />}
        />
        {/* Het privacybeleid moet ook in de app makkelijk te vinden zijn,
            niet alleen achter de betaalmuur (eis Google Play). */}
        <Rij
          icoon="privacy" tegelKleur={systeemKleur('systemGray')} scheiding
          titel="Privacy Policy"
          onPress={() => { Linking.openURL(`${SITE}/privacy`).catch(() => {}); }}
          rol="link"
          rechts={<Icoon naam="extern" grootte={18} kleur={C.textMuted} />}
        />
        <Rij
          icoon="voorwaarden" tegelKleur={systeemKleur('systemGray')} scheiding
          titel="Terms of Use"
          onPress={() => { Linking.openURL(`${SITE}/terms`).catch(() => {}); }}
          rol="link"
          rechts={<Icoon naam="extern" grootte={18} kleur={C.textMuted} />}
        />
      </View>

      <View style={kaartStijl}>
        <View style={styles.rij}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.waarde} selectable>{VERSIE}</Text>
        </View>
        {/* Tik = delen (kopiëren, mailen, WhatsApp); lang drukken selecteert. */}
        <Drukbaar
          style={[styles.rij, styles.scheiding]}
          onPress={() => { if (gebruikerId) Share.share({ message: gebruikerId }).catch(() => {}); }}
          kopieerbaar
          label={gebruikerId ? `User ID ${gebruikerId}. Tap to share` : 'User ID not known yet'}
          markeer
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>User ID</Text>
            <Text style={styles.idTekst} selectable numberOfLines={1}>
              {gebruikerId ?? 'Not known yet'}
            </Text>
          </View>
          {gebruikerId ? <Icoon naam="delen" grootte={18} kleur={C.textMuted} /> : null}
        </Drukbaar>
      </View>
      <Text style={styles.voetnoot}>
        Mention your user ID when you contact us, so we can help you faster.
      </Text>
    </ScrollView>
  );
}

/**
 * Kopje boven een groep, gemarkeerd als kop: schermlezers springen ermee van
 * groep naar groep. iOS: kleine kapitalen in grijs; Android: het M3-kopje.
 */
function GroepKop({ children }: { children: string }) {
  const styles = useStijlen(maak_styles);
  return <Text style={styles.groepKop} accessibilityRole="header">{children}</Text>;
}

/**
 * Eén instellingenrij: icoon, titel, één regel uitleg, iets rechts. Het icoon
 * is een chrome-icoon uit iconen.ts, of het icoon van een dienst (op iOS zijn
 * SF Symbol, op Android het MDI-vakicoon).
 *
 * iOS: het icoon wit in een gekleurd tegeltje, zoals iOS-instellingen.
 * Android: een M3-lijstitem met een los icoon van 24 dp (chrome in
 * textSecondary, een dienst in zijn eigen kleur) en geen scheidingslijn.
 *
 * Met `schakelaar` is de rij een aan/uit-instelling. Op Android is de hele
 * rij de schakelaar (M3): tikken waar dan ook zet hem om, en TalkBack leest
 * naam, rol en stand één keer, met de uitleg als hint. Op iOS blijft de
 * Switch zelf de bediening en draagt hij titel en uitleg; de tekst in de rij
 * zwijgt dan voor VoiceOver, anders hoor je alles twee keer.
 */
function Rij({
  icoon, tegelKleur, titel, sub, subKleur, rechts, onPress, scheiding, label, rol, uitgeklapt, schakelaar,
}: {
  icoon: IcoonNaam | { dienst: Dienst }; tegelKleur: ColorValue; titel: string; sub?: string; subKleur?: string;
  rechts?: React.ReactNode; onPress?: () => void; scheiding?: boolean; label?: string;
  /** 'link' voor rijen die iets buiten de app openen (website, winkel). */
  rol?: 'button' | 'link';
  /** Rij die iets eronder openklapt: de schermlezer zegt of het open is. */
  uitgeklapt?: boolean;
  schakelaar?: { aan: boolean; wissel: (v: boolean) => void };
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const voor = isIOS ? (
    <View style={[styles.tegeltje, { backgroundColor: tegelKleur }]}>
      {typeof icoon === 'string'
        ? <Icoon naam={icoon} grootte={17} kleur="#fff" />
        : <DienstIcoon dienst={icoon.dienst} grootte={17} kleur="#fff" />}
    </View>
  ) : (
    <View style={styles.voorIcoon}>
      {typeof icoon === 'string'
        ? <Icoon naam={icoon} grootte={24} kleur={C.textSecondary} />
        : <DienstIcoon dienst={icoon.dienst} grootte={24} kleur={tegelKleur} />}
    </View>
  );
  let achter = rechts;
  if (schakelaar) {
    achter = isIOS
      ? <Schakelaar value={schakelaar.aan} onValueChange={schakelaar.wissel} label={titel} hint={sub} />
      : (
        // De rij vangt de tik, dus de rimpel loopt over de hele rij; het
        // schuifje is alleen te zien, niet aan te raken of voor te lezen.
        <View pointerEvents="none">
          <Schakelaar value={schakelaar.aan} onValueChange={schakelaar.wissel} verborgenVoorLezer />
        </View>
      );
  }
  const inhoud = (
    <>
      {voor}
      <View style={styles.rijMidden} accessibilityElementsHidden={isIOS && !!schakelaar}>
        <Text style={styles.label}>{titel}</Text>
        {sub ? <Text style={[styles.hint, subKleur ? { color: subKleur, fontWeight: F.weightSemibold } : null]}>{sub}</Text> : null}
      </View>
      {achter}
    </>
  );
  const stijl = isIOS
    ? [styles.rij, styles.rijTegel, scheiding && styles.scheiding]
    : [styles.rij, styles.rijLijst, sub ? styles.rijLijstTwee : null];
  if (schakelaar && !isIOS) {
    const { aan, wissel } = schakelaar;
    return (
      <Drukbaar
        style={stijl}
        rol="switch"
        aan={aan}
        label={titel}
        hint={sub}
        trillen={false}
        onPress={() => {
          tikSchakel(!aan);
          wissel(!aan);
        }}
      >
        {inhoud}
      </Drukbaar>
    );
  }
  // iOS: de rij licht op bij het indrukken, zoals in iOS-instellingen;
  // Android houdt zijn rimpel.
  return onPress
    ? (
      <Drukbaar style={stijl} onPress={onPress} label={label} rol={rol} uitgeklapt={uitgeklapt} markeer>
        {inhoud}
      </Drukbaar>
    )
    : <View style={stijl}>{inhoud}</View>;
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  inhoud: { padding: 16, paddingBottom: 32 },
  groepKop: isIOS
    ? { ...T.sectie, color: C.textSecondary, marginTop: 20, marginBottom: 8, marginLeft: 4 }
    // M3-kopje (titleSmall) in de accentkleur; accentTekst, want het gewone
    // accent haalt als kleine tekst op de lichte grond geen 4.5:1.
    : { ...T.sectie, color: C.accentTekst, marginTop: 24, marginBottom: 8, marginLeft: 16 },
  rij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  // Haarlijn tussen rijen alleen op iOS; M3-lijstitems hebben er geen.
  scheiding: isIOS ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator } : {},
  label: { ...T.body, fontSize: 16, color: C.textPrimary },
  hint: { ...T.klein, color: C.textSecondary, marginTop: 2 },
  waarde: { ...T.body, fontSize: 16, color: C.textSecondary },
  voetnoot: { ...T.klein, color: C.textSecondary, marginTop: 6, marginHorizontal: 4 },
  vermeldingen: { marginTop: 6 },
  vermelding: {
    minHeight: isIOS ? 44 : 48, paddingVertical: 10, paddingHorizontal: 4,
    justifyContent: 'center', borderRadius: 8,
  },
  vermeldingTekst: { ...T.klein, color: C.textSecondary, textDecorationLine: 'underline' },
  dienstNaam: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  // Tegels met de vloeiende iOS-hoek (borderCurve); Android tekent ze niet.
  tegel: { width: 34, height: 34, borderRadius: 9, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  midden: { flex: 1, marginLeft: 12 },
  tegelLabel: { ...T.klein, color: C.textSecondary },
  tegelWaarde: { ...T.body, fontWeight: F.weightSemibold, color: C.textPrimary, marginTop: 1 },
  rijTegel: { justifyContent: 'flex-start', gap: 12, paddingVertical: 10 },
  tegeltje: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  // Android: M3-lijstitem, één regel 56 dp hoog, twee regels ruimer.
  rijLijst: { justifyContent: 'flex-start', gap: 16, minHeight: 56, paddingVertical: 8 },
  rijLijstTwee: { paddingVertical: 12 },
  voorIcoon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  rijMidden: { flex: 1 },
  schuifVak: { paddingHorizontal: 16, paddingBottom: 10 },
  rechtsWaarde: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  idTekst: { ...T.klein, color: C.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
});
