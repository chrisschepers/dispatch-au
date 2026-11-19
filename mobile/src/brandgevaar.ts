/**
 * Fire Danger Rating and Total Fire Ban for your district, today and
 * tomorrow (backend /v1/fire-danger, 19-11-2026). In the fire season this is
 * what people check every day: can I mow, barbecue or burn off tomorrow?
 *
 * Only New South Wales and the ACT for now: the other states do not allow
 * commercial reuse of their ratings (backend/README.md). Outside those the
 * backend says `covered: false` and the app shows nothing.
 *
 * Free of react-native, for the tests (tests/brandgevaar.test.mjs).
 */
export type Rating = 'No Rating' | 'Moderate' | 'High' | 'Extreme' | 'Catastrophic';

export interface DagGevaar { date: string; rating: Rating | null; totalFireBan: boolean | null }

export interface Brandgevaar {
  district: string;
  vandaag: DagGevaar;
  morgen: DagGevaar;
  bron: string;
  vermelding: string;
  url: string;
  verouderd: boolean;
}

const RATINGS: readonly string[] = ['No Rating', 'Moderate', 'High', 'Extreme', 'Catastrophic'];

function dag(v: unknown): DagGevaar | null {
  const d = v as Partial<DagGevaar> | null;
  if (!d || typeof d.date !== 'string') return null;
  return {
    date: d.date,
    rating: RATINGS.includes(d.rating as string) ? (d.rating as Rating) : null,
    totalFireBan: typeof d.totalFireBan === 'boolean' ? d.totalFireBan : null,
  };
}

/** The backend's answer, checked; null when this place is not covered. */
export function leesBrandgevaar(antwoord: unknown): Brandgevaar | null {
  const a = antwoord as { covered?: boolean; district?: Record<string, unknown> | null; sources?: Array<Record<string, unknown>> } | null;
  const d = a?.district;
  if (!a || a.covered !== true || !d || typeof d.district !== 'string') return null;
  const vandaag = dag(d.today), morgen = dag(d.tomorrow);
  if (!vandaag || !morgen) return null;
  const bron = (a.sources ?? []).find((s) => s.source === d.source);
  const url = typeof bron?.adviceUrl === 'string' && /^https:\/\//.test(bron.adviceUrl) ? bron.adviceUrl : '';
  return {
    district: d.district.slice(0, 80),
    vandaag, morgen,
    bron: typeof bron?.name === 'string' ? bron.name.slice(0, 80) : '',
    vermelding: typeof d.attribution === 'string' ? d.attribution.slice(0, 400) : '',
    url,
    verouderd: d.stale === true,
  };
}

/**
 * The colours of the Australian Fire Danger Rating System, as on the road
 * signs: green, yellow, orange, dark red. `tekst` is what stays readable on it.
 */
export function ratingKleur(r: Rating | null): { vlak: string; tekst: string } {
  switch (r) {
    case 'Moderate': return { vlak: '#64BF30', tekst: '#10240a' };
    case 'High': return { vlak: '#FEDD3A', tekst: '#2b2400' };
    case 'Extreme': return { vlak: '#F78100', tekst: '#2b1600' };
    case 'Catastrophic': return { vlak: '#96151B', tekst: '#ffffff' };
    default: return { vlak: '#E5E5EA', tekst: '#3a3a3c' };
  }
}

/** "High" / "No rating" / "Not issued yet". */
export function ratingTekst(d: DagGevaar): string {
  if (d.rating === null) return 'Not issued yet';
  return d.rating === 'No Rating' ? 'No rating' : d.rating;
}

/** Worth a line of its own: a ban, or Extreme and up. */
export function isErnstig(d: DagGevaar): boolean {
  return d.totalFireBan === true || d.rating === 'Extreme' || d.rating === 'Catastrophic';
}

/** One sentence for the screen reader and the share text. */
export function gevaarZin(g: Brandgevaar): string {
  const deel = (naam: string, d: DagGevaar) =>
    `${naam}: ${ratingTekst(d)}${d.totalFireBan ? ', Total Fire Ban' : ''}`;
  return `Fire danger in ${g.district}. ${deel('Today', g.vandaag)}. ${deel('Tomorrow', g.morgen)}.`;
}
