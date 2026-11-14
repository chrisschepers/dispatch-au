// A HAND-MADE example for the incident of the day, so the richer variant can
// be seen while the live feed has no Watch and Act with aircraft. Not a real
// incident. The rows have the exact field shapes of the live API (a NSW RFS
// row of /v1/feed, the mirrored NSW warning row, /v1/incidents/{id}/aircraft
// items with real fleet records from aircraft-fleet.json, history_events rows),
// but the fire, its area, the flights and all times are made up.
// Renders of it carry FIXTURE in the file name.

export const FIXTURE_NOW = Date.parse('2026-11-14T08:30:00Z'); // 7:30 pm in Sydney

const iso = (s) => new Date(Date.parse(s)).toISOString();
const FIRE = [-32.9195, 151.105]; // [lat, lon]

/** An irregular burnt area of roughly 640 ha around the point, as one closed ring of [lon, lat]. */
function area() {
  const ring = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    const r = 1 + 0.18 * Math.sin(3 * a + 0.6) + 0.1 * Math.cos(5 * a);
    const dx = 2.3 * r * Math.cos(a),
      dy = 1.1 * r * Math.sin(a); // km, long axis roughly NE
    const rot = 0.5;
    const ex = dx * Math.cos(rot) - dy * Math.sin(rot),
      ey = dx * Math.sin(rot) + dy * Math.cos(rot);
    ring.push([
      +(
        FIRE[1] +
        0.012 +
        ex / (111 * Math.cos((FIRE[0] * Math.PI) / 180))
      ).toFixed(6),
      +(FIRE[0] + 0.006 + ey / 111).toFixed(6),
    ]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Samples [unix s, lat, lon, alt ft] along waypoints at a speed, one per `stepMin`. */
function fly(start, waypoints, kmh, stepMin, altFt) {
  const out = [];
  let t = Date.parse(start);
  let [lat, lon] = waypoints[0];
  out.push([Math.round(t / 1000), lat, lon, altFt]);
  const stepKm = (kmh * stepMin) / 60;
  for (const [tlat, tlon] of waypoints.slice(1)) {
    for (;;) {
      const dy = (tlat - lat) * 111,
        dx = (tlon - lon) * 111 * Math.cos((lat * Math.PI) / 180);
      const d = Math.hypot(dx, dy);
      if (d < 0.05) break;
      const f = Math.min(1, stepKm / d);
      lat += (tlat - lat) * f;
      lon += (tlon - lon) * f;
      t += stepMin * 60_000 * (f < 1 ? 1 : d / stepKm);
      out.push([Math.round(t / 1000), +lat.toFixed(5), +lon.toFixed(5), altFt]);
      if (f === 1) break;
    }
  }
  return out;
}

/** Uneven loops of waypoints over and around the fire, about `km` out (deterministic). */
const circuit = (km, turns = 1, phase = 0) =>
  Array.from({ length: 5 * turns + 1 }, (_, i) => {
    const a = phase + (i / 5) * 2 * Math.PI + 0.5 * Math.sin(i * 2.3 + phase);
    const r = km * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + phase * 3)));
    return [
      FIRE[0] + 0.006 + (r * Math.sin(a)) / 111,
      FIRE[1] + 0.012 + (r * Math.cos(a)) / 93,
    ];
  });

function flight(
  fleet,
  {
    flightId,
    start,
    from,
    kmh,
    stepMin,
    altFt,
    loopKm,
    turns,
    phase,
    since,
    lastNear,
  },
) {
  return {
    ...fleet,
    name: fleet.callsign.charAt(0) + fleet.callsign.slice(1).toLowerCase(),
    operator: null,
    large: false,
    flightId,
    since: iso(since),
    lastNear: iso(lastNear),
    working: true,
    airborne: true,
    track: fly(
      start,
      [from, ...circuit(loopKm, turns, phase)],
      kmh,
      stepMin,
      altFt,
    ),
  };
}

