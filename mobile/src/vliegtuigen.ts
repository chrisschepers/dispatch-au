/**
 * Ophalen van de vliegtuigen voor de kaart (zie vliegtuigData.ts). Alleen
 * zolang iemand kijkt: de kaart met een luchtlaag aan, of het blad van een
 * toestel. De backend telt elk verzoek als "er kijkt iemand" en vraagt dan
 * zelf elke 3 minuten de posities op bij adsb.lol; zonder kijkers niet.
 *
 * Eén gedeeld beeld voor kaart en blad: het blad ligt boven de kaart, en dan
 * heeft de kaart zelf geen focus meer.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from './api';
import { parseLuchtBeeld, type LuchtBeeld } from './vliegtuigData';

/** Om de 30 s: de backend ververst om de 3 minuten, zo zie je dat snel. */
const ELK_MS = 30_000;

let beeld: LuchtBeeld | null = null;
let opgehaald = 0;
let bezig = false;
const luisteraars = new Set<() => void>();

async function haal(): Promise<void> {
  // Kaart en blad tegelijk open: één verzoek, niet twee.
  if (bezig || Date.now() - opgehaald < 10_000) return;
  if (!/^https:\/\//.test(API_BASE)) return;
  bezig = true;
  try {
    const res = await fetch(`${API_BASE}/v1/aircraft`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    beeld = parseLuchtBeeld(await res.json());
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

/** Het laatste luchtbeeld; haalt het op zolang `aan` en de app voorgrond heeft. */
export function useLuchtBeeld(aan: boolean): LuchtBeeld | null {
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
