// News pages: an article per significant incident and a weekly overview per
// state (articles.mjs decides which). The article is built from the history
// on every request, so it always shows the latest status and ends with the
// incident; the URL never changes.
import { places } from './places.mjs';
import {
  SITE,
  STATES,
  CATEGORY,
  ORG,
  esc,
  nice,
  dateTime,
  longDate,
  levelBadge,
  crumbs,
  page,
  appCta,
  titled,
} from './site-layout.mjs';
import { sourceInfo, activeNear, credits } from './site-data.mjs';
import {
  ARTICLE_REGIONS,
  statusOnly,
  typeWords,
  weekRange,
} from './articles.mjs';
import { incidentRow, newsRow } from './site-places.mjs';

const LEVEL = ['', 'Advice', 'Watch and Act', 'Emergency Warning'];
/** "an Advice", "a Watch and Act", "an Emergency Warning". */
const withArticle = (level) =>
  /^[AEIOU]/.test(level) ? `an ${level}` : `a ${level}`;
/** "an Advice warning", "a Watch and Act warning", "an Emergency Warning" (already a warning). */
const levelWarning = (level) =>
  /warning/i.test(level) ? withArticle(level) : `${withArticle(level)} warning`;

function ogImageFor(category) {
  const known = ['fire', 'rescue', 'storm', 'hazmat'];
  return `${SITE}/assets/og-${known.includes(category) ? category : 'default'}.png`;
}

function newsLd(article, region, row, headlineText, description, placeObj) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: headlineText.slice(0, 110),
    description,
    datePublished: article.published,
    dateModified: article.modified,
    mainEntityOfPage: `${SITE}/news/${region}/${article.slug}`,
    image: [ogImageFor(row?.category)],
    author: ORG,
    publisher: ORG,
    articleSection: STATES[region].name,
    isAccessibleForFree: true,
    ...(placeObj
      ? {
          contentLocation: {
            '@type': 'Place',
            name: `${placeObj.name}, ${STATES[region].short}`,
            geo: {
              '@type': 'GeoCoordinates',
              latitude: placeObj.lat,
              longitude: placeObj.lon,
            },
          },
        }
      : {}),
  };
}

/** /news and /news/{state}. */
export function newsIndex(store, articles, region = '') {
  const st = region ? STATES[region] : null;
  const list = articles.latest(region || null, region ? 80 : 50);
  const regions = ARTICLE_REGIONS.filter((r) => STATES[r]);
  const trail = crumbs(
    region
      ? [
          ['Home', '/'],
          ['News', '/news'],
          [st.name, `/news/${region}`],
        ]
      : [
          ['Home', '/'],
          ['News', '/news'],
        ],
  );
  const months = region ? articles.months(region) : [];
  const body = `${trail.html}
<h1 class="page">${region ? `${esc(st.name)} fire and emergency news` : 'Fire and emergency news'}</h1>
<p class="lead">${
    region
      ? `Bushfires with a warning, large fires and a weekly overview for ${esc(st.name)}, compiled from the official incident feed and updated as the agency publishes changes.`
      : 'Bushfires with a warning, large fires and a weekly overview per state, compiled from the official incident feeds and updated as the agencies publish changes.'
  }</p>
${region ? '' : `<div class="chips">${regions.map((r) => `<a href="/news/${r}">${esc(STATES[r].name)}</a>`).join('')}</div>`}
<div class="list">${list.map((a) => newsRow(a, a.region)).join('') || '<div class="row">No news yet.</div>'}</div>
${
  months.length
    ? `<h2>Archive</h2><div class="chips">${months
        .map(
          (m) =>
            `<a href="/news/${region}/archive/${m.month}">${esc(
              new Date(`${m.month}-15T00:00:00Z`).toLocaleDateString('en-AU', {
                month: 'long',
                year: 'numeric',
              }),
            )}<small>${m.n}</small></a>`,
        )
        .join('')}</div>`
    : ''
}
<div class="note">These reports are compiled automatically from the public feeds of ${regions.map((r) => esc(STATES[r].official)).join(', ')}. They are not official warnings. Always follow the advice of emergency services, and call <b>000</b> in an emergency.</div>`;
  return page({
    path: region ? `/news/${region}` : '/news',
    title: region
      ? titled(`${st.name} fire and emergency news`)
      : 'Australian fire and emergency news | Emergencies Near Me',
    description: region
      ? `Bushfires, warnings and a weekly overview of emergencies in ${st.name}, from the official incident feed.`
      : 'Bushfires, warnings and weekly overviews of emergencies in NSW, Queensland and the ACT, from the official incident feeds.',
    body,
    credits: credits(store, region ? [region] : ARTICLE_REGIONS),
    jsonld: [trail.ld],
    nav: '/news',
  });
}

