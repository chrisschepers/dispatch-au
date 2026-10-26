// The Emergencies Near Me website, rendered on the server from the same
// store the app reads. Pages are plain HTML with live incident data in them,
// so search engines see the content without running scripts.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources } from './feeds.mjs';
import { PRIVACY_HTML } from './privacy.mjs';

const SITE = (
  process.env.SITE_URL || 'https://emergenciesnearme.online'
).replace(/\/$/, '');
const APP_STORE = 'https://apps.apple.com/app/id6811057872';
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'site', 'assets');
const CONTACT = 'chrisschepers22@gmail.com';

export const STATES = {
  vic: {
    name: 'Victoria',
    short: 'VIC',
    tz: 'Australia/Melbourne',
    official: 'VicEmergency',
  },
  nsw: {
    name: 'New South Wales',
    short: 'NSW',
    tz: 'Australia/Sydney',
    official: 'NSW Rural Fire Service',
  },
  qld: {
    name: 'Queensland',
    short: 'QLD',
    tz: 'Australia/Brisbane',
    official: 'Queensland Fire Department',
  },
  sa: {
    name: 'South Australia',
    short: 'SA',
    tz: 'Australia/Adelaide',
    official: 'SA Country Fire Service',
  },
  act: {
    name: 'Australian Capital Territory',
    short: 'ACT',
    tz: 'Australia/Sydney',
    official: 'ACT Emergency Services Agency',
  },
};

const CATEGORY = {
  fire: { label: 'Fire', colour: '#e5372c' },
  planned: { label: 'Planned burn', colour: '#e5372c' },
  ambulance: { label: 'Ambulance', colour: '#f4a814' },
  rescue: { label: 'Rescue', colour: '#2f6fde' },
  storm: { label: 'SES', colour: '#12897a' },
  hazmat: { label: 'Hazmat', colour: '#7c4dbe' },
  other: { label: 'Other', colour: '#8e8e93' },
};

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

/** Feeds often shout suburbs in capitals ("KAMBAH"); show them in title case. */
function nice(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase() || !/[A-Z]{3,}/.test(t)) return t;
  return t
    .toLowerCase()
    .replace(/\b([a-z])/g, (x) => x.toUpperCase())
    .replace(/\b(Nsw|Vic|Qld|Sa|Act)\b/g, (x) => x.toUpperCase());
}

function when(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 360) return `${Math.floor(min / 60)} h ago`;
  return d.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const timeOf = (i) => i.created || i.updated || i.firstSeen;

function currentIncidents(store, region) {
  const feed = store.feed(region, 24);
  if (!feed) return { incidents: [], warnings: [], feed: null };
  return {
    incidents: feed.incidents.filter((i) => i.listed),
    warnings: feed.warnings,
    feed,
  };
}

