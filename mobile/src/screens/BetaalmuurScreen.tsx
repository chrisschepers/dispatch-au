/**
 * Trial and paywall (iOS), copied from 112 Meldingen: without a running yearly
 * subscription or trial you get no further than this screen. It comes after
 * the intro, in the same layout, so location and alerts are already granted
 * and someone who starts the trial has a working app straight away.
 *
 * The amount ALWAYS comes from the store (localised, right currency and GST).
 * No "$9.99" anywhere in the code: a price change in App Store Connect must
 * show up here by itself.
 *
 * ⚠ Apple rejects paywalls where "free" is bigger than what you pay after.
 * So the yearly price is its own bold line right under the title, and the
 * trial is the button.
 *
 * Restore and manage are always there: someone on a new phone, or who wants
 * to cancel, must be able to do that here, even when the store returns nothing.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Linking, Platform } from 'react-native';
import { useAbonnement } from '../abonnement';
import { F } from '../theme';
import { periodeTekst, perPeriode } from '../abonnementRegels';
import { Drukbaar } from '../components/Drukbaar';
import { Icoon } from '../components/Icoon';
import type { IcoonNaam } from '../iconen';
import { IntroSchil, INTRO } from '../components/intro/IntroSchil';
import { SchermProef } from '../components/intro/Schermpjes';
import { toonRevenueCatPaywall } from '../aankopen';

const SITE = 'https://emergenciesnearme.online';
/** iOS: Apple's standard licence agreement, which App Store Connect uses too. */
const VOORWAARDEN = Platform.OS === 'ios'
  ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
  : `${SITE}/terms`;
const PRIVACY = `${SITE}/privacy`;

export default function BetaalmuurScreen() {
  const {
    toegang, wasActief, product, productGeladen, fout, bezig, koop, herstel,
    winkelNaam, account, beheerUrl,
  } = useAbonnement();
  // Once per visit: the RevenueCat paywall over this screen, if one is set up.
  useEffect(() => { toonRevenueCatPaywall(); }, []);
  const Winkel = winkelNaam.charAt(0).toUpperCase() + winkelNaam.slice(1);

  const proef = product ? periodeTekst(product.proefPeriode) : null;
  const heeftProef = !!product?.proefPeriode;
  const prijsZin = product ? `${product.prijs} ${perPeriode(product.periode)}` : null;
  const verlopen = wasActief && toegang === 'geen';

  async function herstelNu() {
    const t = await herstel();
    if (t === 'actief') return;              // the wall disappears by itself
    Alert.alert(
      t === 'wacht' ? 'Payment in progress' : 'Nothing found',
      t === 'wacht'
        ? `${Winkel} is still processing your payment. The app opens as soon as it is done.`
        : `There is no running Emergencies Near Me subscription on this ${account}. Using a different ${account}? Switch there and try again.`,
    );
  }

  const titel = verlopen
    ? 'Your subscription has ended'
    : heeftProef ? 'Start your free trial' : 'Subscribe';

  const knop = !productGeladen
    ? 'Loading…'
    : !product
      ? 'Try again'
      : heeftProef
        ? (proef ? `Start ${proef} free` : 'Start free trial')
        : `Subscribe for ${prijsZin}`;

  return (
    <IntroSchil
      scherm={<SchermProef prijsZin={prijsZin} proefTekst={proef ?? 'The trial'} />}
      titel={titel}
      tekst={
        <View>
          {/* Title, length and price of the subscription, required in the
              app itself (3.1.2(c), Alarmeringen P2000 25-07). */}
          {prijsZin ? <Text style={styles.prijs}>{prijsZin}</Text> : null}
          {product ? <Text style={styles.abo}>Emergencies Near Me Premium · yearly subscription</Text> : null}
          <Text style={styles.tekst}>
            {verlopen
              ? 'Renew to see what is happening near you again.'
              : heeftProef
                ? `The first ${proef ?? 'days'} are free. Cancel any time, also during the trial.`
                : 'Every incident, the map and alerts near you. Cancel any time.'}
          </Text>
        </View>
      }
      extra={
        <>
          {toegang === 'wacht' && (
            <Regel icoon="wacht" tekst={`${Winkel} is still processing your payment. The app opens as soon as it is done.`} />
          )}
          {fout ? <Regel icoon="fout" tekst={fout} /> : null}
        </>
      }
      knop={knop}
      onKnop={koop}
      bezig={bezig || !productGeladen}
      knopUit={toegang === 'wacht'}
      onder={
        <View style={styles.onder}>
          <Drukbaar style={styles.tekstKnop} onPress={herstelNu} disabled={bezig} trillen={false}>
            <Text style={styles.herstel}>Restore purchase</Text>
          </Drukbaar>
          <Text style={styles.klein}>
            {heeftProef
              ? `After the trial the yearly amount is charged through ${winkelNaam}, unless you cancel at least 24 hours before it ends. `
              : ''}
            The subscription renews every year until you cancel it in your {account} settings.
          </Text>
          <View style={styles.links}>
            <Drukbaar style={styles.tekstKnop} rol="link" onPress={() => Linking.openURL(beheerUrl).catch(() => {})} trillen={false}>
              <Text style={styles.link}>Manage</Text>
            </Drukbaar>
            <Drukbaar style={styles.tekstKnop} rol="link" onPress={() => Linking.openURL(VOORWAARDEN).catch(() => {})} trillen={false}>
              <Text style={styles.link}>Terms of Use</Text>
            </Drukbaar>
            <Drukbaar style={styles.tekstKnop} rol="link" onPress={() => Linking.openURL(PRIVACY).catch(() => {})} trillen={false}>
              <Text style={styles.link}>Privacy</Text>
            </Drukbaar>
          </View>
        </View>
      }
    />
  );
}

function Regel({ icoon, tekst }: { icoon: IcoonNaam; tekst: string }) {
  return (
    <View style={styles.regel}>
      <Icoon naam={icoon} grootte={18} kleur={INTRO.waarschuwing} />
      <Text style={styles.regelTekst}>{tekst}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  prijs: { fontSize: 21, fontWeight: F.weightBold, color: INTRO.tekst, textAlign: 'center', marginTop: 8 },
  abo: { fontSize: 13.5, color: INTRO.zacht, textAlign: 'center', marginTop: 2 },
  tekst: { fontSize: 15.5, lineHeight: 22, color: INTRO.zacht, textAlign: 'center', marginTop: 6 },
  regel: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    backgroundColor: INTRO.vlak, borderRadius: 12, padding: 12,
  },
  regelTekst: { flex: 1, fontSize: 14, lineHeight: 19, color: INTRO.tekst },
  // Kleinere tussenruimte: de tekstknoppen hebben nu zelf ruimte om hun tekst.
  onder: { alignItems: 'center', gap: 4, marginTop: -4 },
  // Tekstknop met een echte raakzone: met de hitSlop van Drukbaar minstens
  // 44 pt / 48 dp hoog. De ronding staat op de Drukbaar zelf, zodat de
  // Android-drukstaat de pilvorm van een M3-tekstknop krijgt.
  tekstKnop: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20 },
  herstel: { fontSize: 15, color: INTRO.tekst },
  klein: { fontSize: 12, lineHeight: 16, color: INTRO.klein, textAlign: 'center' },
  // Past de rij niet (grote tekst), dan loopt hij door op een volgende regel.
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 4, columnGap: 8 },
  link: { fontSize: 12.5, color: INTRO.link, textDecorationLine: 'underline' },
});
