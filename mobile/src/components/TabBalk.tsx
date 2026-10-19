/**
 * Zwevende tabbalk die om zijn inhoud sluit, precies zoals in Alarmeringen
 * P2000 (wens Chris 16-08). De standaardbalk van React Navigation wordt over
 * de volle breedte uitgerekt; ook met vaste marges bleef hij daardoor breder
 * dan nodig en stonden de drie knoppen ver uit elkaar. Een eigen balk meet
 * zichzelf naar de knoppen, en die zijn met drie tabs vanzelf smal.
 *
 * Vectoriconen in plaats van emoji, om dezelfde reden als in de hoofdapp:
 * ze kleuren mee met het accent en zien er op elke Android-versie gelijk uit.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, TextInput, Keyboard, BackHandler, LayoutAnimation,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T, isIOS, VEER, mindeBeweging, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { ZoekResultaten } from './ZoekResultaten';

type Icoon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: Record<string, { icoon: Icoon; icoonActief: Icoon; label: string }> = {
  Buurt: { icoon: 'map-marker-radius-outline', icoonActief: 'map-marker-radius', label: 'Nearby' },
  Kaart: { icoon: 'map-outline', icoonActief: 'map', label: 'Map' },
  Instellingen: { icoon: 'cog-outline', icoonActief: 'cog', label: 'Settings' },
};

function TabKnop({
  naam, actief, onPress,
}: { naam: string; actief: boolean; onPress: () => void }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const schaal = useRef(new Animated.Value(1)).current;
  const cfg = TABS[naam];
  if (!cfg) return null;

  function veer(naarWaarde: number) {
    if (mindeBeweging) return;
    Animated.spring(schaal, { toValue: naarWaarde, useNativeDriver: true, ...VEER.standaard }).start();
  }

  return (
    <Pressable
      onPressIn={() => veer(0.94)}
      onPressOut={() => veer(1)}
      onPress={() => {
        if (!actief) Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityLabel={cfg.label}
      accessibilityState={{ selected: actief }}
    >
      <Animated.View style={[styles.knop, actief && styles.knopActief, { transform: [{ scale: schaal }] }]}>
        <MaterialCommunityIcons
          name={actief ? cfg.icoonActief : cfg.icoon}
          size={21}
          color={actief ? C.accent : C.textMuted}
        />
        <Text
          style={[styles.label, actief && { color: C.accent }]}
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
        >
          {cfg.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Zoeken zit in de balk zelf, zoals de iOS-zoekbalk (wens Chris 27-09): rechts
 * een rond vergrootglas. Tik je erop, dan krimpen de tabs in één vloeiende
 * beweging tot een rond knopje met het huidige tabblad en groeit het
 * vergrootglas uit tot een zoekveld; de resultaten vloeien over het scherm
 * (ZoekResultaten). Het toetsenbord komt pas als je in het veld tikt: eerst
 * zien waar je bent, dan typen (TestFlight-ronde 27-09).
 *
 * Eén voortgangswaarde (0 = tabs, 1 = zoeken) drijft alles aan, dus alles
 * beweegt precies samen. Breedtes kunnen niet via de native driver; voor een
 * paar vlakken in één balk is de JS-driver ruim snel genoeg.
 */
const ROND = 58;
const TUSSEN = 10;

