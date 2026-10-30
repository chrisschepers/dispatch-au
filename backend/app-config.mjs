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

export function appConfig(env = process.env) {
  let kaart = KAART_TERUGBLIK_UREN;
  try {
    if (env.KAART_TERUGBLIK_UREN)
      kaart = { ...KAART_TERUGBLIK_UREN, ...JSON.parse(env.KAART_TERUGBLIK_UREN) };
  } catch {
    // An invalid override keeps the defaults rather than breaking the app.
  }
  return { region: 'au', kaartTerugblikUren: kaart };
}
