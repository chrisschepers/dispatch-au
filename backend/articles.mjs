// News articles on the website (wish Chris 09-11-2026), only for incidents
// that matter, so the site does not fill with thousands of thin pages:
// - any Watch and Act or Emergency Warning;
// - Queensland warnings (they carry the agency's own words);
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
import { slugify } from './places.mjs';
import { nice } from './site-layout.mjs';

export const ARTICLE_REGIONS = (process.env.ARTICLE_REGIONS || 'nsw,qld,act')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LANDSCAPE =
  /bush|grass|scrub|vegetation|forest|hay|crop|stubble|wildfire|grass ?land/i;
const LEVEL_LABEL = ['', 'Advice', 'Watch and Act', 'Emergency Warning'];

const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

/** The status without the level NSW puts in front ("Advice · Under control"). */
export function statusOnly(status) {
  const parts = String(status ?? '').split(' · ');
  return parts[parts.length - 1].trim();
}

/** Is this history row worth an article? */
export function newsworthy(row) {
  if (!ARTICLE_REGIONS.includes(row.region) || row.category === 'ambulance')
    return false;
  if (row.max_level >= 2) return true;
  if (row.region === 'qld' && row.kind === 'warning') return true;
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

/**
 * The headline, which follows the incident: the level while one is current,
 * the status while it is listed, the date once it has ended. `withStreet`
 * for a second incident of the same kind in the same place on the same day.
 */
export function headline(row, placeName, tz, withStreet = false) {
  const street = withStreet ? streetOf(row.location) : null;
  const place =
    (placeName || cap(lower(row.location).split(',').pop())) +
    (street ? ` (${street})` : '');
  if (row.kind === 'warning') {
    const action = cap(lower(row.action) || 'stay informed');
    return `${action}: ${LEVEL_LABEL[Math.max(1, levelRank(row.level))]} for ${place}`;
  }
  const type = typeWords(row);
  if (!row.listed) {
    const d = new Date(row.created || row.first_seen).toLocaleDateString(
      'en-AU',
      {
        timeZone: tz,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      },
    );
    return `${place} ${type}, ${d}`;
  }
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
  return [placeSlug || slugify(lower(row.location).split(',').pop()), what, day]
    .filter(Boolean)
    .join('-');
}

/** ISO week of a date in a time zone: { year, week, start, end } (Monday 00:00 to Monday 00:00, local). */
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

export class Articles {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS articles(
        slug TEXT NOT NULL, region TEXT NOT NULL, kind TEXT NOT NULL,
        ref TEXT NOT NULL UNIQUE, place TEXT, title TEXT NOT NULL,
        published TEXT NOT NULL, modified TEXT NOT NULL,
        PRIMARY KEY(region, slug));
      CREATE INDEX IF NOT EXISTS articles_published ON articles(region, published);`);
  }

  get(region, slug) {
    return (
      this.db
        .prepare('SELECT * FROM articles WHERE region=? AND slug=?')
        .get(region, slug) ?? null
    );
  }

  byRef(ref) {
    return (
      this.db.prepare('SELECT * FROM articles WHERE ref=?').get(ref) ?? null
    );
  }

  latest(region = null, limit = 40, before = null) {
    return this.db
      .prepare(
        `SELECT * FROM articles WHERE (? IS NULL OR region=?) AND (? IS NULL OR published<?)
         ORDER BY published DESC LIMIT ?`,
      )
      .all(region, region, before, before, limit);
  }

  inMonth(region, month) {
    return this.db
      .prepare(
        `SELECT * FROM articles WHERE region=? AND substr(published,1,7)=? ORDER BY published DESC`,
      )
      .all(region, month);
  }

  months(region) {
    return this.db
      .prepare(
        `SELECT substr(published,1,7) AS month, COUNT(*) AS n FROM articles WHERE region=?
         GROUP BY month ORDER BY month DESC`,
      )
      .all(region);
  }

  forPlace(region, place, limit = 6) {
    return this.db
      .prepare(
        'SELECT * FROM articles WHERE region=? AND place=? ORDER BY published DESC LIMIT ?',
      )
      .all(region, place, limit);
  }

  all() {
    return this.db
      .prepare(
        'SELECT region, slug, modified FROM articles ORDER BY published DESC',
      )
      .all();
  }

  /**
   * New articles for newsworthy incidents of the last days, and a fresh title
   * and modified time for the ones that changed. `placeName(region, slug)`
   * gives a place's display name; `tz(region)` its time zone.
   */
  refresh({ now = new Date().toISOString(), placeName, tz }) {
    const from = new Date(Date.parse(now) - 3 * 86_400_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM history WHERE last_seen>=? AND region IN (${ARTICLE_REGIONS.map(() => '?').join(',') || "''"})
           AND (max_level>=1 OR kind='warning' OR size_ha>=100)`,
      )
      .all(from, ...ARTICLE_REGIONS);
    const lastEvent = this.db.prepare(
      'SELECT MAX(at) AS at FROM history_events WHERE id=?',
    );
    let created = 0;
    const twins = new Map();
    const keyOf = (row, zone) =>
      `${row.region}|${row.place}|${typeWords(row)}|${new Date(row.created || row.first_seen).toLocaleDateString('en-CA', { timeZone: zone })}`;
    for (const row of rows) {
      if (!newsworthy(row)) continue;
      const k = keyOf(row, tz(row.region));
      twins.set(k, (twins.get(k) ?? 0) + 1);
    }
    for (const row of rows) {
      if (!newsworthy(row)) continue;
      const zone = tz(row.region);
      const title = headline(
        row,
        placeName(row.region, row.place),
        zone,
        twins.get(keyOf(row, zone)) > 1,
      );
      const modified = lastEvent.get(row.id)?.at || row.last_seen;
      const existing = this.byRef(row.id);
      if (existing) {
        if (existing.title !== title || existing.modified < modified)
          this.db
            .prepare('UPDATE articles SET title=?, modified=? WHERE ref=?')
            .run(
              title,
              modified > existing.modified ? modified : existing.modified,
              row.id,
            );
        continue;
      }
      let slug = articleSlug(row, row.place, zone);
      for (let k = 2; this.get(row.region, slug); k++)
        slug = `${articleSlug(row, row.place, zone)}-${k}`;
      const published =
        row.created && row.created < row.first_seen
          ? row.created
          : row.first_seen;
      this.db
        .prepare('INSERT INTO articles VALUES(?,?,?,?,?,?,?,?)')
        .run(
          slug,
          row.region,
          'incident',
          row.id,
          row.place,
          title,
          published,
          modified,
        );
      created++;
    }
    created += this.#weeks(now, tz);
    return created;
  }

  /**
   * A weekly overview per state, made on Monday morning (state time) for the
   * week before, if that week had incidents.
   */
  #weeks(now, tz) {
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
      const n = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM history WHERE region=? AND kind='incident' AND category<>'ambulance'
             AND COALESCE(created, first_seen)>=? AND COALESCE(created, first_seen)<?`,
        )
        .get(region, range.from, range.to).n;
      if (!n) continue;
      const slug = `week-${w.year}-${String(w.week).padStart(2, '0')}`;
      this.db
        .prepare('INSERT INTO articles VALUES(?,?,?,?,?,?,?,?)')
        .run(
          slug,
          region,
          'week',
          ref,
          null,
          weekTitle(region, range, zone),
          range.to,
          range.to,
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
  const fmt = (iso, withYear) =>
    new Date(iso).toLocaleDateString('en-AU', {
      timeZone: tz,
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  const last = new Date(Date.parse(range.to) - 3_600_000).toISOString();
  return `${STATE_SHORT[region] ?? region.toUpperCase()} fires and emergencies, ${fmt(range.from, false)} to ${fmt(last, true)}`;
}
