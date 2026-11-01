// Map look-back windows per service, in hours, read by the app at start
// (30-10-2026, Chris: non-fire incidents may stay longer, variety on the map
// matters). Change them here, or with KAART_TERUGBLIK_UREN (JSON) in Railway,
// without a new app release. The app keeps its own copy as a fallback and only
// accepts 1-168 hours for services it knows.
export const KAART_TERUGBLIK_UREN = {
  Fire: 72,
  Storm: 72,
  Hazmat: 48,
  Other: 48,
  Rescue: 24,
  Ambulance: 24,
};

// RevenueCat paywall sheet over the app's own paywall (iOS). Off by default:
// without a paywall designed in the RevenueCat dashboard the SDK shows its
// default template, which has no Terms of Use or Privacy links (Guideline
// 3.1.2, review check 01-11-2026). Our own paywall underneath has them.
// Set REVENUECAT_PAYWALL=aan in Railway only after a paywall with Terms of Use
// (Apple EULA) and Privacy links is published in the RevenueCat dashboard.
export function revenueCatPaywallAan(env = process.env) {
  return ['aan', 'on', 'true', '1'].includes(String(env.REVENUECAT_PAYWALL ?? '').trim().toLowerCase());
}

export function appConfig(env = process.env) {
  let kaart = KAART_TERUGBLIK_UREN;
  try {
    if (env.KAART_TERUGBLIK_UREN)
      kaart = { ...KAART_TERUGBLIK_UREN, ...JSON.parse(env.KAART_TERUGBLIK_UREN) };
  } catch {
    // An invalid override keeps the defaults rather than breaking the app.
  }
  return { region: 'au', kaartTerugblikUren: kaart, revenueCatPaywall: revenueCatPaywallAan(env) };
}
