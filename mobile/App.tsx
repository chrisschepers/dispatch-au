/**
 * Dispatch Australia: emergency incidents near you, from the official
 * Australian agency feeds. Built on the 112 Meldingen app: three tabs,
 * a short introduction with the two permission questions, and a detail screen.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { InstellingenProvider, useInstellingen } from './src/instellingen';
import { ThemaProvider, useThema } from './src/thema';
import { type Palet } from './src/theme';
import { vraagLocatiePermissie } from './src/locatie';
import { laadInstallToken, zetNotificatieGedrag, meldInstallatie, registreerVoorPushMetInstellingen, werkPushFilterBij } from './src/push';
import BuurtScreen from './src/screens/BuurtScreen';
import KaartScreen from './src/screens/KaartScreen';
import DetailScreen from './src/screens/DetailScreen';
import InstellingenScreen from './src/screens/InstellingenScreen';
import IntroScreen from './src/screens/IntroScreen';
import { C } from './src/theme';
import { navRef, luisterNaarMeldingTikken } from './src/meldingOpenen';
import { telOpening } from './src/recensie';
import { TabBalk } from './src/components/TabBalk';

/**
 * Vangnet: een JS-fout bij het opstarten gaf een stil wit scherm (melding
 * Chris, build 6). Met deze boundary staat de fout leesbaar op het scherm,
 * zodat een tester hem kan doorsturen in plaats van 'er gebeurt niks'.
 */
class FoutVanger extends React.Component<{ children: React.ReactNode }, { fout: Error | null }> {
  state = { fout: null as Error | null };
  static getDerivedStateFromError(fout: Error) { return { fout }; }
  render() {
    if (this.state.fout) {
      return (
        <View style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#1c1c1e' }}>Something went wrong</Text>
          <Text style={{ marginTop: 10, color: '#6e6e73', fontSize: 13 }} selectable>
            {String(this.state.fout)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ONBOARD_KEY = 'dispatch.onboarded.v2';

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBalk {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Buurt" component={BuurtScreen} />
      <Tab.Screen name="Kaart" component={KaartScreen} />
      <Tab.Screen name="Instellingen" component={InstellingenScreen} />
    </Tab.Navigator>
  );
}

/** Navigatiekleuren volgen het thema; anders flitst er wit tussen schermen. */
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
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    laadInstallToken();
    zetNotificatieGedrag();
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

  if (!geladen || onboarded === null) {
    // Zichtbaar laadscherm in plaats van een leeg vlak: zo weet je bij het
    // testen meteen of React draait of dat de bundel al eerder sneuvelde.
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40 }}>📍</Text>
        <Text style={{ marginTop: 8, color: C.textSecondary }}>Loading…</Text>
      </View>
    );
  }
  if (!onboarded) {
    return <IntroScreen klaar={() => { AsyncStorage.setItem(ONBOARD_KEY, '1'); setOnboarded(true); }} />;
  }

  return (
    <NavigationContainer theme={navThema} ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          headerBackTitle: 'Back',
          headerTintColor: C.accent,
          headerTitleStyle: { color: C.textPrimary },
          headerStyle: { backgroundColor: C.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        {/* Eén navigatietaal (audit 20-08): elk subscherm dezelfde native kop
            als Detail, in plaats van losse chevron-knopjes per scherm. */}
        <Stack.Screen name="Detail" component={DetailScreen}
          options={{ title: 'Incident' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/** Los component: de statusbalk moet binnen de ThemaProvider hangen. */
function Systeembalk() {
  const C = useThema();
  return <StatusBar style={C.donker ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <FoutVanger>
    <SafeAreaProvider>
      <InstellingenProvider>
        <ThemaProvider>
          <Systeembalk />
          <Binnenkant />
        </ThemaProvider>
      </InstellingenProvider>
    </SafeAreaProvider>
    </FoutVanger>
  );
}

