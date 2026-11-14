// The owner dashboard page (GET /dashboard). One self-contained document: no
// external script, font or image, and no data. The numbers come from
// /v1/stats, which is open (counts only).
//
// The Content-Security-Policy names the hash of the one style block and the
// one script below, so nothing else can run here, inline or not. The script
// therefore builds everything with DOM calls: no style attributes, no HTML
// from strings.
import crypto from 'node:crypto';

const STYLE = `
:root{color-scheme:light;--page:#f4f3f0;--surface:#fcfcfb;--line:#e3e2dd;--text:#0b0b0b;--text2:#52514e;--muted:#7a7972;
--series:#2a78d6;--series-soft:#cde2fb;--good:#0ca30c;--warning:#fab219;--critical:#d03b3b}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--page:#111110;--surface:#1a1a19;--line:#2e2e2b;--text:#f0efec;--text2:#c3c2b7;--muted:#8f8e86;
--series:#3987e5;--series-soft:#184f95}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:1040px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;margin-bottom:16px}
h1{font-size:20px;margin:0;font-weight:650}
h2{font-size:13px;margin:0 0 10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em}
.meta{color:var(--muted);font-size:13px;margin-right:auto}
button{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
button:focus-visible,input:focus-visible{outline:2px solid var(--series);outline-offset:2px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}
.tile .n{font-size:32px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums}
.tile .l{color:var(--text2);font-size:13px;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}
.wide{margin-top:12px}
.note{color:var(--text2);font-size:13px;margin:10px 0 0;max-width:75ch}
.rows{display:grid;grid-template-columns:auto 1fr auto;gap:8px 12px;align-items:center;font-size:14px}
.rows .v{font-variant-numeric:tabular-nums;text-align:right}
.rows .k{color:var(--text2)}
.rows svg{display:block;width:100%;height:10px}
.bar{fill:var(--series)}
.track{fill:var(--line)}
.pairs{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:14px}
.pairs .k{color:var(--text2)}
.pairs .v{font-variant-numeric:tabular-nums;text-align:right}
.chart{position:relative}
.chart svg{display:block;width:100%;overflow:visible}
.chart text{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.chart .title{fill:var(--text2);font-size:12px}
.chart .gridline{stroke:var(--line);stroke-width:1}
.chart .line{fill:none;stroke:var(--series);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart .cross{stroke:var(--muted);stroke-width:1;visibility:hidden}
.chart .dot{fill:var(--series);stroke:var(--surface);stroke-width:2;visibility:hidden}
.chart .hit{fill:transparent}
.chart .on{visibility:visible}
.chart .hot{fill:var(--text)}
.tip{position:absolute;top:0;left:0;pointer-events:none;background:var(--text);color:var(--surface);border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.35;white-space:nowrap;visibility:hidden;font-variant-numeric:tabular-nums}
.tip.on{visibility:visible}
details{margin-top:10px;font-size:13px}
summary{cursor:pointer;color:var(--text2)}
table{border-collapse:collapse;margin-top:8px;font-variant-numeric:tabular-nums}
th,td{text-align:right;padding:3px 12px 3px 0;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left}
th{font-weight:600;color:var(--text2)}
.scroll{max-height:260px;overflow:auto}
.src{display:grid;grid-template-columns:auto auto 1fr;gap:6px 14px;align-items:center;font-size:14px}
.src .when{color:var(--text2);text-align:right;font-size:13px}
.state{display:inline-flex;align-items:center;gap:6px}
.state i{width:10px;height:10px;border-radius:50%;background:var(--muted);flex:none}
.state.good i{background:var(--good)}
.state.warning i{background:var(--warning)}
.state.critical i{background:var(--critical)}
.empty{border-style:dashed;color:var(--text2)}
form{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
input{font:inherit;flex:1 1 220px;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--page);color:var(--text)}
.msg{color:var(--critical);font-size:13px;min-height:1.4em;margin:8px 0 0}
[hidden]{display:none!important}
@media (max-width:720px){.tiles{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.tile .n{font-size:26px}}
`;

