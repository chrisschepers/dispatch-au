/**
 * The store behind the yearly subscription, in one shape for abonnement.tsx.
 * Copied from 112 Meldingen. Both platforms go through RevenueCat: the App
 * Store on iOS, Google Play on Android, one entitlement for both.
 *
 * `kiesWinkel()` returns null when this platform has no working store (a
 * build without the native module, no RevenueCat key for it). The
 * provider then leaves the app open: a payment module that fails to load must
 * never lock everyone out.
 */
import { Platform } from 'react-native';
import { ENTITLEMENT, beoordeelEntitlement, proefVanIntro, type Uitkomst } from './abonnementRegels';
import { kopenMogelijk, laadPurchases, startAankopen } from './aankopen';

export interface Product {
  /** Localised amount from the store, e.g. "$9.99". Never build it ourselves. */
  prijs: string;
  /** ISO 8601 period, e.g. "P1Y". */
  periode: string | null;
  /** Free period if this user is eligible for the trial, else null. */
  proefPeriode: string | null;
}

export type Gebeurtenis =
  | { soort: 'uitkomst'; u: Uitkomst; volledig: boolean }
  | { soort: 'ververs' }
  /** Payment sheet closed without buying; no message. */
  | { soort: 'geannuleerd' }
  | { soort: 'fout'; melding: string };

export interface Winkel {
  /** For sentences like "through the App Store" / "through Google Play". */
  naam: string;
  /** "Apple Account" / "Google Account": where the subscription lives. */
  account: string;
  beheerUrl: string;
  /** Current state; throws when the store cannot be reached. */
  toestand(): Promise<Uitkomst>;
  product(): Promise<Product | null>;
  /** Starts the purchase; the outcome arrives through `luister`. */
  koop(p: Product): Promise<void>;
  herstel(): Promise<Uitkomst>;
  luister(cb: (g: Gebeurtenis) => void): () => void;
  leesbaar(e: unknown): string;
}

const MISLUKT = 'The purchase did not go through. You have not been charged.';

function code(e: unknown): string {
  return String((e as { code?: string | number })?.code ?? '');
}

function revenueCatWinkel(android: boolean): Winkel | null {
  if (!kopenMogelijk()) return null;
  const rc = laadPurchases();
  if (!rc) return null;
  const P = rc.default;
  type Info = Awaited<ReturnType<typeof P.getCustomerInfo>>;
  type Pakket = NonNullable<Awaited<ReturnType<typeof P.getOfferings>>['current']>['availablePackages'][number];

  const uit = (info: Info) => beoordeelEntitlement(info.entitlements.active[ENTITLEMENT]);
  const luisteraars = new Set<(g: Gebeurtenis) => void>();
  const meld = (g: Gebeurtenis) => luisteraars.forEach((cb) => cb(g));
  // The package behind the product on screen; needed to buy.
  let pakket: Pakket | null = null;

  return {
    naam: android ? 'Google Play' : 'the App Store',
    account: android ? 'Google Account' : 'Apple Account',
    beheerUrl: android
      ? 'https://play.google.com/store/account/subscriptions?package=com.chrisschepers.dispatchau'
      : 'https://apps.apple.com/account/subscriptions',
    async toestand() {
      await startAankopen();
      return uit(await P.getCustomerInfo());
    },
    async product() {
      await startAankopen();
      const aanbod = await P.getOfferings();
      pakket = aanbod.current?.annual ?? null;
      if (!pakket) return null;
      const sp = pakket.product;
      if (android) {
        // Play only offers the trial to people who are eligible, so the
        // free phase of the default offer is the answer by itself.
        const iso = (sp as { defaultOption?: { freePhase?: { billingPeriod?: { iso8601?: string } } | null } | null })
          .defaultOption?.freePhase?.billingPeriod?.iso8601 ?? null;
        return { prijs: sp.priceString, periode: sp.subscriptionPeriod ?? 'P1Y', proefPeriode: iso };
      }
      let geschikt = false;
      if (sp.introPrice) {
        try {
          const r = await P.checkTrialOrIntroductoryPriceEligibility([sp.identifier]);
          geschikt = r[sp.identifier]?.status === rc.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
        } catch { /* unknown = don't promise a trial */ }
      }
      return {
        prijs: sp.priceString,
        periode: sp.subscriptionPeriod ?? 'P1Y',
        proefPeriode: proefVanIntro(sp.introPrice, geschikt),
      };
    },
    async koop() {
      if (!pakket) throw { code: 'niet_gevonden' };
      try {
        const r = await P.purchasePackage(pakket);
        meld({ soort: 'uitkomst', u: uit(r.customerInfo), volledig: true });
      } catch (e) {
        const c = code(e);
        if (c === rc.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) meld({ soort: 'geannuleerd' });
        // Ask to Buy (Family Sharing) or a payment still in progress.
        else if (c === rc.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
          meld({ soort: 'uitkomst', u: { toegang: 'wacht', verlengt: false }, volledig: true });
        } else if (c === rc.PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR) {
          meld({ soort: 'fout', melding: 'Purchases are turned off on this device (Screen Time or a management profile).' });
        } else meld({ soort: 'fout', melding: MISLUKT });
      }
    },
    async herstel() {
      await startAankopen();
      return uit(await P.restorePurchases());
    },
    luister(cb) {
      luisteraars.add(cb);
      // Renewals, approved Ask to Buy, cancelling elsewhere.
      const opInfo = (info: Info) => cb({ soort: 'uitkomst', u: uit(info), volledig: true });
      P.addCustomerInfoUpdateListener(opInfo);
      return () => {
        luisteraars.delete(cb);
        P.removeCustomerInfoUpdateListener(opInfo);
      };
    },
    leesbaar(e) {
      const c = code(e);
      const E = rc.PURCHASES_ERROR_CODE;
      if (c === 'tijd' || c === E.NETWORK_ERROR || c === E.STORE_PROBLEM_ERROR) {
        return `${android ? 'Google Play' : 'The App Store'} cannot be reached right now. Check your connection and try again.`;
      }
      if (c === 'niet_gevonden') {
        return 'The subscription is not available right now. Please try again later.';
      }
      return `Something went wrong with ${android ? 'Google Play' : 'the App Store'}. Please try again.`;
    },
  };
}

export function kiesWinkel(): Winkel | null {
  if (Platform.OS === 'ios') return revenueCatWinkel(false);
  if (Platform.OS === 'android') return revenueCatWinkel(true);
  return null;
}