const CSS = `
:root{--bg:#f6f6f7;--card:#fff;--text:#141414;--soft:#55575d;--muted:#8e8e93;--line:#e6e6e9;--red:#e5372c;--redsoft:#fdeceb}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#1c1c1e;--text:#f2f2f7;--soft:#c7c7cc;--muted:#8e8e93;--line:#2c2c2e;--red:#ff5247;--redsoft:#3a1512}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.top{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;text-decoration:none;font-size:17px}
.brand img{width:34px;height:34px;border-radius:9px}
nav a{margin-left:18px;text-decoration:none;color:var(--soft);font-weight:600;font-size:15px}nav a:hover{color:var(--text)}
.hero{text-align:center;padding:36px 0 18px}
.hero h1{font-size:clamp(38px,7vw,68px);line-height:1.02;letter-spacing:-.04em;font-weight:900;margin:0 0 16px}
.hero h1 span,.red{color:var(--red)}
.hero p{font-size:clamp(17px,2.4vw,20px);color:var(--soft);max-width:640px;margin:0 auto 26px}
.store{display:inline-flex;align-items:center;gap:10px;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:700}
@media (prefers-color-scheme:dark){.store{background:#fff;color:#000}}
.store small{display:block;font-size:11px;font-weight:500;opacity:.8;line-height:1}
.live{display:inline-flex;align-items:center;gap:8px;margin-top:18px;color:var(--soft);font-size:14px}
.dot{width:9px;height:9px;border-radius:50%;background:#34c759;box-shadow:0 0 0 4px #34c75933}
.shots{display:flex;gap:18px;overflow-x:auto;padding:28px 4px 18px;scroll-snap-type:x mandatory}
.shots img{height:min(560px,110vw);width:auto;border-radius:22px;scroll-snap-align:center;flex:none;box-shadow:0 18px 40px #0000001f}
h2{font-size:clamp(26px,4vw,36px);letter-spacing:-.03em;margin:48px 0 14px;line-height:1.1}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:var(--card);border-radius:18px;padding:20px;border:1px solid var(--line)}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--soft);font-size:15px}
.states{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.state{display:block;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.state b{display:block;font-size:28px;letter-spacing:-.02em}.state span{color:var(--soft);font-size:14px}
.list{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.row{display:flex;gap:12px;padding:14px 16px;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.bar{width:4px;border-radius:2px;flex:none}
.row .t{font-weight:700}.row .m{color:var(--soft);font-size:14px}.row .r{margin-left:auto;text-align:right;color:var(--muted);font-size:13px;white-space:nowrap}
.lvl{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;margin-left:6px;vertical-align:1px}
.lvl.e{background:#e5372c;color:#fff}.lvl.w{background:#f4a814;color:#111}.lvl.a{background:#f5d547;color:#111}
.note{background:var(--redsoft);border-radius:16px;padding:16px 18px;margin:28px 0;font-size:15px}
.prose{max-width:720px}.prose h2{font-size:24px;margin-top:34px}.prose p,.prose li{color:var(--soft)}
footer{margin-top:56px;padding:28px 0 40px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
footer a{margin-right:16px}
@media (max-width:440px){.brand .bn{display:none}nav a{margin-left:14px}.row .r{font-size:12px}}
.row>div:nth-child(2){min-width:0;overflow-wrap:anywhere}.attr{white-space:pre-line;margin-top:10px}
.maker{margin-top:10px}footer p a{margin-right:0}
`;

function page({ path, title, description, body, attribution = '' }) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/assets/01-map.jpg"><meta property="og:url" content="${SITE}${path}">
<meta name="apple-itunes-app" content="app-id=6811057872">
<link rel="icon" href="/assets/favicon.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="wrap">
<header class="top"><a class="brand" href="/"><img src="/assets/icon.png" alt=""><span class="bn">Emergencies Near Me</span></a>
<nav><a href="/incidents">Incidents</a><a href="/support">Support</a></nav></header>
${body}
<footer>
<a href="/incidents">Incidents</a><a href="/support">Support</a><a href="/sources">Sources</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
<p>Emergencies Near Me is an independent app. It does not represent and is not affiliated with any government or emergency service; the information comes from the official <a href="/sources">sources</a> of the state emergency services. In an emergency, call <b>000</b>. Always follow the advice of official emergency services.</p>
<p class="maker">Also by the maker: <a href="https://alarmeringenp2000.nl/" hreflang="nl">Alarmeringen P2000</a>, emergency alerts in the Netherlands</p>
${attribution ? `<div class="attr">${esc(attribution)}</div>` : ''}
</footer></div></body></html>`;
}

function levelBadge(level) {
  const l = String(level || '').toLowerCase();
  if (l.includes('emergency'))
    return '<span class="lvl e">Emergency Warning</span>';
  if (l.includes('watch')) return '<span class="lvl w">Watch and Act</span>';
  if (l.includes('advice')) return '<span class="lvl a">Advice</span>';
  return '';
}

function row(i, region) {
  const c = CATEGORY[i.category] ?? CATEGORY.other;
  const st = STATES[region] ?? STATES.vic;
  const meta = [nice(i.location), i.status, i.agency]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  return `<div class="row"><div class="bar" style="background:${c.colour}"></div><div>
