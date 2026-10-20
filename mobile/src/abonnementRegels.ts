/**
 * The rules behind the yearly subscription, free of React and native modules
 * so they can be tested. Same model as 112 Meldingen: one yearly product
 * with a free trial, sold through RevenueCat.
 */

/** RevenueCat entitlement that unlocks the app. */
export const ENTITLEMENT = 'premium';

/**
 * How long an earlier confirmed access stays valid when the store cannot be
 * reached. Locking out a paying user because of an outage is worse than a
 * week of extra access for someone whose subscription just ended.
 */
export const OFFLINE_GELDIG_MS = 7 * 24 * 3600 * 1000;

export type Toegang =
  /** Not established yet (first check running). */
  | 'onbekend'
  /** Paid or in the trial, also when renewal is off. */
  | 'actief'
  /** Purchase made, payment still pending (Ask to Buy). */
  | 'wacht'
  | 'geen';

export interface Uitkomst {
  toegang: Exclude<Toegang, 'onbekend'>;
  /** false = cancelled but still running. Only meaningful with 'actief'. */
  verlengt: boolean;
}

export interface Bewaard {
  actief: boolean;
  gecontroleerd: number;
}

/** Store unreachable: does the last saved status still count? */
export function bewaardGeldig(b: Bewaard | null, nu: number): boolean {
  return !!b && b.actief && nu - b.gecontroleerd < OFFLINE_GELDIG_MS;
}

/**
 * ISO 8601 period to English: "P3D" → "3 days", "P1W" → "7 days",
 * "P1M" → "1 month", "P1Y" → "1 year". Unknown → null.
 */
export function periodeTekst(iso: string | null | undefined): string | null {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso ?? '');
  if (!m) return null;
  const [j, mnd, w, d] = m.slice(1).map((x) => (x ? Number(x) : 0));
  if (j && !mnd && !w && !d) return j === 1 ? '1 year' : `${j} years`;
  if (mnd && !j && !w && !d) return mnd === 1 ? '1 month' : `${mnd} months`;
  // Weeks as days: "7 days free" is how the store and people say it.
  const dagen = w * 7 + d;
  if (dagen && !j && !mnd) return dagen === 1 ? '1 day' : `${dagen} days`;
  return null;
}

/** "P1Y" → "per year", "P1M" → "per month". */
export function perPeriode(iso: string | null | undefined): string {
  if (iso === 'P1Y') return 'per year';
  if (iso === 'P1M') return 'per month';
  const t = periodeTekst(iso);
  return t ? `every ${t}` : 'per period';
}

/**
 * RevenueCat: the entitlement from `customerInfo.entitlements.active`. A
 * cancelled subscription stays there until the period ends, with
 * `willRenew: false`; that keeps access.
 */
export function beoordeelEntitlement(actief: { willRenew: boolean } | undefined): Uitkomst {
  return actief
    ? { toegang: 'actief', verlengt: actief.willRenew }
    : { toegang: 'geen', verlengt: false };
}

/**
 * The trial is a free introductory offer on the yearly product. Only promise
 * it when Apple says this user is eligible; when unknown, don't: a promised
 * trial that doesn't come is misleading, and Apple shows it in the payment
 * sheet anyway. Returns an ISO period ("P3D") or null.
 */
export function proefVanIntro(
  intro: { price: number; period: string; cycles: number } | null | undefined,
  geschikt: boolean,
): string | null {
  if (!geschikt || !intro || intro.price !== 0) return null;
  if (intro.cycles <= 1) return intro.period;
  const m = /^P(\d+)([DWMY])$/.exec(intro.period);
  return m ? `P${Number(m[1]) * intro.cycles}${m[2]}` : null;
}
