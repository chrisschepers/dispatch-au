/**
 * Ads in the free version (20-11-2026, keuze Chris: "die advertenties zijn er
 * voornamelijk om de betaaloptie aantrekkelijk te maken"). Premium has none.
 * Where they may go is in reclameRegels.ts; the block itself in
 * components/Reclame.tsx.
 *
 * - Google AdMob, same account as Alarmeringen P2000.
 * - Personalised where allowed (20-11, keuze Chris: "gepersonaliseerd dus
 *   tracking aan"): Google's consent message (UMP) first, which asks nothing
 *   outside Europe; then on iPhone Apple's tracking question, always, also
 *   after a "no" in the consent message (Apple rejected P2000 1.5.0 on
 *   5.1.1(iv) when it skipped the question). Personalised only with every yes
 *   (magPersonaliseren in reclameRegels.ts), otherwise non-personalised.
 * - The questions wait until the Premium screen is closed, so they never
 *   pile up on top of it after the introduction.
 * - Fails soft: no native module (Expo Go), no network or a consent error
 *   means no ad, never a broken screen.
 * - Development builds always use Google's test units: real units in a dev
 *   build risk an AdMob suspension for invalid traffic.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAbonnement } from './abonnement';
import { usePremium } from './premiumPoort';
import { magPersonaliseren } from './reclameRegels';

type Ads = typeof import('react-native-google-mobile-ads');

/** Ad units per place in the app (AdMob → Emergencies Near Me → Ad units). */
const EENHEDEN = {
  lijst: {
    ios: 'ca-app-pub-8756987324755075/7301634778',
    android: 'ca-app-pub-8756987324755075/8423144755',
  },
  detail: {
    ios: 'ca-app-pub-8756987324755075/2731834375',
    android: 'ca-app-pub-8756987324755075/4835253533',
  },
} as const;

export type ReclamePlek = keyof typeof EENHEDEN;

let ads: Ads | null | undefined;

/** The module only when used: in Expo Go the native part is missing and
 *  loading it throws. */
export function laadAds(): Ads | null {
  if (ads !== undefined) return ads;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ads = require('react-native-google-mobile-ads') as Ads;
  } catch {
    ads = null;
  }
  return ads;
}

export function eenheidVoor(plek: ReclamePlek): string | null {
  const m = laadAds();
  if (!m) return null;
  if (__DEV__) return m.TestIds.ADAPTIVE_BANNER;
  return Platform.OS === 'ios' ? EENHEDEN[plek].ios : EENHEDEN[plek].android;
}

export interface Toestemming {
  /** Ads may be requested at all. */
  mag: boolean;
  /** Personalised ads allowed (consent message and tracking question). */
  gepersonaliseerd: boolean;
}

let toestemming: Promise<Toestemming> | null = null;

/** Apple's tracking question; null when the module is missing or it fails. */
async function vraagTracking(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tt = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
    const r = await tt.requestTrackingPermissionsAsync();
    return r.status;
  } catch {
    return null;
  }
}

/**
 * Consent once per app start, then the SDK. An error in the consent step
 * counts as "ads yes, non-personalised"; only an explicit "no ads" from the
 * SDK says no.
 */
export function zorgVoorToestemming(): Promise<Toestemming> {
  if (toestemming) return toestemming;
  toestemming = (async () => {
    const m = laadAds();
    if (!m) return { mag: false, gepersonaliseerd: false };
    let mag = true;
    let gdpr: boolean | null = null;
    let eersteKeuze: boolean | null = null;
    try {
      const info = await m.AdsConsent.gatherConsent();
      mag = (info as { canRequestAds?: boolean })?.canRequestAds ?? true;
      gdpr = await m.AdsConsent.getGdprApplies();
      if (gdpr) {
        try {
          eersteKeuze = (await m.AdsConsent.getUserChoices()).selectPersonalisedAds === true;
        } catch {
          eersteKeuze = false;
        }
      }
    } catch {
      // No network or no message: non-personalised ads as usual.
    }
    // Always after the consent message, whatever was chosen there.
    const att = await vraagTracking();
    try { await m.default().initialize(); } catch {}
    return { mag, gepersonaliseerd: magPersonaliseren({ ios: Platform.OS === 'ios', gdpr, eersteKeuze, att }) };
  })();
  return toestemming;
}

/**
 * Must the app offer a way to change the ad consent? Google requires that
 * entry point where its consent message applies (Europe); elsewhere the row
 * in Settings stays away. Only asked after the consent step has run.
 */
export function usePrivacykeuze(): { nodig: boolean; toon: () => void } {
  const { tonen: reclame } = useReclame();
  const [nodig, setNodig] = useState(false);
  useEffect(() => {
    if (!reclame) { setNodig(false); return; }
    let weg = false;
    const m = laadAds();
    m?.AdsConsent.getConsentInfo()
      .then((info) => { if (!weg) setNodig(info.privacyOptionsRequirementStatus === 'REQUIRED'); })
      .catch(() => {});
    return () => { weg = true; };
  }, [reclame]);
  const toon = () => { laadAds()?.AdsConsent.showPrivacyOptionsForm().catch(() => {}); };
  return { nodig, toon };
}

/**
 * Show ads here? Only in a build that sells Premium, to someone without it,
 * and only once the store has answered: a paying user on a new phone must not
 * see an ad flash by while RevenueCat is still checking. The consent questions
 * wait until the Premium screen is closed.
 */
export function useReclame(): { tonen: boolean; gepersonaliseerd: boolean } {
  const { vereist, premium, toegang } = useAbonnement();
  const { schermOpen, aanbodBeslist } = usePremium();
  const kandidaat = vereist && !premium && toegang !== 'onbekend' && laadAds() !== null;
  const [t, setT] = useState<Toestemming | null>(null);
  useEffect(() => {
    if (!kandidaat || schermOpen || !aanbodBeslist) return;
    let weg = false;
    zorgVoorToestemming().then((r) => { if (!weg) setT(r); });
    return () => { weg = true; };
  }, [kandidaat, schermOpen, aanbodBeslist]);
  return { tonen: kandidaat && t?.mag === true, gepersonaliseerd: t?.gepersonaliseerd === true };
}
