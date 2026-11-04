/**
 * Plaats zoeken, voor wie "Huidige locatie" uitzet en zelf een plaats wil
 * kiezen. Zonder resultatenlijst moet je de schrijfwijze raden en weet de app
 * bovendien geen coördinaat, dus dan werkt de straal niet (melding Chris 15-08).
 *
 * Bron is Nominatim (OpenStreetMap), dezelfde dienst die de grote app
 * gebruikt. We slaan naam én coördinaat op, zodat de meldingenlijst meteen om
 * het juiste punt kan zoeken.
 *
 * Gebruiksbeleid van de publieke Nominatim-server (controle 01-11-2026): geen
 * autocomplete, hooguit één verzoek per seconde en de app herkenbaar maken.
 * Daarom zoeken we pas als je op zoeken drukt (toetsenbord of knop), vanaf
 * drie tekens, nooit per toetsaanslag; zoekPlaatsen houdt zelf een seconde
 * afstand tussen verzoeken en onthoudt eerdere antwoorden. Onder de
 * resultaten staat de naamsvermelding die het beleid en de ODbL vragen.
 */
import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, Keyboard, Linking,
} from 'react-native';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { Drukbaar } from './Drukbaar';
import { Icoon } from './Icoon';

export interface PlaatsKeuze { naam: string; lat: number; lon: number }

interface Ruw {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/** Minder tekens geeft vooral ruis en onnodige verzoeken. */
export const MIN_TEKENS = 3;
/** Nominatim: hooguit één verzoek per seconde. */
const TUSSENPOZE_MS = 1000;
const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
let volgendeVrij = 0;
const eerder = new Map<string, PlaatsKeuze[]>();

/** Australische plaatsen die op de invoer lijken, met coördinaat. */
export async function zoekPlaatsen(vraag: string): Promise<PlaatsKeuze[]> {
  const sleutel = vraag.trim().toLowerCase();
  const bekend = eerder.get(sleutel);
  if (bekend) return bekend;

  // Plek in de rij meteen vastleggen, zodat ook twee snelle aanroepen
  // minstens een seconde uit elkaar de deur uit gaan.
  const nu = Date.now();
  const start = Math.max(nu, volgendeVrij);
  volgendeVrij = start + TUSSENPOZE_MS;
  if (start > nu) await new Promise((r) => setTimeout(r, start - nu));

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(vraag.trim())}`
    + '&countrycodes=au&format=json&addressdetails=1&limit=10';
  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'EmergenciesNearMe/1.0',
      Referer: 'https://emergenciesnearme.online',
    },
  });
  // 429 of een blokkadepagina: als fout melden, niet als "niets gevonden".
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data: Ruw[] = await res.json();

  const gezien = new Set<string>();
  const uit: PlaatsKeuze[] = [];
  for (const item of data) {
    const a = item.address ?? {};
    const naam = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? '';
    if (!naam || !item.lat || !item.lon) continue;
    const provincie = a.state ?? a.province ?? '';
    const sleutel = `${naam.toLowerCase()}|${provincie.toLowerCase()}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    // Provincie erbij bij dubbele namen (Bergen NH / Bergen L), zodat de
    // gebruiker ziet welke hij kiest.
    const dubbel = data.some((x) => {
      const b = x.address ?? {};
      const n = b.city ?? b.town ?? b.village ?? b.hamlet ?? '';
      return n === naam && (b.state ?? '') !== provincie;
    });
    uit.push({
      naam: dubbel && provincie ? `${naam} (${provincie})` : naam,
      lat: Number(item.lat),
      lon: Number(item.lon),
    });
    if (uit.length >= 6) break;
  }
  eerder.set(sleutel, uit);
  if (eerder.size > 30) eerder.delete(eerder.keys().next().value as string);
  return uit;
}

type Stand = 'leeg' | 'te-kort' | 'zoekt' | 'klaar' | 'niets' | 'fout';

