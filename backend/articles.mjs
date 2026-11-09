// News articles on the website (wish Chris 09-11-2026), only for incidents
// that matter, so the site does not fill with thousands of thin pages:
// - any Watch and Act or Emergency Warning;
// - Queensland warnings (they carry the agency's own words), except the daily
//   "avoid smoke" notices and planned burns;
// - NSW bush and grass fires with an Advice level for 6 hours or more, or of
//   100 ha or more;
// - ACT incidents with a warning level;
// plus a weekly overview per state.
//
// Only states whose licence allows commercial reuse and adaptation (CC BY):
// NSW, Queensland and the ACT. Victoria and South Australia join once their
// agencies confirm it (ARTICLE_REGIONS, see docs). Articles only state what
// the feed says; no advice of our own, always the official link.
import { levelRank } from './history.mjs';
import { slugify, placeText } from './places.mjs';
import { nice, STATES } from './site-layout.mjs';

export const ARTICLE_REGIONS = (process.env.ARTICLE_REGIONS || 'nsw,qld,act')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LANDSCAPE =
  /bush|grass|scrub|vegetation|forest|hay|crop|stubble|wildfire|grass ?land/i;
const LEVEL_LABEL = ['', 'Advice', 'Watch and Act', 'Emergency Warning'];
/** Queensland notices that are issued every day and say little on their own. */
const ROUTINE_QLD = /avoid smoke|hazard reduction|planned burn|permitted burn/i;

const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

/** The status without the level NSW puts in front ("Advice · Under control"). */
export function statusOnly(status) {
  const parts = String(status ?? '').split(' · ');
  return parts[parts.length - 1].trim();
}

/** Is this history row worth an article? */
export function newsworthy(row) {
  if (!ARTICLE_REGIONS.includes(row.region) || row.private) return false;
  if (row.category === 'ambulance') return false;
  // NSW publishes a Watch and Act or Emergency Warning twice: as the incident
  // with its level and as a mirrored warning. The incident has the article.
  if (row.region === 'nsw' && row.kind === 'warning') return false;
  if (row.region === 'qld' && row.kind === 'warning')
    return (
      row.max_level >= 2 ||
      !ROUTINE_QLD.test(`${row.action ?? ''} ${row.title ?? ''}`)
    );
  if (row.max_level >= 2) return true;
  if (
    row.region === 'nsw' &&
    row.kind === 'incident' &&
    LANDSCAPE.test(row.title)
  ) {
    if ((row.size_ha ?? 0) >= 100) return true;
    if (row.max_level >= 1 && hours(row.first_seen, row.last_seen) >= 6)
      return true;
  }
  if (row.region === 'act' && row.max_level >= 1) return true;
  return false;
}

