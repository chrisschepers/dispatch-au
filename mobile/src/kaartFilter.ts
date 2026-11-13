/**
 * Wat de kaart toont (wens Chris 08-11-2026): een periode, de diensten en het
 * waarschuwingsniveau, zoals het filterblad van de grote app. Wat buiten de
 * filters valt, verdwijnt van de kaart. Los van react-native, zodat de tests
 * het zonder toestel nalopen (tests/kaartFilter.test.mjs).
 *
 * Een melding die nog loopt, staat er altijd op. De periode bepaalt alleen
 * hoeveel van de afgelopen meldingen erbij komen: in Australië zijn er op een
 * dag ruim 700, en een brand van drie dagen geleden die al lang uit is, hoort
 * niet tussen de branden van nu (melding Chris 08-11: vier keer "Structure
 * fire" in Caroline Springs, alle vier al van de officiële lijst af).
 */
import { STANDAARD_LUCHT, type LuchtGroep } from './vliegtuigData.ts';
import { STANDAARD_WATER, type VaartSoort } from './vaartuigData.ts';

/** 0 = alleen wat nu loopt; anders ook wat in de laatste zoveel uur afliep. */
export type KaartPeriode = 0 | 4 | 24 | 72;
export const PERIODES: readonly KaartPeriode[] = [0, 4, 24, 72];

/** Australian Warning System: alles, vanaf Watch and Act, of alleen Emergency Warning. */
export type KaartNiveau = 'alle' | 'watch' | 'emergency';
export const NIVEAUS: readonly KaartNiveau[] = ['alle', 'watch', 'emergency'];

export interface KaartFilter {
  periode: KaartPeriode;
  /** De diensten op de kaart (diensten.ts); nooit leeg. */
  diensten: string[];
  niveau: KaartNiveau;
}

/** Het deel van een melding dat het filter nodig heeft. */
export interface FilterMelding {
  discipline: string;
  timestamp: string;
  status?: string | null;
  level?: string | null;
  priority?: string | null;
  /** Staat hij nog op de officiële lijst van de dienst? */
  listed?: boolean;
  /** Laatst gezien in de bron; bij een afgelopen melding het moment dat hij eraf ging. */
  lastSeen?: string | null;
  updated?: string | null;
}

/**
 * Afgelopen: de dienst heeft hem van zijn officiële lijst gehaald, of zet er
 * zelf "Safe" of "Complete" bij (Victoria laat zo'n melding soms nog even
 * staan). Zonder `listed` (oudere gegevens) telt alleen de status.
 */
export function isAfgelopen(m: Pick<FilterMelding, 'listed' | 'status'>): boolean {
  if (m.listed === false) return true;
  return /\b(safe|complete|completed|closed)\b/i.test(m.status ?? '');
}

/** 3 = Emergency Warning, 2 = Watch and Act, 1 = Advice, 0 = geen niveau. */
export function niveauVan(m: Pick<FilterMelding, 'level' | 'priority'>): number {
  const t = `${m.level ?? ''} ${m.priority ?? ''}`.toLowerCase();
  if (t.includes('emergency')) return 3;
  if (t.includes('watch')) return 2;
  if (t.includes('advice')) return 1;
  return 0;
}

/** Wanneer een afgelopen melding voor het laatst liep (ms), anders NaN. */
function eindVan(m: FilterMelding): number {
  for (const t of [m.lastSeen, m.updated, m.timestamp]) {
    const ms = Date.parse(t ?? '');
    if (Number.isFinite(ms)) return ms;
  }
  return Number.NaN;
}

/** Hoort deze melding op de kaart bij dit filter? */
export function opKaart(m: FilterMelding, f: KaartFilter, nu = Date.now()): boolean {
  if (!f.diensten.includes(m.discipline)) return false;
  if (f.niveau === 'watch' && niveauVan(m) < 2) return false;
  if (f.niveau === 'emergency' && niveauVan(m) < 3) return false;
  if (!isAfgelopen(m)) return true;
  if (f.periode === 0) return false;
  return nu - eindVan(m) <= f.periode * 3_600_000;
}

/**
 * Welk venster de kaart bij de feed opvraagt. De feed geeft altijd alles wat
 * nog loopt, plus wat binnen het venster afliep (24, 72 of 168 uur).
 */
export function feedUren(periode: KaartPeriode): 24 | 72 {
  return periode <= 24 ? 24 : 72;
}

/** Kort, voor de filterpil en de knoppen in het filterblad. */
export function periodeLabel(p: KaartPeriode): string {
  return p === 0 ? 'Active now' : p === 72 ? '3 days' : `${p} h`;
}

