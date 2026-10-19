/**
 * Turns feed rows into plain words for the list, the map and the detail
 * screen. Same exports as in 112 Meldingen, so the screens stay as they are;
 * the content is Australian: agency titles, warning levels and suburb names.
 */
import type { Melding } from './api';
import { C } from './theme';

/**
 * Australian Warning System levels, highest first. The feed publishes them as
 * "Emergency Warning", "Watch and Act" and "Advice".
 */
export function urgentieTekst(priority: string): string | null {
  const p = (priority || '').toLowerCase();
  if (p.includes('emergency')) return 'Emergency Warning: act now';
  if (p.includes('watch')) return 'Watch and Act: conditions are changing';
  if (p.includes('advice')) return 'Advice: stay informed';
  // No warning level: show the agency's status ("Responding", "Under control").
  const status = (priority || '').trim();
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : null;
}

export interface VertaaldeMelding {
  titel: string;
  icoon: string;
  emoji: string;
  kleur: string;
  dienst: string;
  groot: boolean;
  /** True when the title only names the service ("Fire incident"); the list
   *  then shows the suburb first, because that is what differs per row. */
  generiek?: boolean;
  kaartIcoon: string;
  kaartVlammen?: 1 | 2 | 3;
  kaartBrandend?: 'woning' | 'gebouw' | 'voertuig' | 'container' | 'natuur' | 'schip' | 'buiten';
  kaartBotsing?: boolean;
  /** "Emergency Warning", "Watch and Act" — null when there is none. */
  opschaling: string | null;
}

/** The warning level, if the agency issued one for this incident. */
export function opschalingLabel(m: Melding): string | null {
  const lvl = (m.level ?? m.priority ?? '').toLowerCase();
  if (lvl.includes('emergency')) return 'Emergency Warning';
  if (lvl.includes('watch')) return 'Watch and Act';
  if (lvl.includes('advice')) return 'Advice';
  return null;
}

/** Kept for compatibility with screens that test for a helicopter. */
export const MMT_RE = /\b(helicopter|aircraft)\b/i;

const DIENST: Record<string, { label: string; icoon: string; emoji: string; kleur: string }> = {
  Fire: { label: 'Fire', icoon: 'fire-truck', emoji: '🚒', kleur: C.brandweer },
  Ambulance: { label: 'Ambulance', icoon: 'ambulance', emoji: '🚑', kleur: C.ambulance },
  Rescue: { label: 'Rescue', icoon: 'car-emergency', emoji: '🚨', kleur: C.politie },
  Storm: { label: 'SES', icoon: 'weather-pouring', emoji: '🌧️', kleur: C.knrm },
  Hazmat: { label: 'Hazmat', icoon: 'biohazard', emoji: '☣️', kleur: C.mmt },
  Other: { label: 'Emergency services', icoon: 'alert-circle-outline', emoji: '⚠️', kleur: C.dienstOnbekend },
};

/** Recognised incident types → title and map symbol. First match wins. */
const REGELS: Array<{
  re: RegExp; titel: string; kaartIcoon?: string;
  kaartVlammen?: 1 | 2 | 3; kaartBrandend?: VertaaldeMelding['kaartBrandend']; kaartBotsing?: boolean;
}> = [
  { re: /bush ?fire|grass ?fire|scrub ?fire|vegetation fire|wildfire/i, titel: 'Bushfire', kaartBrandend: 'natuur', kaartVlammen: 2 },
  { re: /planned burn|burn.?off|hazard reduction/i, titel: 'Planned burn', kaartIcoon: 'fire', kaartVlammen: 1 },
  { re: /structure fire|house fire|residential fire|building fire/i, titel: 'Structure fire', kaartBrandend: 'woning', kaartVlammen: 2 },
  { re: /car fire|vehicle fire/i, titel: 'Vehicle fire', kaartBrandend: 'voertuig', kaartVlammen: 1 },
  { re: /rubbish|bin fire|skip fire/i, titel: 'Rubbish fire', kaartBrandend: 'container', kaartVlammen: 1 },
  { re: /alarm/i, titel: 'Fire alarm', kaartIcoon: 'bell-ring-outline' },
  { re: /road crash|accident|collision|mva|motor vehicle/i, titel: 'Road crash', kaartIcoon: 'car-emergency', kaartBotsing: true },
  { re: /rescue/i, titel: 'Rescue', kaartIcoon: 'lifebuoy' },
  { re: /flood/i, titel: 'Flooding', kaartIcoon: 'home-flood' },
  { re: /storm|tree down|building damage|wind/i, titel: 'Storm damage', kaartIcoon: 'weather-lightning-rainy' },
  { re: /hazmat|hazardous|chemical|gas leak|fuel spill/i, titel: 'Hazardous materials', kaartIcoon: 'biohazard' },
  { re: /smoke/i, titel: 'Smoke sighting', kaartIcoon: 'smoke' },
  { re: /fire/i, titel: 'Fire', kaartIcoon: 'fire', kaartVlammen: 1 },
];

