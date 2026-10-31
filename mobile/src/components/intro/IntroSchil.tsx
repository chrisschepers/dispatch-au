/**
 * Opmaak van het startscherm en de proefperiode (wens Chris 27-09, naar het
 * voorbeeld van Alarmeringen P2000): zwarte grond, bovenin een telefoon met
 * een voorbeeldscherm, daaronder een korte titel en uitleg, stippen voor de
 * voortgang en één grote rode knop.
 *
 * Altijd donker, los van het thema: zo springt het lichte telefoonscherm eruit
 * en voelt het als een welkom, niet als een instellingenscherm.
 *
 * De kop en de voet met de knop staan vast; het toestel en de tekst ertussen
 * schuiven. Het toestel krijgt de ruimte die overblijft. Op een kleine iPhone
 * wordt hij dus kleiner, en bij grote tekst of in een laag venster (gesplitst
 * scherm) verdwijnt hij: hij is versiering, de knop en de tekst gaan voor.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, ActivityIndicator, Easing, ScrollView,
  useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { F, isIOS, mindeBeweging, PALET_DONKER } from '../../theme';
import { VastThema } from '../../thema';
import { Drukbaar } from '../Drukbaar';
import { Icoon } from '../Icoon';
import { Navigatiebalk } from '../Navigatiebalk';
import { Toestel, toestelBreedte } from './Toestel';
import { MAX_SMAL } from '../../inhoudMaat';

export const INTRO = {
  // Grond en vlakken komen uit het donkere palet: op iOS OLED-zwart met
  // #1c1c1e erop, op Android de M3-tonen #131313 en #1f1f1f (Material kent
  // geen puur zwart).
  grond: PALET_DONKER.bg,
  vlak: PALET_DONKER.card,
  tekst: '#ffffff',
  zacht: '#a1a1a6',
  /** Kleine lettertjes, zoals de verlengingsregel op de betaalmuur. */
  klein: '#8e8e93',
  link: '#c7c7cc',
  waarschuwing: '#ffb340',
  knop: '#9b231c',
  knopRand: '#c8352c',
  stip: '#48484a',
};

interface Props {
  /** Voorbeeldscherm in het toestel. */
  scherm: React.ReactNode;
  /** Voorbeeldscherm heeft zelf een donkere grond (vergrendelscherm). */
  schermDonker?: boolean;
  titel: string;
  tekst?: React.ReactNode;
  /** Tussen tekst en stippen: meldingen als "betaling wordt verwerkt". */
  extra?: React.ReactNode;
  stap?: number;
  aantal?: number;
  knop: string;
  onKnop: () => void;
  bezig?: boolean;
  knopUit?: boolean;
  onTerug?: () => void;
  /** Rechtsboven "Skip": alleen op stappen die je mag overslaan. */
  onOverslaan?: () => void;
  /** Onder de knop: herstellen, voorwaarden en dergelijke. */
  onder?: React.ReactNode;
  /** Wisselt per stap; laat het scherm zacht invloeien. */
  sleutel?: string | number;
}

