/**
 * Of deze build pushmeldingen kan ontvangen. Los van React Native, zodat de
 * tests het zonder telefoon kunnen nalopen (zie pushBeschikbaar.ts).
 *
 * iOS heeft altijd push (APNs). Android alleen als de build met
 * google-services.json is gemaakt: app.config.ts zet dan
 * extra.androidPushConfigured. Alleen een echte `true` telt; een ontbrekende
 * of rare waarde betekent geen push.
 */
export function pushBeschikbaarOp(os: string, extra: unknown): boolean {
  if (os !== 'android') return true;
  return (extra as { androidPushConfigured?: unknown } | null | undefined)?.androidPushConfigured === true;
}