/** /news/{state}/archive/{yyyy-mm}. */
export function newsArchive(store, articles, region, month) {
  const st = STATES[region];
  const list = articles.inMonth(region, month);
  if (!list.length) return null;
  const label = new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });
  const trail = crumbs([
    ['Home', '/'],
    ['News', '/news'],
    [st.name, `/news/${region}`],
    [label, `/news/${region}/archive/${month}`],
  ]);
  const body = `${trail.html}
<h1 class="page">${esc(st.name)} emergency news, ${esc(label)}</h1>
<div class="list">${list.map((a) => newsRow(a, region)).join('')}</div>`;
  return page({
    path: `/news/${region}/archive/${month}`,
    title: `${st.name} emergency news, ${label} | Emergencies Near Me`,
    description: `${list.length} reports on bushfires and emergencies in ${st.name} in ${label}.`,
    body,
    credits: credits(store, [region]),
    jsonld: [trail.ld],
    nav: '/news',
  });
}

/** The incident's moments: reported, every change, ended. */
function timeline(store, row, tz) {
  const events = store.db
    .prepare('SELECT * FROM history_events WHERE id=? ORDER BY at')
    .all(row.id);
  const items = [];
  let last = null;
  for (const e of events) {
    const text =
      e.status === 'Ended'
        ? `Ended: no longer on the agency's list of current incidents`
        : [e.level, statusOnly(e.status)]
            .filter(Boolean)
            .filter((v, k, a) => a.indexOf(v) === k)
            .join(' · ') || 'Updated';
    if (text === last) continue;
    last = text;
    items.push(
      `<li><b>${esc(dateTime(e.at, tz))}</b><br>${esc(items.length ? text : `Reported. ${text}`)}</li>`,
    );
  }
  return items;
}

