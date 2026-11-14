// Incident of the day: which incident of the last 24 hours gets the daily
// Instagram post (concept, 14-11-2026, after "Melding van de dag" in the
// Dutch app). Pure: the feed rows and the aircraft per incident come in, the
// choice and the reasons why come out. Nothing here calls out.
//
// Order, highest first:
//  1. warning level (Emergency Warning > Watch and Act > Advice > none);
//  2. firefighting aircraft that worked it (unique aircraft, flights.mjs);
//  3. fire size in hectares (only NSW publishes one: `sizeHa`);
//  4. resources (only Victoria and Queensland publish a count);
//  5. how long it ran (agency call time, else our first observation, until
//     we last saw it).
// Never chosen: planned burns, ambulance and medical calls, a warning that is
// only an area without an incident, and states whose licence does not allow a
// commercial adaptation (South Australia, see ARTICLE_REGIONS).
import { levelRank, isPrivate } from '../history.mjs';
import { ARTICLE_REGIONS } from '../articles.mjs';

export const WINDOW_HOURS = 24;
export const LEVEL_LABEL = ['', 'Advice', 'Watch and Act', 'Emergency Warning'];
export const CRITERIA = [
  'level',
  'aircraft',
  'sizeHa',
  'resources',
  'durationMin',
];

const PLANNED =
  /planned|prescribed|hazard reduction|burn[\s-]?off|permitted burn|pile burn|back ?burn/i;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** "nsw" from "nsw:incident:685150". */
export const regionOf = (row) => String(row?.id ?? '').split(':')[0];

function validPoint(p) {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 90 &&
    Math.abs(p[1]) <= 180
  );
}

function hasArea(g, depth = 0) {
  if (!g || depth > 4) return false;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return true;
  return (
    g.type === 'GeometryCollection' &&
    Array.isArray(g.geometries) &&
    g.geometries.some((x) => hasArea(x, depth + 1))
  );
}

/** Why a feed row can never be the incident of the day, or null when it can. */
export function excludedBecause(
  row,
  { regions = ARTICLE_REGIONS, now = Date.now(), hours = WINDOW_HOURS } = {},
) {
  if (!row || row.kind !== 'incident') return 'warning-only';
  if (!regions.includes(regionOf(row))) return 'licence';
  if (
    row.category === 'planned' ||
    /burns?$/i.test(String(row.sourceFeed ?? '')) ||
    PLANNED.test(String(row.title ?? ''))
  )
    return 'planned';
  if (row.category === 'ambulance' || isPrivate(row)) return 'medical';
  if (!validPoint(row.point) && !hasArea(row.geometry)) return 'no-location';
  const last = Date.parse(row.lastSeen ?? '');
  if (!row.listed && Number.isFinite(last) && last < now - hours * 3_600_000)
    return 'outside-window';
  return null;
}

/** The numbers the order is decided on. A missing figure is null, never 0. */
export function rankKey(row, aircraft = []) {
  const start = Date.parse(row.created || row.firstSeen || '');
  const end = Date.parse(row.lastSeen || row.updated || '');
  return {
    level: levelRank(row.level),
    aircraft: new Set(
      (aircraft ?? []).map((a) => a?.hex).filter((h) => typeof h === 'string'),
    ).size,
    sizeHa: num(row.sizeHa) != null && row.sizeHa > 0 ? row.sizeHa : null,
    resources: num(row.resources),
    durationMin:
      Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? Math.round((end - start) / 60_000)
        : null,
  };
}

/** Negative when `a` ranks above `b`; the id breaks a full tie, so the choice is stable. */
export function compareKeys(a, b) {
  for (const c of CRITERIA) {
    const d = (b.key[c] ?? -1) - (a.key[c] ?? -1);
    if (d) return d;
  }
  return a.row.id.localeCompare(b.row.id);
}

const fmt = (n) => Math.round(n).toLocaleString('en-AU');

function hoursText(min) {
  const h = min / 60;
  return h >= 48
    ? `${Math.round(h / 24)} days`
    : `${Math.max(1, Math.round(h))} h`;
}

