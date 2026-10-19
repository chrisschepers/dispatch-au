/**
 * Plaats zoeken met suggesties, voor wie "Huidige locatie" uitzet en zelf een
 * plaats wil kiezen. Zonder suggesties moet je de schrijfwijze raden en weet
 * de app bovendien geen coördinaat, dus dan werkt de straal niet (melding
 * Chris 15-08).
 *
 * Bron is Nominatim (OpenStreetMap), dezelfde dienst die de grote app
 * gebruikt. We slaan naam én coördinaat op, zodat de meldingenlijst meteen om
 * het juiste punt kan zoeken.
 */
import React, { useRef, useState } from 'react';
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

/** Nederlandse plaatsen die op de invoer lijken, met coördinaat. */
export async function zoekPlaatsen(vraag: string): Promise<PlaatsKeuze[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(vraag)}`
    + '&countrycodes=au&format=json&addressdetails=1&limit=10';
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'DispatchAustralia/1.0' },
  });
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
  return uit;
}

export function PlaatsZoeker({
  waarde, onKies, onWis,
}: { waarde: string | null; onKies: (keuze: PlaatsKeuze) => void; onWis: () => void }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const [tekst, setTekst] = useState(waarde ?? '');
  const [suggesties, setSuggesties] = useState<PlaatsKeuze[]>([]);
  const [zoekt, setZoekt] = useState(false);
  const wacht = useRef<ReturnType<typeof setTimeout> | null>(null);

  function typ(nieuw: string) {
    setTekst(nieuw);
    if (wacht.current) clearTimeout(wacht.current);
    // Wissen moet het zoeken ook echt stoppen, anders blijft het rondje draaien.
    if (nieuw.trim().length < 2) { setZoekt(false); setSuggesties([]); return; }
    setZoekt(true);
    wacht.current = setTimeout(async () => {
      try { setSuggesties(await zoekPlaatsen(nieuw.trim())); }
      catch { setSuggesties([]); }
      finally { setZoekt(false); }
    }, 350);
  }

  return (
    <View>
      {waarde ? (
        // Gekozen plaats: tik erop om hem te wissen en opnieuw te zoeken.
        <Drukbaar style={styles.gekozen} onPress={() => { onWis(); setTekst(''); setSuggesties([]); }}>
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
            placeholder="Search your suburb or town"
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
          />
          {zoekt ? <ActivityIndicator size="small" color={C.textMuted} /> : null}
        </View>
      )}

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
  lijst: { marginTop: 8, borderRadius: 10, backgroundColor: C.chipBg, overflow: 'hidden' },
  suggestie: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  suggestieTekst: { ...T.body, color: C.textPrimary },
});