/** Sentences about the incident, only from the facts in the feed. */
function story(row, place, st, info, endedAt) {
  const tz = st.tz;
  const ended = !row.listed;
  const type = typeWords(row);
  const street = String(row.location ?? '')
    .split(',')
    .slice(0, -1)
    .join(',')
    .trim();
  const where = [nice(street), place?.name].filter(Boolean).join(', ');
  const area =
    place?.lga && !/unincorporated/i.test(place.lga)
      ? ` in the ${place.lga} area`
      : '';
  const agency = row.agency || st.official;
  const p = [];
  if (row.kind === 'warning') {
    p.push(
      `${agency} has issued ${row.level ? levelWarning(row.level) : 'a warning'} for ${row.location || place?.name || 'an area'}${area}, ${st.name}${row.action ? `: ${row.action.toLowerCase()}` : ''}.`,
    );
    p.push(
      `The warning was issued on ${dateTime(row.created || row.first_seen, tz)}${ended ? ` and is no longer current since ${dateTime(endedAt, tz)}` : ''}.`,
    );
    return p;
  }
  // NSW and Queensland publish no call time: then it is when it was first listed.
  const reported = dateTime(row.created || row.first_seen, tz);
  p.push(
    `${ended ? `${agency} responded to` : `${agency} is responding to`} a ${type}${where ? ` at ${where}` : ''}${area}, ${st.name}. It was ${row.created ? 'reported' : 'first listed'} on ${reported}.`,
  );
  const facts = [];
  if (row.size_ha)
    facts.push(
      `burnt about ${Number(row.size_ha).toLocaleString('en-AU')} hectares`,
    );
  if (!ended && row.resources)
    facts.push(`${row.resources} resources assigned`);
  if (ended && row.max_resources)
    facts.push(`up to ${row.max_resources} resources assigned`);
  if (row.max_level >= 1) {
    const now = levelNow(row);
    p.push(
      ended
        ? `The highest warning level was ${LEVEL[row.max_level]}.`
        : now
          ? `The warning level is ${LEVEL[now]}${now < row.max_level ? `, after ${LEVEL[row.max_level]} earlier` : ''}.`
          : `The warning level was ${LEVEL[row.max_level]} earlier; there is none now.`,
    );
  }
  if (ended) {
    p.push(
      `The incident ended on ${dateTime(endedAt, tz)}, when it left the agency's list of current incidents${statusOnly(row.status) ? `. Its last published status was “${statusOnly(row.status).toLowerCase()}”` : ''}${facts.length ? `, and it had ${facts.join(' and ')}` : ''}.`,
    );
  } else {
    p.push(
      `At ${dateTime(info.fetchedAt || row.last_seen, tz)} its status was “${statusOnly(row.status).toLowerCase() || 'not published'}”${facts.length ? `, and it had ${facts.join(' and ')}` : ''}.`,
    );
  }
  return p;
}

function levelNow(row) {
  const l = String(row.level ?? '').toLowerCase();
  return l.includes('emergency')
    ? 3
    : l.includes('watch')
      ? 2
      : l.includes('advice')
        ? 1
        : 0;
}

