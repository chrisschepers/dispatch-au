// Incident of the day as one HTML scene (concept, 14-11-2026). Same approach
// as "Melding van de dag" in the Dutch app (highlightReel.ts there):
//
// - one page gives both the still (1080×1350, the end state) and the reel
//   (1080×1920): the page has no clock, `window.__zetTijd(sec)` sets any
//   frame from nothing, so a slow machine cannot make a jerky video;
// - a dark MapLibre map (OpenFreeMap) with an SVG layer on top for the fire
//   area and the aircraft tracks, so they can grow without redrawing the map;
// - after the 7 s scene the reel ends with 2.5 s of app icon, the official
//   App Store badge and "Link in bio".
//
// Facts only. Every figure comes from the feed row, the aircraft linked to
// the incident (flights.mjs) or, when the backend passes them, the status
// events of history.mjs. A moment without a real time is left out; the big
// number appears only when it means something (scene.number).
//
// Times and the date are in the incident's own state time zone (STATES[..].tz:
// Australia/Sydney for NSW and the ACT, Melbourne, Brisbane, Adelaide).
import { levelRank } from '../history.mjs';
import { statusOnly } from '../articles.mjs';
import { STATES, nice } from '../site-layout.mjs';
import { places, placeText } from '../places.mjs';
import { sources } from '../source-config.mjs';
import { ATTRIBUTION as AIRCRAFT_ATTRIBUTION } from '../aircraft.mjs';
import { LEVEL_LABEL, regionOf } from './select.mjs';

export const SCENE_VERSION = 'incident-of-the-day-v1';
export const FPS = 25;
export const SCENE_SEC = 7;
export const END_SEC = 2.5;
export const TOTAL_SEC = SCENE_SEC + END_SEC;
export const SIZES = {
  still: { w: 1080, h: 1350 },
  reel: { w: 1080, h: 1920 },
};

/**
 * Australian Warning System colours, sampled from the official national
 * hazard icons (AIDR Knowledge Hub, knowledge.aidr.org.au/resources/
 * australian-warning-system). The text colour on each is ours, chosen for
 * contrast: black on yellow and orange, white on red.
 */
export const AWS = {
  1: { label: 'Advice', bg: '#FBE032', fg: '#111111' },
  2: { label: 'Watch and Act', bg: '#FF7900', fg: '#111111' },
  3: { label: 'Emergency Warning', bg: '#D6001C', fg: '#FFFFFF' },
};

/** Background: the app's red, and dark from Watch and Act up so orange and red stand out. */
const TINT = {
  light: ['#E5483C', '#C8291F', '#6E120C'],
  dark: ['#3A0B08', '#1B0605', '#0A0303'],
};
const TRACK_COLOURS = [
  '#3DD6C0',
  '#6FA8FF',
  '#FFD23F',
  '#C77DFF',
  '#FF8FAB',
  '#9BE564',
];
export const MAP_CREDIT = '© OpenStreetMap contributors · OpenFreeMap';
export const INDEPENDENT = 'Independent app — not an official warning service';
export const APPLE_TRADEMARK =
  'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc.';

/** A status that says the fire is held or over. "Not yet controlled" and "Out of control" are not. */
export function isControlStatus(status) {
  const s = String(status ?? '');
  if (/not yet|out of control|uncontrolled/i.test(s)) return false;
  return /controlled|under control|contained|patrolled|safe|\bout\b|extinguished|complete/i.test(
    s,
  );
}

const clean = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmt = (n) => Math.round(n).toLocaleString('en-AU');
const t = (iso) => Date.parse(iso ?? '');

export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

/** "Bush Fire" → ["Bush", "fire"]; "Fire" → ["", "Fire"]; the second part goes in the yellow marker. */
export function splitHeadline(title) {
  const words = clean(title).split(' ').filter(Boolean);
  if (!words.length) return ['', 'Incident'];
  if (/^(mva|motor vehicle (accident|crash))$/i.test(words.join(' ')))
    return ['Road', 'crash'];
  if (words.length === 1) return ['', cap(words[0].toLowerCase())];
  return [
    cap(words.slice(0, -1).join(' ').toLowerCase()),
    words[words.length - 1].toLowerCase(),
  ];
}

/** Only aircraft ≥ 2 or hectares ≥ 10, straight from the data; anything else is no number. */
export function chooseNumber({ aircraft = 0, sizeHa = null } = {}) {
  if (Number.isInteger(aircraft) && aircraft >= 2 && aircraft <= 60)
    return {
      value: String(aircraft),
      label: 'aircraft worked this fire',
      kind: 'aircraft',
    };
  if (
    typeof sizeHa === 'number' &&
    Number.isFinite(sizeHa) &&
    sizeHa >= 10 &&
    sizeHa < 10_000_000
  )
    return { value: fmt(sizeHa), label: 'hectares', kind: 'sizeHa' };
  return null;
}

function zoneParts(ms, tz) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
}
const dayKey = (ms, tz) => {
  const p = zoneParts(ms, tz);
  return `${p.year}-${p.month}-${p.day}`;
};

