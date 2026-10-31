/**
 * De navigatie van de app: de tabbalk van het systeem met per tabblad een
 * eigen stapel.
 *
 * Eerder een eigen zwevende tabbalk met zoeken erin (wens Chris 16-08 en
 * 27-09) en Detail in één stapel boven alle tabs, zodat de balk bij elke
 * melding verdween. Nu de echte balk van het platform: op iOS de
 * UITabBarController (met Liquid Glass vanaf iOS 26), op Android de M3
 * BottomNavigationView. Detail zit in elke stapel, dus de balk blijft staan
 * als je een melding opent (HIG 7.5). Zoeken is een eigen tabblad: op iOS
 * achteraan, zodat iOS 26 hem los naast de balk kan zetten; op Android als
 * derde, vóór Instellingen.
 */
import React from 'react';
import { DynamicColorIOS, PlatformColor } from 'react-native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabIcon,
} from '@react-navigation/bottom-tabs/unstable';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-screens/experimental';

import type { Melding } from './api';
import { ICONEN, type IcoonNaam } from './iconen';
import { PALET_LICHT, PALET_DONKER, isIOS, isIOS26, type Palet } from './theme';
import { useThema, useMinderBeweging } from './thema';
import BuurtScreen from './screens/BuurtScreen';
import KaartScreen from './screens/KaartScreen';
import ZoekScreen from './screens/ZoekScreen';
import InstellingenScreen from './screens/InstellingenScreen';
import DetailScreen from './screens/DetailScreen';
import GroepScreen from './screens/GroepScreen';

/**
 * Alle schermen van de vier stapels. Kaart kan een plek meekrijgen (vanuit
 * het kaartje in Detail); `t` is een volgnummer, zodat de kaart ook opnieuw
 * inzoomt als je twee keer dezelfde plek kiest. Groep is het blad met de
 * meldingen die op de kaart één plek delen (alleen in de kaartstapel).
 */
export type StapelParams = {
  Buurt: undefined;
  Kaart: { lat?: number; lon?: number; id?: string; t?: number } | undefined;
  Zoeken: undefined;
  Instellingen: undefined;
  Detail: { melding: Melding };
  Groep: { leden: Melding[] };
};

export type TabParams = {
  BuurtTab: NavigatorScreenParams<StapelParams> | undefined;
  KaartTab: NavigatorScreenParams<StapelParams> | undefined;
  ZoekTab: NavigatorScreenParams<StapelParams> | undefined;
  InstellingenTab: NavigatorScreenParams<StapelParams> | undefined;
};

const Tab = createNativeBottomTabNavigator<TabParams>();
// Eén stapelsoort, gedeeld door de vier tabbladen.
const Stapel = createNativeStackNavigator<StapelParams>();

/**
 * Tabicoon per platform. iOS: SF Symbol, gevuld als hij gekozen is. Android:
 * de vector-drawables uit plugins/with-tab-iconen.cjs; een uri zonder ':'
 * leest bottom-tabs als drawable-naam. Uit de functievorm maakt bottom-tabs
 * zelf een gewoon en een gekozen icoon.
 */
function tabIcoon(gewoon: IcoonNaam, gekozen: IcoonNaam, drawable: string) {
  return ({ focused }: { focused: boolean }): NativeBottomTabIcon => (isIOS
    ? { type: 'sfSymbol', name: ICONEN[focused ? gekozen : gewoon].ios }
    : { type: 'image', source: { uri: focused ? `${drawable}_actief` : drawable } });
}

/**
 * Kop per platform. iOS: zo veel mogelijk de systeemkop, met alleen een
 * pijltje als terugknop. Geen achtergrondkleur (op iOS 26 maakt die een grote
 * titel onzichtbaar), geen tintkleur (de standaard is het accent uit het
 * navigatiethema) en geen titelstijl (iOS 26 past de titelkleur aan wat
 * eronder ligt). Onder iOS 26 een vervaagde kop, zoals de systeemapps.
 *
 * Android: de kleine M3-kopbalk op de achtergrond van het scherm, titel in
 * titleLarge (22, gewoon gewicht). Geen tintkleur: de terugpijl krijgt dan de
 * tekstkleur (onSurface) in plaats van rood.
 *
 * Met 'verminder beweging' vervaagt een nieuw scherm in plaats van te schuiven.
 */
