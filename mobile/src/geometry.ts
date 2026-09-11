import type { Geometry, Position } from 'geojson';
export type MapCoordinate = { latitude: number; longitude: number };
export function coordinate(p: Position): MapCoordinate {
  return { latitude: p[1], longitude: p[0] };
}
export function polygons(
  g: Geometry | null,
): { coordinates: MapCoordinate[]; holes: MapCoordinate[][] }[] {
  if (!g) return [];
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(polygons);
  const values =
    g.type === 'Polygon'
      ? [g.coordinates]
      : g.type === 'MultiPolygon'
        ? g.coordinates
        : [];
  return values
    .filter((rings) => rings.length > 0)
    .map((rings) => ({
      coordinates: rings[0].map(coordinate),
      holes: rings.slice(1).map((ring) => ring.map(coordinate)),
    }));
}
