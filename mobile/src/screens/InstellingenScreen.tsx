/**
 * Instellingen in de stijl van iOS-instellingen: gegroepeerde kaarten, per
 * groep een kopje. Het locatiepatroon volgt wat Chris koos (15-08): "Huidige
 * locatie" aan = live volgen; uit = de rij "Handmatige locatie" verschijnt.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Linking, Platform, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useInstellingen } from '../instellingen';
import { vraagLocatiePermissie } from '../locatie';
import {
  registreerVoorPushMetInstellingen, huidigeGebruiker, werkPushFilterBij, zorgVoorGebruiker,
} from '../push';
import { T, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import {
  DIENSTEN, wisselDienst, straalVoor, straalTekst, MAX_STRAAL_KM, LANDELIJK_KM, LANDELIJK_MOGELIJK,
} from '../diensten';
import { StraalSchuif } from '../components/StraalSchuif';
import { Drukbaar } from '../components/Drukbaar';
import { PlaatsZoeker } from '../components/PlaatsZoeker';
import { Schakelaar } from '../components/Schakelaar';
import { openRecensiePagina } from '../recensie';

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

export default function InstellingenScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const { inst, zet, zetVeel } = useInstellingen();
  const navigation = useNavigation<Nav>();

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
      Alert.alert('No mail app', `Send your message to ${CONTACT.email}.`);
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

  /** Welke dienst zijn schuif open heeft, en de waarde tijdens het slepen. */
  const [open_, setOpen] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, number>>({});

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
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.inhoud}>
        <Text style={styles.kop}>Settings</Text>

        {/* Opzet gelijk aan het voorbeeld op het startscherm (wens Chris
            27-09): elke rij een gekleurd tegeltje, een naam en eronder in één
            regel wat hij doet. Hoofdschakelaar bovenaan (17-08): uit = de
            meldingen-laag klapt in; de lijst en de kaart blijven gewoon werken. */}
        <Text style={styles.groepKop}>Alerts</Text>
        <View style={kaartStijl}>
          <Rij
            icoon="bell-ring" tegelKleur={C.accent}
            titel="Receive alerts"
            sub={inst.notificaties
              ? 'An alert when something happens near you'
              : 'The app keeps working, you just get no alerts'}
            rechts={<Schakelaar value={inst.notificaties} onValueChange={toggleNotificaties} />}
          />
          {inst.notificaties && (
            <>
              {/* Heette "Alleen grote incidenten", maar filtert op spoed:
                  Chris miste een ambulance op 4 km omdat die als A2 binnenkwam
                  (15-08). Zelfde woorden als in de lijst. */}
              <Rij
                icoon="lightning-bolt" tegelKleur="#ff9500" scheiding
                titel="Warnings only"
                sub="Only Advice, Watch and Act or Emergency Warning"
                rechts={<Schakelaar value={inst.alleenGroot} onValueChange={(v) => zet('alleenGroot', v)} />}
              />
            </>
          )}
          {/* GRIP landelijk, zoals de "GRIP-opschaling alert" van de grote app
              (wens Chris 27-09). Staat los van straal en diensten, en werkt
              ook als de gewone meldingen uit staan (backend gripOnly is een
              override), dus altijd zichtbaar. */}
          <Rij
            icoon="alert-octagon" tegelKleur="#f59e0b" scheiding
            titel="Emergency Warnings anywhere"
            sub="An alert for every Emergency Warning in Australia"
            rechts={<Schakelaar value={inst.gripAlarm} onValueChange={toggleGrip} />}
          />
        </View>

        {/* Afstand: eerst één hoofdschuif die ook "In de buurt" bepaalt, en
            pas als je wilt per dienst verfijnen (wens Chris 27-09). Staat altijd
            in beeld: de straal geldt ook voor de lijst, niet alleen voor pushes. */}
        <Text style={styles.groepKop}>Distance</Text>
        <View style={kaartStijl}>
          <Rij
            icoon="map-marker-radius" tegelKleur={C.accent}
            titel="Radius"
            sub={perDienstAan ? 'Set per service' : 'Applies to your alerts and to Nearby'}
            rechts={perDienstAan ? null : <Text style={[styles.waarde, { color: C.accent, fontWeight: '600' }]}>{straalTekst(live.__ ?? inst.straalKm)}</Text>}
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
            icoon="tune-variant" tegelKleur="#5856d6" scheiding
            titel="Set per service"
            sub="For example bushfires 100 km and road crashes 10 km"
            rechts={<Schakelaar value={perDienstAan} onValueChange={zetPerDienst} />}
          />
          {perDienstAan && DIENSTEN.map((d) => {
            const km = live[d.key] ?? straalVoor(d.key, inst.straalKm, inst.straalPerDienst);
            const open = open_ === d.key;
            return (
              <View key={d.key}>
                <Rij
                  icoon={d.icoon} tegelKleur={d.kleur} scheiding
                  titel={d.label}
                  sub={open && LANDELIJK_MOGELIJK.has(d.key) ? 'All the way right: anywhere in Australia' : undefined}
                  onPress={() => setOpen(open ? null : d.key)}
                  label={`${d.volleNaam}, ${straalTekst(km)}. Tap to choose the distance`}
                  rechts={(
                    <View style={styles.rechtsWaarde}>
                      <Text style={[styles.waarde, { color: d.kleur, fontWeight: '600' }]}>{straalTekst(km)}</Text>
                      <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={C.textMuted} />
                    </View>
                  )}
                />
                {open && (
                  <View style={styles.schuifVak}>
                    <StraalSchuif
                      zonderKop
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
        {inst.notificaties && (
          <>
            <Text style={styles.groepKop}>Alerts for</Text>
            <View style={kaartStijl}>
              {DIENSTEN.map((d, i) => {
                const aan = inst.disciplines.includes(d.key);
                const km = straalVoor(d.key, inst.straalKm, inst.straalPerDienst);
                return (
                  <Rij
                    key={d.key}
                    icoon={d.icoon} tegelKleur={d.kleur} scheiding={i > 0}
                    titel={d.label}
                    sub={aan ? (km >= LANDELIJK_KM ? 'Anywhere in Australia' : `Within ${km} km`) : 'Off'}
                    rechts={<Schakelaar value={aan} onValueChange={() => toggleDienst(d.key)} />}
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

        <Text style={styles.groepKop}>Location</Text>
        <View style={kaartStijl}>
          <Rij
            icoon="crosshairs-gps" tegelKleur="#007aff"
            titel="Current location"
            sub={inst.volgLocatie
              ? 'Incidents around where you are'
              : inst.handPlaats ? `Fixed place: ${inst.handPlaats}` : 'Choose a fixed place below'}
            rechts={<Schakelaar value={inst.volgLocatie} onValueChange={toggleVolgLocatie} />}
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
            keuzes zijn voor wie het juist vast wil hebben. */}
        <Text style={styles.groepKop}>Appearance</Text>
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
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{label}</Text>
                {hint && <Text style={styles.hint}>{hint}</Text>}
              </View>
              {inst.thema === sleutel && (
                <MaterialCommunityIcons name="check" size={20} color={C.accent} />
              )}
            </Drukbaar>
          ))}
        </View>

        <View style={kaartStijl}>
          <View style={styles.rij}>
            <View style={[styles.tegel, { backgroundColor: C.chipBg }]}>
              <MaterialCommunityIcons name="account-outline" size={19} color={C.textSecondary} />
            </View>
            <View style={styles.midden}>
              <Text style={styles.tegelLabel}>Developer</Text>
              <Text style={styles.tegelWaarde}>{CONTACT.ontwikkelaar}</Text>
            </View>
          </View>

          {/* De mail wordt voorgeschreven mét het gebruikers-id: zonder dat
              nummer kan Chris een melding niet terugvinden in de database en
              begint elk supportgesprek met heen-en-weer (wens Chris 16-08). */}
          <Drukbaar style={[styles.rij, styles.scheiding]} onPress={mailSupport}>
            <View style={[styles.tegel, { backgroundColor: C.accentSoft }]}>
              <MaterialCommunityIcons name="email-outline" size={19} color={C.accent} />
            </View>
            <View style={styles.midden}>
              <Text style={styles.tegelLabel}>Email</Text>
              <Text style={[styles.tegelWaarde, { color: C.accent }]}>{CONTACT.email}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.textMuted} />
          </Drukbaar>
        </View>

        <View style={kaartStijl}>
          <Rij
            icoon="star" tegelKleur="#ffcc00"
            titel="Rate Emergencies Near Me"
            sub="A review helps others find the app"
            onPress={openRecensiePagina}
            rechts={<MaterialCommunityIcons name="open-in-new" size={18} color={C.textMuted} />}
          />
        </View>

        <View style={kaartStijl}>
          <View style={styles.rij}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.waarde}>{VERSIE}</Text>
          </View>
          {/* Tik = delen (kopiëren, mailen, WhatsApp); lang drukken selecteert. */}
          <Drukbaar
            style={[styles.rij, styles.scheiding]}
            onPress={() => { if (gebruikerId) Share.share({ message: gebruikerId }).catch(() => {}); }}
            label={gebruikerId ? `User ID ${gebruikerId}. Tap to share` : 'User ID not known yet'}
            trillen={false}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>User ID</Text>
              <Text style={styles.idTekst} selectable numberOfLines={1}>
                {gebruikerId ?? 'Not known yet'}
              </Text>
            </View>
            {gebruikerId ? <MaterialCommunityIcons name="share-variant-outline" size={18} color={C.textMuted} /> : null}
          </Drukbaar>
        </View>
        <Text style={styles.voetnoot}>
          Mention your user ID when you contact us, so we can help you faster.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Eén instellingenrij: gekleurd tegeltje, titel, één regel uitleg, iets rechts. */
function Rij({
  icoon, tegelKleur, titel, sub, subKleur, rechts, onPress, scheiding, label,
}: {
  icoon: string; tegelKleur: string; titel: string; sub?: string; subKleur?: string;
  rechts?: React.ReactNode; onPress?: () => void; scheiding?: boolean; label?: string;
}) {
  const styles = useStijlen(maak_styles);
  const inhoud = (
    <>
      <View style={[styles.tegeltje, { backgroundColor: tegelKleur }]}>
        <MaterialCommunityIcons name={icoon as never} size={17} color="#fff" />
      </View>
      <View style={styles.rijMidden}>
        <Text style={styles.label}>{titel}</Text>
        {sub ? <Text style={[styles.hint, subKleur ? { color: subKleur, fontWeight: '600' } : null]}>{sub}</Text> : null}
      </View>
      {rechts}
    </>
  );
  const stijl = [styles.rij, styles.rijTegel, scheiding && styles.scheiding];
  return onPress
    ? <Drukbaar style={stijl} onPress={onPress} label={label} trillen={false}>{inhoud}</Drukbaar>
    : <View style={stijl}>{inhoud}</View>;
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  inhoud: { padding: 16, paddingBottom: 120 },
  kop: { ...T.display, color: C.textPrimary, marginBottom: 8 },
  groepKop: {
    ...T.sectie, color: C.textSecondary, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8, marginLeft: 4,
  },
  rij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  label: { ...T.body, fontSize: 16, color: C.textPrimary },
  hint: { ...T.klein, color: C.textSecondary, marginTop: 2 },
  waarde: { ...T.body, fontSize: 16, color: C.textSecondary },
  voetnoot: { ...T.klein, color: C.textSecondary, marginTop: 6, marginHorizontal: 4 },
  dienstNaam: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tegel: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  midden: { flex: 1, marginLeft: 12 },
  tegelLabel: { ...T.klein, color: C.textSecondary },
  tegelWaarde: { ...T.body, fontSize: 15, fontWeight: '600', color: C.textPrimary, marginTop: 1 },
  rijTegel: { justifyContent: 'flex-start', gap: 12, paddingVertical: 10 },
  tegeltje: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rijMidden: { flex: 1 },
  schuifVak: { paddingHorizontal: 16, paddingBottom: 10 },
  rechtsWaarde: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  idTekst: { ...T.klein, color: C.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
});
