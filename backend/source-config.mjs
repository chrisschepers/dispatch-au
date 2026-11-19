export const sources = {
  sa: {
    name: 'SA Country Fire Service',
    interval: 300000,
    staleAfter: 900000,
    url: 'https://data.eso.sa.gov.au/feeds/prod/cap-au.xml',
    adviceUrl: 'https://www.cfs.sa.gov.au/incidents/',
    attribution:
      'The Government of South Australia, CFS Current Incidents, https://www.cfs.sa.gov.au/warnings-restrictions/warnings/rss-feeds/. CC BY 4.0.',
    licenseUrl: 'https://www.cfs.sa.gov.au/home/copyright/',
    coverageNote:
      'CFS public CAP-AU incidents and warnings, not CFSScan or all SA emergency calls. Map pins use only published point locations; warning polygons remain areas. See CFS for official advice.',
  },
  nsw: {
    name: 'NSW Rural Fire Service',
    interval: 120000,
    staleAfter: 2400000,
    url: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json',
    adviceUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    attribution:
      '© State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au.',
    licenseUrl:
      'https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds',
    coverageNote:
      'RFS incidents; not all NSW emergency calls. Source updates about every 30 minutes. Unknown call times use the source update (Updated), or first observation (Seen). Alert levels appear with incident status; see RFS for warning areas.',
  },
  qld: {
    name: 'Queensland Fire Department',
    interval: 120000,
    staleAfter: 2400000,
    url: 'https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json',
    adviceUrl: 'https://www.fire.qld.gov.au/Current-Incidents',
    attribution:
      '© State of Queensland (Queensland Fire Department), CC BY 4.0. Adapted for display.',
    licenseUrl:
      'https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents',
    coverageNote:
      'Vegetation fires, permitted burns and published QFD warnings; not all Queensland emergency calls. Source updates about every 30 minutes. Unknown call times use the source update (Updated), or first observation (Seen).',
  },
  vic: {
    name: 'VicEmergency',
    interval: 60000,
    staleAfter: 300000,
    url: 'https://emergency.vic.gov.au/public/events-geojson.json',
    adviceUrl: 'https://emergency.vic.gov.au/respond/',
    // EMV: name the State of Victoria, Australia, link to the notice
    // (licenseUrl) and show when the data was last updated.
    attribution:
      'Data © State of Victoria, Australia. Source: VicEmergency. Licensed under CC BY 3.0 AU.',
    licenseUrl:
      'https://www.emv.vic.gov.au/responsibilities/victorias-warning-system/emergency-data',
  },
  act: {
    name: 'ACT Emergency Services Agency',
    interval: 60000,
    staleAfter: 300000,
    url: 'https://esa.act.gov.au/feeds/currentincidents.xml',
    adviceUrl: 'https://esa.act.gov.au/',
    attribution:
      'Data © ACT Emergency Services Agency, licensed under CC BY 4.0. Adapted for display.',
    licenseUrl:
      'https://data.esa.act.gov.au/be-emergency-ready/warnings-alerts',
    coverageNote: 'ACT incident feed only. See ESA for official warnings.',
  },
};

const on = (value) =>
  ['aan', 'on', 'true', '1'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );

