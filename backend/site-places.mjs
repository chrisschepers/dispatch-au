// State and place pages (wish Chris 09-11-2026: "let vooral goed op de seo").
// People search for "fire near Penrith" or "Caroline Springs fire today";
// the official sites answer per state. A page per suburb with what is
// happening now and what happened there recently answers that search, and
// links to the official advice and to the app.
//
// Thin pages are kept out of the index: a place needs two incidents in 90
// days or one in the last 14 (placeIndexable); ambulance calls are never
// listed, only counted.
import { places } from './places.mjs';
import {
  STATES,
  CATEGORY,
  esc,
  nice,
  when,
  dateTime,
  levelBadge,
  crumbs,
  page,
  appCta,
} from './site-layout.mjs';
import {
  currentIncidents,
  placeHistory,
  placeCounts,
  activePlaces,
  placeIndexable,
  activeNear,
  sourceInfo,
  PRIVATE_CATEGORIES,
  isOver,
} from './site-data.mjs';
import { statusOnly } from './articles.mjs';

const timeOf = (i) => i.created || i.first_seen || i.firstSeen || i.updated;

/** The place of a live feed row (history rows carry it already). */
function placeOf(i, region) {
  if (i.place !== undefined)
    return i.place ? places().get(region, i.place) : null;
  return places().match(region, i.location, i.point);
}

/** The street part of a location ("Ivanhoe Rd"), without the place itself. */
function streetOf(location) {
  const parts = String(location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? nice(parts.slice(0, -1).join(', ')) : '';
}

/**
 * One incident in a list: colour bar, title (to its article when there is
 * one), street and place (to the place page), status, time. An ended incident
 * has no card behind it and says "Ended", like in the app.
 */
export function incidentRow(
  i,
  region,
  { articles = null, absolute = false, km = null, showPlace = true } = {},
) {
  const c = CATEGORY[i.category] ?? CATEGORY.other;
  const st = STATES[region] ?? STATES.vic;
  const place = placeOf(i, region);
  const article = articles?.byRef?.(i.id);
  const title = esc(nice(i.title) || c.label);
  const titleHtml = article
    ? `<a href="/news/${region}/${esc(article.slug)}">${title}</a>`
    : title;
  const placeHtml = place
    ? `<a href="/incidents/${region}/${esc(place.slug)}">${esc(place.name)}</a>`
    : esc(nice(i.location));
  const street = streetOf(i.location);
  const ended = isOver(i);
  const meta = [
    showPlace ? [street, placeHtml].filter(Boolean).join(', ') : esc(street),
    ended ? '' : esc(statusOnly(i.status)),
  ]
    .filter(Boolean)
    .join(' · ');
  const right = [
    esc(absolute ? dateTime(timeOf(i), st.tz) : when(timeOf(i), st.tz)),
    km != null
      ? `${km < 1 ? '<1' : Math.round(km)} km`
      : showPlace
        ? esc(st.short)
        : '',
  ]
    .filter(Boolean)
    .join('<br>');
  return `<div class="row${ended ? ' ended' : ''}"><div class="bar" style="background:${ended ? 'transparent' : c.colour}"></div><div>
<div class="t">${titleHtml}${ended ? '<span class="ended-tag">Ended</span>' : levelBadge(i.level)}</div><div class="m">${meta}</div></div>
<div class="r">${right}</div></div>`;
}

function updatedLine(info, tz) {
  return info.fetchedAt
    ? `<p class="updated">Updated ${esc(dateTime(info.fetchedAt, tz))} from ${esc(info.name)}.</p>`
    : '';
}

/** /incidents/{state}: what is happening now, the busiest places, the news. */
export function statePage(store, region, articles) {
  const st = STATES[region];
  const { incidents, warnings, feed } = currentIncidents(store, region);
  const visible = incidents.filter((i) => !PRIVATE_CATEGORIES.has(i.category));
  const counts = {};
  for (const i of incidents) counts[i.category] = (counts[i.category] || 0) + 1;
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([c, n]) =>
        `${n} ${n === 1 ? (CATEGORY[c] ?? CATEGORY.other).label.toLowerCase() : (CATEGORY[c] ?? CATEGORY.other).plural}`,
    )
    .join(', ');
  const levelled = warnings.filter((w) => w.level);
  const busiest = activePlaces(store, region, 7)
    .sort((a, b) => b.n - a.n || a.info.name.localeCompare(b.info.name))
    .slice(0, 24);
  const news = articles.latest(region, 6);
  const info = sourceInfo(store, region);
  const trail = crumbs([
    ['Home', '/'],
    ['Incidents', '/incidents'],
    [st.name, `/incidents/${region}`],
  ]);
  const body = `${trail.html}
<h1 class="page">${esc(st.name)} emergency incidents now</h1>
<p class="lead">${incidents.length} current incidents in ${esc(st.name)}${summary ? `: ${esc(summary)}` : ''}. Updated every minute from ${esc(feed?.source || st.official)}.</p>
${updatedLine(info, st.tz)}
<p><a class="btn" href="/map/${region}">Open the ${esc(st.short)} map</a></p>
${
  levelled.length
    ? `<h2>Warnings</h2><div class="list">${levelled
        .slice(0, 50)
        .map((w) => incidentRow(w, region, { articles }))
        .join('')}</div>`
    : ''
}
<h2>Incidents</h2>
<div class="list">${
    visible
      .slice(0, 300)
      .map((i) => incidentRow(i, region, { articles }))
      .join('') || '<div class="row">No current incidents.</div>'
  }</div>
${counts.ambulance ? `<p class="updated">Plus ${counts.ambulance} ambulance ${counts.ambulance === 1 ? 'call' : 'calls'}, not listed here for privacy.</p>` : ''}
${
  busiest.length
    ? `<h2>Busiest places this week</h2><div class="chips">${busiest
        .map(
          (p) =>
            `<a href="/incidents/${region}/${esc(p.place)}">${esc(p.info.name)}<small>${p.n}</small></a>`,
        )
        .join(
          '',
        )}</div><p><a href="/incidents/${region}/places">All places in ${esc(st.name)} with incidents →</a></p>`
    : ''
}
${
  news.length
    ? `<h2>${esc(st.short)} news</h2><div class="list">${news.map((a) => newsRow(a, region)).join('')}</div><p><a href="/news/${region}">More ${esc(st.short)} news →</a></p>`
    : ''
}
${appCta()}
<div class="note">For official advice and warnings, see <a href="${esc(feed?.adviceUrl || info.adviceUrl || '#')}">${esc(st.official)}</a>. In an emergency call <b>000</b>.</div>`;
  return page({
    path: `/incidents/${region}`,
    title: `${st.name} emergency incidents now (${incidents.length}) | Emergencies Near Me`,
    description: `Live emergency incidents in ${st.name}: ${incidents.length} right now${summary ? ` (${summary})` : ''}. Bushfires, crashes, storms and floods, updated every minute.`,
    body,
    attribution: feed?.attribution || info.attribution,
    jsonld: [trail.ld],
    nav: '/incidents',
  });
}