export function watchAndActFixture() {
  const id = 'nsw:incident:699001';
  const incident = {
    id,
    sourceId: '699001',
    sourceFeed: 'nsw',
    agency: 'NSW RFS',
    created: null,
    updated: '2026-11-14T08:05:00.000Z',
    resources: null,
    geometry: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [FIRE[1], FIRE[0]] },
        {
          type: 'GeometryCollection',
          geometries: [{ type: 'Polygon', coordinates: [area()] }],
        },
      ],
    },
    point: FIRE,
    kind: 'incident',
    level: 'Watch and Act',
    action: null,
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    title: 'Bush Fire',
    location: 'PAYNES CROSSING RD, WOLLOMBI 2325',
    category: 'fire',
    status: 'Watch and Act · Out of control',
    sizeHa: 640,
    firstSeen: '2026-11-14T01:58:12.410Z',
    lastSeen: '2026-11-14T08:29:41.002Z',
    listed: true,
  };
  // NSW mirrors a Watch and Act as a warning row without a place (regional.mjs).
  const warning = {
    ...incident,
    id: 'nsw:warning:699001',
    kind: 'warning',
    geometry: null,
    point: null,
    action: 'Watch and Act',
  };
  const aircraft = [
    flight(
      {
        hex: '7c4401',
        registration: 'VH-NPV',
        callsign: 'HELITAK 205',
        role: 'helitak',
        rotor: true,
        class: 'RW - Type 2 Medium',
        type: 'B412',
        model: 'BELL HELICOPTER TEXTRON CANADA LIMITED 412EP',
      },
      {
        flightId: 'fx-1',
        start: '2026-11-14T02:16:00Z',
        from: [-32.787, 151.342],
        kmh: 220,
        stepMin: 4,
        altFt: 1500,
        loopKm: 2.2,
        turns: 2,
        phase: 0.4,
        since: '2026-11-14T02:31:00Z',
        lastNear: '2026-11-14T03:20:00Z',
      },
    ),
    flight(
      {
        hex: '7c42ff',
        registration: 'VH-NIP',
        callsign: 'BOMBER 230',
        role: 'bomber',
        rotor: false,
        class: 'FW - Type 4 SEAT',
        type: 'AT8T',
        model: 'AIR TRACTOR INC AT-802A',
      },
      {
        flightId: 'fx-2',
        start: '2026-11-14T02:40:00Z',
        from: [-33.18, 150.86],
        kmh: 300,
        stepMin: 4,
        altFt: 2500,
        loopKm: 3.2,
        turns: 1,
        phase: 3.6,
        since: '2026-11-14T03:12:00Z',
        lastNear: '2026-11-14T03:40:00Z',
      },
    ),
    flight(
      {
        hex: '7c4201',
        registration: 'VH-NBN',
        callsign: 'HELITAK 212',
        role: 'helitak',
        rotor: true,
        class: 'RW - Type 2 Medium',
        type: 'B212',
        model: 'BELL HELICOPTER CO 212',
      },
      {
        flightId: 'fx-3',
        start: '2026-11-14T03:35:00Z',
        from: [-32.69, 150.97],
        kmh: 200,
        stepMin: 4,
        altFt: 1200,
        loopKm: 1.6,
        turns: 2,
        phase: 2.2,
        since: '2026-11-14T04:05:00Z',
        lastNear: '2026-11-14T05:10:00Z',
      },
    ),
  ];
  // history_events rows of history.mjs: the first sighting and every change of status or level.
  const events = [
    {
      id,
      at: '2026-11-14T01:58:12.410Z',
      status: 'Advice · Not yet controlled',
      level: 'Advice',
      resources: null,
      listed: 1,
    },
    {
      id,
      at: '2026-11-14T03:26:40.118Z',
      status: 'Watch and Act · Out of control',
      level: 'Watch and Act',
      resources: null,
      listed: 1,
    },
  ];
  // A few other rows, so the selection has something to beat.
  const others = [
    {
      ...incident,
      id: 'nsw:incident:699002',
      sourceId: '699002',
      title: 'Grass Fire',
      location: 'GOLDEN HWY, DENMAN 2328',
      level: 'Advice',
      status: 'Advice · Under control',
      sizeHa: 2100,
      point: [-32.39, 150.69],
      geometry: { type: 'Point', coordinates: [150.69, -32.39] },
    },
    {
      ...incident,
      id: 'nsw:incident:699003',
      sourceId: '699003',
      title: 'Hazard Reduction',
      location: 'BROKEN BACK RANGE, POKOLBIN 2320',
      category: 'planned',
      level: null,
      status: 'Being controlled',
      sizeHa: 4800,
      point: [-32.79, 151.25],
      geometry: { type: 'Point', coordinates: [151.25, -32.79] },
    },
  ];
  return {
    now: FIXTURE_NOW,
    feed: {
      incidents: [incident, ...others],
      warnings: [warning],
      fetchedAt: '2026-11-14T08:29:41.002Z',
    },
    aircraft: { [id]: aircraft },
    events: { [id]: events },
  };
}
