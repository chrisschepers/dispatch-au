/**
 * Eén vaartuig op de kaart (13-11-2026). Bewust een andere vorm dan de
 * rondjes van de toestellen en de pins van de meldingen: een romp in
 * bovenaanzicht in de kleur van zijn laag (vaartuigData.ts), boeg in de
 * vaarrichting. Ligt hij stil, dan een rustig rondje met een anker; is hij
 * al een half uur niet gehoord (`stale`), dan gedempt: laatst bekende plek.
 *
 * De romp heeft een witte rand met een donkere lijn eromheen, zodat hij op
 * de lichte kaart, de donkere kaart en de satellietfoto (donkerblauw water)
 * leesbaar blijft, welke laagkleur hij ook heeft.
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { mdiAnchor } from '@mdi/js';
import { opKleur } from '../kleur';
import { koersVan, waterLaag, type Vaartuig } from '../vaartuigData';

// Romp in bovenaanzicht, boeg omhoog; het vlakje is het stuurhuis.
const ROMP = 'M12 1.8C15.4 6 17 10.2 17 14.6V19.6a2.2 2.2 0 0 1-2.2 2.2H9.2A2.2 2.2 0 0 1 7 19.6V14.6C7 10.2 8.6 6 12 1.8Z';
const STUURHUIS = 'M9.6 13.2h4.8v4.6H9.6z';

/** De romp zelf, boeg omhoog; ook gebruikt in het blad van het vaartuig. */
export function RompIcoon({ maat, kleur }: { maat: number; kleur: string }) {
  return (
    <Svg width={maat} height={maat} viewBox="0 0 24 24">
      <Path d={ROMP} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={3.6} strokeLinejoin="round" />
      <Path d={ROMP} fill={kleur} stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
      <Path d={STUURHUIS} fill={opKleur(kleur)} opacity={0.9} />
    </Svg>
  );
}

/** Stilliggend: een rondje in de laagkleur met een anker. */
export function AnkerRondje({ maat, kleur }: { maat: number; kleur: string }) {
  return (
    <View style={[styles.rondje, { width: maat, height: maat, borderRadius: maat / 2, backgroundColor: kleur }]}>
      <Svg width={Math.round(maat * 0.62)} height={Math.round(maat * 0.62)} viewBox="0 0 24 24">
        <Path d={mdiAnchor} fill={opKleur(kleur)} />
      </Svg>
    </View>
  );
}

/** Het teken van een vaartuig: varend een romp, stil een anker. */
export function VaartuigTeken({ v, maat = 32, draai = true }: {
  v: Pick<Vaartuig, 'soort' | 'moving' | 'course' | 'heading' | 'stale'>;
  maat?: number;
  /** Op de kaart draait Android de marker zelf; iOS draait het teken. */
  draai?: boolean;
}) {
  const kleur = waterLaag(v.soort).kleur;
  const koers = koersVan(v);
  if (!v.moving) {
    return (
      <View style={v.stale ? styles.stil : null}>
        <AnkerRondje maat={Math.round(maat * 0.75)} kleur={kleur} />
      </View>
    );
  }
  return (
    <View style={[v.stale && styles.stil, draai && koers != null ? { transform: [{ rotate: `${koers}deg` }] } : null]}>
      <RompIcoon maat={maat} kleur={kleur} />
    </View>
  );
}

function VaartuigMarkerInner({ v, tracksViewChanges, onPress }: {
  v: Vaartuig;
  tracksViewChanges: boolean;
  onPress: (v: Vaartuig) => void;
}) {
  const android = Platform.OS === 'android';
  const koers = koersVan(v);
  const laag = waterLaag(v.soort);
  return (
    <Marker
      // v.lat en v.lon zijn in parseVaartBeeld al tot geldige getallen gemaakt.
      coordinate={{ latitude: v.lat, longitude: v.lon }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      // Onder de toestellen (7), boven de meldingen; stilliggers onderop.
      zIndex={v.moving ? 6 : 4}
      {...(android && koers != null ? { rotation: koers, flat: true } : {})}
      accessibilityRole="button"
      accessibilityLabel={[
        v.name, laag.enkel, v.moving ? 'under way' : 'not moving', v.stale ? 'last known position' : null,
      ].filter(Boolean).join(', ')}
      accessibilityHint="Shows this vessel"
      onPress={(e) => { e.stopPropagation(); onPress(v); }}
    >
      {/* 44 × 44 tikvlak (HIG) om het teken. */}
      <View collapsable={false} style={styles.tikvlak}>
        <VaartuigTeken v={v} maat={30} draai={!android} />
      </View>
    </Marker>
  );
}

/** Alleen opnieuw tekenen als er voor dit vaartuig iets veranderde. */
export const VaartuigMarker = React.memo(VaartuigMarkerInner, (a, b) =>
  a.tracksViewChanges === b.tracksViewChanges && a.onPress === b.onPress
  && a.v.lat === b.v.lat && a.v.lon === b.v.lon && a.v.moving === b.v.moving
  && a.v.course === b.v.course && a.v.heading === b.v.heading
  && a.v.stale === b.v.stale && a.v.soort === b.v.soort);

const styles = StyleSheet.create({
  tikvlak: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rondje: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.35)',
  },
  // Laatst bekende plek, al een half uur niet gehoord.
  stil: { opacity: 0.55 },
});