/** Voluit, voor de schermlezer en de filterpil. */
export function periodeVoluit(p: KaartPeriode): string {
  return p === 0 ? 'Active now' : p === 72 ? 'Last 3 days' : `Last ${p} hours`;
}

export function niveauLabel(n: KaartNiveau): string {
  return n === 'alle' ? 'All' : n === 'watch' ? 'Watch and Act' : 'Emergency';
}

/** Wijkt het filter af van de standaard (alles, alleen actief)? Dan een rand om de pil. */
export function filterActief(f: KaartFilter, alleDiensten: readonly string[]): boolean {
  return f.periode !== 0 || f.niveau !== 'alle' || f.diensten.length < alleDiensten.length;
}

/**
 * "4 callouts at this address in 3 days" (plan 08-11): liggen alle meldingen
 * in een groep op hetzelfde adres, dan is dat het verhaal. Vaak een
 * brandalarm in één gebouw, zoals de vier in Caroline Springs. Null als het
 * geen herhaling op één adres is; alleen een plaatsnaam is geen adres.
 */
export function herhalingTekst(
  leden: ReadonlyArray<{ location?: string | null; city?: string | null; timestamp: string }>,
): string | null {
  if (leden.length < 2 || !leden[0]!.location?.trim()) return null;
  const adres = (m: { location?: string | null; city?: string | null }) =>
    `${m.location ?? ''}|${m.city ?? ''}`.trim().toLowerCase();
  const eerste = adres(leden[0]!);
  if (leden.some((m) => adres(m) !== eerste)) return null;
  const tijden = leden.map((m) => Date.parse(m.timestamp)).filter(Number.isFinite);
  if (tijden.length < 2) return `${leden.length} callouts at this address`;
  const uur = (Math.max(...tijden) - Math.min(...tijden)) / 3_600_000;
  let duur: string;
  if (uur < 1) duur = 'within an hour';
  else if (uur < 24) {
    const n = Math.max(1, Math.round(uur));
    duur = `in ${n} ${n === 1 ? 'hour' : 'hours'}`;
  } else {
    const n = Math.ceil(uur / 24);
    duur = `in ${n} days`;
  }
  return `${leden.length} callouts at this address ${duur}`;
}

export type KaartType = 'standard' | 'hybrid';

/** Alles wat je op de kaart kiest: het filter, de ondergrond en de lagen in de lucht en op het water. */
export interface KaartKeuze extends KaartFilter {
  kaartType: KaartType;
  lucht: Record<LuchtGroep, boolean>;
  /** Vaartuigen per soort (13-11); een keuze van voor die tijd krijgt de standaard. */
  water: Record<VaartSoort, boolean>;
}

/** Een nieuwe installatie: alles wat nu loopt, alle diensten, de gewone kaart. */
export function standaardKeuze(alleDiensten: readonly string[]): KaartKeuze {
  return {
    periode: 0, diensten: [...alleDiensten], niveau: 'alle', kaartType: 'standard',
    lucht: { ...STANDAARD_LUCHT }, water: { ...STANDAARD_WATER },
  };
}

/**
 * Een bewaarde keuze, gecontroleerd. Wat niet (meer) klopt valt terug op de
 * standaard, zodat een oude of beschadigde waarde de kaart nooit leeg maakt.
 */
export function schoneKeuze(raw: unknown, alleDiensten: readonly string[]): KaartKeuze {
  const basis = standaardKeuze(alleDiensten);
  if (!raw || typeof raw !== 'object') return basis;
  const r = raw as Partial<Record<keyof KaartKeuze, unknown>>;
  const diensten = Array.isArray(r.diensten)
    ? alleDiensten.filter((d) => (r.diensten as unknown[]).includes(d))
    : basis.diensten;
  const lucht = { ...basis.lucht };
  if (r.lucht && typeof r.lucht === 'object') {
    for (const k of Object.keys(lucht) as LuchtGroep[]) {
      const v = (r.lucht as Record<string, unknown>)[k];
      if (typeof v === 'boolean') lucht[k] = v;
    }
  }
  const water = { ...basis.water };
  if (r.water && typeof r.water === 'object') {
    for (const k of Object.keys(water) as VaartSoort[]) {
      const v = (r.water as Record<string, unknown>)[k];
      if (typeof v === 'boolean') water[k] = v;
    }
  }
  return {
    periode: PERIODES.includes(r.periode as KaartPeriode) ? (r.periode as KaartPeriode) : basis.periode,
    diensten: diensten.length ? diensten : basis.diensten,
    niveau: NIVEAUS.includes(r.niveau as KaartNiveau) ? (r.niveau as KaartNiveau) : basis.niveau,
    kaartType: r.kaartType === 'hybrid' ? 'hybrid' : 'standard',
    lucht,
    water,
  };
}