/** /news/{state}/{slug}. Null when there is no such article. */
export function articlePage(store, articles, region, slug) {
  const a = articles.get(region, slug);
  if (!a) return null;
  if (a.kind === 'week') return weekPage(store, articles, a);
  const st = STATES[region];
  const row = store.db.prepare('SELECT * FROM history WHERE id=?').get(a.ref);
  if (!row) return null;
  const place = row.place ? places().get(region, row.place) : null;
  const info = sourceInfo(store, region);
  const title = a.title;
  // When it left the list: the "Ended" event, the same time as in the timeline.
  const endedAt =
    store.db
      .prepare(
        "SELECT MAX(at) AS at FROM history_events WHERE id=? AND status='Ended'",
      )
      .get(row.id)?.at ?? row.last_seen;
  const paragraphs = story(row, place, st, info, endedAt);
  const description =
    paragraphs
      .join(' ')
      .slice(0, 155)
      .replace(/\s+\S*$/, '') + '…';
  const ended = !row.listed;
  const steps = timeline(store, row, st.tz);
  const nearby =
    row.lat != null
      ? activeNear(store, row.lat, row.lon, 25, region)
          .filter((r) => r.id !== row.id)
          .slice(0, 8)
      : [];
  const more = (place ? articles.forPlace(region, place.slug, 6) : []).filter(
    (x) => x.slug !== a.slug,
  );
  const c = CATEGORY[row.category] ?? CATEGORY.other;
  const facts = [
    ['Status', ended ? 'Ended' : statusOnly(row.status) || 'Not published'],
    ...(row.max_level
      ? [
          [
            'Warning level',
            `${LEVEL[row.max_level]}${!ended && levelNow(row) !== row.max_level ? ` (now ${LEVEL[levelNow(row)] || 'none'})` : ''}`,
          ],
        ]
      : []),
    [
      'Type',
      row.kind === 'warning'
        ? `${row.level || ''} warning`.trim()
        : nice(row.title) || c.label,
    ],
    [
      'Location',
      [
        nice(row.location),
        place?.lga && !/unincorporated/i.test(place.lga)
          ? `${place.lga} council area`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    ...(row.size_ha
      ? [['Size', `${Number(row.size_ha).toLocaleString('en-AU')} ha`]]
      : []),
    ...(!ended && row.resources ? [['Resources', String(row.resources)]] : []),
    [
      row.created ? 'Reported' : 'First listed',
      dateTime(row.created || row.first_seen, st.tz),
    ],
    ended
      ? ['Ended', dateTime(endedAt, st.tz)]
      : ['Last checked', dateTime(info.fetchedAt || row.last_seen, st.tz)],
    ['Source', row.agency || st.official],
  ];
  const trail = crumbs([
    ['Home', '/'],
    ['News', '/news'],
    [st.name, `/news/${region}`],
    [title, `/news/${region}/${a.slug}`],
  ]);
  const body = `${trail.html}
<article class="news">
<h1 class="page">${esc(title)}</h1>
<p class="updated">Published ${esc(longDate(a.published, st.tz))} · Updated ${esc(dateTime(a.modified, st.tz))}${ended ? '' : ' · Live: this page follows the incident'}</p>
<p>${ended ? '<span class="ended-tag" style="margin:0">Ended</span>' : levelBadge(row.level)}</p>
${paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}
${row.details ? `<p>The agency's warning says:</p><blockquote>${esc(row.details)}</blockquote>` : ''}
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
${steps.length > 1 ? `<h2>Timeline</h2><ul class="timeline">${steps.join('')}</ul>` : ''}
<div class="note">This report is compiled automatically from the public incident feed of ${esc(row.agency || st.official)} and is updated as the agency publishes changes. It is not an official warning. For the latest official information see <a href="${esc(info.adviceUrl || '#')}">${esc(st.official)}</a>. In an emergency call <b>000</b>.</div>
${place ? `<p>More about this area: <a href="/incidents/${region}/${esc(place.slug)}">emergencies in ${esc(place.name)}</a> · <a href="/map/${region}">${esc(st.short)} map</a></p>` : ''}
</article>
${nearby.length ? `<h2>Also happening nearby</h2><div class="list">${nearby.map((r) => incidentRow(r, region, { articles, km: r.km })).join('')}</div>` : ''}
${more.length ? `<h2>Earlier news from ${esc(place.name)}</h2><div class="list">${more.map((x) => newsRow(x, region)).join('')}</div>` : ''}
${appCta()}`;
  return page({
    path: `/news/${region}/${a.slug}`,
    title: titled(title),
    description,
    body,
    credits: credits(store, [region]),
    ogType: 'article',
    ogImage: ogImageFor(row.category),
    jsonld: [newsLd(a, region, row, title, description, place), trail.ld],
    head: `<meta property="article:published_time" content="${esc(a.published)}"><meta property="article:modified_time" content="${esc(a.modified)}">`,
    nav: '/news',
  });
}

/** The weekly overview of a state, from the history of that week. */
function weekPage(store, articles, a) {
  const region = a.region;
  const st = STATES[region];
  const [, year, week] = a.ref.match(/(\d{4})-(\d{2})$/) ?? [];
  const range = weekRange(Number(year), Number(week), st.tz);
  const rows = store.db
    .prepare(
      `SELECT * FROM history INDEXED BY history_start
       WHERE region=? AND COALESCE(created, first_seen)>=? AND COALESCE(created, first_seen)<?
         AND kind='incident' AND private=0`,
    )
    .all(region, range.from, range.to);
  const by = {};
  for (const r of rows) by[r.category] = (by[r.category] || 0) + 1;
  const landscape = rows.filter(
    (r) =>
      r.category === 'fire' &&
      /bush|grass|scrub|vegetation|forest/i.test(r.title),
  );
  const warned = rows.filter((r) => r.max_level >= 1);
  const biggest = rows
    .filter((r) => r.size_ha)
    .sort((x, y) => y.size_ha - x.size_ha)
    .slice(0, 5);
  const perPlace = new Map();
  for (const r of rows)
    if (r.place) perPlace.set(r.place, (perPlace.get(r.place) ?? 0) + 1);
  const busiest = [...perPlace]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 12)
    .map(([slug, n]) => ({ p: places().get(region, slug), n }))
    .filter((x) => x.p);
  const weekNews = articles
    .between(region, range.from, range.to)
    .filter((x) => x.kind === 'incident');
  const counts = Object.entries(by)
    .sort((x, y) => y[1] - x[1])
    .map(
      ([c, n]) =>
        `${n} ${n === 1 ? (CATEGORY[c] ?? CATEGORY.other).label.toLowerCase() : (CATEGORY[c] ?? CATEGORY.other).plural}`,
    );
  const fires = by.fire ?? 0;
  const top = busiest[0];
  const lead = [
    `In the week of ${longDate(range.from, st.tz)}, ${st.official} published ${rows.length} incidents in ${st.name}${counts.length ? `: ${counts.slice(0, -1).join(', ')}${counts.length > 1 ? ' and ' : ''}${counts.at(-1)}` : ''}.`,
    landscape.length
      ? landscape.length === fires
        ? `All ${fires} fires were bush, grass or vegetation fires.`
        : `${landscape.length} of the ${fires} fires were bush, grass or vegetation fires.`
      : '',
    warned.length
      ? `${warned.length} ${warned.length === 1 ? 'incident had' : 'incidents had'} a warning level.`
      : '',
    top ? `The most incidents were in ${top.p.name} (${top.n}).` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const trail = crumbs([
    ['Home', '/'],
    ['News', '/news'],
    [st.name, `/news/${region}`],
    [a.title, `/news/${region}/${a.slug}`],
  ]);
  const body = `${trail.html}
<article class="news">
<h1 class="page">${esc(a.title)}</h1>
<p class="updated">Published ${esc(longDate(a.published, st.tz))}</p>
<p>${esc(lead)}</p>
<div class="stats">${[
    [rows.length, 'incidents'],
    [landscape.length, 'bush, grass and vegetation fires'],
    [warned.length, 'with a warning level'],
    [by.rescue ?? 0, 'rescues and crashes'],
    [by.storm ?? 0, 'storm and flood jobs'],
  ]
    .filter(([n], k) => k === 0 || n > 0)
    .map(
      ([n, label]) =>
        `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`,
    )
    .join('')}</div>
${
  biggest.length
    ? `<h2>Largest fires</h2><div class="list">${biggest.map((r) => incidentRow(r, region, { articles, absolute: true })).join('')}</div>`
    : ''
}
${
  busiest.length
    ? `<h2>Busiest places</h2><div class="chips">${busiest
        .map(
          ({ p, n }) =>
            `<a href="/incidents/${region}/${esc(p.slug)}">${esc(p.name)}<small>${n}</small></a>`,
        )
        .join('')}</div>`
    : ''
}
${weekNews.length ? `<h2>Reports from this week</h2><div class="list">${weekNews.map((x) => newsRow(x, region)).join('')}</div>` : ''}
<div class="note">Compiled automatically from the public incident feed of ${esc(st.official)}. Not every call is published, and the counts cover incidents as published. Always follow the advice of emergency services; in an emergency call <b>000</b>.</div>
</article>
${appCta()}`;
  const description = lead.slice(0, 155).replace(/\s+\S*$/, '') + '…';
  return page({
    path: `/news/${region}/${a.slug}`,
    title: titled(a.title),
    description,
    body,
    credits: credits(store, [region]),
    ogType: 'article',
    ogImage: ogImageFor('fire'),
    jsonld: [
      newsLd(a, region, { category: 'fire' }, a.title, description, null),
      trail.ld,
    ],
    head: `<meta property="article:published_time" content="${esc(a.published)}">`,
    nav: '/news',
  });
}