export function vertaalMelding(m: Melding): VertaaldeMelding {
  const d = DIENST[m.discipline] ?? DIENST.Other;
  const tekst = `${m.title ?? ''} ${m.rawMessage ?? ''}`;
  const opschaling = opschalingLabel(m);
  const groot = opschaling === 'Emergency Warning' || opschaling === 'Watch and Act'
    || (m.resources ?? 0) >= 10;
  const symbool = { icoon: d.icoon, emoji: d.emoji };
  // Bare agency titles ("Fire incident", "Other") say nothing; the list then
  // leads with the street and suburb, which is what differs per row.
  if (/^\s*((fire|rescue|storm|flood|ses|ambulance|medical)\s+)?(incident|call)?\s*$|^\s*other\s*$/i.test(m.title ?? '')) {
    const t = m.discipline === 'Other' ? 'Emergency incident' : `${d.label} incident`;
    return { titel: t, generiek: true, ...symbool, kaartIcoon: d.icoon, kleur: d.kleur, dienst: d.label, groot, opschaling };
  }
  for (const r of REGELS) {
    if (r.re.test(tekst)) {
      return {
        titel: r.titel, ...symbool, kaartIcoon: r.kaartIcoon ?? d.icoon,
        kaartVlammen: r.kaartVlammen, kaartBrandend: r.kaartBrandend, kaartBotsing: r.kaartBotsing,
        kleur: d.kleur, dienst: d.label, groot, opschaling,
      };
    }
  }
  const titel = (m.title && !/^(fire|other|rescue)\s+incident$/i.test(m.title)) ? m.title : null;
  return {
    titel: titel ?? `${d.label} incident`, generiek: titel == null,
    ...symbool, kaartIcoon: d.icoon, kleur: d.kleur, dienst: d.label, groot, opschaling,
  };
}

/** "1.2 km" or "350 m". */
export function afstandTekst(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

/** "5 min ago", "2 h ago", "yesterday 2:32 pm". */
export function tijdTekst(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffUur = Math.floor(diffMin / 60);
  if (diffUur < 6) return `${diffUur} h ago`;
  if (new Date().toDateString() === d.toDateString()) return hhmm(d);
  const gisteren = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
  return gisteren ? `yesterday ${hhmm(d)}` : `${d.getDate()}/${d.getMonth() + 1} ${hhmm(d)}`;
}

/** Short time for the right-hand column; the section header has the day. */
export function klokTekst(iso: string): string {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  const vandaag = new Date().toDateString() === d.toDateString();
  const gisteren = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
  if (vandaag || gisteren) return hhmm(d);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Section header for the list. */
export function periodeVan(iso: string): string {
  const d = new Date(iso);
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 60) return 'Now';
  if (new Date().toDateString() === d.toDateString()) return 'Today';
  if (new Date(Date.now() - 86400000).toDateString() === d.toDateString()) return 'Yesterday';
  if (min < 60 * 24 * 7) return 'This week';
  return 'Older';
}

/** "Buckley St, Stratford" — street and suburb, without repeating. */
export function plaatsRegel(
  locatie: string | null | undefined,
  plaats: string | null | undefined,
): string | null {
  const straat = nettePlaats(locatie);
  const stad = nettePlaats(plaats);
  if (!straat) return stad;
  if (!stad) return straat;
  if (straat.toLowerCase().includes(stad.toLowerCase())) return straat;
  return `${straat}, ${stad}`;
}

/** Feeds often shout suburbs in capitals ("STRATFORD"); show them in title case. */
export function nettePlaats(tekst: string | null | undefined): string | null {
  if (!tekst) return null;
  const t = tekst.trim();
  if (!t) return null;
  const alleHoofd = t === t.toUpperCase() && /[A-Z]{3,}/.test(t);
  if (!alleHoofd) return t;
  return t.toLowerCase().replace(/\b([a-z])/g, (x) => x.toUpperCase());
}

/** "12 resources assigned" — Australian feeds publish a count, not vehicles. */
export function eenhedenTekst(aantalPerDienst: Record<string, number>): string | null {
  const n = Object.values(aantalPerDienst).reduce((a, b) => a + b, 0);
  if (!n) return null;
  return n === 1 ? 'one resource assigned' : `${n} resources assigned`;
}
