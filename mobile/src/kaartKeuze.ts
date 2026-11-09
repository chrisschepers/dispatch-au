/**
 * De keuzes op de kaart (filter, ondergrond, lagen in de lucht), bewaard in
 * AsyncStorage. Bewust los van de instellingen: het Buurt-scherm laadt opnieuw
 * bij elke wijziging daarin, en een filter op de kaart hoort de lijst niet te
 * verversen. Het kaartscherm en zijn bladen (Filters, Kaartlagen) lezen
 * dezelfde waarde, zonder provider.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALLE_DIENSTKEYS } from './diensten';
import { schoneKeuze, standaardKeuze, type KaartKeuze } from './kaartFilter';

const SLEUTEL = 'dispatch.kaart.v1';

let keuze: KaartKeuze = standaardKeuze(ALLE_DIENSTKEYS);
const luisteraars = new Set<() => void>();
const meld = () => luisteraars.forEach((l) => l());

// Eén keer bij het laden van de module. Tot dan geldt de standaard; die is
// ook wat een nieuwe installatie ziet.
AsyncStorage.getItem(SLEUTEL)
  .then((raw) => {
    if (!raw) return;
    keuze = schoneKeuze(JSON.parse(raw), ALLE_DIENSTKEYS);
    meld();
  })
  .catch(() => { /* corrupt of geen opslag: de standaard blijft */ });

export function zetKaartKeuze(waarden: Partial<KaartKeuze>): void {
  keuze = { ...keuze, ...waarden };
  AsyncStorage.setItem(SLEUTEL, JSON.stringify(keuze)).catch(() => {});
  meld();
}

function abonneer(l: () => void): () => void {
  luisteraars.add(l);
  return () => { luisteraars.delete(l); };
}

export function useKaartKeuze(): KaartKeuze {
  return useSyncExternalStore(abonneer, () => keuze, () => keuze);
}
