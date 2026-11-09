import { API_BASE } from './api';

/**
 * Instellingen uit de backend, één keer bij het starten; lukt dat niet, dan
 * gelden de ingebouwde waarden. Tot 08-11-2026 kwamen hier ook de
 * kaarttijden per dienst vandaan (kaartTerugblikUren); sindsdien kiest de
 * kaart zelf een periode in zijn filterblad (kaartFilter.ts). De backend
 * stuurt ze nog mee voor oudere versies van de app.
 */

/**
 * De RevenueCat-paywall als sheet over onze eigen betaalmuur (iOS). Standaard
 * UIT, ook als de config niet laadt: zonder paywall in het RevenueCat-dashboard
 * toont de SDK zijn standaardsjabloon, en daarin staan geen links naar de Terms
 * of Use en het privacybeleid (richtlijn 3.1.2, controle 01-11-2026). Onze
 * eigen muur eronder heeft ze wel.
 * Pas aanzetten (Railway: REVENUECAT_PAYWALL=aan) nadat er in het
 * RevenueCat-dashboard een paywall met links naar de Terms of Use (Apple-EULA)
 * en het privacybeleid is gepubliceerd.
 */
let revenueCatPaywall = false;
let laden: Promise<void> | null = null;

export function laadAppConfig(): Promise<void> {
  if (!laden) laden = haalAppConfig();
  return laden;
}

async function haalAppConfig(): Promise<void> {
  if (!/^https:\/\//.test(API_BASE)) return;
  try {
    const res = await fetch(`${API_BASE}/v1/config?region=au`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const j = (await res.json()) as { revenueCatPaywall?: unknown };
    // Alleen een echte true zet hem aan.
    revenueCatPaywall = j?.revenueCatPaywall === true;
  } catch {
    // Geen verbinding: de ingebouwde waarden blijven gelden.
  }
}

/**
 * Of de betaalmuur de RevenueCat-sheet mag openen. Wacht op de config van de
 * start (hooguit 4 s); komt die niet, dan blijft het nee.
 */
export async function revenueCatPaywallAan(): Promise<boolean> {
  await Promise.race([
    laadAppConfig(),
    new Promise<void>((r) => setTimeout(r, 4000)),
  ]);
  return revenueCatPaywall;
}