<div class="t">${esc(nice(i.title) || c.label)}${levelBadge(i.level)}</div><div class="m">${meta}</div></div>
<div class="r">${esc(when(timeOf(i), st.tz))}<br>${esc(st.short)}</div></div>`;
}

function regionOf(i) {
  return String(i.id || '').split(':')[0];
}

function home(store) {
  const per = Object.keys(STATES)
    .filter((r) => sources[r])
    .map((r) => ({ r, ...currentIncidents(store, r) }));
  const total = per.reduce((n, p) => n + p.incidents.length, 0);
  const latest = per
    .flatMap((p) => p.incidents)
    .sort((a, b) => Date.parse(timeOf(b)) - Date.parse(timeOf(a)))
    .slice(0, 8);
  const shots = [
    ['01-map', 'Live map with emergency incidents around Melbourne'],
    ['02-nearby', 'List of incidents near you'],
    ['03-detail', 'Incident details with agency, status and directions'],
    ['04-settings', 'Alert settings with radius per service'],
    ['05-alert', 'Push alert for a grass fire'],
  ];
  const features = [
    [
      'Live map',
      'Every published fire, crash, storm, flood and hazmat incident on one map, updated every minute.',
    ],
    [
      'Near you',
      'A list of what is happening within your radius, newest first, with distance and status.',
    ],
    [
      'Alerts for your area',
      'A push alert when something happens near you. Set a radius per service, for example bushfires 100 km and crashes 10 km.',
    ],
    [
      'Warning levels',
      'Advice, Watch and Act and Emergency Warning, as issued by the agencies, clearly marked.',
    ],
    [
      'Every state in one app',
      'Victoria, New South Wales, Queensland, South Australia and the ACT, without switching apps.',
    ],
    [
      'Details and directions',
      'Agency, status, resources and a route to the incident, plus a link to the official advice.',
    ],
  ];
  const body = `
