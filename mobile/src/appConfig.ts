import { API_BASE } from './api';
import { KAART_TERUGBLIK_UREN } from './diensten';
import { geldigeUren } from './kaartTijden';

/**
 * Instellingen uit de backend (30-10-2026, wens Chris: niet-brandmeldingen
 * langer op de kaart, en dat voortaan zonder app-update kunnen aanpassen).
 * Eén keer bij het starten; lukt dat niet, dan gelden de ingebouwde waarden.
 */
let kaart: Record<string, number> = { ...KAART_TERUGBLIK_UREN };

export function kaartTerugblikUren(): Record<string, number> {
  return kaart;
}

export async function laadAppConfig(): Promise<void> {
  if (!/^https:\/\//.test(API_BASE)) return;
  try {
    const res = await fetch(`${API_BASE}/v1/config?region=au`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const j = (await res.json()) as { kaartTerugblikUren?: unknown };
    kaart = geldigeUren(j?.kaartTerugblikUren, KAART_TERUGBLIK_UREN);
  } catch {
    // Geen verbinding: de ingebouwde waarden blijven gelden.
  }
}
