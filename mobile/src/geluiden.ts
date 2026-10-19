/**
 * De meldingsgeluiden. Bewust allemaal zacht en laag: dit is een
 * buurtmelding, geen alarm. Het verschil zit in karakter, niet in volume.
 *
 * De sleutel is ook de bestandsnaam (zacht → zacht.wav) én de naam van het
 * Android-kanaal (m112_snd_zacht). Kanaalgeluiden liggen vast zodra het
 * kanaal bestaat, dus per geluid één kanaal.
 *
 * Gratis krijg je één geluid voor alles. Met Pro stel je per dienst een eigen
 * geluid in (wens Chris 16-08): dan hoor je aan de melding al of het de
 * brandweer of een ambulance is, zonder te kijken.
 */
export interface Geluid {
  sleutel: string;
  naam: string;
  omschrijving: string;
}

export const GELUIDEN: Geluid[] = [
  { sleutel: 'zacht', naam: 'Soft', omschrijving: 'Two gentle chimes' },
  { sleutel: 'bel', naam: 'Bell', omschrijving: 'One warm low tone' },
  { sleutel: 'tik', naam: 'Tick', omschrijving: 'Short and quiet' },
  { sleutel: 'dubbel', naam: 'Double', omschrijving: 'Two short ticks' },
  { sleutel: 'melodie', naam: 'Melody', omschrijving: 'Three brighter tones' },
  { sleutel: 'pager', naam: 'Pager', omschrijving: 'Like an old-school pager' },
];

export const STANDAARD_GELUID = 'zacht';

/** Bestaat dit geluid nog? Beschermt tegen een oude opgeslagen keuze. */
export function geldigGeluid(sleutel: string | undefined | null): string {
  return GELUIDEN.some((g) => g.sleutel === sleutel) ? sleutel! : STANDAARD_GELUID;
}

/** Het geluid dat voor deze dienst geldt: eigen keuze, anders het algemene. */
export function geluidVoorDienst(
  dienst: string,
  algemeen: string,
  perDienst: Record<string, string>,
): string {
  return geldigGeluid(perDienst[dienst] ?? algemeen);
}

/** Android-kanaal per geluid; iOS gebruikt de bestandsnaam uit de payload. */
export function kanaalVoor(sleutel: string): string {
  return `dispatch_snd_${geldigGeluid(sleutel)}`;
}