const SCRIPT = `
(function () {
  'use strict';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function (id) { return document.getElementById(id); };
  // The SVG namespace, read from the empty element in the page.
  var SVG = $('ns').namespaceURI;
  var last = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function num(n) { return n == null ? '\\u2013' : Number(n).toLocaleString('en-AU'); }
  function dayLabel(day) {
    var p = day.split('-');
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
  }
  function ago(isoTime, now) {
    if (!isoTime) return 'never';
    var s = Math.max(0, Math.round((now - Date.parse(isoTime)) / 1000));
    if (s < 90) return s + ' s ago';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 172800) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 4, 5, 10];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i] * p) return steps[i] * p;
    return 10 * p;
  }

  function show(ok, message) {
    $('board').hidden = !ok;
    $('msg').hidden = ok;
    $('msg').textContent = message || '';
  }

  function barRows(target, items, total) {
    clear(target);
    var max = 1;
    items.forEach(function (it) { if (it.n > max) max = it.n; });
    items.forEach(function (it) {
      target.appendChild(el('span', 'k', it.label));
      var s = svg('svg', { viewBox: '0 0 100 10', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      s.appendChild(svg('rect', { class: 'track', x: 0, y: 3, width: 100, height: 4, rx: 2 }));
      if (it.n > 0) s.appendChild(svg('rect', { class: 'bar', x: 0, y: 1, width: Math.max(1, it.n / max * 100), height: 8, rx: 2 }));
      target.appendChild(s);
      var share = total ? ' \\u00b7 ' + Math.round(it.n / total * 100) + '%' : '';
      target.appendChild(el('span', 'v', num(it.n) + share));
    });
  }
  function pairs(target, items) {
    clear(target);
    items.forEach(function (it) {
      target.appendChild(el('span', 'k', it[0]));
      target.appendChild(el('span', 'v', num(it[1])));
    });
  }

  // Two panels on one time axis, each with its own scale: new devices per day
  // as bars, the running total as a line below.
  function chart(daily) {
    var box = $('chart');
    var tip = $('tip');
    var old = box.querySelector('svg');
    if (old) box.removeChild(old);
    var W = Math.max(280, box.clientWidth);
    var L = 44, R = 8, T1 = 22, H1 = 130, GAP = 34, H2 = 90, B = 22;
    var T2 = T1 + H1 + GAP;
    var H = T2 + H2 + B;
    var n = daily.length;
    var step = (W - L - R) / n;
    var bw = Math.max(1, Math.min(14, step - 2));
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img', 'aria-label': 'New devices per day and total registered devices, last ' + n + ' days. The same numbers are in the table below.' });
    var maxNew = niceMax(Math.max.apply(null, daily.map(function (d) { return d.new; })));
    var totals = daily.map(function (d) { return d.total; });
    var lo = Math.min.apply(null, totals), hi = Math.max.apply(null, totals);
    var pad = Math.max(1, Math.round((hi - lo) * 0.1));
    lo = Math.max(0, lo - pad); hi = hi + pad;
    var x = function (i) { return L + step * i + step / 2; };
    var y1 = function (v) { return T1 + H1 - v / maxNew * H1; };
    var y2 = function (v) { return T2 + H2 - (v - lo) / (hi - lo) * H2; };

    s.appendChild(svg('text', { class: 'title', x: L, y: 12 }, 'New devices per day'));
    s.appendChild(svg('text', { class: 'title', x: L, y: T2 - 10 }, 'Total registered'));
    [[y1(0), 0], [y1(maxNew / 2), maxNew / 2], [y1(maxNew), maxNew], [y2(lo), lo], [y2(hi), hi]].forEach(function (t) {
      s.appendChild(svg('line', { class: 'gridline', x1: L, x2: W - R, y1: t[0], y2: t[0] }));
      s.appendChild(svg('text', { x: L - 6, y: t[0] + 4, 'text-anchor': 'end' }, num(Math.round(t[1]))));
    });
    var bars = daily.map(function (d, i) {
      var h = d.new / maxNew * H1;
      var r = svg('rect', { class: 'bar', x: x(i) - bw / 2, y: T1 + H1 - h, width: bw, height: h, rx: Math.min(4, bw / 2, h) });
      s.appendChild(r);
      return r;
    });
    s.appendChild(svg('polyline', { class: 'line', points: daily.map(function (d, i) { return x(i) + ',' + y2(d.total); }).join(' ') }));
    var every = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 70)));
    daily.forEach(function (d, i) {
      if ((n - 1 - i) % every === 0)
        s.appendChild(svg('text', { x: x(i), y: H - 6, 'text-anchor': i === n - 1 ? 'end' : 'middle' }, dayLabel(d.day)));
    });
    var cross = svg('line', { class: 'cross', y1: T1, y2: T2 + H2 });
    var dot = svg('circle', { class: 'dot', r: 5 });
    s.appendChild(cross); s.appendChild(dot);
    var hit = svg('rect', { class: 'hit', x: L, y: T1, width: W - L - R, height: T2 + H2 - T1 });
    s.appendChild(hit);
    var current = -1;
    function hover(clientX) {
      var rect = s.getBoundingClientRect();
      var i = Math.min(n - 1, Math.max(0, Math.floor((clientX - rect.left - L) / step)));
      if (current >= 0) bars[current].classList.remove('hot');
      current = i;
      var d = daily[i];
      bars[i].classList.add('hot');
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y2(d.total));
      cross.classList.add('on'); dot.classList.add('on');
      clear(tip);
      tip.appendChild(el('b', null, dayLabel(d.day)));
      [['New', d.new], ['Total', d.total], ['Active 24 h', d.active24h], ['Alerts sent', d.pushes]].forEach(function (r) {
        if (r[1] == null) return;
        tip.appendChild(el('br'));
        tip.appendChild(document.createTextNode(r[0] + ': ' + num(r[1])));
      });
      tip.classList.add('on');
      var left = x(i) + 12;
      if (left + tip.offsetWidth > W) left = x(i) - 12 - tip.offsetWidth;
      tip.style.transform = 'translate(' + Math.max(0, left) + 'px,' + T1 + 'px)';
    }
    function leave() {
      if (current >= 0) bars[current].classList.remove('hot');
      current = -1;
      cross.classList.remove('on'); dot.classList.remove('on'); tip.classList.remove('on');
    }
    hit.addEventListener('pointermove', function (e) { hover(e.clientX); });
    hit.addEventListener('pointerdown', function (e) { hover(e.clientX); });
    hit.addEventListener('pointerleave', leave);
    box.insertBefore(s, tip);
  }

  function table(daily) {
    var body = $('rows');
    clear(body);
    daily.slice().reverse().forEach(function (d) {
      var tr = el('tr');
      [d.day, num(d.new), num(d.total), num(d.active24h), num(d.pushes)].forEach(function (v) { tr.appendChild(el('td', null, v)); });
      body.appendChild(tr);
    });
  }

  var STATES = {
    healthy: ['good', 'Healthy'],
    delayed: ['warning', 'Delayed'],
    unavailable: ['critical', 'Unavailable']
  };
  function sources(list, now) {
    var box = $('sources');
    clear(box);
    list.forEach(function (src) {
      var st = src.alert ? ['critical', src.state === 'unavailable' ? 'Unavailable' : 'Outage'] : (STATES[src.state] || ['', String(src.state)]);
      box.appendChild(el('b', null, String(src.region).toUpperCase()));
      var state = el('span', 'state ' + st[0]);
      state.appendChild(el('i'));
      state.appendChild(document.createTextNode(st[1] + (src.consecutiveFailures ? ' \\u00b7 ' + src.consecutiveFailures + ' failed' : '')));
      box.appendChild(state);
      var when = el('span', 'when', 'fetched ' + ago(src.fetchedAt, now));
      if (src.error) when.title = String(src.error);
      box.appendChild(when);
    });
    if (!list.length) box.appendChild(el('span', 'k', 'No source information.'));
  }

  function render(d) {
    last = d;
    var dev = d.devices;
    var now = Date.parse(d.generatedAt);
    $('t-total').textContent = num(dev.total);
    $('t-today').textContent = num(dev.new.today);
    $('t-new7').textContent = num(dev.new.last7d);
    $('t-active7').textContent = num(dev.active.last7d);
    chart(d.series.daily);
    table(d.series.daily);
    $('since').textContent = d.series.snapshotsSince
      ? 'Daily snapshots since ' + dayLabel(d.series.snapshotsSince) + '; earlier days are counted from devices still registered.'
      : 'No daily snapshot yet; days are counted from devices still registered.';
    barRows($('platforms'), [
      { label: 'iOS', n: dev.platforms.ios },
      { label: 'Android', n: dev.platforms.android },
      { label: 'Unknown', n: dev.platforms.unknown }
    ], dev.total);
    barRows($('versions'), dev.versions.map(function (v) { return { label: v.version, n: v.devices }; }), dev.total);
    pairs($('devices'), [
      ['New, 30 days', dev.new.last30d],
      ['Active, 24 h', dev.active.last24h],
      ['Active, 30 days', dev.active.last30d],
      ['With push token', dev.withPushToken],
      ['Alerts switched on', dev.notificationsEnabled],
      ['Location set', dev.withLocation]
    ]);
    pairs($('pushes'), [
      ['Sent today', d.pushes.today],
      ['Sent, 7 days', d.pushes.last7d],
      ['Incidents, 7 days', d.pushes.byRank7d.incident],
      ['Advice, 7 days', d.pushes.byRank7d.advice],
      ['Watch and Act, 7 days', d.pushes.byRank7d.watchAndAct],
      ['Emergency Warning, 7 days', d.pushes.byRank7d.emergencyWarning]
    ]);
    sources(d.sources, now);
    $('updated').textContent = 'Updated ' + new Date(now).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' \\u00b7 days in ' + d.timeZone + ' time';
  }

  var busy = false;
  function load() {
    if (busy) return;
    busy = true;
    fetch('/v1/stats', { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) { show(false, 'The dashboard is switched off on the server.'); return null; }
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (d) { if (d) { show(true); render(d); } })
      .catch(function () { $('updated').textContent = 'Could not refresh; trying again in a minute.'; if (!last) show(false, 'Could not reach the server.'); })
      .then(function () { busy = false; });
  }

  var resize = null;
  window.addEventListener('resize', function () {
    clearTimeout(resize);
    resize = setTimeout(function () { if (last && !$('board').hidden) chart(last.series.daily); }, 150);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  setInterval(function () { if (!document.hidden) load(); }, 60000);
  load();
})();
`;

