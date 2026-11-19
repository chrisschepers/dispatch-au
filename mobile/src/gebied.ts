/**
 * Warning areas. An Australian warning (Advice, Watch and Act, Emergency
 * Warning) covers an area, and the first thing people ask is "is my place
 * inside it?". The feed carries the area as GeoJSON; until 19-11-2026 the app
 * only drew a pin. Free of react-native so the tests can run it
 * (tests/gebied.test.mjs). Same ray casting as backend/push.mjs.
 */
import type { Geometry } from 'geojson';

/** Rings of one polygon, positions as [lon, lat]. The first ring is the outline. */
type Ringen = number[][][];

/** Every polygon in the geometry, however it is wrapped. */
export function vlakken(g: Geometry | null | undefined): Ringen[] {
  if (!g) return [];
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(vlakken);
  if (g.type === 'Polygon') return g.coordinates.length ? [g.coordinates] : [];
  if (g.type === 'MultiPolygon') return g.coordinates.filter((r) => r.length > 0);
  return [];
}

export function heeftVlak(g: Geometry | null | undefined): boolean {
  return vlakken(g).length > 0;
}

function inRing(ring: number[][], lat: number, lon: number): boolean {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

/** Is this point inside the area (inside an outline and not in one of its holes)? */
export function binnenGebied(g: Geometry | null | undefined, lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return vlakken(g).some((ringen) =>
    inRing(ringen[0]!, lat, lon) && !ringen.slice(1).some((gat) => inRing(gat, lat, lon)));
}

/** The box around every outline: [south, west, north, east], or null without an area. */
export function omvang(g: Geometry | null | undefined): [number, number, number, number] | null {
  let z = Infinity, w = Infinity, n = -Infinity, o = -Infinity;
  for (const ringen of vlakken(g)) {
    for (const [lon, lat] of ringen[0] as [number, number][]) {
      if (lat < z) z = lat;
      if (lat > n) n = lat;
      if (lon < w) w = lon;
      if (lon > o) o = lon;
    }
  }
  return Number.isFinite(z) ? [z, w, n, o] : null;
}

/**
 * A place for the pin when the agency only published the area (Queensland
 * and South Australia often do): the middle of the box around it.
 */
export function middenVan(g: Geometry | null | undefined): [number, number] | null {
  const b = omvang(g);
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

/**
 * The colours of the Australian Warning System: yellow for Advice, orange for
 * Watch and Act, red for Emergency Warning. People know them from every
 * official app, so the areas use exactly these and not the app's own palette.
 * Level 0 (an incident with an outline, such as a fire ground) stays grey.
 */
export function vlakKleur(niveau: number): { rand: string; vulling: string } {
  if (niveau >= 3) return { rand: '#D61E1E', vulling: 'rgba(214,30,30,0.28)' };
  if (niveau === 2) return { rand: '#F07800', vulling: 'rgba(255,121,0,0.26)' };
  if (niveau === 1) return { rand: '#C9A800', vulling: 'rgba(251,224,50,0.26)' };
  return { rand: '#6B6B6B', vulling: 'rgba(107,107,107,0.16)' };
}

/** Hoogste aantal punten per omtrek op de kaart; een kustlijn heeft er duizenden. */
const MAX_PUNTEN = 300;

/** Outlines ready for a map polygon, thinned out when an outline is very detailed. */
export function kaartVlakken(g: Geometry | null | undefined): Array<{
  coordinates: { latitude: number; longitude: number }[];
  holes: { latitude: number; longitude: number }[][];
}> {
  const dun = (ring: number[][]) => {
    const stap = Math.max(1, Math.ceil(ring.length / MAX_PUNTEN));
    return ring.filter((_, i) => i % stap === 0 || i === ring.length - 1)
      .map(([lon, lat]) => ({ latitude: lat as number, longitude: lon as number }));
  };
  return vlakken(g).map((ringen) => ({ coordinates: dun(ringen[0]!), holes: ringen.slice(1).map(dun) }));
}

/** "You are inside this Watch and Act area", in the words of the level. */
export function binnenTekst(niveau: number): string {
  const naam = niveau >= 3 ? 'Emergency Warning' : niveau === 2 ? 'Watch and Act' : niveau === 1 ? 'Advice' : 'incident';
  return `You are inside this ${naam} area`;
}