function kopOpties(C: Palet, minderBeweging: boolean): NativeStackNavigationOptions {
  const animation = minderBeweging ? 'fade' : 'default';
  return isIOS
    ? {
      headerBackButtonDisplayMode: 'minimal',
      headerShadowVisible: false,
      headerBlurEffect: isIOS26 ? undefined : 'systemChromeMaterial',
      animation,
    }
    : {
      headerStyle: { backgroundColor: C.bg },
      headerShadowVisible: false,
      headerTitleStyle: { color: C.textPrimary, fontSize: 22, fontWeight: '400' },
      animation,
    };
}

/**
 * Grote titel op iOS. Een doorzichtige achtergrond voor het grote-titelvlak
 * houdt dat vlak leeg, terwijl de ingeklapte balk onder iOS 26 zijn vervaging
 * houdt.
 */
const groteTitel: NativeStackNavigationOptions = isIOS
  ? {
    headerLargeTitleEnabled: true,
    headerLargeTitleShadowVisible: false,
    headerLargeStyle: { backgroundColor: 'transparent' },
  }
  : {};

/**
 * Detail per melding: een push voor een andere melding opent een nieuw
 * scherm in plaats van het bestaande te hergebruiken met oude gegevens erin
 * (StackRouter zoekt bij NAVIGATE op dit id).
 *
 * iOS: een doorzichtige kop, waar de melding onderdoor schuift. Onder iOS 26
 * vervaagt hij met de blur uit kopOpties, op iOS 26 tekent het systeem zijn
 * eigen scrollrand. De ScrollView van Detail begint zelf onder de kop
 * (contentInsetAdjustmentBehavior). Android houdt de effen M3-kopbalk.
 */
const detailId = ({ params }: { params: StapelParams['Detail'] }) => params?.melding?.id;
const detailOpties: NativeStackNavigationOptions = {
  title: 'Incident',
  ...(isIOS ? { headerTransparent: true } : {}),
};

function useKop(): NativeStackNavigationOptions {
  const C = useThema();
  const minderBeweging = useMinderBeweging();
  return React.useMemo(() => kopOpties(C, minderBeweging), [C, minderBeweging]);
}

// Buurt zonder kop op beide platforms (keuze Chris 01-09): de titel herhaalde
// het tabblad er recht onder. De Live-pil staat bovenin de lijst.
function BuurtStapel() {
  const kop = useKop();
  return (
    <Stapel.Navigator screenOptions={kop}>
      <Stapel.Screen name="Buurt" component={BuurtScreen} options={{ title: 'Nearby', headerShown: false }} />
      <Stapel.Screen name="Detail" component={DetailScreen} getId={detailId} options={detailOpties} />
    </Stapel.Navigator>
  );
}

/**
 * De kaart vult het scherm tot onder de statusbalk, zoals Apple Kaarten.
 *
 * Groep: een blad van het systeem voor meldingen op één plek, half open en
 * door te trekken tot vol scherm. iOS: UISheetPresentationController met
 * greep; op iOS 26 een doorzichtige achtergrond, dan tekent het systeem het
 * blad in glas. Android: een BottomSheet (react-native-screens); de greep
 * tekent GroepScreen zelf, want sheetGrabberVisible is alleen voor iOS.
 */
function KaartStapel() {
  const C = useThema();
  const kop = useKop();
  return (
    <Stapel.Navigator screenOptions={kop}>
      <Stapel.Screen name="Kaart" component={KaartScreen} options={{ title: 'Map', headerShown: false }} />
      <Stapel.Screen name="Detail" component={DetailScreen} getId={detailId} options={detailOpties} />
      <Stapel.Screen
        name="Groep"
        component={GroepScreen}
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          // Android: de M3-bovenhoek van 28 dp; zonder waarde maakt
          // react-native-screens de hoeken vierkant. iOS houdt die van het
          // systeem.
          sheetCornerRadius: isIOS ? undefined : 28,
          contentStyle: { backgroundColor: isIOS26 ? 'transparent' : C.bg },
        }}
      />
    </Stapel.Navigator>
  );
}

function ZoekStapel() {
  const kop = useKop();
  return (
    <Stapel.Navigator screenOptions={kop}>
      <Stapel.Screen name="Zoeken" component={ZoekScreen} options={{ title: 'Search', ...groteTitel }} />
      <Stapel.Screen name="Detail" component={DetailScreen} getId={detailId} options={detailOpties} />
    </Stapel.Navigator>
  );
}

