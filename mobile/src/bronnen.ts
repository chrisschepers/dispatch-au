/**
 * De officiële bronnen van de app, op één plek. Instellingen toont ze als
 * lijst met link, het meldingscherm noemt per incident de bron en het domein.
 *
 * Google Play keurde de app op 26-10-2026 af onder "Misleading Claims":
 * "Missing Source Link for Government Information". Wie overheidsinformatie
 * toont, moet de oorspronkelijke bron noemen met een werkende link naar het
 * overheidsdomein, en duidelijk maken dat de app geen overheid is. De
 * licenties (CC BY) vragen daarnaast een naamsvermelding. Die teksten staan
 * letterlijk zo in backend/source-config.mjs.
 */
import { regions, type Region } from './feed-model.ts';

export type BronRegio = Exclude<Region, 'au'>;

export interface Bron {
  regio: BronRegio;
  /** Wie de gegevens publiceert, bijvoorbeeld "VicEmergency". */
  naam: string;
  staat: string;
  /** De officiële pagina met de incidenten en waarschuwingen. */
  url: string;
  /** Wat we in beeld zetten, bijvoorbeeld "emergency.vic.gov.au". */
  domein: string;
  /** Naamsvermelding zoals de licentie van de bron die vraagt. */
  vermelding: string;
  licentieUrl: string;
}

const STAAT: Record<BronRegio, string> = {
  vic: 'Victoria',
  nsw: 'New South Wales',
  qld: 'Queensland',
  sa: 'South Australia',
  act: 'Australian Capital Territory',
};

const VERMELDING: Record<BronRegio, string> = {
  vic: 'Data © State of Victoria, Australia. Source: VicEmergency. Licensed under CC BY 3.0 AU.',
  nsw: '© State of New South Wales (NSW Rural Fire Service). For current information go to www.rfs.nsw.gov.au.',
  qld: '© State of Queensland (Queensland Fire Department), CC BY 4.0. Adapted for display.',
  sa: 'The Government of South Australia, CFS Current Incidents, https://www.cfs.sa.gov.au/warnings-restrictions/warnings/rss-feeds/. CC BY 4.0.',
  act: 'Data © ACT Emergency Services Agency, licensed under CC BY 4.0. Adapted for display.',
};

// De licentie- of bronvermeldingspagina per bron. Victoria eist een link
// naar die pagina bij elke herpublicatie.
const LICENTIE: Record<BronRegio, string> = {
  vic: 'https://www.emv.vic.gov.au/responsibilities/victorias-warning-system/emergency-data',
  nsw: 'https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds',
  qld: 'https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents',
  sa: 'https://www.cfs.sa.gov.au/home/copyright/',
  act: 'https://data.esa.act.gov.au/be-emergency-ready/warnings-alerts',
};

/** "https://www.rfs.nsw.gov.au/fire-information/…" → "rfs.nsw.gov.au". */
export function domeinVan(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

// Zelfde volgorde als in de winkeltekst en op de website.
export const BRONNEN: Bron[] = (
  ['vic', 'nsw', 'qld', 'sa', 'act'] as const
).map((regio) => ({
  regio,
  naam: regions[regio].source,
  staat: STAAT[regio],
  url: regions[regio].adviceUrl,
  domein: domeinVan(regions[regio].adviceUrl),
  vermelding: VERMELDING[regio],
  licentieUrl: LICENTIE[regio],
}));

/** De bron van een melding, op de regio uit het id ("vic:…"). */
export function bronVan(regio: string | null | undefined): Bron | null {
  return BRONNEN.find((b) => b.regio === regio) ?? null;
}
