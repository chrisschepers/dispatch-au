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
 * afstand tussen verzoeken en onthoudt eerdere antwoorden.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { T, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { Drukbaar } from './Drukbaar';

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

  // Typen zoekt niets: alleen de vorige uitkomst gaat weg, want die hoort
  // niet meer bij wat er staat.
  function typ(nieuw: string) {
    setTekst(nieuw);
    if (stand !== 'zoekt') { setSuggesties([]); setStand('leeg'); }
  }

  async function zoek() {
    const vraag = tekst.trim();
    if (stand === 'zoekt') return;
    if (vraag.length < MIN_TEKENS) { setSuggesties([]); setStand('te-kort'); return; }
    setStand('zoekt');
    try {
      const gevonden = await zoekPlaatsen(vraag);
      setSuggesties(gevonden);
      setStand(gevonden.length > 0 ? 'klaar' : 'niets');
    } catch {
      setSuggesties([]);
      setStand('fout');
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
        // Gekozen plaats: tik erop om hem te wissen en opnieuw te zoeken.
        <Drukbaar style={styles.gekozen} onPress={() => { onWis(); setTekst(''); setSuggesties([]); setStand('leeg'); }}>
          <MaterialCommunityIcons name="map-marker" size={16} color={C.accent} />
          <Text style={styles.gekozenTekst}>{waarde}</Text>
          <MaterialCommunityIcons name="close-circle" size={17} color={C.textMuted} />
        </Drukbaar>
      ) : (
        <View style={styles.invoerRij}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={C.textMuted} />
          <TextInput
            style={styles.invoer}
            value={tekst}
            onChangeText={typ}
            onSubmitEditing={zoek}
            placeholder="Suburb or town, then search"
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Suburb or town"
            accessibilityHint="Press search to look it up"
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
              schaal={0.99}
              style={[styles.suggestie, i > 0 && styles.scheiding]}
              onPress={() => {
                onKies(s);
                setTekst(s.naam);
                setSuggesties([]);
                setStand('leeg');
                Keyboard.dismiss();
              }}
            >
              <MaterialCommunityIcons name="map-marker" size={16} color={C.textMuted} />
              <Text style={styles.suggestieTekst}>{s.naam}</Text>
            </Drukbaar>
          ))}
        </View>
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
  gekozenTekst: { ...T.body, color: C.textPrimary, fontWeight: '600' },
  invoerRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoer: { flex: 1, ...T.body, fontSize: 16, color: C.textPrimary, paddingVertical: 6 },
  zoekKnop: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.accentSoft, minHeight: 36, justifyContent: 'center',
  },
  zoekKnopTekst: { ...T.body, fontSize: 15, fontWeight: '600', color: C.accent },
  melding: { ...T.klein, color: C.textSecondary, marginTop: 6 },
  lijst: { marginTop: 8, borderRadius: 10, backgroundColor: C.chipBg, overflow: 'hidden' },
  suggestie: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  suggestieTekst: { ...T.body, color: C.textPrimary },
});
