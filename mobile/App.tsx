/**
 * Dispatch Australia: emergency incidents near you, from the official
 * Australian agency feeds. Built on the 112 Meldingen app: Nearby, Map and
 * Settings plus a Search tab on the system tab bar (src/navigatie.tsx), a
 * short introduction with the two permission questions, and a detail screen
 * in every tab.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { InstellingenProvider, useInstellingen } from './src/instellingen';
import { ThemaProvider, useThema } from './src/thema';
import { T, PALET_LICHT, PALET_DONKER, type Palet } from './src/theme';
import { vraagLocatiePermissie } from './src/locatie';
import { laadInstallToken, zetNotificatieGedrag, meldInstallatie, registreerVoorPushMetInstellingen, werkPushFilterBij } from './src/push';
import { laadAppConfig } from './src/appConfig';
import IntroScreen from './src/screens/IntroScreen';
import BetaalmuurScreen from './src/screens/BetaalmuurScreen';
import { AbonnementProvider, useAbonnement } from './src/abonnement';
import { navRef, luisterNaarMeldingTikken } from './src/meldingOpenen';
import { telOpening } from './src/recensie';
import { TabNavigatie } from './src/navigatie';
import { Navigatiebalk } from './src/components/Navigatiebalk';

/**
 * Het opstartscherm van het systeem blijft staan tot de app weet wat hij
 * moet tonen (instellingen geladen, startscherm al gezien of niet, stand van
 * het abonnement). Zo zit er geen leeg vlak of draaiertje tussen het logo en
 * het eerste scherm. Hooguit 3 s: blijft het opstarten ergens hangen, dan
 * gaat het toch weg en neemt het Laadscherm het over. Zonder de native
 * module (oude build) doen beide aanroepen niets.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});
setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 3000);

/**
 * Vangnet: een JS-fout bij het opstarten gaf een stil wit scherm (melding
 * Chris, build 6). Met deze boundary staat de fout leesbaar op het scherm,
 * zodat een tester hem kan doorsturen in plaats van 'er gebeurt niks'.
 *
 * De boundary hangt buiten de ThemaProvider, dus de kleuren komen uit
 * Appearance. Die geeft na setColorScheme (thema.tsx) de keuze in de app
 * terug, en anders de stand van de telefoon. Bij een fout verdwijnt de
 * Systeembalk mee met de rest van de app; daarom zet de foutpagina zelf de
 * statusbalk en de Android-navigatiebalk.
 */
class FoutVanger extends React.Component<{ children: React.ReactNode }, { fout: Error | null }> {
  state = { fout: null as Error | null };
  static getDerivedStateFromError(fout: Error) { return { fout }; }
  // Fout tijdens het opstarten: meteen het opstartscherm weg, niet pas na
  // de 3 s, anders lijkt de app te hangen.
  componentDidCatch() { SplashScreen.hideAsync().catch(() => {}); }
  render() {
    if (this.state.fout) {
      const P = Appearance.getColorScheme() === 'dark' ? PALET_DONKER : PALET_LICHT;
      const stijl = P.donker ? 'light' : 'dark';
      return (
        <View style={{ flex: 1, backgroundColor: P.bg, justifyContent: 'center', padding: 24 }}>
          <StatusBar style={stijl} />
          <Navigatiebalk stijl={stijl} />
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: P.textPrimary }}>
            Something went wrong
          </Text>
          <Text style={{ marginTop: 10, color: P.textSecondary, fontSize: 13 }} selectable>
            {String(this.state.fout)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const ONBOARD_KEY = 'dispatch.onboarded.v2';

/**
 * Wat er onder het opstartscherm klaarstaat: een leeg vlak in de grondkleur,
 * zonder logo of emoji die het opstartscherm nadoen. Duurt het opstarten
 * langer dan 2 s (het opstartscherm gaat na 3 s hoe dan ook weg), dan een
 * klein draaiertje met 'Loading…'. Zo zie je bij het testen nog steeds of
 * React draait of dat de bundel al eerder sneuvelde.
 */
function Laadscherm() {
  const C = useThema();
  const [traag, setTraag] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTraag(true), 2000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View
      style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      {traag && (
        <>
          <ActivityIndicator color={C.textSecondary} />
          <Text style={[T.klein, { color: C.textSecondary, marginTop: 8 }]}>Loading…</Text>
        </>
      )}
    </View>
  );
}

/**
 * Navigatiekleuren volgen het thema; anders flitst er wit tussen schermen.
 * `dark` stuurt ook de tabbalk en de koppen (licht of donker, los van het
 * systeem), `card` is de achtergrond van de Android-tabbalk en `background`
 * die van de native container.
 */
function navThemaVoor(C: Palet) {
  const basis = C.donker ? DarkTheme : DefaultTheme;
  return {
    ...basis,
    colors: {
      ...basis.colors,
      background: C.bg,
      card: C.card,
      primary: C.accent,
      text: C.textPrimary,
      border: C.border,
    },
  };
}

function Binnenkant() {
  const C = useThema();
  // Statusbalk mee: donkere letters op licht, lichte op donker.
  const navThema = useMemo(() => navThemaVoor(C), [C]);
  const { inst, geladen, zet } = useInstellingen();
  const abonnement = useAbonnement();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    laadInstallToken();
    zetNotificatieGedrag();
    // Kaarttijden uit de backend; zonder verbinding de ingebouwde waarden.
    laadAppConfig();
    // Installatie meteen aanmelden, ook zonder push. Anders telt het dashboard
    // alleen wie meldingen aanzet (zie meldInstallatie).
    meldInstallatie().catch(() => {});
    // Tikken op een push opent die melding (ook als de app dicht was).
    const stopLuisteren = luisterNaarMeldingTikken();
    AsyncStorage.getItem(ONBOARD_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(false));
    // Vangnet: wat er ook gebeurt, na 3 s tonen we de app.
    const t = setTimeout(() => setOnboarded((h) => (h === null ? false : h)), 3000);
    return () => { clearTimeout(t); stopLuisteren(); };
  }, []);

