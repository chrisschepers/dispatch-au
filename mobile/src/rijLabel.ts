/**
 * Wat VoiceOver/TalkBack bij een meldingenrij voorleest. Los van
 * react-native, zodat de node-tests het kunnen nalopen.
 *
 * Het label vervangt de tekst in de rij, dus alles wat in beeld telt moet
 * erin, in de volgorde van het scherm: titel, waarschuwingsniveau, plaats,
 * urgentie, afstand, tijd. Tot 31-10 ontbrak het niveau ('Emergency
 * Warning'), juist het belangrijkste van de rij.
 *
 * Niveau en urgentie komen uit hetzelfde veld, dus vaak zegt de urgentie het
 * niveau al ('Emergency Warning: act now'); dan één keer. Ze kunnen ook
 * verschillen (het niveau kijkt eerst naar `level`), en een urgentie als
 * 'Responding' is alleen een status: dan blijft het niveau staan.
 */
export interface RijTekst {
  kop: string;
  /** 'Emergency Warning', 'Watch and Act', 'Advice' of null. */
  opschaling: string | null;
  /** De regel onder de titel (plaats, of dienst en urgentie). */
  onder: string | null;
  urgentie: string | null;
  /** Bij een omgedraaide rij staat de urgentie al in `onder`. */
  urgentieInOnder: boolean;
  km: string | null;
  tijd: string;
}

export function rijLabel(r: RijTekst): string {
  const zelfdeNiveau = !!r.opschaling && !!r.urgentie && r.urgentie.startsWith(r.opschaling);
  return [
    r.kop,
    zelfdeNiveau ? null : r.opschaling,
    r.onder,
    r.urgentieInOnder ? null : r.urgentie,
    r.km,
    r.tijd,
  ].filter(Boolean).join(', ');
}
