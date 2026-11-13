/**
 * Ophalen van de vaartuigen voor de kaart (zie vaartuigData.ts). Alleen
 * zolang iemand kijkt: de kaart met een waterlaag aan, of het blad Kaartlagen
 * of van een vaartuig. De backend telt elk verzoek aan /v1/vessels als "er
 * kijkt iemand" en vraagt dan zelf elke minuut de posities op; zonder kijkers
 * veel minder vaak.
 *
 * Eén gedeeld beeld voor kaart en bladen, net als vliegtuigen.ts. Mislukt het
 * ophalen (geen verbinding, of een oudere backend zonder de route), dan
 * blijft het vorige beeld staan, of er is er geen: nooit een foutmelding.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from './api';
import { parseVaartBeeld, parseTochten, type VaartBeeld, type Tochten } from './vaartuigData';

/** Om de 30 s: de backend ververst elke minuut zolang er iemand kijkt. */
const ELK_MS = 30_000;

let beeld: VaartBeeld | null = null;
let opgehaald = 0;
let bezig = false;
const luisteraars = new Set<() => void>();

async function haal(): Promise<void> {
  // Kaart en blad tegelijk open: één verzoek, niet twee.
  if (bezig || Date.now() - opgehaald < 10_000) return;
  if (!/^https:\/\//.test(API_BASE)) return;
  bezig = true;
  try {
    const res = await fetch(`${API_BASE}/v1/vessels`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    beeld = parseVaartBeeld(await res.json());
    opgehaald = Date.now();
    luisteraars.forEach((l) => l());
  } catch {
    // Geen verbinding: het vorige beeld blijft staan, met zijn eigen tijden.
  } finally {
    bezig = false;
  }
}

function abonneer(l: () => void): () => void {
  luisteraars.add(l);
  return () => { luisteraars.delete(l); };
}

/** Het laatste beeld van het water; haalt het op zolang `aan` en de app voorgrond heeft. */
export function useVaartBeeld(aan: boolean): VaartBeeld | null {
  const huidig = useSyncExternalStore(abonneer, () => beeld, () => beeld);
  useEffect(() => {
    if (!aan) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void haal();
      timer = setInterval(() => void haal(), ELK_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [aan]);
  return huidig;
}

/** De tochten van één vaartuig; null als de route ontbreekt of het ophalen mislukt. */
export async function haalTochten(mmsi: number): Promise<Tochten | null> {
  if (!/^https:\/\//.test(API_BASE) || !Number.isInteger(mmsi)) return null;
  try {
    const res = await fetch(`${API_BASE}/v1/vessels/${mmsi}/trips`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return parseTochten(await res.json());
  } catch {
    return null;
  }
}