<section class="hero"><h1>Every emergency<br><span>near you</span>, live.</h1>
<p>Bushfires, floods, road crashes and ambulance calls from Australian emergency services, on one map. With alerts for your own area.</p>
<a class="store" href="${APP_STORE}"><svg width="20" height="24" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg><span><small>Download on the</small>App Store</span></a>
<div><span class="live"><span class="dot"></span>${total.toLocaleString('en-AU')} incidents across Australia right now</span></div>
</section>
<div class="shots">${shots.map(([f, alt]) => `<img src="/assets/${f}.jpg" alt="${esc(alt)}" loading="lazy" width="555" height="1200">`).join('')}</div>
<h2>Know what is happening, <span class="red">before</span> you smell the smoke</h2>
<div class="grid">${features.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
<h2>Right now</h2>
<div class="states">${per.map((p) => `<a class="state" href="/incidents/${p.r}"><b>${p.incidents.length}</b><span>${esc(STATES[p.r].name)}</span></a>`).join('')}</div>
<h2>Latest incidents</h2>
<div class="list">${latest.map((i) => row(i, regionOf(i))).join('') || '<div class="row">No incidents right now.</div>'}</div>
<p><a href="/incidents">All incidents by state →</a></p>
<h2>Try it free</h2>
<p>Start with a free trial, then a yearly subscription through the App Store. Cancel any time in your Apple Account settings.</p>
<div class="note">Emergencies Near Me is not an official warning service. In an emergency call <b>000</b>, and follow the advice of your state emergency service.</div>`;
  return page({
    path: '/',
    title:
      'Emergencies Near Me: live bushfire, flood and crash alerts in Australia',
    description: `Live emergency incidents across Australia on one map: bushfires, floods, road crashes and ambulance calls, with alerts for your area. ${total} incidents right now.`,
    body,
  });
}

function overview(store) {
  const per = Object.keys(STATES)
    .filter((r) => sources[r])
    .map((r) => ({ r, ...currentIncidents(store, r) }));
  const body = `<section class="prose"><h1 style="font-size:40px;letter-spacing:-.03em;margin:20px 0 8px">Emergency incidents in Australia</h1>
<p>Current incidents published by state emergency services, updated every minute. Pick a state for the full list.</p></section>
<div class="states">${per.map((p) => `<a class="state" href="/incidents/${p.r}"><b>${p.incidents.length}</b><span>${esc(STATES[p.r].name)}</span></a>`).join('')}</div>`;
  return page({
    path: '/incidents',
    title: 'Emergency incidents in Australia right now | Emergencies Near Me',
    description:
      'Live emergency incidents in Victoria, New South Wales, Queensland, South Australia and the ACT, updated every minute.',
    body,
  });
}

function statePage(store, region) {
  const st = STATES[region];
  const { incidents, warnings, feed } = currentIncidents(store, region);
  const counts = {};
  for (const i of incidents) counts[i.category] = (counts[i.category] || 0) + 1;
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([c, n]) => `${n} ${(CATEGORY[c] ?? CATEGORY.other).label.toLowerCase()}`,
    )
    .join(', ');
  const levelled = warnings.filter((w) => w.level);
  const body = `<section class="prose"><h1 style="font-size:clamp(30px,5vw,42px);letter-spacing:-.03em;margin:20px 0 8px">${esc(st.name)} emergency incidents now</h1>
<p>${incidents.length} current incidents in ${esc(st.name)}${summary ? `: ${esc(summary)}` : ''}. Updated every minute from ${esc(feed?.source || st.official)}.</p></section>
${
  levelled.length
    ? `<h2>Warnings</h2><div class="list">${levelled
        .slice(0, 50)
        .map((w) => row(w, region))
        .join('')}</div>`
    : ''
}
<h2>Incidents</h2>
<div class="list">${
    incidents
      .slice(0, 300)
      .map((i) => row(i, region))
      .join('') || '<div class="row">No current incidents.</div>'
  }</div>
<div class="note">Get an alert when something happens near you: <a href="${APP_STORE}"><b>Emergencies Near Me on the App Store</b></a>. For official advice, see <a href="${esc(feed?.adviceUrl || '#')}">${esc(st.official)}</a>. In an emergency call <b>000</b>.</div>`;
  return page({
    path: `/incidents/${region}`,
    title: `${st.name} emergency incidents now (${incidents.length}) | Emergencies Near Me`,
    description: `Live emergency incidents in ${st.name}: ${incidents.length} right now${summary ? ` (${summary})` : ''}. Bushfires, crashes, storms and ambulance calls, updated every minute.`,
    body,
    attribution: feed?.attribution || '',
  });
}

function support() {
  const faq = [
    [
      'Why don’t I see incidents near me?',
      'The app shows incidents that state emergency services publish: Victoria, New South Wales, Queensland, South Australia and the ACT. Not every call is published, and some sources update about every 30 minutes. Try a larger radius in Settings.',
    ],
    [
      'I’m outside Australia. Why does it show Melbourne?',
      'With a location outside Australia nothing would be within your radius, so the app shows Melbourne instead. You can choose any Australian place in Settings.',
    ],
    [
      'I don’t get alerts.',
      'Check that notifications for Emergencies Near Me are allowed in iPhone Settings, and that Receive alerts is on in the app. Alerts follow your radius and the services you switched on.',
    ],
    [
      'How do I cancel my subscription?',
      'In iPhone Settings, tap your name, then Subscriptions, then Emergencies Near Me. Cancel at least 24 hours before the trial or year ends.',
    ],
    [
      'I bought it on another iPhone.',
      'Open the app and tap Restore purchase on the subscription screen, with the same Apple Account.',
    ],
    [
      'Is this an official warning service?',
      'No. Emergencies Near Me is independent and does not represent any government or emergency service. The information comes from the official sources listed under Sources. In an emergency call 000, and follow the advice of your state emergency service.',
    ],
  ];
  const body = `<section class="prose"><h1 style="font-size:40px;letter-spacing:-.03em;margin:20px 0 8px">Support</h1>
${faq.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join('')}
<h2>Contact</h2><p>Questions or feedback? Email <a href="mailto:${CONTACT}">${CONTACT}</a>. We usually reply within a day.</p></section>`;
  return page({
    path: '/support',
    title: 'Support | Emergencies Near Me',
    description:
      'Help with Emergencies Near Me: coverage, alerts, subscriptions and contact.',
    body,
  });
}

const bare = (url) =>
  String(url)
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/$/, '');

/**
 * Where the information comes from. Google Play rejected the app on
 * 26-10-2026 for a "Missing Source Link for Government Information": an app
 * that shows government information must name the official sources with a
 * working link, and make clear it does not represent a government. The store
 * listing links here.
 */
function sourcesPage() {
  const list = Object.keys(STATES)
    .filter((r) => sources[r])
    .map((r) => {
      const s = sources[r];
      return `<h2>${esc(STATES[r].name)}: ${esc(s.name)}</h2>
<p>Official incidents and warnings: <a href="${esc(s.adviceUrl)}">${esc(bare(s.adviceUrl))}</a><br>
Open data and licence: <a href="${esc(s.licenseUrl)}">${esc(bare(s.licenseUrl))}</a></p>
<p>${esc(s.attribution)}${s.coverageNote ? ` ${esc(s.coverageNote)}` : ''}</p>`;
    })
    .join('');
  const body = `<section class="prose"><h1 style="font-size:40px;letter-spacing:-.03em;margin:20px 0 8px">Sources</h1>
<p>Emergencies Near Me is an independent app. It does not represent any government, government agency or emergency service, and is not affiliated with or endorsed by them.</p>
<p>Every incident and warning in the app and on this website comes from the public feeds of the state emergency services below, and names its source. We show the information as published, shortened where needed for display. It can be delayed or incomplete: always check the official source and follow the advice of emergency services. In an emergency call <b>000</b>.</p>
${list}</section>`;
  return page({
    path: '/sources',
    title: 'Sources | Emergencies Near Me',
    description:
      'Where the information in Emergencies Near Me comes from: the official websites of VicEmergency, NSW Rural Fire Service, Queensland Fire Department, SA Country Fire Service and ACT Emergency Services Agency.',
    body,
  });
}

function terms() {
  const parts = [
    [
      'The app',
      'Emergencies Near Me shows incident information published by Australian state emergency services. It is an independent app, not an official warning service, and is not affiliated with any government or emergency service. Information can be delayed, incomplete or wrong. In an emergency call 000, and always follow the advice of official emergency services.',
    ],
    [
      'Subscription',
      'Emergencies Near Me Premium is a yearly auto-renewable subscription, sold through the App Store or Google Play. Eligible new subscribers get a free trial; after the trial the yearly price shown in the store is charged, unless you cancel at least 24 hours before the trial ends. The subscription renews every year until you cancel it in your Apple or Google account settings. Refunds follow the rules of the store you bought it in.',
    ],
    [
      'Your use',
      'Use the app for personal, non-commercial purposes. Do not copy, resell or scrape the app or its data, and do not use it in a way that harms the service or other people.',
    ],
    [
      'Liability',
      'The app is provided as is. To the extent the law allows, we are not liable for loss or damage caused by relying on the information in the app, by delayed or missed alerts, or by the app being unavailable. Nothing in these terms limits your rights under the Australian Consumer Law.',
    ],
    [
      'Changes',
      'We may update these terms. The current version is always on this page.',
    ],
  ];
  const body = `<section class="prose"><h1 style="font-size:40px;letter-spacing:-.03em;margin:20px 0 8px">Terms of Use</h1>
<p class="m" style="color:var(--muted)">Last updated 20 October 2026</p>
${parts.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('')}
<h2>App Store</h2><p>For purchases through the App Store, Apple's <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Standard End User License Agreement</a> also applies.</p>
<h2>Contact</h2><p><a href="mailto:${CONTACT}">${CONTACT}</a></p></section>`;
  return page({
    path: '/terms',
    title: 'Terms of Use | Emergencies Near Me',
    description:
      'Terms of Use for the Emergencies Near Me app and subscription.',
    body,
  });
}

function sitemap() {
  const paths = [
    '/',
    '/incidents',
    ...Object.keys(STATES)
      .filter((r) => sources[r])
      .map((r) => `/incidents/${r}`),
    '/support',
    '/sources',
    '/privacy',
    '/terms',
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `<url><loc>${SITE}${p}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg' };

/**
 * A website response for this path, or null when the path is not a page
 * (the API routes then take over).
 */
export function renderSite(pathname, store) {
  const html = (body, cache = 'public, max-age=60') => ({
    status: 200,
    type: 'text/html; charset=utf-8',
    body,
    cache,
  });
  if (pathname === '/') return html(home(store));
  if (pathname === '/incidents') return html(overview(store));
  const m = pathname.match(/^\/incidents\/([a-z]{2,3})$/);
  if (m && STATES[m[1]] && sources[m[1]]) return html(statePage(store, m[1]));
  if (pathname === '/support') return html(support(), 'public, max-age=3600');
  if (pathname === '/sources')
    return html(sourcesPage(), 'public, max-age=3600');
  if (pathname === '/terms') return html(terms(), 'public, max-age=3600');
  if (pathname === '/privacy')
    return html(PRIVACY_HTML, 'public, max-age=3600');
  if (pathname === '/sitemap.xml')
    return {
      status: 200,
      type: 'application/xml',
      body: sitemap(),
      cache: 'public, max-age=3600',
    };
  if (pathname === '/robots.txt')
    return {
      status: 200,
      type: 'text/plain',
      body: `User-agent: *\nDisallow: /v1/\nSitemap: ${SITE}/sitemap.xml\n`,
      cache: 'public, max-age=3600',
    };
  const a = pathname.match(/^\/assets\/([a-z0-9-]+\.(png|jpg))$/);
  if (a) {
    const file = join(ASSETS, a[1]);
    if (!existsSync(file)) return null;
    return {
      status: 200,
      type: TYPES['.' + a[2]],
      body: readFileSync(file),
      cache: 'public, max-age=604800',
    };
  }
  return null;
}