export function IntroSchil({
  scherm, schermDonker, titel, tekst, extra, stap, aantal, knop, onKnop,
  bezig, knopUit, onTerug, onOverslaan, onder, sleutel,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const [vak, setVak] = useState<{ b: number; h: number } | null>(null);
  const [lijfH, setLijfH] = useState(0);
  const [onderH, setOnderH] = useState(0);
  const zicht = useRef(new Animated.Value(1)).current;
  const schuif = useRef<ScrollView>(null);

  useEffect(() => {
    // Elke stap begint bovenaan, ook als je de vorige had doorgeschoven.
    schuif.current?.scrollTo({ y: 0, animated: false });
    if (mindeBeweging) return;
    zicht.setValue(0);
    // Snel op gang, zacht tot stilstand: een scherm dat binnenkomt.
    Animated.timing(zicht, {
      toValue: 1, duration: 260, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true,
    }).start();
  }, [sleutel, zicht]);

  function opMaat(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setVak((v) => (v && v.b === width && v.h === height ? v : { b: width, h: height }));
  }

  // Het toestel is versiering: alleen als er echt plek voor is, en niet bij
  // grote tekst, want dan heeft de uitleg die ruimte nodig.
  const toonToestel = vak != null && vak.h >= 140 && fontScale < 1.5;

  // Wat onder de knop staat (herstellen, voorwaarden) hoort vast onderin.
  // Neemt het daar meer dan 40% van de hoogte in, bij grote tekst of in een
  // laag venster, dan zou het onder de rand verdwijnen zonder dat je erbij
  // kunt. Dan schuift het mee onder de tekst; de knop blijft altijd staan.
  // Beide maten hangen niet af van waar het staat (zelfde breedte), dus dit
  // springt niet heen en weer.
  const onderMee = !!onder && lijfH > 0 && onderH > lijfH * 0.4;
  const onderVak = onder ? (
    <View onLayout={(e) => setOnderH(e.nativeEvent.layout.height)}>{onder}</View>
  ) : null;

  // Het donkere palet als context: de Drukbaar-knoppen hierin (terug, de
  // hoofdknop, de links op de betaalmuur) halen hun Android-drukstaat uit
  // het thema, en op deze zwarte grond moet die licht zijn, ook als de app
  // op licht staat. Het toestel zet voor zijn voorbeeldscherm zelf weer
  // het lichte palet.
  return (
    <VastThema palet={PALET_DONKER}>
      <SafeAreaView style={styles.root}>
        {/* Witte klok op de zwarte grond, ook als de app op licht staat. De
            laatst gemonteerde StatusBar wint, en dat is deze. Op Android
            hetzelfde voor de knoppen van de navigatiebalk. */}
        <StatusBar style="light" />
        <Navigatiebalk stijl="light" />
        <View style={styles.kop}>
          {onTerug ? (
            <Drukbaar style={styles.terug} onPress={onTerug} label="Back" trillen={false} disabled={bezig}>
              {/* iOS een chevron, Android de Material-pijl naar links. */}
              <Icoon naam="terug" grootte={24} kleur={INTRO.tekst} gewicht="semibold" />
            </Drukbaar>
          ) : (
            // Lege plek, zodat Skip rechts blijft staan.
            <View />
          )}
          {onOverslaan ? (
            <Drukbaar
              style={styles.overslaan}
              onPress={onOverslaan}
              label="Skip introduction"
              trillen={false}
              disabled={bezig}
            >
              <Text style={styles.overslaanTekst}>Skip</Text>
            </Drukbaar>
          ) : null}
        </View>

        <View style={styles.lijf} onLayout={(e) => setLijfH(e.nativeEvent.layout.height)}>
          <ScrollView
            ref={schuif}
            style={styles.schuif}
            contentContainerStyle={styles.schuifInhoud}
            alwaysBounceVertical={false}
            // Lichte schuifbalk: de standaard donkere valt weg op zwart.
            indicatorStyle="white"
          >
            <Animated.View style={[styles.toestelVak, { opacity: zicht }]} onLayout={opMaat}>
              {toonToestel ? (
                <Toestel breedte={toestelBreedte(vak.b, vak.h)} donker={schermDonker}>{scherm}</Toestel>
              ) : null}
            </Animated.View>

            <Animated.View style={[styles.tekstVak, { opacity: zicht }]}>
              <Text style={styles.titel} accessibilityRole="header">{titel}</Text>
              {typeof tekst === 'string' ? <Text style={styles.tekst}>{tekst}</Text> : tekst}
              {extra}
            </Animated.View>

            {onderMee ? <View style={styles.onderMee}>{onderVak}</View> : null}
          </ScrollView>

          <View style={styles.voet}>
            {aantal != null && stap != null ? (
              <View style={styles.stippen} accessible accessibilityLabel={`Step ${stap + 1} of ${aantal}`}>
                {Array.from({ length: aantal }, (_, i) => (
                  <View key={i} style={[styles.stip, i === stap && styles.stipActief]} />
                ))}
              </View>
            ) : null}
            {/* Het label houdt de naam van de knop vast terwijl het wieltje
                draait; anders is hij dan naamloos voor VoiceOver en TalkBack. */}
            <Drukbaar
              style={[styles.knop, knopUit && styles.knopUit]}
              onPress={onKnop}
              disabled={bezig || knopUit}
              label={knop}
              bezig={bezig}
              trillen
            >
              {bezig ? <ActivityIndicator color={INTRO.tekst} /> : <Text style={styles.knopTekst}>{knop}</Text>}
            </Drukbaar>
            {onderMee ? null : onderVak}
          </View>
        </View>
      </SafeAreaView>
    </VastThema>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INTRO.grond },
  kop: {
    minHeight: 52, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  // Android 48 dp (M3-raakvlak), iOS 44 pt.
  terug: {
    width: isIOS ? 44 : 48, height: isIOS ? 44 : 48, borderRadius: isIOS ? 22 : 24,
    backgroundColor: INTRO.vlak, alignItems: 'center', justifyContent: 'center',
  },
  // Tekstknop; de negatieve marge zet de tekst op dezelfde 16 van de rand
  // als de terugknop links. De ronding geeft op Android een pilvormige
  // drukstaat, zoals een M3-tekstknop.
  overslaan: {
    minHeight: 44, paddingHorizontal: 12, marginRight: -12, borderRadius: 22, justifyContent: 'center',
  },
  overslaanTekst: { fontSize: 17, fontWeight: F.weightSemibold, color: INTRO.zacht },
  lijf: { flex: 1 },
  schuif: { flex: 1 },
  schuifInhoud: { flexGrow: 1 },
  toestelVak: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  tekstVak: {
    width: '100%', maxWidth: MAX_SMAL, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 22,
  },
  titel: {
    fontSize: 28, lineHeight: 34, fontWeight: F.weightBold, letterSpacing: -0.5,
    color: INTRO.tekst, textAlign: 'center',
  },
  tekst: { fontSize: 16.5, lineHeight: 23, color: INTRO.zacht, textAlign: 'center', marginTop: 10 },
  // Zelfde breedte en marge als in de voet, zodat het daar even hoog is.
  onderMee: {
    width: '100%', maxWidth: MAX_SMAL, alignSelf: 'center',
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8,
  },
  voet: {
    width: '100%', maxWidth: MAX_SMAL, alignSelf: 'center',
    paddingHorizontal: 24, paddingTop: 18, paddingBottom: 10, gap: 16,
  },
  stippen: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  stip: { width: 7, height: 7, borderRadius: 4, backgroundColor: INTRO.stip },
  stipActief: { width: 26, backgroundColor: INTRO.tekst },
  knop: {
    backgroundColor: INTRO.knop, borderRadius: 30, borderWidth: 1.5, borderColor: INTRO.knopRand,
    paddingVertical: 17, alignItems: 'center',
  },
  knopUit: { opacity: 0.5 },
  knopTekst: { fontSize: 18, fontWeight: F.weightSemibold, color: INTRO.tekst },
});
