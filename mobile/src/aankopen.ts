/**
 * RevenueCat for the yearly subscription (iOS). Fails soft: without a key,
 * without the native module or with the store down, the app simply runs
 * without a paywall. A broken payment module must never block alerts.
 */
import { Platform } from 'react-native';
import { ENTITLEMENT } from './abonnementRegels';

/**
 * Public RevenueCat SDK key of the Emergencies Near Me project (Project →
 * API keys). Empty = no purchases and no paywall. Public keys belong in the
 * app; the secret key stays at RevenueCat.
 */
export const RC_SLEUTEL = Platform.select({
  ios: 'appl_oYZfSGyMstyaSVaRZzGKTpIIrhp',
  // Google Play app in the same RevenueCat project.
  android: 'goog_ErnPHiWYIaqXdXcqmvtYRcKmHgy',
  default: '',
}) as string;

let ingericht = false;

/** Loads the module only when used: a native module that trips must not take
 *  the whole bundle down with it. */
export function laadPurchases(): typeof import('react-native-purchases') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases');
  } catch {
    return null;
  }
}

export function kopenMogelijk(): boolean {
  return RC_SLEUTEL.length > 0;
}

export async function startAankopen(): Promise<void> {
  if (!kopenMogelijk() || ingericht) return;
  const mod = laadPurchases();
  if (!mod) return;
  try {
    mod.default.configure({ apiKey: RC_SLEUTEL });
    ingericht = true;
  } catch { /* a store error must not touch the app */ }
}

/**
 * The paywall designed in the RevenueCat dashboard, shown as a sheet over our
 * own paywall. Same approach as Alarmeringen P2000: change the wall without a
 * new build, and A/B test it.
 *
 * Our own BetaalmuurScreen stays underneath, so every outcome is safe: no
 * paywall configured yet, the module missing, an error or a close tap all
 * leave the own wall in view. A purchase reaches abonnement.tsx through the
 * CustomerInfo listener and the wall disappears.
 */
export async function toonRevenueCatPaywall(): Promise<void> {
  if (!kopenMogelijk()) return;
  await startAankopen();
  if (!ingericht) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RevenueCatUI = require('react-native-purchases-ui').default;
    await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT,
      displayCloseButton: true,
    });
  } catch { /* old build or native error: the own wall stays */ }
}
