// Live map on emergenciesnearme.online (site-map.mjs). MapLibre with
// OpenFreeMap tiles; incidents from /v1/map, refreshed every minute while the
// page is visible. Active incidents are filled circles in the service colour,
// ended ones (Last 24 hours) are rings, like in the app.
(function () {
  'use strict';
  const el = document.getElementById('map');
  const status = document.getElementById('map-status');
  if (!el || !window.maplibregl) {
    if (status)
      status.textContent =
        'The map could not load. The lists below show what is happening.';
    return;
  }
  const dark =
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const b = el.dataset.bounds.split(',').map(Number);
  const map = new maplibregl.Map({
    container: el,
    style:
      'https://tiles.openfreemap.org/styles/' + (dark ? 'dark' : 'positron'),
    bounds: [
      [b[0], b[1]],
      [b[2], b[3]],
    ],
    fitBoundsOptions: { padding: 16 },
    attributionControl: { compact: true },
    cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
  });
  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    'top-right',
  );
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: false },
    }),
    'top-right',
  );

  let hours = 0;
  const hidden = {};
  let rows = [];
  let colours = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c];
    });
  }
  function ago(iso) {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(min)) return '';
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    if (min < 48 * 60) return Math.floor(min / 60) + ' h ago';
    return Math.floor(min / 1440) + ' days ago';
  }
  function geojson() {
    return {
      type: 'FeatureCollection',
      features: rows
        .filter(function (r) {
          if (hidden[r[4]] || (r[4] === 'planned' && hidden.fire)) return false;
          return hours > 0 || r[10] === 1;
        })
        .map(function (r) {
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r[3], r[2]] },
            properties: {
              region: r[1],
              cat: r[4],
              title: r[5],
              place: r[6],
              slug: r[7],
              status: r[8],
              level: r[9],
              listed: r[10],
              t: r[11],
              article: r[12],
              colour: (colours[r[4]] || {}).colour || '#8e8e93',
            },
          };
        }),
    };
  }
  function refreshSource() {
    const src = map.getSource('incidents');
    if (src) src.setData(geojson());
    const shown = geojson().features.length;
    status.textContent =
      shown +
      (hours ? ' incidents in the last 24 hours' : ' active incidents') +
      ' on the map. Updated ' +
      new Date().toLocaleTimeString('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
      }) +
      '.';
  }
  function load() {
    fetch('/v1/map?hours=24', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : Promise.reject(r.status);
      })
      .then(function (d) {
        rows = d.incidents || [];
        colours = d.categories || {};
        refreshSource();
      })
      .catch(function () {
        status.textContent =
          'Could not load incidents. Trying again in a minute.';
      });
  }

  map.on('load', function () {
    map.addSource('incidents', {
      type: 'geojson',
      data: geojson(),
      cluster: true,
      clusterRadius: 38,
      clusterMaxZoom: 10,
    });
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'incidents',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': dark ? '#d1d1d6' : '#3a3a3c',
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'incidents',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 13,
      },
      paint: { 'text-color': dark ? '#1c1c1e' : '#ffffff' },
    });
    map.addLayer({
      id: 'points',
      type: 'circle',
      source: 'incidents',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'case',
          ['>=', ['length', ['get', 'level']], 1],
          9,
          7,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'listed'], 1],
          ['get', 'colour'],
          dark ? '#1c1c1e' : '#ffffff',
        ],
        'circle-stroke-width': ['case', ['==', ['get', 'listed'], 1], 2, 2.5],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'listed'], 1],
          '#ffffff',
          ['get', 'colour'],
        ],
      },
    });
    map.on('click', 'clusters', function (e) {
      const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      map
        .getSource('incidents')
        .getClusterExpansionZoom(f.properties.cluster_id)
        .then(function (z) {
          map.easeTo({ center: f.geometry.coordinates, zoom: z });
        });
    });
    map.on('click', 'points', function (e) {
      const p = e.features[0].properties;
      const html =
        '<b>' +
        esc(p.title) +
        '</b>' +
        (p.level
          ? ' <span class="lvl ' +
            (/emergency/i.test(p.level)
              ? 'e'
              : /watch/i.test(p.level)
                ? 'w'
                : 'a') +
            '">' +
            esc(p.level) +
            '</span>'
          : '') +
        '<br>' +
        (p.slug
          ? '<a href="/incidents/' +
            esc(p.region) +
            '/' +
            esc(p.slug) +
            '">' +
            esc(p.place) +
            '</a>'
          : esc(p.place)) +
        ' · ' +
        esc(p.status) +
        '<br><span style="color:#8e8e93">' +
        esc(ago(p.t)) +
        '</span>' +
        (p.article
          ? '<br><a href="' + esc(p.article) + '">Read the report →</a>'
          : '');
      new maplibregl.Popup({ maxWidth: '260px' })
        .setLngLat(e.features[0].geometry.coordinates)
        .setHTML(html)
        .addTo(map);
    });
    ['clusters', 'points'].forEach(function (l) {
      map.on('mouseenter', l, function () {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', l, function () {
        map.getCanvas().style.cursor = '';
      });
    });
    load();
    setInterval(function () {
      if (!document.hidden) load();
    }, 60000);
  });

  const filters = document.getElementById('map-filters');
  if (filters)
    filters.addEventListener('click', function (e) {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.hours != null) {
        hours = Number(a.dataset.hours);
        filters.querySelectorAll('[data-hours]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === a));
        });
      } else if (a.dataset.cat) {
        hidden[a.dataset.cat] = !hidden[a.dataset.cat];
        a.setAttribute('aria-pressed', String(!hidden[a.dataset.cat]));
      }
      refreshSource();
    });
})();
