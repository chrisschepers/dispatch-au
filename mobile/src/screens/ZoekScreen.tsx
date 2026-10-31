/**
 * Zoeken, als eigen tabblad met het zoekveld van het systeem in de kop: op
 * iOS onder de grote titel (of los naast de tabbalk op iOS 26), op Android
 * achter het vergrootglas in de kopbalk. Eerder zat het in de zelfgebouwde
 * zwevende tabbalk (wens Chris 27-09, naar het voorbeeld van de iOS-zoekbalk);
 * sinds de systeemtabbalk is dit de plek die beide platforms zelf voor
 * zoeken hebben.
 *
 * Geen suggesties of uitleg vooraf: je typt en de lijst volgt. Een leeg veld
 * toont gewoon de nieuwste meldingen, zodat er nooit een leeg scherm staat.
 * Elk woord moet ergens voorkomen ("fire penrith" = branden in Penrith); zie
 * zoekMeldingen in api.ts.
 *
 * "Use my radius and services" = jouw straal en de diensten van de lijst.
 * Standaard uit: wie zoekt, zoekt meestal iets wat hij elders hoorde.
 *
 * Het toetsenbord komt pas als je in het veld tikt: eerst zien waar je bent,
 * dan typen (TestFlight-ronde 27-09).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SearchBarCommands } from 'react-native-screens';
import { zoekMeldingen, type Melding } from '../api';
import { afstandKm } from '../afstand';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { T, isIOS, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { MeldingRij } from '../components/MeldingRij';
import { Schakelaar } from '../components/Schakelaar';
import { Drukbaar } from '../components/Drukbaar';
import type { StapelParams } from '../navigatie';
import { useInhoudMaat } from '../inhoudMaat';

const WACHT_MS = 350;
const LIMIET = 60;

type Nav = NativeStackNavigationProp<StapelParams, 'Zoeken'>;

export default function ZoekScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const navigation = useNavigation<Nav>();
  // Op een breed scherm een kolom in het midden in plaats van rand tot rand.
  const { marge, kolom } = useInhoudMaat();
  const { inst } = useInstellingen();
  const zoekVeld = useRef<SearchBarCommands>(null);
  const [vraag, setVraag] = useState('');
  const [filters, setFilters] = useState(false);
  const [uitslag, setUitslag] = useState<Melding[] | null>(null);
  const [bezig, setBezig] = useState(true);
  const [fout, setFout] = useState(false);
  // Ophogen = dezelfde vraag nog een keer stellen (knop 'Try again').
  const [poging, setPoging] = useState(0);
  const [plek, setPlek] = useState<{ lat: number; lon: number } | null>(null);
  const [toetsenbord, setToetsenbord] = useState(0);
  // Alleen het antwoord op de laatste vraag telt; een trage eerdere mag die
  // niet overschrijven.
  const volgnummer = useRef(0);

  // Het zoekveld zit in de kop van de stapel, niet in het scherm zelf.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: zoekVeld,
        placeholder: 'Search suburbs, streets or incidents',
        autoCapitalize: 'none',
        hideWhenScrolling: false,
        tintColor: C.accent,
        textColor: C.textPrimary,
        hintTextColor: C.textMuted,
        headerIconColor: C.textPrimary,
        onChangeText: (e) => setVraag(e.nativeEvent.text),
        onSearchButtonPress: () => zoekVeld.current?.blur(),
        onCancelButtonPress: () => setVraag(''),
        onClose: () => setVraag(''),
      },
    });
  }, [navigation, C]);

  // Android: het toetsenbord schuift over de lijst heen. De hoogte erbij als
  // ruimte onderin, zodat de laatste resultaten bereikbaar blijven tijdens
  // het typen. Zonder animatie; wat extra ruimte kan geen kwaad. iOS regelt
  // dit zelf (automaticallyAdjustKeyboardInsets).
  useEffect(() => {
    if (isIOS) return;
    const aan = Keyboard.addListener('keyboardDidShow', (e) => setToetsenbord(e.endCoordinates.height));
    const uit = Keyboard.addListener('keyboardDidHide', () => setToetsenbord(0));
    return () => { aan.remove(); uit.remove(); };
  }, []);

  useEffect(() => {
    // Eerst wat al bekend is; is er nog niets (net opgestart), dan een verse
    // fix. Anders bleven afstanden leeg en stond het filter grijs
    // (emulatortest 27-09).
    bepaalPlekSnel(inst)
      .then((p) => p ?? bepaalPlek(inst))
      .then((p) => { if (p && p.bron !== 'geen' && p.bron !== 'buiten-au') setPlek(p); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nr = ++volgnummer.current;
    setBezig(true);
    const t = setTimeout(async () => {
      try {
        const ms = await zoekMeldingen(vraag, filters && plek
          ? { ...plek, radiusKm: inst.straalKm, disciplines: inst.lijstDiensten }
          : undefined);
        if (nr !== volgnummer.current) return;
        setUitslag(ms);
        setFout(false);
      } catch {
        if (nr === volgnummer.current) setFout(true);
      } finally {
        if (nr === volgnummer.current) setBezig(false);
      }
    }, vraag ? WACHT_MS : 0);
    return () => clearTimeout(t);
  }, [vraag, filters, plek, inst.straalKm, inst.lijstDiensten, poging]);

  const aantal = uitslag?.length ?? 0;
  const aantalTekst = fout
    ? 'Search is unavailable right now'
    : uitslag === null
      ? 'Searching…'
      : aantal === 0
        ? 'Nothing found'
        : `${aantal >= LIMIET ? `${LIMIET}+` : aantal} ${aantal === 1 ? 'incident' : 'incidents'} found`;

  const kop = (
    <View style={styles.balk}>
      <View style={styles.aantalRij}>
        {/* Bij een fout selecteerbaar: een foutmelding wil je kunnen doorsturen. */}
        <Text style={styles.aantal} selectable={fout}>{aantalTekst}</Text>
        {bezig ? <ActivityIndicator size="small" color={C.textMuted} /> : null}
        {fout && !bezig ? (
          <Drukbaar style={styles.opnieuw} onPress={() => setPoging((p) => p + 1)} label="Try again">
            <Text style={styles.opnieuwTekst}>Try again</Text>
          </Drukbaar>
        ) : null}
      </View>
      {/* De schakelaar draagt de naam; de tekst ernaast zwijgt voor de
          schermlezer, anders hoor je hem twee keer. */}
      <View style={styles.filterRij}>
        <Text
          style={styles.filterTekst}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          Use my radius and services
        </Text>
        <Schakelaar
          value={filters}
          onValueChange={setFilters}
          disabled={!plek}
          label="Use my radius and services"
        />
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.root}
      data={uitslag ?? []}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={kop}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.lijst, kolom, { paddingHorizontal: marge },
        toetsenbord > 0 && { paddingBottom: 24 + toetsenbord },
      ]}
      renderItem={({ item }) => (
        <MeldingRij
          m={item}
          km={plek ? afstandKm(plek.lat, plek.lon, item) : null}
          metDatum
          onPress={() => {
            zoekVeld.current?.blur();
            navigation.navigate('Detail', { melding: item });
          }}
        />
      )}
    />
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  lijst: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  balk: {
    paddingHorizontal: 4, paddingBottom: 10, marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator,
  },
  aantalRij: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  aantal: { ...T.kop, color: C.textSecondary, flexShrink: 1 },
  opnieuw: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  opnieuwTekst: { ...T.kop, color: C.accentTekst },
  filterRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  filterTekst: { ...T.body, color: C.textSecondary, flexShrink: 1 },
});
