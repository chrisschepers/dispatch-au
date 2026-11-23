/**
 * Ophalen van de vliegtuigen voor de kaart (zie vliegtuigData.ts). Alleen
 * zolang iemand kijkt: de kaart met een luchtlaag aan, of het blad van een
 * toestel. De backend telt elk verzoek als "er kijkt iemand" en vraagt dan
 * zelf elke 10 s de posities op (adsb.fi); zonder kijkers niet.
 *
 * Eén gedeeld beeld voor kaart en blad: het blad ligt boven de kaart, en dan
 * heeft de kaart zelf geen focus meer.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from './api';
import { parseLuchtBeeld, type LuchtBeeld } from './vliegtuigData';

/** Om de 10 s, het ritme van de backend (23-11: was 30 s, een heli leek stil te staan). */
const ELK_MS = 10_000;

let beeld: LuchtBeeld | null = null;
let opgehaald = 0;
let bezig = false;
const luisteraars = new Set<() => void>();
// Hoeveel de klok van het toestel voorloopt op die van de server (ms), uit de
// Date-kop van het antwoord. Null = onbekend: dan rekent de kaart niet vooruit.
let klokVoor: number | null = null;

/**
 * Seconden sinds deze positie, op de klok van de server. Null zolang het
 * klokverschil onbekend is; een telefoon die een minuut verkeerd staat zou
 * een toestel anders een minuut te ver vooruit zetten.
 */
export function leeftijdSec(seenAt: string, nu = Date.now()): number | null {
  if (klokVoor == null) return null;
  const t = Date.parse(seenAt);
  return Number.isFinite(t) ? (nu - klokVoor - t) / 1000 : null;
}

async function haal(): Promise<void> {
  // Kaart en blad tegelijk open: één verzoek, niet twee.
  if (bezig || Date.now() - opgehaald < 5_000) return;
  if (!/^https:\/\//.test(API_BASE)) return;
  bezig = true;
  try {
    const res = await fetch(`${API_BASE}/v1/aircraft`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    beeld = parseLuchtBeeld(await res.json());
    opgehaald = Date.now();
    const server = Date.parse(res.headers.get('date') ?? '');
    klokVoor = Number.isFinite(server) ? opgehaald - server : null;
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
