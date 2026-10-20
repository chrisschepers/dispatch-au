/**
 * Zoekresultaten, over het huidige tabblad heen zolang de zoekbalk onderin
 * open staat (wens Chris 27-09, naar het voorbeeld van de iOS-zoekbalk).
 *
 * Geen suggesties of uitleg vooraf: je typt en de lijst volgt. Een leeg veld
 * toont gewoon de nieuwste meldingen, zodat er nooit een leeg scherm staat.
 * Elk woord moet ergens voorkomen ("brand arnhem" = branden in Arnhem); de
 * backend kent de afkortingen, zie databaseService.getMessages.
 *
 * "Gebruik ingestelde filters" = jouw straal en de diensten van de lijst.
 * Standaard uit: wie zoekt, zoekt meestal iets wat hij elders hoorde.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { zoekMeldingen, type Melding } from '../api';
import { afstandKm } from '../afstand';
import { useInstellingen } from '../instellingen';
import { bepaalPlek, bepaalPlekSnel } from '../locatie';
import { T, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { MeldingRij } from './MeldingRij';
import { Schakelaar } from './Schakelaar';

const WACHT_MS = 350;
const LIMIET = 60;

export function ZoekResultaten({ vraag, onKies, onderRuimte }: {
  vraag: string;
  onKies: (m: Melding) => void;
  /** Hoogte van de zoekbalk (+ toetsenbord) onderin, voor de lijstruimte. */
  onderRuimte: number;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const { inst } = useInstellingen();
  const [filters, setFilters] = useState(false);
  const [uitslag, setUitslag] = useState<Melding[] | null>(null);
  const [bezig, setBezig] = useState(true);
  const [fout, setFout] = useState(false);
  const [plek, setPlek] = useState<{ lat: number; lon: number } | null>(null);
  // Alleen het antwoord op de laatste vraag telt; een trage eerdere mag die
  // niet overschrijven.
  const volgnummer = useRef(0);

  useEffect(() => {
    // Eerst wat al bekend is; is er nog niets (net opgestart), dan een verse
    // fix. Anders bleven afstanden leeg en stond "ingestelde filters" grijs
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
  }, [vraag, filters, plek, inst.straalKm, inst.lijstDiensten]);

  const aantal = uitslag?.length ?? 0;
  const aantalTekst = fout
    ? 'Search is unavailable right now'
    : uitslag === null
      ? 'Searching…'
      : aantal === 0
        ? 'Nothing found'
        : `${aantal >= LIMIET ? `${LIMIET}+` : aantal} ${aantal === 1 ? 'incident' : 'incidents'} found`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.kop} accessibilityRole="header">Zoeken</Text>
      <View style={styles.balk}>
        <View style={styles.aantalRij}>
          <Text style={styles.aantal}>{aantalTekst}</Text>
          {bezig ? <ActivityIndicator size="small" color={C.textMuted} /> : null}
        </View>
        <View style={styles.filterRij}>
          <Text style={styles.filterTekst}>Gebruik ingestelde filters</Text>
          <Schakelaar value={filters} onValueChange={setFilters} disabled={!plek} />
        </View>
      </View>
      <FlatList
        data={uitslag ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.lijst, { paddingBottom: onderRuimte + 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        renderItem={({ item }) => (
          <MeldingRij
            m={item}
            km={plek ? afstandKm(plek.lat, plek.lon, item) : null}
            metDatum
            onPress={() => { Keyboard.dismiss(); onKies(item); }}
          />
        )}
      />
    </SafeAreaView>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg },
  kop: { ...T.display, color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  balk: {
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator,
  },
  aantalRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aantal: { ...T.kop, color: C.textSecondary },
  filterRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  filterTekst: { ...T.body, color: C.textSecondary },
  lijst: { paddingHorizontal: 16, paddingTop: 12 },
});