export function newsRow(a, region) {
  const st = STATES[region] ?? STATES.vic;
  return `<div class="row"><div class="bar" style="background:var(--red)"></div><div>
<div class="t"><a href="/news/${region}/${esc(a.slug)}">${esc(a.title)}</a></div></div>
<div class="r">${esc(dateTime(a.published, st.tz))}</div></div>`;
}

/** /incidents/{state}/places: every place with incidents in the last 90 days, A to Z. */
export function placesIndexPage(store, region) {
  const st = STATES[region];
  const list = activePlaces(store, region, 90).sort((a, b) =>
    a.info.name.localeCompare(b.info.name),
  );
  const groups = new Map();
  for (const p of list) {
    const letter = p.info.name[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(p);
  }
  const trail = crumbs([
    ['Home', '/'],
    ['Incidents', '/incidents'],
    [st.name, `/incidents/${region}`],
    ['Places', `/incidents/${region}/places`],
  ]);
  const body = `${trail.html}
<h1 class="page">Places in ${esc(st.name)} with emergency incidents</h1>
<p class="lead">${list.length} suburbs and towns in ${esc(st.name)} had a fire, crash, storm or other published incident in the last 90 days. Each page shows what is happening there now and what happened recently.</p>
<div class="az">${[...groups]
    .map(
      ([letter, ps]) =>
        `<h3>${esc(letter)}</h3><div class="chips">${ps
          .map(
            (p) =>
              `<a href="/incidents/${region}/${esc(p.place)}">${esc(p.info.name)}<small>${p.n}</small></a>`,
          )
          .join('')}</div>`,
    )
    .join('')}</div>`;
  return page({
    path: `/incidents/${region}/places`,
    title: `${st.name} suburbs and towns with emergency incidents | Emergencies Near Me`,
    description: `Fires, crashes, storms and other incidents per suburb in ${st.name}: ${list.length} places with incidents in the last 90 days.`,
    body,
    jsonld: [trail.ld],
    nav: '/incidents',
  });
}

/** Place names nearby with their own page worth visiting. */
function nearbyPlaces(store, place, n = 12) {
  const withPages = new Map(
    activePlaces(store, place.state, 90).map((p) => [p.place, p]),
  );
  return places()
    .within(place.state, place.lat, place.lon, 40)
    .filter(({ place: p }) => p.slug !== place.slug && withPages.has(p.slug))
    .slice(0, n)
    .map(({ place: p, km }) => ({ p, km, n: withPages.get(p.slug).n }));
}

/** /incidents/{state}/{place}. Null for an unknown place (404). */
export function placePage(store, region, slug, articles) {
  const st = STATES[region];
  const place = places().get(region, slug);
  if (!place) return null;
  const hist = placeHistory(store, region, slug, 90);
  const visible = hist.filter((r) => !PRIVATE_CATEGORIES.has(r.category));
  const ambulance = hist.length - visible.length;
  const now = activeNear(store, place.lat, place.lon, 15, region);
  const recent30 = visible.filter(
    (r) => Date.now() - Date.parse(r.last_seen) <= 30 * 86_400_000,
  );
  const older = visible.filter((r) => !recent30.includes(r));
  const year = placeCounts(store, region, slug, 365);
  const yearTotal = Object.entries(year)
    .filter(([c]) => !PRIVATE_CATEGORIES.has(c))
    .reduce((s, [, n]) => s + n, 0);
  const fires = (year.fire ?? 0) + (year.planned ?? 0);
  const near = nearbyPlaces(store, place);
  const news = articles.forPlace(region, slug, 6);
  const info = sourceInfo(store, region);
  const indexable = placeIndexable(store, region, slug);
  const area =
    place.lga && !/unincorporated/i.test(place.lga) ? place.lga : null;
  const trail = crumbs([
    ['Home', '/'],
    ['Incidents', '/incidents'],
    [st.name, `/incidents/${region}`],
    [place.name, `/incidents/${region}/${slug}`],
  ]);
  const nowHere = now.filter((r) => r.place === slug);
  const lead = `Live fires, road crashes, storm damage and other incidents in and around ${place.name}${area ? ` (${area} council area)` : ''}, ${st.name}, as published by ${st.official}. ${
    nowHere.length
      ? `${nowHere.length} active in ${place.name} right now.`
      : now.length
        ? `Nothing active in ${place.name} itself right now; ${now.length} within 15 km.`
        : `Nothing active in or near ${place.name} right now.`
  } ${recent30.length} ${recent30.length === 1 ? 'incident' : 'incidents'} in the last 30 days.`;
  const body = `${trail.html}
<h1 class="page">Emergencies in ${esc(place.name)}, ${esc(st.short)}</h1>
<p class="lead">${esc(lead)}</p>
${updatedLine(info, st.tz)}
<div class="stats">
<div class="stat"><b>${nowHere.length}</b><span>active in ${esc(place.name)}</span></div>
<div class="stat"><b>${now.length}</b><span>active within 15 km</span></div>
<div class="stat"><b>${recent30.length}</b><span>in the last 30 days</span></div>
<div class="stat"><b>${yearTotal}</b><span>in the last 12 months${fires ? `, ${fires} fires` : ''}</span></div>
</div>
<h2>Now in and around ${esc(place.name)}</h2>
${
  now.length
    ? `<div class="list">${now
        .slice(0, 20)
        .map((r) => incidentRow(r, r.region, { articles, km: r.km }))
        .join('')}</div>`
    : `<p>No active incidents within 15 km of ${esc(place.name)}. See the <a href="/map/${region}">${esc(st.short)} map</a> for everything happening in ${esc(st.name)}.</p>`
}
<h2>Last 30 days in ${esc(place.name)}</h2>
${
  recent30.length
    ? `<div class="list">${recent30.map((r) => incidentRow(r, region, { articles, absolute: true, showPlace: false })).join('')}</div>`
    : `<p>No published incidents in ${esc(place.name)} in the last 30 days.</p>`
}
${
  older.length
    ? `<h3>Earlier (31 to 90 days ago)</h3><div class="list">${older
        .slice(0, 60)
        .map((r) =>
          incidentRow(r, region, {
            articles,
            absolute: true,
            showPlace: false,
          }),
        )
        .join('')}</div>`
    : ''
}
${ambulance ? `<p class="updated">Plus ${ambulance} ambulance ${ambulance === 1 ? 'call' : 'calls'} in this period, not listed for privacy.</p>` : ''}
${
  news.length
    ? `<h2>News from ${esc(place.name)}</h2><div class="list">${news.map((a) => newsRow(a, region)).join('')}</div>`
    : ''
}
${
  near.length
    ? `<h2>Nearby places</h2><div class="chips">${near
        .map(
          ({ p, km }) =>
            `<a href="/incidents/${region}/${esc(p.slug)}">${esc(p.name)}<small>${Math.round(km)} km</small></a>`,
        )
        .join('')}</div>`
    : ''
}
${appCta(`Get an alert when something happens near ${place.name}, with your own radius per service.`)}
<div class="note">For official advice and warnings for ${esc(place.name)}, see <a href="${esc(info.adviceUrl || '#')}">${esc(st.official)}</a>. In an emergency call <b>000</b>.</div>`;
  const placeLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `${place.name}, ${st.short}`,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: place.lat,
      longitude: place.lon,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: place.name,
      addressRegion: st.short,
      ...(place.postcodes[0] ? { postalCode: place.postcodes[0] } : {}),
      addressCountry: 'AU',
    },
  };
  return page({
    path: `/incidents/${region}/${slug}`,
    title: `${place.name} fires and emergencies now | ${st.short} | Emergencies Near Me`,
    description: `${place.name}, ${st.short}: ${nowHere.length} active ${nowHere.length === 1 ? 'incident' : 'incidents'} now, ${now.length} within 15 km and ${recent30.length} in the last 30 days. Bushfires, crashes and storms, updated every minute.`,
    body,
    attribution: info.attribution,
    robots: indexable
      ? 'index,follow,max-image-preview:large'
      : 'noindex,follow',
    jsonld: [trail.ld, placeLd],
    nav: '/incidents',
  });
}
