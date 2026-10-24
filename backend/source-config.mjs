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
    attribution: 'Data © State of Victoria. Source: VicEmergency.',
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