  /**
   * Instellingen gewijzigd → filter op de backend laten meelopen.
   *
   * Deze lijst moet ELKE waarde bevatten die in werkPushFilterBij() meegaat.
   * Ging fout (18-08): de handmatige plek stond er niet in. Wie "Huidige
   * locatie" uitzette en dáárna een plaats intypte, stuurde alleen bij het
   * omzetten van de schakelaar iets naar de server — en op dat moment was er
   * nog geen plaats gekozen, dus ging de GPS-plek mee. De ingetypte plaats
   * bereikte de server nooit en de pushes bleven om je oude locatie draaien.
   * Zelfde les als in de grote app (1.4.6, anker versus weergave-locatie).
   *
   * Kort uitstellen zodat een reeks wijzigingen (plaatsnaam, breedte, lengte)
   * één verzoek wordt in plaats van drie.
   */
  useEffect(() => {
    if (!onboarded) return;
    const t = setTimeout(() => { werkPushFilterBij(inst).catch(() => {}); }, 400);
    return () => clearTimeout(t);
  }, [
    onboarded,
    inst.straalKm, inst.straalPerDienst,
    inst.disciplines, inst.alleenGroot, inst.gripAlarm, inst.notificaties,
    inst.volgLocatie, inst.handLat, inst.handLon,
    inst.geluid, inst.geluidPerDienst,
  ]);

  // Telt mee voor het moment van de recensievraag (recensie.ts); pas na het
  // startscherm, de eerste keer is geen "keer openen".
  useEffect(() => { if (onboarded) telOpening(); }, [onboarded]);

  // Zonder abonnement of proef is de app dicht (abonnement.tsx). Tijdens de
  // eerste controle het laadscherm, niet even de muur: anders flitst hij bij
  // elke start voor een betalende gebruiker.
  const muurLaden = abonnement.vereist && abonnement.toegang === 'onbekend';
  const opstarten = !geladen || onboarded === null || (onboarded && muurLaden);

  // Klaar met opstarten: het opstartscherm weg, het eerste scherm staat er.
  useEffect(() => {
    if (!opstarten) SplashScreen.hideAsync().catch(() => {});
  }, [opstarten]);

  if (opstarten) return <Laadscherm />;
  if (!onboarded) {
    return <IntroScreen klaar={() => { AsyncStorage.setItem(ONBOARD_KEY, '1'); setOnboarded(true); }} />;
  }
  if (abonnement.vereist && abonnement.toegang !== 'actief') {
    return <BetaalmuurScreen />;
  }

  return (
    <NavigationContainer theme={navThema} ref={navRef}>
      {/* Eén navigatietaal (audit 20-08): elk subscherm dezelfde native kop
          als Detail, in plaats van losse chevron-knopjes per scherm. */}
      <TabNavigatie />
    </NavigationContainer>
  );
}

/**
 * Los component: de systeembalken moeten binnen de ThemaProvider hangen.
 * Lichte tekens op donker, donkere op licht; op Android ook de knoppen van de
 * navigatiebalk, die over de tabbalk liggen.
 */
function Systeembalk() {
  const C = useThema();
  const stijl = C.donker ? 'light' : 'dark';
  return (
    <>
      <StatusBar style={stijl} />
      <Navigatiebalk stijl={stijl} />
    </>
  );
}

export default function App() {
  return (
    <FoutVanger>
    <SafeAreaProvider>
      <InstellingenProvider>
        <ThemaProvider>
          <Systeembalk />
          <AbonnementProvider>
            <Binnenkant />
          </AbonnementProvider>
        </ThemaProvider>
      </InstellingenProvider>
    </SafeAreaProvider>
    </FoutVanger>
  );
}