const lower = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase();
const cap = (s) => {
  const t = String(s ?? '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

/** "bush fire", "grass fire", "vegetation fire", "road crash". */
export function typeWords(row) {
  const t = lower(row.title);
  if (row.kind === 'warning') return 'fire';
  if (/mva|motor vehicle|transport/.test(t)) return 'road crash';
  return t.replace(/\s+/g, ' ') || 'incident';
}

/** The street part of a location ("Timor Rd"), or null. */
export function streetOf(location) {
  const parts = String(location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? nice(parts.slice(0, -1).join(', ')) : null;
}

/** The place as the agency wrote it, readable, when it matched no known place. */
function placeFromText(location) {
  const name = placeText(location).names[0] ?? String(location ?? '');
  return nice(name).replace(/\b([a-z])/g, (x) => x.toUpperCase());
}

const dateIn = (iso, tz) =>
  new Date(iso).toLocaleDateString('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * The headline, which follows the incident: the level while one is current,
 * the status while it is listed, the date once it has ended. `twin` is 1 for
 * a second incident of the same kind in the same place on the same day (the
 * street is added) and 2 when that street is the same too (the time as well).
 */
export function headline(row, placeName, tz, twin = 0) {
  const street = twin ? streetOf(row.location) : null;
  const time =
    twin > 1
      ? new Date(row.created || row.first_seen).toLocaleTimeString('en-AU', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
  const extra = [street, time].filter(Boolean).join(', ');
  const place =
    (placeName || placeFromText(row.location)) + (extra ? ` (${extra})` : '');
  if (row.kind === 'warning') {
    const level = LEVEL_LABEL[Math.max(1, levelRank(row.level))];
    // "Emergency Warning" is a warning already; "Advice warning" is not.
    const named = /warning/i.test(level) ? level : `${level} warning`;
    if (!row.listed)
      return `${place}: ${named}, ${dateIn(row.created || row.first_seen, tz)}`;
    return `${cap(lower(row.action) || 'stay informed')}: ${level} for ${place}`;
  }
  const type = typeWords(row);
  if (!row.listed)
    return `${place} ${type}, ${dateIn(row.created || row.first_seen, tz)}`;
  const rank = levelRank(row.level);
  if (rank > 0) return `${place} ${type}: ${LEVEL_LABEL[rank]}`;
  return `${place} ${type}: ${lower(statusOnly(row.status)) || 'reported'}`;
}

/** Stable URL part for an incident's article. */
export function articleSlug(row, placeSlug, tz) {
  const day = new Date(row.created || row.first_seen).toLocaleDateString(
    'en-CA',
    { timeZone: tz },
  );
  const what =
    row.kind === 'warning'
      ? `${slugify(row.action || 'fire')}-warning`
      : slugify(typeWords(row));
  return [placeSlug || slugify(placeFromText(row.location)), what, day]
    .filter(Boolean)
    .join('-');
}

/** ISO week of a date in a time zone: { year, week, monday } (local Monday 00:00 as a local-clock Date). */
export function isoWeek(date, tz) {
  const local = new Date(
    new Date(date).toLocaleString('en-US', { timeZone: tz }),
  );
  const day = (local.getDay() + 6) % 7; // Monday 0
  const monday = new Date(local);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - day);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((thursday - jan4) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
    );
  return { year: thursday.getFullYear(), week, monday };
}

/** The month (yyyy-mm) of a time in a zone. */
export const monthIn = (iso, tz) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7);

export class Articles {
  constructor(db, tz = (region) => STATES[region]?.tz ?? 'Australia/Sydney') {
    this.db = db;
    this.tz = tz;
    db.exec(`CREATE TABLE IF NOT EXISTS articles(
        slug TEXT NOT NULL, region TEXT NOT NULL, kind TEXT NOT NULL,
        ref TEXT NOT NULL UNIQUE, place TEXT, title TEXT NOT NULL,
        published TEXT NOT NULL, modified TEXT NOT NULL,
        PRIMARY KEY(region, slug));
      CREATE INDEX IF NOT EXISTS articles_published ON articles(region, published);
      CREATE INDEX IF NOT EXISTS articles_place ON articles(region, place, published);`);
    this.q = {
      get: db.prepare('SELECT * FROM articles WHERE region=? AND slug=?'),
      byRef: db.prepare('SELECT * FROM articles WHERE ref=?'),
      latest: db.prepare(
        `SELECT * FROM articles WHERE (? IS NULL OR region=?) ORDER BY published DESC LIMIT ?`,
      ),
      between: db.prepare(
        'SELECT * FROM articles WHERE region=? AND published>=? AND published<? ORDER BY published DESC',
      ),
      region: db.prepare(
        'SELECT * FROM articles WHERE region=? ORDER BY published DESC',
      ),
      forPlace: db.prepare(
        'SELECT * FROM articles WHERE region=? AND place=? ORDER BY published DESC LIMIT ?',
      ),
      all: db.prepare(
        'SELECT region, slug, modified FROM articles ORDER BY published DESC',
      ),
      insert: db.prepare('INSERT INTO articles VALUES(?,?,?,?,?,?,?,?)'),
      update: db.prepare('UPDATE articles SET title=?, modified=? WHERE ref=?'),
      lastEvent: db.prepare(
        'SELECT MAX(at) AS at FROM history_events WHERE id=?',
      ),
    };
  }

  get(region, slug) {
    return this.q.get.get(region, slug) ?? null;
  }

  byRef(ref) {
    return this.q.byRef.get(ref) ?? null;
  }

  latest(region = null, limit = 40) {
    return this.q.latest.all(region, region, limit);
  }

  between(region, from, to) {
    return this.q.between.all(region, from, to);
  }

  /** Articles of a month, by the state's own calendar. */
  inMonth(region, month) {
    const tz = this.tz(region);
    return this.q.region
      .all(region)
      .filter((a) => monthIn(a.published, tz) === month);
  }

  /** Months with articles, newest first, by the state's own calendar. */
  months(region) {
    const tz = this.tz(region);
    const counts = new Map();
    for (const a of this.q.region.all(region)) {
      const m = monthIn(a.published, tz);
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    return [...counts].map(([month, n]) => ({ month, n }));
  }

  forPlace(region, place, limit = 6) {
    return this.q.forPlace.all(region, place, limit);
  }

  all() {
    return this.q.all.all();
  }

  /**
   * New articles for newsworthy incidents of the last days, and a fresh title
   * and modified time for the ones that changed. `placeName(region, slug)`
   * gives a place's display name; `tz(region)` its time zone; `started` when
   * the history began (weekly overviews need a complete week).
   */
  refresh({ now = new Date().toISOString(), placeName, tz, started = null }) {
    const from = new Date(Date.parse(now) - 3 * 86_400_000).toISOString();
    // "+region": use history_seen (last_seen) instead of scanning per region.
    const rows = this.db
      .prepare(
        `SELECT * FROM history WHERE last_seen>=? AND +region IN (${ARTICLE_REGIONS.map(() => '?').join(',') || "''"})
           AND (max_level>=1 OR kind='warning' OR size_ha>=100)`,
      )
      .all(from, ...ARTICLE_REGIONS);
    const news = rows.filter(newsworthy);
    const day = (row, zone) =>
      new Date(row.created || row.first_seen).toLocaleDateString('en-CA', {
        timeZone: zone,
      });
    const count = (key) => {
      const m = new Map();
      for (const row of news) {
        const k = key(row);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    const base = (row) =>
      `${row.region}|${row.place}|${typeWords(row)}|${day(row, tz(row.region))}`;
    const sameDay = count(base);
    const sameStreet = count((row) => `${base(row)}|${streetOf(row.location)}`);
    let created = 0;
    for (const row of news) {
      const zone = tz(row.region);
      const twin =
        sameStreet.get(`${base(row)}|${streetOf(row.location)}`) > 1
          ? 2
          : sameDay.get(base(row)) > 1
            ? 1
            : 0;
      const title = headline(row, placeName(row.region, row.place), zone, twin);
      const modified = this.q.lastEvent.get(row.id)?.at || row.last_seen;
      const existing = this.byRef(row.id);
      if (existing) {
        if (existing.title !== title || existing.modified < modified)
          this.q.update.run(
            title,
            modified > existing.modified ? modified : existing.modified,
            row.id,
          );
        continue;
      }
      let slug = articleSlug(row, row.place, zone);
      for (let k = 2; this.get(row.region, slug); k++)
        slug = `${articleSlug(row, row.place, zone)}-${k}`;
      // Published when we published it, not when the incident began.
      this.q.insert.run(
        slug,
        row.region,
        'incident',
        row.id,
        row.place,
        title,
        now,
        modified > now ? modified : now,
      );
      created++;
    }
    created += this.#weeks(now, tz, started);
    return created;
  }

  /**
   * A weekly overview per state, made on Monday morning (state time) for the
   * week before, if the history covers that whole week and it had incidents.
   */
  #weeks(now, tz, started) {
    let created = 0;
    for (const region of ARTICLE_REGIONS) {
      const zone = tz(region);
      const { monday } = isoWeek(now, zone);
      const localNow = new Date(
        new Date(now).toLocaleString('en-US', { timeZone: zone }),
      );
      if ((localNow - monday) / 3_600_000 < 6) continue; // after 06:00 on Monday
      const w = isoWeek(new Date(Date.parse(now) - 7 * 86_400_000), zone);
      const ref = `week:${region}:${w.year}-${String(w.week).padStart(2, '0')}`;
      if (this.byRef(ref)) continue;
      const range = weekRange(w.year, w.week, zone);
      if (started && started > range.from) continue; // only part of the week
      const n = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM history INDEXED BY history_start
           WHERE region=? AND COALESCE(created, first_seen)>=? AND COALESCE(created, first_seen)<?
             AND kind='incident' AND private=0`,
        )
        .get(region, range.from, range.to).n;
      if (!n) continue;
      const slug = `week-${w.year}-${String(w.week).padStart(2, '0')}`;
      this.q.insert.run(
        slug,
        region,
        'week',
        ref,
        null,
        weekTitle(region, range, zone),
        now,
        now,
      );
      created++;
    }
    return created;
  }
}

const STATE_SHORT = {
  nsw: 'NSW',
  qld: 'Queensland',
  act: 'ACT',
  vic: 'Victoria',
  sa: 'South Australia',
};

/** Start and end (UTC ISO) of an ISO week, local midnight to midnight in `tz`. */
export function weekRange(year, week, tz) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const mondayUtc = new Date(
    jan4.getTime() - day * 86_400_000 + (week - 1) * 7 * 86_400_000,
  );
  // Local midnight of that Monday in tz: shift by the zone's offset on that day.
  const offset = (d) => {
    const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    return local - utc;
  };
  const from = new Date(mondayUtc.getTime() - offset(mondayUtc));
  const sunday = new Date(mondayUtc.getTime() + 7 * 86_400_000);
  const to = new Date(sunday.getTime() - offset(sunday));
  return { from: from.toISOString(), to: to.toISOString(), monday: mondayUtc };
}

export function weekTitle(region, range, tz) {
  const last = new Date(Date.parse(range.to) - 3_600_000).toISOString();
  const year = (iso) =>
    new Date(iso).toLocaleDateString('en-AU', {
      timeZone: tz,
      year: 'numeric',
    });
  const fmt = (iso, withYear) =>
    new Date(iso).toLocaleDateString('en-AU', {
      timeZone: tz,
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  // Across New Year both dates get their year: "28 December 2026 to 3 January 2027".
  const crosses = year(range.from) !== year(last);
  return `${STATE_SHORT[region] ?? region.toUpperCase()} fires and emergencies, ${fmt(range.from, crosses)} to ${fmt(last, true)}`;
}