const BODY = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Owner dashboard</title>
<style>${STYLE}</style>
</head>
<body>
<svg id="ns" width="0" height="0" aria-hidden="true"></svg>
<main>
<header>
<h1>Emergencies Near Me</h1>
<span class="meta" id="updated">Owner dashboard</span>
</header>

<p class="card msg" id="msg" role="alert" hidden></p>

<div id="board" hidden>
<section class="tiles" aria-label="Installs">
<div class="card tile"><div class="n" id="t-total">–</div><div class="l">Registered devices</div></div>
<div class="card tile"><div class="n" id="t-today">–</div><div class="l">New today</div></div>
<div class="card tile"><div class="n" id="t-new7">–</div><div class="l">New, 7 days</div></div>
<div class="card tile"><div class="n" id="t-active7">–</div><div class="l">Active, 7 days</div></div>
</section>

<section class="card">
<h2>Installs, last 60 days</h2>
<div class="chart" id="chart"><div class="tip" id="tip"></div></div>
<details>
<summary>Table</summary>
<div class="scroll"><table>
<thead><tr><th>Day</th><th>New</th><th>Total</th><th>Active 24 h</th><th>Alerts sent</th></tr></thead>
<tbody id="rows"></tbody>
</table></div>
</details>
<p class="note" id="since"></p>
<p class="note"><b>What "registered" means.</b> The app registers its device at every start until that has succeeded once, before the intro and whatever the answer to the notification question is. So this counts installs that were opened at least once with a connection, not only installs with alerts on. A simulator does not register. Removing the app does not take a device off the list, and installing it again counts as a new device. It is not the store's download figure.</p>
<p class="note"><b>Active</b> is the last time a device sent its settings: at every start after the intro and when a setting changes. Opening the app from the background does not count.</p>
</section>

