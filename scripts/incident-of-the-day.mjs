// Incident of the day, CONCEPT: renders the post locally and posts nothing.
//
//   PUPPETEER_DIR=<folder with node_modules/puppeteer> \
//   node --experimental-strip-types scripts/incident-of-the-day.mjs --out <dir> [--cache <dir>] [--only live|fixture] [--check-frames]
//
// Live: one GET of /v1/feed?region=au&hours=24, then /v1/incidents/{id}/aircraft
// for the fires at the highest warning level (at most 40, one request a
// second). `--cache <dir>` keeps those answers and reuses them on the next
// run, so a re-render does not call the API again.
// Fixture: the hand-made Watch and Act example of backend/highlight/fixture.mjs,
// written with FIXTURE in every file name.
//
// Writes still.png, still.jpg, reel.mp4, caption.txt and scene.json (the
// selection, why, and the scene) for each.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  selectIncidentOfTheDay,
  excludedBecause,
} from '../backend/highlight/select.mjs';
import { buildScene } from '../backend/highlight/scene.mjs';
import { buildCaption } from '../backend/highlight/caption.mjs';
import {
  launchBrowser,
  renderStill,
  renderReel,
} from '../backend/highlight/render.mjs';
import { watchAndActFixture } from '../backend/highlight/fixture.mjs';
import { levelRank } from '../backend/history.mjs';
import { isLandscapeFire } from '../backend/aircraft.mjs';

const API = (
  process.env.IOTD_API || 'https://incident-feed-production.up.railway.app'
).replace(/\/$/, '');
const UA = 'emergencies-near-me-iotd-concept/0.1';
const MAX_AIRCRAFT_CALLS = 40;

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg('out') || process.env.IOTD_OUT;
if (!OUT) {
  console.error(
    'Usage: --out <dir> [--cache <dir>] [--only live|fixture] [--check-frames]',
  );
  process.exit(2);
}
const CACHE = arg('cache');
const ONLY = arg('only');
const CHECK = process.argv.includes('--check-frames');
mkdirSync(OUT, { recursive: true });
if (CACHE) mkdirSync(CACHE, { recursive: true });

let lastCall = 0;
async function get(path, cacheName) {
  const cached = CACHE && join(CACHE, cacheName);
  if (cached && existsSync(cached))
    return JSON.parse(readFileSync(cached, 'utf8'));
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(API + path, {
    headers: { 'user-agent': UA, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  const json = await res.json();
  if (cached) writeFileSync(cached, JSON.stringify(json));
  return json;
}

/** The scene without the long coordinate lists, for scene.json. */
function summary(scene) {
  return {
    ...scene,
    area: `${scene.area.length} polygon(s), ${scene.area.flat(2).length} points`,
    tracks: scene.tracks.map((t) => ({ ...t, pts: `${t.pts.length} points` })),
  };
}

async function produce(
  browser,
  { name, incident, selection, aircraft, events, now, fetchedAt, extra = {} },
) {
  const scene = buildScene({ incident, aircraft, events, now, fetchedAt });
  const caption = buildCaption(scene, selection);
  const still = await renderStill(browser, scene);
  writeFileSync(join(OUT, `${name}still.png`), still.png);
  writeFileSync(join(OUT, `${name}still.jpg`), still.jpg);
  const checkDir = join(OUT, `${name}check`);
  if (CHECK) mkdirSync(checkDir, { recursive: true });
  const keep = new Set([12, 30, 45, 70, 105, 140, 175, 200, 236]);
  const reel = await renderReel(browser, scene, join(OUT, `${name}reel.mp4`), {
    frameHook: CHECK
      ? (i, jpg) =>
          keep.has(i) &&
          writeFileSync(
            join(checkDir, `frame-${String(i).padStart(3, '0')}.jpg`),
            jpg,
          )
      : undefined,
  });
  writeFileSync(join(OUT, `${name}caption.txt`), caption + '\n');
  writeFileSync(
    join(OUT, `${name}scene.json`),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        incident: { ...incident, geometry: incident.geometry?.type ?? null },
        selection: {
          ...selection,
          chosen: selection.chosen?.id ?? null,
          aircraft: `${selection.aircraft.length} item(s)`,
        },
        rendered: {
          stillWithMap: still.withMap,
          reelWithMap: reel.withMap,
          reelFrames: reel.frames,
        },
        historyEvents: events
          ? 'from fixture'
          : 'not available from the public API; timeline uses feed fields only',
        ...extra,
        scene: summary(scene),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      iotd: 'rendered',
      name: name || 'live',
      id: incident.id,
      still: still.withMap,
      reel: reel.withMap,
      frames: reel.frames,
    }),
  );
}

async function live(browser) {
  const now = Date.now();
  const feed = await get('/v1/feed?region=au&hours=24', 'feed.json');
  // Aircraft only decide between incidents at the same, highest level, and
  // only bush and grass fires can have them (flights.mjs).
  const pool = feed.incidents.filter((r) => !excludedBecause(r, { now }));
  const top = Math.max(0, ...pool.map((r) => levelRank(r.level)));
  const ask = pool
    .filter((r) => levelRank(r.level) === top && isLandscapeFire(r))
    .sort(
      (a, b) =>
        (b.sizeHa ?? 0) - (a.sizeHa ?? 0) ||
        (b.resources ?? 0) - (a.resources ?? 0),
    )
    .slice(0, MAX_AIRCRAFT_CALLS);
  const air = {};
  for (const r of ask)
    air[r.id] =
      (
        await get(
          `/v1/incidents/${encodeURIComponent(r.id)}/aircraft`,
          `air-${r.id.replace(/[^a-z0-9]+/gi, '_')}.json`,
        )
      ).aircraft ?? [];
  const selection = selectIncidentOfTheDay(feed, {
    aircraftFor: (id) => air[id] ?? [],
    now,
  });
  if (!selection.chosen) throw new Error('No incident qualified');
  // For the owner: what would win if only incidents first seen in the window counted.
  const fresh = selectIncidentOfTheDay(
    {
      ...feed,
      incidents: feed.incidents.filter(
        (r) => Date.parse(r.created || r.firstSeen) >= now - 24 * 3_600_000,
      ),
    },
    { aircraftFor: (id) => air[id] ?? [], now },
  );
  await produce(browser, {
    name: '',
    incident: selection.chosen,
    selection,
    aircraft: selection.aircraft,
    events: null,
    now,
    fetchedAt: feed.fetchedAt,
    extra: {
      aircraftChecked: Object.fromEntries(
        Object.entries(air).map(([id, a]) => [id, a.length]),
      ),
      ifOnlyNewInWindow: fresh.chosen
        ? {
            id: fresh.chosen.id,
            title: fresh.chosen.title,
            location: fresh.chosen.location,
            why: fresh.why,
          }
        : null,
    },
  });
}

async function fixture(browser) {
  const fx = watchAndActFixture();
  const selection = selectIncidentOfTheDay(fx.feed, {
    aircraftFor: (id) => fx.aircraft[id] ?? [],
    now: fx.now,
  });
  const id = selection.chosen.id;
  await produce(browser, {
    name: 'FIXTURE-watch-and-act-',
    incident: selection.chosen,
    selection,
    aircraft: fx.aircraft[id] ?? [],
    events: fx.events[id] ?? null,
    now: fx.now,
    fetchedAt: fx.feed.fetchedAt,
  });
}

const browser = await launchBrowser();
try {
  if (ONLY !== 'fixture') await live(browser);
  if (ONLY !== 'live') await fixture(browser);
} finally {
  await browser.close();
}
