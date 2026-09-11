import type { Category, Incident } from './feed-model';
export const light = {
  background: '#f2f2f7',
  card: '#ffffff',
  text: '#1c1c1e',
  secondary: '#62646c',
  line: '#e4e4e9',
  accent: '#d83329',
  tint: '#fff0ee',
  field: '#e8e8ee',
  green: '#187446',
};
export const dark: typeof light = {
  background: '#101013',
  card: '#1c1c20',
  text: '#f5f5f7',
  secondary: '#aaaab4',
  line: '#303036',
  accent: '#ff6c60',
  tint: '#352321',
  field: '#29292e',
  green: '#63ce98',
};
export type Colours = typeof light;
export const categories: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fire', label: 'Fire' },
  { id: 'ambulance', label: 'Ambulance' },
  { id: 'rescue', label: 'Rescue' },
  { id: 'storm', label: 'Storm & flood' },
  { id: 'hazmat', label: 'Hazmat' },
  { id: 'planned', label: 'Planned burns' },
];
export const categoryColors = {
  ambulance: '#b17b08',
  fire: '#d83329',
  rescue: '#2678cc',
  storm: '#138779',
  hazmat: '#9461ae',
  planned: '#9c702c',
  other: '#727884',
};
export const categoryIcons = {
  ambulance: 'medkit-outline',
  fire: 'flame-outline',
  rescue: 'help-buoy-outline',
  storm: 'rainy-outline',
  hazmat: 'flask-outline',
  planned: 'leaf-outline',
  other: 'information-circle-outline',
} as const;
export function rowColor(r: Incident) {
  return r.kind === 'warning'
    ? r.level === 'Emergency Warning'
      ? '#d83329'
      : r.level === 'Watch and Act'
        ? '#cb690b'
        : '#a8810b'
    : categoryColors[r.category];
}
export function localTime(
  value: string | null,
  full = false,
  timeZone = 'Australia/Melbourne',
) {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    ...(full
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { hour: '2-digit', minute: '2-digit', hour12: false }),
  }).format(new Date(value));
}
export function dayLabel(
  value: string | null,
  now: number,
  timeZone = 'Australia/Melbourne',
) {
  if (!value) return 'Time not supplied';
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  if (fmt.format(new Date(value)) === fmt.format(now)) return 'Today';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