/**
 * The incident of the day from a 24-hour feed. `aircraftFor(id)` returns the
 * aircraft list of /v1/incidents/{id}/aircraft (or nothing). `exclude` holds
 * ids that were featured before, so a long fire is not the post every day.
 */
export function selectIncidentOfTheDay(
  feed,
  {
    aircraftFor = () => [],
    now = Date.now(),
    regions = ARTICLE_REGIONS,
    exclude = [],
    hours = WINDOW_HOURS,
  } = {},
) {
  const excluded = {};
  const pool = [];
  const skip = new Set(exclude);
  for (const row of [...(feed?.incidents ?? []), ...(feed?.warnings ?? [])]) {
    const why = skip.has(row?.id)
      ? 'featured-before'
      : excludedBecause(row, { regions, now, hours });
    if (why) {
      excluded[why] = (excluded[why] ?? 0) + 1;
      continue;
    }
    const aircraft = aircraftFor(row.id) ?? [];
    pool.push({ row, aircraft, key: rankKey(row, aircraft) });
  }
  pool.sort(compareKeys);
  const [best, next] = pool;
  if (!best)
    return {
      chosen: null,
      aircraft: [],
      key: null,
      reasons: [],
      why: null,
      deciding: null,
      runnerUp: null,
      candidates: 0,
      excluded,
    };
  const deciding = next
    ? (CRITERIA.find((c) => (best.key[c] ?? -1) !== (next.key[c] ?? -1)) ??
      'id')
    : 'only';
  const atLevel = pool.filter((p) => p.key.level === best.key.level).length;
  const level = LEVEL_LABEL[best.key.level];
  const scope = best.key.level
    ? `of the ${atLevel} incident${atLevel === 1 ? '' : 's'} at ${level} level in the last ${hours} hours`
    : `of the ${pool.length} incidents in the last ${hours} hours`;

  // What each criterion says about the choice, up to the one that decided.
  const reasons = [];
  const upto =
    deciding === 'only' || deciding === 'id'
      ? CRITERIA.length
      : CRITERIA.indexOf(deciding) + 1;
  for (const c of CRITERIA.slice(0, upto)) {
    const v = best.key[c];
    const tied = next && (next.key[c] ?? -1) === (v ?? -1);
    if (c === 'level')
      reasons.push(
        v
          ? `Warning level ${level}: ${tied ? `the highest in the last ${hours} hours, shared by ${atLevel}` : `the highest in the last ${hours} hours`}`
          : `No incident had a warning level in the last ${hours} hours`,
      );
    if (c === 'aircraft')
      reasons.push(
        v
          ? `${v} firefighting aircraft worked it${tied ? ' (as many as the next one)' : ''}`
          : `No firefighting aircraft linked to it${tied ? ' or to the next one' : ''}`,
      );
    if (c === 'sizeHa')
      reasons.push(
        v != null
          ? `Fire size ${fmt(v)} ha${next?.key.sizeHa != null ? ` (next largest ${fmt(next.key.sizeHa)} ha)` : ''}`
          : 'No fire size published',
      );
    if (c === 'resources')
      reasons.push(
        v != null ? `${v} resources assigned` : 'No resource count published',
      );
    if (c === 'durationMin' && v != null)
      reasons.push(`Listed for about ${hoursText(v)}`);
  }

  const k = best.key;
  const why = {
    only: `the only incident that qualified in the last ${hours} hours`,
    level: `the only ${level} in the last ${hours} hours`,
    aircraft: `the most firefighting aircraft (${k.aircraft}) ${scope}`,
    sizeHa: `the largest fire (${k.sizeHa != null ? fmt(k.sizeHa) : '?'} ha) ${scope}`,
    resources: `the most resources assigned (${k.resources}) ${scope}`,
    durationMin: `the longest running (${k.durationMin != null ? hoursText(k.durationMin) : '?'}) ${scope}`,
    id: `one ${scope}`,
  }[deciding];

  return {
    chosen: best.row,
    aircraft: best.aircraft,
    key: best.key,
    reasons,
    why,
    deciding,
    runnerUp: next
      ? {
          id: next.row.id,
          title: next.row.title,
          location: next.row.location,
          key: next.key,
        }
      : null,
    candidates: pool.length,
    excluded,
  };
}
