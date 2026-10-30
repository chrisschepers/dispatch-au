/**
 * Kaarttijden uit de backend controleren (30-10-2026). Alleen diensten die de
 * app kent, met 1 tot 168 uur; de rest blijft op de ingebouwde waarde. Zo kan
 * een tikfout in de backend de kaart nooit leeg of overvol maken.
 */
export function geldigeUren(invoer: unknown, basis: Record<string, number>): Record<string, number> {
  const uit = { ...basis };
  if (!invoer || typeof invoer !== 'object' || Array.isArray(invoer)) return uit;
  for (const [dienst, uren] of Object.entries(invoer as Record<string, unknown>)) {
    if (dienst in basis && typeof uren === 'number' && Number.isFinite(uren) && uren >= 1 && uren <= 168) {
      uit[dienst] = uren;
    }
  }
  return uit;
}
