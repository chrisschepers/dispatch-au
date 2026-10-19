/** Afstand in km tussen een punt en een melding (haversine); null zonder coördinaat. */
import type { Melding } from './api';

export function afstandKm(aLat: number, aLon: number, m: Melding): number | null {
  const lat = m.lat, lon = m.lon ?? m.lng;
  if (lat == null || lon == null) return null;
  const R = 6371, dLat = ((lat - aLat) * Math.PI) / 180, dLon = ((lon - aLon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
