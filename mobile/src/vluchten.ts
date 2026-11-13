/**
 * Ophalen van de vluchten van een toestel en van de toestellen bij een brand
 * (zie vluchtData.ts). Beide routes tellen bij de backend niet als "er kijkt
 * iemand" en zijn daar 30 s bewaard. Ontbreekt een route (oudere backend) of
 * mislukt het ophalen, dan null: het blok blijft weg, zonder foutmelding.
 */
import { API_BASE } from './api';
import { parseBrandToestellen, parseVluchten, type BrandToestel, type Vluchten } from './vluchtData';

async function haalJson(pad: string): Promise<unknown | null> {
  if (!/^https:\/\//.test(API_BASE)) return null;
  try {
    const res = await fetch(`${API_BASE}${pad}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** De blustoestellen die de laatste 24 uur bij deze brand waren; leeg als er niets is. */
export async function haalBrandToestellen(incidentId: string): Promise<{ toestellen: BrandToestel[]; bron: string | null }> {
  const json = await haalJson(`/v1/incidents/${encodeURIComponent(incidentId)}/aircraft`);
  return json == null ? { toestellen: [], bron: null } : parseBrandToestellen(json);
}

/** De vluchten van de laatste 7 dagen; null voor een toestel dat niet gevolgd wordt. */
export async function haalVluchten(hex: string): Promise<Vluchten | null> {
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const json = await haalJson(`/v1/aircraft/${hex}/flights`);
  return json == null ? null : parseVluchten(json);
}