export function PlaatsZoeker({
  waarde, onKies, onWis,
}: { waarde: string | null; onKies: (keuze: PlaatsKeuze) => void; onWis: () => void }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const [tekst, setTekst] = useState(waarde ?? '');
  const [suggesties, setSuggesties] = useState<PlaatsKeuze[]>([]);
  const [stand, setStand] = useState<Stand>('leeg');
  // De tekst zoals hij nu in het veld staat. zoek() leest hem na het wachten
  // op Nominatim; de `tekst` uit de closure is dan die van vóór het wachten.
  const actueel = useRef(waarde ?? '');

  function zetTekst(nieuw: string) {
    actueel.current = nieuw;
    setTekst(nieuw);
  }

  // Typen zoekt niets: alleen de vorige uitkomst gaat weg, want die hoort
  // niet meer bij wat er staat. Tijdens een zoekopdracht ruimt zoek() zelf op.
  function typ(nieuw: string) {
    zetTekst(nieuw);
    if (stand !== 'zoekt') { setSuggesties([]); setStand('leeg'); }
  }

  async function zoek() {
    const vraag = tekst.trim();
    if (stand === 'zoekt') return;
    if (vraag.length < MIN_TEKENS) { setSuggesties([]); setStand('te-kort'); return; }
    setStand('zoekt');
    // Doorgetypt terwijl het verzoek liep (dat kan ruim een seconde duren
    // door de tussenpoos): de uitkomst hoort dan bij een oude tekst. Weggooien
    // en terug naar 'leeg', zodat de hint om opnieuw te zoeken verschijnt.
    const verouderd = () => actueel.current.trim() !== vraag;
    try {
      const gevonden = await zoekPlaatsen(vraag);
      if (verouderd()) { setSuggesties([]); setStand('leeg'); return; }
      setSuggesties(gevonden);
      setStand(gevonden.length > 0 ? 'klaar' : 'niets');
    } catch {
      setSuggesties([]);
      setStand(verouderd() ? 'leeg' : 'fout');
    }
  }

  const zoekt = stand === 'zoekt';
  const melding = stand === 'te-kort'
    ? `Type at least ${MIN_TEKENS} letters, then search.`
    : stand === 'niets'
      ? 'No places found. Check the spelling and search again.'
      : stand === 'fout'
        ? 'Searching did not work. Check your connection and try again.'
        : stand === 'leeg' && tekst.trim().length > 0
          ? 'Press search to look it up.'
          : null;

  return (
    <View>
      {waarde ? (
        // Gekozen plaats: tik erop om hem te wissen en opnieuw te zoeken. Het
        // kruisje zegt dat alleen in beeld, dus de schermlezer krijgt het zo.
        <Drukbaar
          style={styles.gekozen}
          label={`${waarde}. Tap to clear and choose another place`}
          onPress={() => { onWis(); zetTekst(''); setSuggesties([]); setStand('leeg'); }}
        >
          <Icoon naam="plaats" grootte={16} kleur={C.accent} />
          <Text style={styles.gekozenTekst}>{waarde}</Text>
          <Icoon naam="wissen" grootte={17} kleur={C.textMuted} />
        </Drukbaar>
      ) : (
        <View style={styles.invoerRij}>
          <Icoon naam="plaatsZoeken" grootte={18} kleur={C.textMuted} />
          <TextInput
            style={styles.invoer}
            // Een plaatshouder is geen naam: hij verdwijnt zodra je typt.
            accessibilityLabel="Suburb or town"
            accessibilityHint="Press search to look it up"
            value={tekst}
            onChangeText={typ}
            onSubmitEditing={zoek}
            placeholder="Suburb or town, then search"
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            // Android: geen streep onder het veld (het staat al als rij in
            // een kaart) en cursor, grepen en selectie in het accent van het
            // palet. iOS houdt de standaard: daar kleurt selectionColor ook
            // de cursor, en met deze doorzichtigheid zie je die nauwelijks.
            underlineColorAndroid="transparent"
            cursorColor={C.accent}
            selectionHandleColor={C.accent}
            selectionColor={isIOS ? undefined : `${C.accent}55`}
          />
          {zoekt ? (
            <ActivityIndicator size="small" color={C.textMuted} />
          ) : (
            <Drukbaar
              style={styles.zoekKnop}
              onPress={zoek}
              label="Search for this suburb or town"
              trillen={false}
            >
              <Text style={styles.zoekKnopTekst}>Search</Text>
            </Drukbaar>
          )}
        </View>
      )}

      {!waarde && melding ? (
        <Text style={styles.melding} accessibilityLiveRegion="polite">{melding}</Text>
      ) : null}

      {suggesties.length > 0 && (
        <View style={styles.lijst}>
          {suggesties.map((s, i) => (
            <Drukbaar
              key={`${s.naam}-${s.lat}`}
              // Oplichten zoals een rij in een lijst, niet inzakken.
              markeer
              style={[styles.suggestie, i > 0 && styles.scheiding]}
              onPress={() => {
                onKies(s);
                zetTekst(s.naam);
                setSuggesties([]);
                setStand('leeg');
                Keyboard.dismiss();
              }}
            >
              <Icoon naam="plaats" grootte={16} kleur={C.textMuted} />
              <Text style={styles.suggestieTekst}>{s.naam}</Text>
            </Drukbaar>
          ))}
        </View>
      )}

      {/* Naamsvermelding volgens het Nominatim-beleid en de ODbL: zichtbaar
          zolang er resultaten uit OpenStreetMap in beeld staan. */}
      {suggesties.length > 0 && (
        <Text
          style={styles.bron}
          accessibilityRole="link"
          onPress={() => { Linking.openURL(OSM_COPYRIGHT).catch(() => {}); }}
        >
          Search by Nominatim · © OpenStreetMap contributors
        </Text>
      )}
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  gekozen: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: C.accentSoft, alignSelf: 'flex-start',
  },
  gekozenTekst: { ...T.body, color: C.textPrimary, fontWeight: F.weightSemibold },
  invoerRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Raakvlak van het platform: 44 pt (iOS) of 48 dp (Android), ook voor de
  // suggesties en de zoekknop. hitSlop helpt daar niet: de lijst knipt af
  // (overflow).
  invoer: { flex: 1, ...T.body, fontSize: 16, color: C.textPrimary, paddingVertical: 6, minHeight: isIOS ? 44 : 48 },
  // Zoeken gebeurt pas op deze knop of de zoektoets (Nominatim-beleid, zie
  // boven), dus een echte knop met tekst in het accent, als een capsule.
  zoekKnop: {
    paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accentSoft, minHeight: isIOS ? 44 : 48, justifyContent: 'center',
  },
  zoekKnopTekst: { ...T.body, fontSize: 15, fontWeight: F.weightSemibold, color: C.accent },
  melding: { ...T.klein, color: C.textSecondary, marginTop: 6 },
  // borderCurve: de vloeiende iOS-hoek; Android negeert hem.
  lijst: { marginTop: 8, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.chipBg, overflow: 'hidden' },
  suggestie: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11,
    minHeight: isIOS ? 44 : 48,
  },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  suggestieTekst: { ...T.body, color: C.textPrimary },
  bron: { ...T.klein, color: C.textMuted, marginTop: 6 },
});
