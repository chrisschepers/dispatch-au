import type { Place } from './domain/places';
export type Preferences = {
  theme: 'system' | 'light' | 'dark';
  saved: Place[];
  active: Place | null;
  includePlanned: boolean;
};
export const defaults: Preferences = {
  theme: 'system',
  saved: [],
  active: null,
  includePlanned: false,
};
export function validPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false;
  const p = value as Place;
  return (
    typeof p.id === 'string' &&
    p.id.length <= 200 &&
    typeof p.name === 'string' &&
    !!p.name.trim() &&
    p.name.length <= 100 &&
    Number.isFinite(p.lat) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    Number.isFinite(p.lng) &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    Number.isInteger(p.radius) &&
    p.radius >= 1 &&
    p.radius <= 200
  );
}
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return defaults;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return defaults;
    return {
      theme: ['system', 'light', 'dark'].includes(p.theme) ? p.theme : 'system',
      saved: Array.isArray(p.saved)
        ? p.saved.filter(validPlace).slice(0, 1)
        : [],
      active: validPlace(p.active) ? p.active : null,
      includePlanned: p.includePlanned === true,
    };
  } catch {
    return defaults;
  }
}
