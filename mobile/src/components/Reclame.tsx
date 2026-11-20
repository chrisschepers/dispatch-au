/**
 * One ad in the free version (see advertenties.ts and reclameRegels.ts): a
 * Google banner on a card in the style of the list, with "Advertisement" on
 * top so it never passes for an incident, and "Remove ads" that opens Premium.
 *
 * - Renders nothing for Premium, without consent, while nothing has loaded
 *   and after a failed request: never an empty card.
 * - Inline adaptive banner at the width of the card. In the list at most
 *   100 high (a large banner, about a row and a half); under an incident up
 *   to 250, which allows the medium rectangle.
 * - The width is passed once it is known: every new width makes the banner
 *   request a new ad.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { eenheidVoor, laadAds, useReclame, type ReclamePlek } from '../advertenties';
import { usePremium } from '../premiumPoort';
import { T, F, type Palet } from '../theme';
import { useStijlen, useKaartStijl } from '../thema';
import { Drukbaar } from './Drukbaar';

const MAX_HOOGTE: Record<ReclamePlek, number> = { lijst: 100, detail: 250 };

export function Reclame({ plek }: { plek: ReclamePlek }) {
  const { tonen, gepersonaliseerd } = useReclame();
  if (!tonen) return null;
  return <ReclameBlok plek={plek} gepersonaliseerd={gepersonaliseerd} />;
}

function ReclameBlok({ plek, gepersonaliseerd }: { plek: ReclamePlek; gepersonaliseerd: boolean }) {
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const { vraag } = usePremium();
  const [breedte, setBreedte] = useState<number | null>(null);
  const [stand, setStand] = useState<'laden' | 'ok' | 'mislukt'>('laden');
  const ads = laadAds();
  const eenheid = eenheidVoor(plek);
  if (!ads || !eenheid || stand === 'mislukt') return null;
  const { BannerAd, BannerAdSize } = ads;

  const meet = (e: LayoutChangeEvent) => {
    const b = Math.floor(e.nativeEvent.layout.width);
    if (b > 0) setBreedte((oud) => (oud === null ? b : oud));
  };

  const geladen = stand === 'ok';
  return (
    // Until the ad is there the card takes no room and shows nothing.
    <View style={[styles.buiten, !geladen && styles.verborgen]} onLayout={meet}>
      <View style={[kaartStijl, styles.kaart]}>
        {geladen && (
          <View style={styles.kopRij}>
            <Text style={styles.label}>Advertisement</Text>
            <Drukbaar
              rol="button"
              label="Remove ads"
              hint="Shows what Premium adds"
              style={styles.weg}
              onPress={() => vraag('reclame')}
            >
              <Text style={styles.wegTekst}>Remove ads</Text>
            </Drukbaar>
          </View>
        )}
        {breedte !== null && (
          <View style={styles.banner}>
            <BannerAd
              unitId={eenheid}
              size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
              width={breedte}
              maxHeight={MAX_HOOGTE[plek]}
              // Personalised only with consent and, on iPhone, "Allow" for tracking.
              requestOptions={{ requestNonPersonalizedAdsOnly: !gepersonaliseerd }}
              onAdLoaded={() => setStand('ok')}
              onAdFailedToLoad={() => setStand('mislukt')}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  buiten: { marginBottom: 8 },
  // Height 0 and invisible while loading; the banner still gets its width.
  verborgen: { height: 0, opacity: 0, marginBottom: 0, overflow: 'hidden' },
  kaart: { paddingBottom: 8 },
  kopRij: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 12, paddingRight: 4,
  },
  label: { ...T.klein, color: C.textSecondary, fontWeight: F.weightSemibold },
  // Text button with a touch area of at least 44.
  weg: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 22 },
  wegTekst: { ...T.klein, color: C.accentTekst, fontWeight: F.weightSemibold },
  banner: { alignItems: 'center' },
});
