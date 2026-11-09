// The live map on the website (/map and /map/nsw etc.), the web version of
// the app's map. The page itself is server-rendered text (title, active
// warnings, busiest places) so search engines see content; the map is drawn
// in the browser with MapLibre and OpenFreeMap tiles (free, OpenStreetMap
// data) from /v1/map, a compact list of what is active or recently ended.
import { places } from './places.mjs';
import {
  STATES,
  CATEGORY,
  ASSET_VERSION,
  esc,
  crumbs,
  page,
  appCta,
} from './site-layout.mjs';
import {
  currentIncidents,
  activePlaces,
  mapRows,
  regionsLive,
  sourceInfo,
  isOver,
} from './site-data.mjs';
import { statusOnly } from './articles.mjs';
import { incidentRow } from './site-places.mjs';

const MAPLIBRE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist';

/** [west, south, east, north] per state, and for all of Australia. */
export const BOUNDS = {
  au: [112, -44, 154, -10],
  vic: [140.9, -39.2, 150, -33.9],
  nsw: [140.9, -37.6, 153.7, -28.1],
  qld: [137.9, -29.2, 153.6, -10.6],
  sa: [129, -38.1, 141, -25.9],
  act: [148.7, -35.95, 149.45, -35.1],
};

/**
 * /v1/map: incidents listed now or ended within `hours`, as compact rows:
 * [id, region, lat, lon, category, title, place name, place slug, status,
 * level, listed (1/0), time, article path or ""].
 */
export function mapData(store, articles, hours) {
  const rows = mapRows(store, hours);
  const idx = places();
  return {
    updatedAt: new Date().toISOString(),
    hours,
    categories: Object.fromEntries(
      Object.entries(CATEGORY).map(([k, v]) => [
        k,
        { label: v.label, colour: v.colour },
      ]),
    ),
    incidents: rows.map((r) => {
      const p = r.place ? idx.get(r.region, r.place) : null;
      const a = articles.byRef(r.id);
      return [
        r.id,
        r.region,
        Math.round(r.lat * 1e5) / 1e5,
        Math.round(r.lon * 1e5) / 1e5,
        r.category,
        r.title,
        p?.name ?? '',
        r.place ?? '',
        isOver(r) ? 'Ended' : statusOnly(r.status),
        isOver(r) ? '' : (r.level ?? ''),
        isOver(r) ? 0 : 1,
        r.t,
        a ? `/news/${r.region}/${a.slug}` : '',
      ];
    }),
  };
}

/** /map or /map/{state}. */
export function mapPage(store, articles, region = '') {
  const st = region ? STATES[region] : null;
  const regions = region ? [region] : regionsLive(STATES);
  const per = regions.map((r) => ({ r, ...currentIncidents(store, r) }));
  const total = per.reduce(
    (n, p) => n + p.incidents.filter((i) => i.category !== 'ambulance').length,
    0,
  );
  const warnings = per.flatMap((p) =>
    p.warnings.filter((w) => w.level).map((w) => ({ w, r: p.r })),
  );
  const busiest = regions
    .flatMap((r) => activePlaces(store, r, 7).map((p) => ({ ...p, r })))
    .sort((a, b) => b.n - a.n)
    .slice(0, 20);
  const name = st ? st.name : 'Australia';
  const trail = crumbs(
    region
      ? [
          ['Home', '/'],
          ['Map', '/map'],
          [st.name, `/map/${region}`],
        ]
      : [
          ['Home', '/'],
          ['Map', '/map'],
        ],
  );
  const attribution = regions
    .map((r) => sourceInfo(store, r).attribution)
    .filter(Boolean)
    .join('\n');
  const body = `${trail.html}
<h1 class="page">${region ? `${esc(st.name)} fire and emergency map` : 'Live emergency map of Australia'}</h1>
<div class="chips" id="map-filters" role="group" aria-label="Map filters">
<a href="#" data-hours="0" aria-pressed="true">Active now</a><a href="#" data-hours="24" aria-pressed="false">Last 24 hours</a>
${Object.entries(CATEGORY)
  .filter(([k]) => !['ambulance', 'planned'].includes(k))
  .map(
    ([k, v]) =>
      `<a href="#" data-cat="${k}" aria-pressed="true"><span style="color:${v.colour}">●</span> ${esc(v.label)}</a>`,
  )
  .join('')}
</div>
<div id="map" data-region="${region || 'au'}" data-bounds="${BOUNDS[region || 'au'].join(',')}" style="height:min(72vh,720px);border-radius:18px;overflow:hidden;border:1px solid var(--line);background:var(--card)"></div>
<p class="updated" id="map-status">Loading the map…</p>
<p class="lead">${total} active fires, crashes, storms and other incidents${region ? ` in ${esc(st.name)}` : ' in Victoria, New South Wales, Queensland, South Australia and the ACT'}, on one live map. Tap an incident for its status, place and any warning; rings are incidents that have ended in the last 24 hours.</p>
<noscript><p>The map needs JavaScript. The lists below and the <a href="/incidents">incident pages per state</a> work without it.</p></noscript>
${
  !region
    ? `<div class="chips">${regionsLive(STATES)
        .map((r) => `<a href="/map/${r}">${esc(STATES[r].name)} map</a>`)
        .join('')}</div>`
    : ''
}
${
  warnings.length
    ? `<h2>Warnings now</h2><div class="list">${warnings
        .slice(0, 30)
        .map(({ w, r }) => incidentRow(w, r, { articles }))
        .join('')}</div>`
    : `<h2>Warnings now</h2><p>No Advice, Watch and Act or Emergency Warning is current${region ? ` in ${esc(st.name)}` : ''}.</p>`
}
${
  busiest.length
    ? `<h2>Busiest places this week</h2><div class="chips">${busiest
        .map(
          (p) =>
            `<a href="/incidents/${p.r}/${esc(p.place)}">${esc(p.info.name)}<small>${esc(STATES[p.r].short)} · ${p.n}</small></a>`,
        )
        .join('')}</div>`
    : ''
}
${appCta('The app shows this map with your own radius and sends an alert when something happens near you.')}
<div class="note">This map is not an official warning service and can be delayed. For official information see the <a href="/sources">agencies' own sites</a>. In an emergency call <b>000</b>.</div>
<script src="${MAPLIBRE}/maplibre-gl.js" defer></script>
<script src="/assets/map.js?v=${ASSET_VERSION}" defer></script>`;
  return page({
    path: region ? `/map/${region}` : '/map',
    title: region
      ? `${st.name} fire map: live bushfires and emergencies | Emergencies Near Me`
      : 'Live bushfire and emergency map of Australia | Emergencies Near Me',
    description: `Live map of ${total} active bushfires, crashes, floods and other emergencies in ${name}, from the official feeds. Updated every minute.`,
    body,
    attribution: `${attribution}\nMap: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors.`,
    jsonld: [trail.ld],
    head: `<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css"><link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin>`,
    nav: '/map',
  });
}
