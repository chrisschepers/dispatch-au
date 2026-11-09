/**
 * Eén toestel op de kaart: een gekleurd rondje per laag (vliegtuigData.ts)
 * met een vliegtuig of helikopter in bovenaanzicht, neus in de vliegrichting.
 * Zelfde vorm als de heli's in de grote app, zodat wie beide kent het meteen
 * herkent.
 *
 * Geen vloeiend doorvliegen zoals daar: de posities zijn hier tot drie
 * minuten oud (de backend vraagt zo vaak op), en vooruit rekenen over drie
 * minuten zet een helikopter die gaat hangen kilometers verkeerd. Zonder
 * signaal (STIL_NA_MIN) wordt het rondje gedempt: laatst bekende plek.
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Ellipse, Line, Path, Rect } from 'react-native-svg';
import { opKleur } from '../kleur';
import {
  GROEP_VAN_ROL, LUCHT_GROEPEN, rolTekst, hoogteTekst, type Vliegtuig,
} from '../vliegtuigData';

const KLEUR = Object.fromEntries(LUCHT_GROEPEN.map((g) => [g.key, g.kleur])) as Record<string, string>;

export function kleurVan(v: Pick<Vliegtuig, 'role'>): string {
  return KLEUR[GROEP_VAN_ROL[v.role]] ?? '#E85A16';
}

// Bovenaanzicht, neus omhoog: draait met de koers mee.
export function HeliIcoon({ size, kleur }: { size: number; kleur: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="4" y1="4.5" x2="20" y2="15.5" stroke={kleur} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1="20" y1="4.5" x2="4" y2="15.5" stroke={kleur} strokeWidth={1.7} strokeLinecap="round" />
      <Ellipse cx="12" cy="10" rx="3.2" ry="4.6" fill={kleur} />
      <Rect x="11.2" y="13" width="1.6" height="8" rx="0.8" fill={kleur} />
      <Line x1="9.4" y1="20.6" x2="14.6" y2="20.6" stroke={kleur} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// Vliegtuig in bovenaanzicht, neus omhoog.
export function VliegtuigIcoon({ size, kleur }: { size: number; kleur: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.5c.8 0 1.3.7 1.3 1.6V9l7.2 3.6v1.9l-7.2-2v4.9l2.2 1.7v1.6L12 19.9l-3.5.8v-1.6l2.2-1.7v-4.9l-7.2 2v-1.9L10.7 9V4.1c0-.9.5-1.6 1.3-1.6z"
        fill={kleur}
      />
    </Svg>
  );
}

/** Rondje met het toestel erin; ook gebruikt in het blad van het toestel. */
export function ToestelRondje({ v, maat = 32, stil = false, draai = true }: {
  v: Pick<Vliegtuig, 'role' | 'rotor' | 'track'>;
  maat?: number;
  stil?: boolean;
  /** Op de kaart draait Android de marker zelf; iOS draait het rondje. */
  draai?: boolean;
}) {
  const kleur = kleurVan(v);
  // Wit of bijna-zwart, wat het best leest op de laagkleur (amber haalt met wit maar 2:1).
  const glyph = opKleur(kleur);
  const icoon = Math.round(maat * 0.69);
  return (
    <View
      style={[
        styles.rondje,
        { backgroundColor: kleur, width: maat, height: maat, borderRadius: maat / 2 },
        stil && styles.stil,
        draai && v.track != null ? { transform: [{ rotate: `${v.track}deg` }] } : null,
      ]}
    >
      {v.rotor ? <HeliIcoon size={icoon} kleur={glyph} /> : <VliegtuigIcoon size={icoon} kleur={glyph} />}
    </View>
  );
}

function VliegtuigMarkerInner({ v, stil, tracksViewChanges, onPress }: {
  v: Vliegtuig;
  /** Geen recente positie (zonderSignaal); de kaart rekent dat uit bij elke verversing. */
  stil: boolean;
  tracksViewChanges: boolean;
  onPress: (v: Vliegtuig) => void;
}) {
  const android = Platform.OS === 'android';
  const hoogte = hoogteTekst(v);
  return (
    <Marker
      coordinate={{ latitude: v.lat, longitude: v.lon }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      // Boven de meldingen: een toestel boven een brand hoort niet onder de
      // pin van die brand te verdwijnen.
      zIndex={7}
      // Android (Google Maps) draait de marker native, zonder het plaatje
      // opnieuw te tekenen; flat = koers blijft kloppen als de kaart draait.
      {...(android && v.track != null ? { rotation: v.track, flat: true } : {})}
      accessibilityRole="button"
      accessibilityLabel={[v.callsign, rolTekst(v), hoogte, stil ? 'no recent signal' : null].filter(Boolean).join(', ')}
      accessibilityHint="Shows this aircraft"
      onPress={(e) => { e.stopPropagation(); onPress(v); }}
    >
      {/* 44 × 44 tikvlak (HIG) om het rondje. */}
      <View collapsable={false} style={styles.tikvlak}>
        <ToestelRondje v={v} stil={stil} draai={!android} />
      </View>
    </Marker>
  );
}

/** Alleen opnieuw tekenen als er voor dit toestel iets veranderde. */
export const VliegtuigMarker = React.memo(VliegtuigMarkerInner, (a, b) =>
  a.tracksViewChanges === b.tracksViewChanges && a.stil === b.stil
  && a.onPress === b.onPress
  && a.v.lat === b.v.lat && a.v.lon === b.v.lon && a.v.track === b.v.track
  && a.v.seenAt === b.v.seenAt && a.v.role === b.v.role);

const styles = StyleSheet.create({
  tikvlak: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rondje: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.35)',
  },
  // Laatst bekende plek, geen live signaal.
  stil: { opacity: 0.55 },
});