function InstellingenStapel() {
  const kop = useKop();
  return (
    <Stapel.Navigator screenOptions={kop}>
      <Stapel.Screen name="Instellingen" component={InstellingenScreen} options={{ title: 'Settings', ...groteTitel }} />
    </Stapel.Navigator>
  );
}

/**
 * Android: de inhoud van elk tabblad stopt boven de balk. De tabcontainer
 * legt de inhoud over de volle hoogte onder de balk en meldt de balkhoogte
 * als 'interface'-inzet. Eén keer per tabblad: de container heeft één
 * luisteraar, en een tweede SafeAreaView van react-native-screens binnen
 * hetzelfde tabblad neemt die over (daarom gebruikt KaartScreen op Android
 * gewone Views).
 */
function androidLaag({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={{ bottom: true }} insetType="interface" style={{ flex: 1 }}>
      {children}
    </SafeAreaView>
  );
}

export function TabNavigatie() {
  const C = useThema();

  // Zoeken staat op iOS achteraan (iOS 26 kan hem dan los naast de balk
  // zetten) en op Android als derde. Op iOS geen eigen icoon of label: dan
  // tekent het systeem zijn eigen zoekknop.
  const zoekTab = (
    <Tab.Screen
      name="ZoekTab"
      component={ZoekStapel}
      options={{
        title: 'Search',
        tabBarRole: isIOS ? 'search' : undefined,
        tabBarIcon: isIOS ? undefined : { type: 'image', source: { uri: 'tab_zoeken' } },
        lazy: true,
      }}
    />
  );

  return (
    <Tab.Navigator
      // Android-terug vanuit Kaart, Zoeken of Instellingen gaat eerst naar Buurt.
      backBehavior="firstRoute"
      screenLayout={isIOS ? undefined : androidLaag}
      screenOptions={{
        // iOS 26-glas kan licht of donker worden met wat eronder ligt; dan
        // moet het accent mee, los van het thema van de app. Het label is
        // tekst, dus in het licht accentTekst: het gewone accent haalt op de
        // witte balk maar 4.3:1. In het donker zijn ze gelijk.
        tabBarActiveTintColor: isIOS
          ? DynamicColorIOS({ light: PALET_LICHT.accentTekst, dark: PALET_DONKER.accentTekst })
          : C.accentTekst,
        tabBarInactiveTintColor: isIOS ? (isIOS26 ? undefined : PlatformColor('systemGray')) : C.textSecondary,
        tabBarActiveIndicatorColor: C.accentSoft,
        tabBarRippleColor: C.rimpel,
        // Met vier tabbladen verbergt 'auto' de labels van de niet-gekozen
        // tabs; M3 wil ze altijd zien.
        tabBarLabelVisibilityMode: 'labeled',
        // Android: M3 labelMedium (500). Zonder deze stijl geeft bottom-tabs
        // het gewone gewicht door en vervangt react-native-screens het
        // lettertype van de balk door Roboto Regular.
        tabBarLabelStyle: isIOS ? undefined : { fontWeight: '500' },
        // Onder iOS 26 waarschuwt de native kant bij alles behalve 'automatic'.
        tabBarMinimizeBehavior: isIOS26 ? 'onScrollDown' : undefined,
      }}
    >
      <Tab.Screen
        name="BuurtTab"
        component={BuurtStapel}
        options={{ title: 'Nearby', tabBarIcon: tabIcoon('tabBuurt', 'tabBuurtActief', 'tab_buurt') }}
      />
      <Tab.Screen
        name="KaartTab"
        component={KaartStapel}
        options={{ title: 'Map', tabBarIcon: tabIcoon('tabKaart', 'tabKaartActief', 'tab_kaart'), lazy: true }}
      />
      {!isIOS && zoekTab}
      <Tab.Screen
        name="InstellingenTab"
        component={InstellingenStapel}
        options={{
          title: 'Settings',
          tabBarIcon: tabIcoon('tabInstellingen', 'tabInstellingenActief', 'tab_instellingen'),
          lazy: true,
        }}
      />
      {isIOS && zoekTab}
    </Tab.Navigator>
  );
}