/** "4:04 pm", or "Wed 4:04 pm" when it is not on the day of the post. */
export function timeLabel(iso, tz, day) {
  const ms = t(iso);
  if (!Number.isFinite(ms)) return '';
  const time = new Date(ms)
    .toLocaleTimeString('en-AU', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/[  ]/g, ' ')
    .toLowerCase();
  return day && dayKey(ms, tz) === day
    ? time
    : `${zoneParts(ms, tz).weekday} ${time}`;
}

/** "14 November" in the state's zone. */
export function dateLabel(ms, tz) {
  return new Date(ms).toLocaleDateString('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
  });
}

/** "Sat 14 Nov, 6:05 pm" */
export function dateTimeLabel(ms, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month}, ${timeLabel(new Date(ms).toISOString(), tz, dayKey(ms, tz))}`;
}

/**
 * Up to three moments, each with a real time:
 * - the first: "Reported" (agency call time) or "First listed" (our first sight);
 * - the first time the warning level rose above where it started (events);
 * - the first aircraft at the fire (flights.mjs `since`);
 * - the end: a control status or "Off the list" (events), or from the feed
 *   alone the latest update and its status, or when it was last listed.
 * Priority when there are more: first, level, end, aircraft. Then by time.
 */
export function chooseSteps({
  incident,
  events = null,
  aircraft = [],
  tz,
  day,
  now = Date.now(),
}) {
  const out = [];
  const first = incident.created || incident.firstSeen;
  if (Number.isFinite(t(first)))
    out.push({
      at: first,
      label: incident.created ? 'Reported' : 'First listed',
      emphasis: false,
      kind: 'first',
    });
  const evs = Array.isArray(events)
    ? events
        .filter((e) => Number.isFinite(t(e?.at)))
        .sort((a, b) => t(a.at) - t(b.at))
    : [];
  if (evs.length) {
    let max = levelRank(evs[0].level);
    let rise = null;
    for (const e of evs.slice(1)) {
      const r = levelRank(e.level);
      if (r > max) {
        max = r;
        rise = {
          at: e.at,
          label: LEVEL_LABEL[r],
          emphasis: true,
          kind: 'level',
        };
      }
    }
    if (rise) out.push(rise);
    const end = evs.findLast(
      (e, i) =>
        i > 0 &&
        (e.status === 'Ended' || isControlStatus(statusOnly(e.status))),
    );
    if (end)
      out.push({
        at: end.at,
        label:
          end.status === 'Ended'
            ? 'Off the list'
            : cap(statusOnly(end.status).toLowerCase()),
        emphasis: false,
        kind: 'end',
      });
  } else if (!incident.listed && Number.isFinite(t(incident.lastSeen))) {
    out.push({
      at: incident.lastSeen,
      label: 'Last listed',
      emphasis: false,
      kind: 'end',
    });
  } else if (
    Number.isFinite(t(incident.updated)) &&
    statusOnly(incident.status)
  ) {
    out.push({
      at: incident.updated,
      label: `Update: ${statusOnly(incident.status).toLowerCase()}`,
      emphasis: false,
      kind: 'end',
    });
  }
  const since = (aircraft ?? [])
    .map((a) => t(a?.since))
    .filter(Number.isFinite);
  if (since.length)
    out.push({
      at: new Date(Math.min(...since)).toISOString(),
      label: 'First aircraft at the fire',
      emphasis: true,
      kind: 'aircraft',
    });
  const order = ['first', 'level', 'end', 'aircraft'];
  return out
    .filter((s) => t(s.at) <= now + 60_000)
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, 3)
    .sort((a, b) => t(a.at) - t(b.at))
    .map((s) => ({
      time: timeLabel(s.at, tz, day),
      at: s.at,
      label: s.label,
      emphasis: s.emphasis,
    }));
}

/** Polygons of the incident's geometry as rings of [lon, lat], thinned to a sane size. */
export function areaOf(geometry, maxPoints = 2400) {
  const polys = [];
  const walk = (g, depth = 0) => {
    if (!g || depth > 4) return;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
    else if (g.type === 'GeometryCollection')
      (g.geometries ?? []).forEach((x) => walk(x, depth + 1));
  };
  walk(geometry);
  const total = polys.flat().reduce((n, r) => n + r.length, 0);
  const step = Math.max(1, Math.ceil(total / maxPoints));
  return polys
    .map((rings) =>
      rings
        .map((ring) =>
          ring
            .filter((_, i) => i % step === 0 || i === ring.length - 1)
            .map((p) => [p[0], p[1]]),
        )
        .filter((ring) => ring.length >= 3),
    )
    .filter((rings) => rings.length);
}

/**
 * One track per aircraft (its latest flight at this fire), cut at the last
 * sample near the fire, so the icon ends where it worked and not back at base.
 */
export function tracksOf(aircraft = [], max = 6) {
  const byHex = new Map();
  for (const a of aircraft ?? []) {
    if (typeof a?.hex !== 'string') continue;
    const prev = byHex.get(a.hex);
    if (!prev || t(a.lastNear) > t(prev.lastNear)) byHex.set(a.hex, a);
  }
  return [...byHex.values()]
    .sort((a, b) => t(a.since) - t(b.since) || a.hex.localeCompare(b.hex))
    .slice(0, max)
    .map((a, i) => {
      const until = t(a.lastNear);
      const pts = (Array.isArray(a.track) ? a.track : [])
        .filter(
          (p) =>
            Array.isArray(p) &&
            Number.isFinite(p[1]) &&
            Number.isFinite(p[2]) &&
            (!Number.isFinite(until) ||
              !Number.isFinite(p[0]) ||
              p[0] * 1000 <= until + 60_000),
        )
        .map((p) => [p[2], p[1]]);
      return {
        hex: a.hex,
        name: clean(a.name || a.registration || 'Aircraft'),
        rotor: a.rotor === true,
        colour: TRACK_COLOURS[i % TRACK_COLOURS.length],
        pts,
      };
    });
}

function placeOf(incident, region, index) {
  const point = Array.isArray(incident.point) ? incident.point : null;
  let hit = null;
  try {
    hit = (index ?? places()).match(region, incident.location, point);
  } catch {
    hit = null;
  }
  if (hit?.name) return hit.name;
  const n = placeText(incident.location).names?.[0];
  return n ? nice(n) : '';
}

const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * The scene for one incident. `aircraft` is /v1/incidents/{id}/aircraft
 * `.aircraft`; `events` the history_events rows of the incident when the
 * backend has them (the public API does not), else null.
 */
export function buildScene({
  incident,
  aircraft = [],
  events = null,
  now = Date.now(),
  fetchedAt = null,
  place,
  placeIndex,
  aircraftAttribution = AIRCRAFT_ATTRIBUTION,
}) {
  const region = regionOf(incident);
  const st = STATES[region] ?? {
    short: region.toUpperCase(),
    tz: 'Australia/Sydney',
  };
  const tz = st.tz;
  const cfg = sources[region] ?? {
    name: incident.agency || 'the agency',
    attribution: '',
    adviceUrl: incident.officialUrl,
  };
  const rank = levelRank(incident.level);
  const tracks = tracksOf(aircraft);
  const aircraftCount = new Set(
    (aircraft ?? []).map((a) => a?.hex).filter(Boolean),
  ).size;
  // The post is about the day of the incident's latest moment in the window.
  const moments = [
    incident.updated,
    incident.created,
    incident.firstSeen,
    ...(events ?? []).map((e) => e?.at),
    ...(aircraft ?? []).map((a) => a?.lastNear),
  ]
    .map(t)
    .filter((x) => Number.isFinite(x) && x <= now);
  const dateAt = Math.max(
    now - 24 * 3_600_000,
    Math.min(now, moments.length ? Math.max(...moments) : now),
  );
  const day = dayKey(dateAt, tz);
  const point =
    Array.isArray(incident.point) && incident.point.every(Number.isFinite)
      ? [incident.point[1], incident.point[0]]
      : null;
  const asOf = Number.isFinite(t(fetchedAt)) ? t(fetchedAt) : now;
  const sourceLine = /Source:/.test(cfg.attribution)
    ? cfg.attribution
    : `Source: ${cfg.name}. ${cfg.attribution}`.trim();
  return {
    version: SCENE_VERSION,
    id: incident.id,
    region,
    state: st.short,
    tz,
    headline: splitHeadline(incident.title),
    place: place ?? placeOf(incident, region, placeIndex),
    date: dateLabel(dateAt, tz),
    dateAt: new Date(dateAt).toISOString(),
    level: rank ? { rank, ...AWS[rank] } : null,
    status: statusOnly(incident.status) || null,
    point,
    area: areaOf(incident.geometry),
    tracks,
    aircraftCount,
    sizeHa:
      typeof incident.sizeHa === 'number' && incident.sizeHa > 0
        ? incident.sizeHa
        : null,
    number: chooseNumber({
      aircraft: aircraftCount,
      sizeHa: incident.sizeHa ?? null,
    }),
    steps: chooseSteps({ incident, events, aircraft, tz, day, now }),
    source: {
      name: cfg.name,
      attribution: cfg.attribution,
      adviceUrl: cfg.adviceUrl || incident.officialUrl,
      licenseUrl: cfg.licenseUrl ?? null,
      line: `${sourceLine} Data as of ${dateTimeLabel(asOf, tz)}.`,
    },
    aircraftLine: aircraftCount ? aircraftAttribution : null,
    independent: `${INDEPENDENT} · Official warnings: ${hostOf(cfg.adviceUrl || incident.officialUrl)}`,
    facts: [
      statusOnly(incident.status) && `Status: ${statusOnly(incident.status)}`,
      incident.sizeHa ? `Fire size: ${fmt(incident.sizeHa)} ha` : null,
      tracks.length
        ? `Aircraft: ${tracks.map((x) => x.name).join(', ')}`
        : null,
    ].filter(Boolean),
  };
}

// ── The page ────────────────────────────────────────────────────────────────

const LAYOUT = {
  still: {
    top: 52,
    kop: 140,
    place: 420,
    map: 498,
    mapH: 440,
    rail: 970,
    foot: 1136,
  },
  reel: {
    top: 236,
    kop: 326,
    place: 606,
    map: 688,
    mapH: 530,
    rail: 1254,
    foot: 1420,
  },
};

/** Aircraft glyphs, white on a dark round badge in the track colour: a plane seen from above (turned to its heading), a helicopter from the side. */
const PLANE =
  '<path d="M24 3c2 0 3 2 3 5v10l16 9v5l-16-4v9l5 4v4l-8-2-8 2v-4l5-4v-9L5 32v-5l16-9V8c0-3 1-5 3-5z" fill="#fff"/>';
const HELI =
  '<g fill="#fff"><rect x="6" y="8" width="34" height="3.5" rx="1.7"/><rect x="21.2" y="10" width="3.6" height="7"/><path d="M7 25.5c0-5.6 5-9.5 12.5-9.5h4.5c4.6 0 7 3 7 6.5v2.6c0 2.6-2 4.4-4.6 4.4H13c-3.6 0-6-1.7-6-4z"/><path d="M29 21.5h11.5l2.5-7h3l-1.4 12H29z"/></g><path d="M9 34.5h21M13 29.5v5M25 29.5v5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/>';

/**
 * The whole scene as one page. `map: false` leaves MapLibre out (no network)
 * and lists the facts instead; that is also the fallback when tiles fail.
 * `fonts`: CSS with @font-face rules; without it Rubik comes from Google Fonts.
 * `icon` and `badge`: data URIs of the app icon and the official App Store
 * badge. Without a badge the end card shows a marked placeholder, never a
 * home-made badge.
 */
export function renderSceneHtml(scene, format, opts = {}) {
  const { w, h } = SIZES[format];
  const reel = format === 'reel';
  const y = LAYOUT[format];
  const withMap = opts.map !== false && !!(scene.point || scene.area.length);
  const [c1, c2, c3] = scene.level?.rank >= 2 ? TINT.dark : TINT.light;
  const mapW = w - 140;
  const icon = opts.icon ?? null;
  const badge = opts.badge ?? null;
  const brand = icon
    ? `<img class="merk" src="${icon}" alt="">`
    : '<div class="merk"></div>';
  const fontHead =
    opts.fonts != null
      ? `<style>${opts.fonts}</style>`
      : '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700;800&display=block">';
  const legend = [
    ...(scene.area.length
      ? [{ k: '#FF9F1C', name: 'Mapped fire area', i: 'area' }]
      : []),
    ...scene.tracks.map((tr, i) => ({ k: tr.colour, name: tr.name, i })),
  ].slice(0, 4);
  const data = {
    point: scene.point,
    area: scene.area,
    tracks: scene.tracks.map((tr) => ({
      colour: tr.colour,
      rotor: tr.rotor,
      pts: tr.pts,
    })),
    dur: SCENE_SEC,
    steps: scene.steps.length,
    plane: PLANE,
    heli: HELI,
  };
  const pill = scene.level
    ? `<b class="aws" data-a="aws" style="--bg:${scene.level.bg};--fg:${scene.level.fg}">${esc(scene.level.label)}</b>`
    : scene.status
      ? `<b class="aws stil" data-a="aws">${esc(scene.status)}</b>`
      : '';
  const mapBody = withMap
    ? `<div id="map"></div><svg id="lijnen" width="${mapW}" height="${y.mapH}"></svg><div id="punten"></div>
       <div class="leg">${legend.map((l) => `<i data-leg="${l.i}" style="--k:${l.k}">${esc(l.name)}</i>`).join('')}</div>
       <div class="credit">${esc(MAP_CREDIT)}</div>`
    : `<ul class="lijst">${(scene.facts.length ? scene.facts : ['Details are in the app']).map((f, i) => `<li data-rij="${i}">${esc(f)}</li>`).join('')}</ul>`;
  const endCard = reel
    ? `<div class="uit" data-a="uit">
  ${icon ? `<img class="logo" data-a="uit-logo" src="${icon}" alt="">` : '<div class="logo" data-a="uit-logo"></div>'}
  <h2 data-a="uit-kop">Emergencies Near Me</h2>
  ${
    badge
      ? `<div class="badges" data-a="uit-tekst"><img class="apple" src="${badge}" alt="Download on the App Store"></div>`
      : '<div class="badges" data-a="uit-tekst"><div class="plaatshouder">PLACEHOLDER — official App Store badge goes here</div></div>'
  }
  <em data-a="uit-knop">Link in bio</em>
  ${badge ? `<small>${esc(APPLE_TRADEMARK)}</small>` : ''}
