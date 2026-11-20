/**
 * Ads in the free version (20-11-2026, keuze Chris: "die advertenties zijn er
 * voornamelijk om de betaaloptie aantrekkelijk te maken"). Premium has none.
 * Where they may go is in reclameRegels.ts; the block itself in
 * components/Reclame.tsx.
 *
 * - Google AdMob, same account as Alarmeringen P2000. Non-personalised only:
 *   no tracking question on iOS, no advertising ID on Android (blocked in
 *   app.config.ts), and the privacy policy stays short.
 * - Google's consent message (UMP) first; outside Europe it asks nothing.
 * - Fails soft: no native module (Expo Go), no network or a consent error
 *   means no ad, never a broken screen.
 * - Development builds always use Google's test units: real units in a dev
 *   build risk an AdMob suspension for invalid traffic.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAbonnement } from './abonnement';

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

let toestemming: Promise<boolean> | null = null;

/**
 * Consent once per app start, then the SDK. true = ads may be requested.
 * An error counts as yes (non-personalised, as before); only an explicit
 * "no ads" from the SDK says no.
 */
export function zorgVoorToestemming(): Promise<boolean> {
  if (toestemming) return toestemming;
  toestemming = (async () => {
    const m = laadAds();
    if (!m) return false;
    let mag = true;
    try {
      const info = await m.AdsConsent.gatherConsent();
      mag = (info as { canRequestAds?: boolean })?.canRequestAds ?? true;
    } catch {
      // No network or no message: non-personalised ads as usual.
    }
    try { await m.default().initialize(); } catch {}
    return mag;
  })();
  return toestemming;
}

/**
 * Must the app offer a way to change the ad consent? Google requires that
 * entry point where its consent message applies (Europe); elsewhere the row
 * in Settings stays away. Only asked after the consent step has run.
 */
export function usePrivacykeuze(): { nodig: boolean; toon: () => void } {
  const reclame = useReclame();
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
 * see an ad flash by while RevenueCat is still checking.
 */
export function useReclame(): boolean {
  const { vereist, premium, toegang } = useAbonnement();
  const kandidaat = vereist && !premium && toegang !== 'onbekend' && laadAds() !== null;
  const [mag, setMag] = useState(false);
  useEffect(() => {
    if (!kandidaat) return;
    let weg = false;
    zorgVoorToestemming().then((m) => { if (!weg) setMag(m); });
    return () => { weg = true; };
  }, [kandidaat]);
  return kandidaat && mag;
}