// Extra sources (19-11-2026). Each one is OFF until its switch is set in the
// environment: without it the source is never requested and never shows up
// as failed. `region` is the state its rows belong to; a row id starts with
// that state ("nsw:incident:livetraffic-1"), so the app files it there.
// A source whose `region` is its own key (wa) is a whole new state.
// `traffic` sources only keep crashes, and a crash a fire service already
// lists is left out (IncidentStore.withoutDuplicates).
export const optionalSources = {
  'nsw-traffic': {
    region: 'nsw',
    name: 'Live Traffic NSW',
    switch: 'LIVETRAFFIC_API_KEY',
    enabled: (env) => !!env.LIVETRAFFIC_API_KEY,
    traffic: true,
    interval: 120000,
    staleAfter: 900000,
    // The official API of Transport for NSW; the key comes with a free
    // account on opendata.transport.nsw.gov.au.
    url: 'https://api.transport.nsw.gov.au/v1/live/hazards/incident/open',
    headers: (env) => ({ Authorization: `apikey ${env.LIVETRAFFIC_API_KEY}` }),
    adviceUrl: 'https://www.livetraffic.com/',
    // Hub terms 6(d): name Transport for NSW, suggest no official status.
    attribution:
      'Crashes: © State of New South Wales (Transport for NSW), CC BY 4.0. Adapted; not endorsed by Transport for NSW.',
    licenseUrl: 'https://opendata.transport.nsw.gov.au/datalicence',
    coverageNote: 'Crashes on NSW roads come from Live Traffic NSW.',
  },
  'qld-warnings': {
    region: 'qld',
    name: 'Queensland storm, flood and cyclone warnings',
    switch: 'QLD_WARNINGS',
    enabled: (env) => on(env.QLD_WARNINGS),
    accept: 'application/xml',
    interval: 300000,
    staleAfter: 2400000,
    url: 'https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/StormFloodCycloneWarnings/StormWarnings_capau.xml',
    adviceUrl: 'https://www.disaster.qld.gov.au/',
    attribution:
      'Storm, flood and cyclone warnings: © State of Queensland (Queensland Fire Department), CC BY 4.0. Adapted.',
    // The record on data.qld.gov.au itself was not public on 19-11-2026;
    // this is the national catalogue's copy of it (CC BY 4.0).
    licenseUrl:
      'https://data.gov.au/data/dataset/storm-flood-and-cyclone-warnings-capau-xml',
    coverageNote:
      'Storm, flood and cyclone warnings are the Australian Warning System warnings Queensland publishes.',
  },
  'qld-traffic': {
    region: 'qld',
    name: 'QLDTraffic',
    switch: 'QLDTRAFFIC_API_KEY',
    enabled: (env) => !!env.QLDTRAFFIC_API_KEY,
    traffic: true,
    interval: 120000,
    staleAfter: 900000,
    url: (env) =>
      'https://api.qldtraffic.qld.gov.au/v2/events?apikey=' +
      encodeURIComponent(env.QLDTRAFFIC_API_KEY),
    adviceUrl: 'https://qldtraffic.qld.gov.au/',
    attribution:
      'Crashes: © State of Queensland (Department of Transport and Main Roads), CC BY 4.0. Adapted.',
    licenseUrl:
      'https://www.data.qld.gov.au/dataset/131940-traffic-and-travel-information-geojson-api',
    coverageNote: 'Crashes on Queensland roads come from QLDTraffic.',
  },
  'vic-traffic': {
    region: 'vic',
    name: 'Victorian road disruptions',
    switch: 'VIC_ROADS_API_KEY',
    enabled: (env) => !!env.VIC_ROADS_API_KEY,
    traffic: true,
    // The API allows 20 calls a minute and refreshes every 60 seconds.
    interval: 120000,
    staleAfter: 900000,
    url: 'https://api.opendata.transport.vic.gov.au/api/opendata/roads/disruptions/unplanned/v3?page=1&limit=1000',
    headers: (env) => ({ KeyId: env.VIC_ROADS_API_KEY }),
    adviceUrl: 'https://traffic.transport.vic.gov.au/',
    attribution:
      'Crashes: © State of Victoria (Department of Transport and Planning), CC BY 4.0. Adapted.',
    licenseUrl:
      'https://discover.data.vic.gov.au/dataset/unplanned-disruptions-road',
    coverageNote:
      'Crashes on Victorian roads come from the Department of Transport and Planning.',
  },
  wa: {
    region: 'wa',
    name: 'Emergency WA',
    switch: 'WA_ENABLED',
    enabled: (env) => on(env.WA_ENABLED),
    interval: 120000,
    staleAfter: 900000,
    url: 'https://api.emergency.wa.gov.au/v1/incidents',
    adviceUrl: 'https://www.emergency.wa.gov.au/',
    // The credit statement DFES asks for (catalogue.data.wa.gov.au, DFES-066).
    attribution:
      'Supplied by EmergencyWA. © Government of Western Australia (Department of Fire and Emergency Services). For current information go to www.emergency.wa.gov.au. CC BY 4.0.',
    licenseUrl:
      'https://catalogue.data.wa.gov.au/dataset/dfes-emergencywa-incident-points-dfes-066',
    coverageNote:
      'Incidents DFES publishes on Emergency WA; not all WA emergency calls. See Emergency WA for official warnings.',
  },
  // The warning areas are CC BY-ND 4.0: shown as published, never reworded.
  'wa-warnings': {
    region: 'wa',
    name: 'Emergency WA warnings',
    switch: 'WA_WARNINGS',
    enabled: (env) => on(env.WA_ENABLED) && on(env.WA_WARNINGS),
    interval: 120000,
    staleAfter: 900000,
    url: 'https://api.emergency.wa.gov.au/v1/warnings',
    adviceUrl: 'https://www.emergency.wa.gov.au/',
    attribution: 'Warnings: EmergencyWA (DFES), CC BY-ND 4.0, shown unaltered.',
    licenseUrl:
      'https://catalogue.data.wa.gov.au/dataset/dfes-emergencywa-warning-areas-dfes-068',
    coverageNote: null,
  },
};

export const allSources = { ...sources, ...optionalSources };

/** The state a source's rows belong to: its own key for the five originals. */
export const regionOf = (key) => allSources[key]?.region ?? key;

/** Keys of the optional sources switched on in this environment. */
export function enabledOptional(env = process.env) {
  return Object.keys(optionalSources).filter((key) =>
    optionalSources[key].enabled(env),
  );
}

/** Everything the collector fetches: the five originals plus what is on. */
export function activeSources(env = process.env) {
  return [...Object.keys(sources), ...enabledOptional(env)];
}

/**
 * States beyond the original five that are switched on (wa). Apps up to
 * 1.2.0 reject a whole feed with a state they do not know, so these only
 * travel in the national feed when the request asks: `&extra=wa`.
 */
export function extraRegions(env = process.env) {
  return enabledOptional(env).filter(
    (key) => optionalSources[key].region === key,
  );
}