<div class="grid">
<section class="card"><h2>Platform</h2><div class="rows" id="platforms"></div></section>
<section class="card"><h2>App version</h2><div class="rows" id="versions"></div>
<p class="note">The version a device had when it registered or last switched alerts on; an update alone does not change it. Versions on fewer than 3 devices are under "other".</p></section>
<section class="card"><h2>Devices</h2><div class="pairs" id="devices"></div></section>
<section class="card"><h2>Alerts sent</h2><div class="pairs" id="pushes"></div>
<p class="note">Incident alerts per device, by warning level. Large air tanker alerts are not in these numbers. Kept for 7 days.</p></section>
</div>

<section class="card wide"><h2>Sources</h2><div class="src" id="sources"></div></section>

<section class="card wide empty"><h2>Stores</h2>
<p class="note">Not connected yet. App Store, Google Play and RevenueCat figures (downloads, subscriptions, revenue) will appear here.</p></section>
</div>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;

const hash = (text) =>
  `'sha256-${crypto.createHash('sha256').update(text).digest('base64')}'`;

export const DASHBOARD_HTML = BODY;

/** Only this page's own style and script, and requests to this server. */
export const DASHBOARD_CSP = [
  "default-src 'none'",
  `script-src ${hash(SCRIPT)}`,
  `style-src ${hash(STYLE)}`,
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