</div>`
    : '';
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8">
${fontHead}
${withMap ? '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css"><script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>' : ''}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{position:relative;font-family:'Rubik',system-ui,sans-serif;color:#fff;-webkit-font-smoothing:antialiased;background:linear-gradient(155deg,${c1},${c2} 52%,${c3})}
svg.bg{position:absolute;inset:0}
.top{position:absolute;left:70px;right:70px;top:${y.top}px;display:flex;align-items:center;gap:16px;font-weight:700;font-size:28px}
.merk{width:54px;height:54px;border-radius:14px;flex:none;background:#C8291F;box-shadow:0 0 0 3px rgba(255,255,255,.9)}
.top b{margin-left:auto;background:#13161b;padding:10px 24px 11px;border-radius:999px;font-size:31px;font-weight:800;letter-spacing:-.5px;box-shadow:0 10px 24px -8px rgba(0,0,0,.5)}
h1{position:absolute;left:70px;right:70px;top:${y.kop}px;font-weight:800;font-size:118px;line-height:.98;letter-spacing:-3.8px;text-shadow:0 8px 34px rgba(0,0,0,.25);white-space:nowrap}
h1 span{display:block;width:fit-content}
.pill{display:inline-block!important;background:#FFD60A;color:#9C0F08;border-radius:26px;padding:0 24px 10px;margin-top:10px;box-shadow:0 10px 0 rgba(0,0,0,.2);text-shadow:none;transform-origin:left center}
.plek{position:absolute;left:70px;right:70px;top:${y.place}px;height:60px;display:flex;align-items:center;gap:22px}
.plek span{flex:1;min-width:0;font-size:44px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plek span small{font-size:44px;font-weight:500;opacity:.85}
.aws{flex:none;background:var(--bg);color:var(--fg);border:4px solid #111;border-radius:999px;padding:7px 24px 9px;font-size:31px;font-weight:800;letter-spacing:-.3px;box-shadow:0 10px 24px -8px rgba(0,0,0,.55);transform-origin:right center}
.aws.stil{background:#13161b;color:#fff;border-color:rgba(255,255,255,.25)}
.kaart{position:absolute;left:70px;top:${y.map}px;width:${mapW}px;height:${y.mapH}px;border-radius:44px;overflow:hidden;background:#0F141B;box-shadow:0 40px 80px -20px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.12)}
#map{position:absolute;inset:0}#lijnen{position:absolute;inset:0}#punten{position:absolute;inset:0}
.pin{position:absolute;width:68px;height:83px;margin:-83px 0 0 -34px;transform-origin:50% 100%;filter:drop-shadow(0 12px 14px rgba(0,0,0,.5))}
.puls{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;background:rgba(255,121,0,.5)}
.vlieg{position:absolute;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:#0b0d10;border:4px solid var(--k);display:grid;place-items:center;box-shadow:0 6px 12px rgba(0,0,0,.55)}
.vlieg svg{display:block}
.leg{position:absolute;left:22px;right:22px;bottom:22px;display:flex;gap:12px;flex-wrap:wrap}
.leg i{font-style:normal;display:flex;align-items:center;gap:10px;background:rgba(10,12,15,.86);padding:10px 18px;border-radius:999px;font-size:23px;font-weight:600;white-space:nowrap}
.leg i::before{content:"";width:14px;height:14px;border-radius:50%;background:var(--k);flex:none}
.credit{position:absolute;left:18px;top:14px;z-index:2;font-size:15px;font-weight:500;color:rgba(255,255,255,.72);background:rgba(10,12,15,.72);padding:4px 10px;border-radius:999px}
.lijst{position:absolute;inset:0;list-style:none;padding:44px 50px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.lijst li{font-size:36px;font-weight:600;padding-left:34px;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lijst li::before{content:"";position:absolute;left:0;top:14px;width:14px;height:14px;border-radius:50%;background:#FFD60A}
.getal{position:absolute;right:58px;top:${y.kop + 18}px;z-index:4;background:#FFD60A;color:#9C0F08;border-radius:30px;padding:14px 26px 16px;text-align:center;transform-origin:50% 50%;box-shadow:0 22px 44px -10px rgba(0,0,0,.55),0 8px 0 rgba(0,0,0,.2)}
.getal b{display:block;font-size:84px;font-weight:800;line-height:.9;letter-spacing:-3px}
.getal span{display:block;font-size:22px;font-weight:700;margin-top:8px;max-width:190px;line-height:1.1}
.rail{position:absolute;left:70px;right:70px;top:${y.rail}px;display:flex;align-items:flex-start}
.stap{flex:1;position:relative;padding-top:38px;min-width:0}
.stap .lijn{position:absolute;left:14px;right:0;top:11px;height:6px;background:rgba(255,255,255,.35);transform-origin:left center}
.stap:last-child .lijn{display:none}
.stap .bol{position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 0 0 7px rgba(255,255,255,.22)}
.stap b{display:block;font-size:38px;font-weight:800;letter-spacing:-1px;white-space:nowrap}
.stap span{display:block;font-size:25px;font-weight:600;opacity:.92;margin-top:4px;padding-right:18px;line-height:1.15}
.stap.nadruk .bol{background:#FFD60A;box-shadow:0 0 0 7px rgba(255,214,10,.3)}.stap.nadruk b{color:#FFD60A}
.voet{position:absolute;left:70px;right:70px;top:${y.foot}px;font-size:19px;line-height:1.36;font-weight:500}
.voet p{opacity:.78}.voet p+p{margin-top:6px}
.voet p.los{opacity:.95;font-weight:700;font-size:21px;margin-top:12px}
.uit{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:linear-gradient(155deg,${TINT.light[0]},${TINT.light[1]} 52%,${TINT.light[2]});opacity:0}
.uit .logo{width:260px;height:260px;border-radius:58px;box-shadow:0 40px 80px -20px rgba(0,0,0,.6),0 0 0 6px rgba(255,255,255,.14);display:block}
div.logo{background:#C8291F}
.uit h2{font-size:84px;font-weight:800;letter-spacing:-2.5px;line-height:1;margin-top:56px;text-shadow:0 8px 34px rgba(0,0,0,.25)}
.uit .badges{display:flex;align-items:center;justify-content:center;margin-top:56px}
.uit .badges .apple{height:124px;width:auto;display:block}
.plaatshouder{width:372px;height:124px;border:4px dashed #fff;border-radius:22px;display:grid;place-items:center;padding:0 24px;font-size:24px;font-weight:700;line-height:1.2;background:rgba(0,0,0,.25)}
.uit em{font-style:normal;display:inline-block;margin-top:54px;background:#FFD60A;color:#9C0F08;font-size:50px;font-weight:800;padding:16px 40px 20px;border-radius:26px;box-shadow:0 10px 0 rgba(0,0,0,.2)}
.uit small{position:absolute;left:90px;right:90px;top:1500px;font-size:19px;line-height:1.35;font-weight:500;opacity:.65}
</style></head><body>
<svg class="bg" width="${w}" height="${h}">${[260, 400, 540, 680, 820, 960, 1100].map((r) => `<circle cx="${w - 220}" cy="${y.kop + 170}" r="${r}" fill="none" stroke="#fff" stroke-opacity="${scene.level?.rank >= 2 ? 0.05 : 0.09}" stroke-width="2"/>`).join('')}</svg>
<div class="top" data-a="top">${brand}<span>Incident of the day</span><b>${esc(scene.date)}</b></div>
<h1>${scene.headline[0] ? `<span data-a="kop1">${esc(scene.headline[0])}</span>` : ''}<span class="pill" data-a="kop2">${esc(scene.headline[1])}</span></h1>
<div class="plek" data-a="plek"><span>${esc(scene.place || scene.state)}${scene.place ? `<small>, ${esc(scene.state)}</small>` : ''}</span>${pill}</div>
<div class="kaart" data-a="kaart">${mapBody}</div>
${scene.number ? `<div class="getal" data-a="getal"><b>${esc(scene.number.value)}</b><span>${esc(scene.number.label)}</span></div>` : ''}
<div class="rail">${scene.steps.map((s, i) => `<div class="stap${s.emphasis ? ' nadruk' : ''}" data-stap="${i}"><i class="lijn"></i><i class="bol"></i><b>${esc(s.time)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>
<div class="voet" data-a="voet"><p>${esc(scene.source.line)}</p>${scene.aircraftLine ? `<p>${esc(scene.aircraftLine)}</p>` : ''}<p class="los">${esc(scene.independent)}</p></div>
${endCard}
<script>
const D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
window.__klaar = false; window.__kaartFout = false;
const q = (s) => document.querySelector(s);
const klem = (x) => Math.max(0, Math.min(1, x));
const deel = (t, a, b) => { const x = klem((t - a) / (b - a)); return 1 - Math.pow(1 - x, 3); };
const veer = (t, a, b) => { const x = klem((t - a) / (b - a)); return x === 0 ? 0 : x === 1 ? 1 : 1 + 0.18 * Math.sin(x * Math.PI) * (1 - x) * 4 - Math.pow(1 - x, 3); };
const zet = (el, o, tf) => { if (!el) return; el.style.opacity = o; el.style.transform = tf || ''; };
let gebied = null, paden = [], pin = null, puls = null;

// The headline may never leave the frame: shrink until it fits (next to the number).
(function pasKop() {
  const h1 = q('h1'), max = ${mapW} - (q('.getal') ? 270 : 0); let px = 118;
  while (px > 56 && [...h1.children].some((s) => s.getBoundingClientRect().width > max)) { px -= 4; h1.style.fontSize = px + 'px'; h1.style.letterSpacing = (-px / 31) + 'px'; }
})();

window.__zetTijd = function (t) {
  zet(q('[data-a=top]'), deel(t, 0, .4));
  const k1 = deel(t, .1, .6); zet(q('[data-a=kop1]'), k1, 'translateY(' + (1 - k1) * 46 + 'px)');
  const k2 = veer(t, .35, .95); zet(q('[data-a=kop2]'), klem(k2 * 3), 'rotate(-2.5deg) scale(' + (.6 + .4 * k2) + ')');
  const pl = deel(t, .7, 1.1); zet(q('[data-a=plek]'), pl, 'translateY(' + (1 - pl) * 20 + 'px)');
  const aw = veer(t, 1.0, 1.5); zet(q('[data-a=aws]'), klem(aw * 3), 'scale(' + (.6 + .4 * aw) + ')');
  const ka = deel(t, .8, 1.4); zet(q('[data-a=kaart]'), ka, 'translateY(' + (1 - ka) * 60 + 'px) scale(' + (.94 + .06 * ka) + ')');
  if (pin) {
    const p = veer(t, 1.3, 1.8); zet(pin, klem(p * 4), 'translateY(' + (1 - p) * -90 + 'px) scale(' + (.7 + .3 * p) + ')');
    const fase = t < 1.8 ? 0 : ((t - 1.8) % 1.4) / 1.4, uit = t > D.dur - .9;
    zet(puls, uit ? .3 : t < 1.8 ? 0 : .55 * (1 - fase), 'scale(' + (uit ? .72 : .35 + fase * .9) + ')');
  }
  if (gebied) { const g = deel(t, 1.6, 2.4); gebied.style.opacity = g; gebied.style.transform = 'scale(' + (.85 + .15 * g) + ')'; }
  const lg0 = q('[data-leg="area"]'); if (lg0) { const l = deel(t, 2.0, 2.35); zet(lg0, l, 'translateY(' + (1 - l) * 14 + 'px)'); }
  const n = paden.length, van = 2.0, tot = 4.4, per = n ? Math.min(1.6, (tot - van) / Math.max(1, n * .6)) : 0;
  paden.forEach((p, i) => {
    const start = van + (n > 1 ? i * (tot - van - per) / (n - 1) : 0), v = deel(t, start, start + per);
    p.els.forEach((el) => { el.style.strokeDashoffset = p.len * (1 - v); el.style.opacity = v > 0 ? 1 : 0; });
    if (p.icoon) {
      const a = p.els[0].getPointAtLength(p.len * v), b = p.els[0].getPointAtLength(Math.max(0, p.len * v - 6));
      const hoek = (a.x === b.x && a.y === b.y) ? p.hoek : Math.atan2(a.x - b.x, b.y - a.y) * 180 / Math.PI;
      if (!(a.x === b.x && a.y === b.y)) p.hoek = hoek;
      p.icoon.style.left = a.x + 'px'; p.icoon.style.top = a.y + 'px';
      const s = veer(t, start - .1, start + .3); zet(p.icoon, klem(s * 3), 'scale(' + (.5 + .5 * s) + ')');
      if (p.draai) p.draai.style.transform = 'rotate(' + hoek + 'deg)';
    }
    const lg = q('[data-leg="' + i + '"]'); const l = deel(t, start + per * .4, start + per * .4 + .35); zet(lg, l, 'translateY(' + (1 - l) * 14 + 'px)');
  });
  document.querySelectorAll('[data-rij]').forEach((li, i) => { const v = deel(t, 1.6 + i * .35, 2.1 + i * .35); zet(li, v, 'translateX(' + (1 - v) * -24 + 'px)'); });
  document.querySelectorAll('[data-stap]').forEach((s, i) => {
    const a = 4.5 + i * .45, v = deel(t, a, a + .4);
    zet(s.querySelector('.bol'), klem(v * 2), 'scale(' + veer(t, a, a + .4) + ')');
    zet(s.querySelector('b'), v, 'translateY(' + (1 - v) * 14 + 'px)'); zet(s.querySelector('span'), v);
    const lijn = s.querySelector('.lijn'); if (lijn) { lijn.style.transform = 'scaleX(' + deel(t, a + .2, a + .65) + ')'; }
  });
  const g = veer(t, 5.2, 5.7); zet(q('[data-a=getal]'), klem(g * 3), 'rotate(4deg) scale(' + (.5 + .5 * g) + ')');
  zet(q('[data-a=voet]'), deel(t, 5.8, 6.2));
  const u = D.dur;
  zet(q('[data-a=uit]'), deel(t, u + .05, u + .4));
  const lo = veer(t, u + .2, u + .8); zet(q('[data-a=uit-logo]'), klem(lo * 3), 'scale(' + (.6 + .4 * lo) + ')');
  [['uit-kop', .55], ['uit-tekst', .8], ['uit-knop', 1.05]].forEach(([naam, na]) => {
    const v = deel(t, u + na, u + na + .4); zet(q('[data-a=' + naam + ']'), v, 'translateY(' + (1 - v) * 26 + 'px)');
  });
};

function teken(map) {
  const svg = q('#lijnen'), laag = q('#punten'), ns = 'http://www.w3.org/2000/svg';
  const midden = D.point ? map.project(D.point) : null;
  if (D.area.length) {
    gebied = document.createElementNS(ns, 'g');
    let d = '';
    for (const poly of D.area) for (const ring of poly) d += ring.map((p, i) => { const s = map.project(p); return (i ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1); }).join(' ') + ' Z ';
    const vlak = document.createElementNS(ns, 'path');
    vlak.setAttribute('d', d); vlak.setAttribute('fill', 'rgba(255,121,0,.32)'); vlak.setAttribute('fill-rule', 'evenodd');
    vlak.setAttribute('stroke', '#FF9F1C'); vlak.setAttribute('stroke-width', '4'); vlak.setAttribute('stroke-linejoin', 'round');
    gebied.appendChild(vlak); svg.appendChild(gebied);
    const bb = vlak.getBBox(), o = midden || { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    gebied.style.transformBox = 'view-box'; gebied.style.transformOrigin = o.x + 'px ' + o.y + 'px';
  }
  for (const tr of D.tracks) {
    if (!tr.pts.length) continue;
    const pts = tr.pts.map((p) => map.project(p));
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ') + (pts.length === 1 ? ' l0.1 0' : '');
    const els = [['#0b0d10', 11], [tr.colour, 6]].map(([kleur, dik]) => {
      const el = document.createElementNS(ns, 'path');
      el.setAttribute('d', d); el.setAttribute('fill', 'none'); el.setAttribute('stroke', kleur); el.setAttribute('stroke-width', dik);
      el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round'); svg.appendChild(el);
      return el;
    });
    const len = Math.max(0.1, els[0].getTotalLength());
    els.forEach((el) => { el.style.strokeDasharray = len + ' ' + len; });
    const icoon = document.createElement('div'); icoon.className = 'vlieg';
    icoon.style.setProperty('--k', tr.colour);
    icoon.innerHTML = '<svg viewBox="0 0 48 48" width="30" height="30">' + (tr.rotor ? D.heli : D.plane) + '</svg>';
    laag.appendChild(icoon);
    paden.push({ els, len, icoon, draai: tr.rotor ? null : icoon.firstChild, hoek: 0 });
  }
  if (midden) {
    puls = document.createElement('div'); puls.className = 'puls'; puls.style.left = midden.x + 'px'; puls.style.top = midden.y + 'px'; laag.insertBefore(puls, laag.firstChild);
    pin = document.createElement('div'); pin.className = 'pin'; pin.style.left = midden.x + 'px'; pin.style.top = midden.y + 'px';
    pin.innerHTML = '<svg viewBox="0 0 100 122" width="68" height="83"><path d="M50 4C25 4 6 23 6 47c0 30 37 62 41 70a4 4 0 0 0 6 0c4-8 41-40 41-70C94 23 75 4 50 4Z" fill="#fff"/><path d="M50 12C29 12 14 28 14 47c0 24 29 52 36 61 7-9 36-37 36-61 0-19-15-35-36-35Z" fill="#C8291F"/><circle cx="50" cy="46" r="13" fill="#fff"/></svg>';
    // The pin under the aircraft icons, so an aircraft over the fire stays visible.
    laag.insertBefore(pin, puls.nextSibling);
  }
}

${
  withMap
    ? `
(function kaart() {
  if (typeof maplibregl === 'undefined') { window.__kaartFout = true; return; }
  const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/dark', center: D.point || D.area[0][0][0], zoom: 10,
    interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true } });
  // Fit the fire, its area and the part of each track within 9 km of it; the
  // rest of a track runs in from the edge, so the fire stays the subject.
  const b = new maplibregl.LngLatBounds(); const c = D.point || D.area[0][0][0]; b.extend(c);
  for (const poly of D.area) for (const ring of poly) for (const p of ring) b.extend(p);
  const km = (p) => Math.hypot((p[0] - c[0]) * 111 * Math.cos(c[1] * Math.PI / 180), (p[1] - c[1]) * 111);
  for (const tr of D.tracks) for (const p of tr.pts) if (km(p) <= 9) b.extend(p);
  const leeg = b.getNorth() - b.getSouth() < 0.004 && b.getEast() - b.getWest() < 0.004;
  if (leeg) map.jumpTo({ center: c, zoom: 11 });
  else map.fitBounds(b, { padding: { top: 90, bottom: 110, left: 80, right: 80 }, maxZoom: 13, duration: 0 });
  map.on('error', () => { window.__kaartFout = true; });
  map.on('load', () => {
    // The same dark house style as the Dutch app's reel.
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#1b2420');
      if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', layer.id.includes('water') ? '#24465c' : /park|wood/.test(layer.id) ? '#1f3a2e' : /building|residential/.test(layer.id) ? '#2a2f37' : '#1f2b26');
      if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', layer.id.includes('water') ? '#24465c' : layer.id.includes('casing') ? '#2c313a' : '#555a68');
      if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
        map.setPaintProperty(layer.id, 'text-color', '#c6d0cc'); map.setPaintProperty(layer.id, 'text-halo-color', '#141b18'); map.setPaintProperty(layer.id, 'text-halo-width', 1.2);
      }
    }
    map.once('idle', () => {
      if (window.__kaartFout) return;
      teken(map);
      window.__zetTijd(D.dur);
      // The map does not move during the reel: freeze it to an image and drop
      // WebGL, so every frame only paints HTML and SVG.
      try {
        const url = map.getCanvas().toDataURL('image/png');
        const img = new Image();
        img.onload = () => {
          try { map.remove(); } catch (e) {}
          img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
          q('#map').appendChild(img);
          window.__klaar = true;
        };
        img.onerror = () => { window.__klaar = true; };
        img.src = url;
      } catch (e) { window.__klaar = true; }
    });
  });
})();`
    : 'window.__zetTijd(D.dur); window.__klaar = true;'
}
</script></body></html>`;
}