export function TabBalk({ state, navigation }: BottomTabBarProps) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const [zoek, setZoek] = useState(false);          // resultaten in beeld
  const [zoekModus, setZoekModus] = useState(false); // doel van de animatie
  const [vraag, setVraag] = useState('');
  const [toetsenbord, setToetsenbord] = useState(0);
  const [balkHoogte, setBalkHoogte] = useState(64);
  const [ruimte, setRuimte] = useState(0);           // breedte van de hele rij
  const [pilBreed, setPilBreed] = useState(230);     // natuurlijke breedte tabs
  const invoer = useRef<TextInput>(null);
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const aan = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setToetsenbord(e.endCoordinates.height);
    });
    const uit = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', () => setToetsenbord(0));
    return () => { aan.remove(); uit.remove(); };
  }, []);

  // Android-terugknop sluit eerst het zoeken, niet de app.
  useEffect(() => {
    if (!zoek) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { sluitZoek(); return true; });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoek]);

  function naar(doel: 0 | 1, klaar?: () => void) {
    if (mindeBeweging) { v.setValue(doel); klaar?.(); return; }
    Animated.spring(v, {
      toValue: doel, useNativeDriver: false,
      // Kritisch gedempt: vloeiend aankomen zonder door te schieten.
      stiffness: 260, damping: 30, mass: 1,
    }).start(({ finished }) => { if (finished) klaar?.(); });
  }

  function openZoek() {
    Haptics.selectionAsync().catch(() => {});
    setZoek(true);
    setZoekModus(true);
    naar(1);
  }

  function sluitZoek() {
    invoer.current?.blur();
    Keyboard.dismiss();
    setZoekModus(false);
    naar(0, () => { setZoek(false); setVraag(''); });
  }

  const huidig = TABS[state.routes[state.index]?.name ?? ''] ?? TABS.Buurt!;

  // Geometrie: in rust staan tabs + rondje samen in het midden; zoekend vult
  // de rij de hele breedte met rondje links en het veld rechts.
  const rust = pilBreed + TUSSEN + ROND;
  const veldBreed = Math.max(ROND, ruimte - ROND - TUSSEN);
  const linksBreed = v.interpolate({ inputRange: [0, 1], outputRange: [pilBreed, ROND] });
  const rechtsBreed = v.interpolate({ inputRange: [0, 1], outputRange: [ROND, veldBreed] });
  const inspringen = v.interpolate({ inputRange: [0, 1], outputRange: [Math.max(0, (ruimte - rust) / 2), 0] });
  const tabsZicht = v.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' });
  const rondZicht = v.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const veldZicht = v.interpolate({ inputRange: [0.55, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <>
      {zoek && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: v }]} pointerEvents={zoekModus ? 'auto' : 'none'}>
          <ZoekResultaten
            vraag={vraag}
            onderRuimte={balkHoogte + toetsenbord}
            // Detail staat in de stack boven de tabs; navigate gaat vanzelf omhoog.
            onKies={(m) => (navigation as unknown as { navigate: (r: string, p: object) => void }).navigate('Detail', { melding: m })}
          />
        </Animated.View>
      )}
      <View
        style={[styles.omhulsel, toetsenbord > 0 && { bottom: toetsenbord - (isIOS ? 22 : 0) }]}
        pointerEvents="box-none"
        onLayout={(e) => setBalkHoogte(e.nativeEvent.layout.height)}
      >
        <SafeAreaView edges={toetsenbord > 0 ? [] : ['bottom']} pointerEvents="box-none">
          <View
            style={styles.balkRij}
            pointerEvents="box-none"
            onLayout={(e) => setRuimte(e.nativeEvent.layout.width)}
          >
            <Animated.View style={{ marginLeft: inspringen, flexDirection: 'row', gap: TUSSEN }}>
              {/* Links: de tabs, die krimpen tot het ronde knopje. */}
              <Animated.View style={[styles.pil, styles.links, { width: linksBreed }]}>
                <Glas />
                <Animated.View
                  style={[styles.tabsLaag, { opacity: tabsZicht }]}
                  pointerEvents={zoekModus ? 'none' : 'auto'}
                  onLayout={(e) => { if (!zoek) setPilBreed(e.nativeEvent.layout.width); }}
                >
                  {state.routes.map((route, i) => (
                    <TabKnop
                      key={route.key}
                      naam={route.name}
                      actief={state.index === i}
                      onPress={() => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (state.index !== i && !event.defaultPrevented) navigation.navigate(route.name);
                      }}
                    />
                  ))}
                </Animated.View>
                <Animated.View
                  style={[styles.rondLaag, { opacity: rondZicht }]}
                  pointerEvents={zoekModus ? 'auto' : 'none'}
                >
                  <Pressable
                    style={styles.vul}
                    onPress={sluitZoek}
                    accessibilityRole="button"
                    accessibilityLabel={`Back to ${huidig.label}`}
                  >
                    <MaterialCommunityIcons name={huidig.icoonActief} size={24} color={C.accent} />
                  </Pressable>
                </Animated.View>
              </Animated.View>

              {/* Rechts: het vergrootglas, dat uitgroeit tot het zoekveld. */}
              <Animated.View style={[styles.pil, styles.rechts, { width: rechtsBreed }]}>
                <Glas />
                <Pressable
                  style={styles.vul}
                  onPress={zoekModus ? () => invoer.current?.focus() : openZoek}
                  accessibilityRole={zoekModus ? undefined : 'button'}
                  accessibilityLabel={zoekModus ? undefined : 'Search'}
                >
                  <View style={styles.veldInhoud}>
                    <MaterialCommunityIcons name="magnify" size={zoekModus ? 21 : 24} color={zoekModus ? C.textSecondary : C.textPrimary} />
                    <Animated.View style={[styles.invoerVak, { opacity: veldZicht }]} pointerEvents={zoekModus ? 'auto' : 'none'}>
                      <TextInput
                        ref={invoer}
                        style={styles.zoekInvoer}
                        value={vraag}
                        onChangeText={setVraag}
                        placeholder="Search…"
                        placeholderTextColor={C.textMuted}
                        autoCorrect={false}
                        returnKeyType="search"
                        onSubmitEditing={Keyboard.dismiss}
                        accessibilityLabel="Search by suburb, street or incident type"
                      />
                      {vraag ? (
                        <Pressable onPress={() => { setVraag(''); invoer.current?.focus(); }} hitSlop={10} accessibilityLabel="Wissen">
                          <MaterialCommunityIcons name="close-circle" size={18} color={C.textMuted} />
                        </Pressable>
                      ) : null}
                    </Animated.View>
                  </View>
                </Pressable>
              </Animated.View>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>
    </>
  );
}

/** Glaslaag van de balk: blur op iOS, melkwit erover (zie laag). */
function Glas() {
  const styles = useStijlen(maak_styles);
  return (
    <>
      {isIOS && <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />}
      {/* Op wit blijft glas alleen een grijze waas; een melkwitte laag
          eronder houdt de balk rustig zonder de blur op te geven. */}
      <View style={styles.laag} pointerEvents="none" />
    </>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  omhulsel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingBottom: 10, paddingHorizontal: 16,
  },
  balkRij: { flexDirection: 'row', alignItems: 'center' },
  links: { height: ROND, borderRadius: ROND / 2, paddingHorizontal: 0 },
  rechts: { height: ROND, borderRadius: ROND / 2, paddingHorizontal: 0 },
  tabsLaag: { position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5 },
  rondLaag: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  vul: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  veldInhoud: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', paddingLeft: 17, paddingRight: 14, gap: 8 },
  invoerVak: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoekInvoer: { flex: 1, ...T.body, fontSize: 17, color: C.textPrimary, paddingVertical: 0 },
  // Geen breedte: de pil meet zichzelf naar de knoppen (zoals de hoofdapp).
  pil: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 26,
    paddingHorizontal: 5,
    overflow: 'hidden',
    backgroundColor: isIOS ? 'transparent' : C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 10,
  },
  laag: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  knop: {
    alignItems: 'center', gap: 1,
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 21,
  },
  knopActief: { backgroundColor: C.accentSoft },
  label: { ...T.klein, fontSize: 10, fontWeight: '600', color: C.textMuted },
});
