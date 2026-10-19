/** Geometrie zonder afhankelijkheid van de persoonlijke meldingsstraal. */
export function kaartVenster(regio: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) {
  const hoogte = regio.latitudeDelta * 111.32;
  const breedte = regio.longitudeDelta * 111.32 * Math.cos(regio.latitude * Math.PI / 180);
  return {
    laden: Number.isFinite(hoogte) && Number.isFinite(breedte) && hoogte > 0 && breedte > 0 && breedte <= 2500 && hoogte <= 3000,
    radiusKm: Math.max(0.2, Math.hypot(hoogte, breedte) / 2 * 1.15),
  };
}
