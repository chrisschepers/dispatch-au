/**
 * Een klein kaartje met een afgelegd spoor: de tocht van een vaartuig of de
 * vlucht van een toestel, met een punt waar hij begon en een stip waar hij
 * eindigde of nu is. Vast beeld, zoals MiniKaart: het zit in een blad dat je
 * sleept, en een kaart die meeschuift vangt dat gebaar weg.
 *
 * Alle punten komen uit parseSpoor (spoor.ts) en zijn dus geldige getallen;
 * hier wordt nog één keer gefilterd, zodat de kaart ook bij een aanroep van
 * elders nooit een ongeldige coördinaat krijgt.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { kaartStijlVoor, appleKaartVoor } from '../kaartstijl';
import { useThema } from '../thema';
import { KAART_BESCHIKBAAR } from '../kaartBeschikbaar';
import { plekVan, spoorRegio, type Plek } from '../spoor';

export function SpoorKaart({ spoor, kleur, hoogte = 170, label }: {
  spoor: readonly Plek[];
  kleur: string;
  hoogte?: number;
  /** Voor de schermlezer: wat dit kaartje toont. */
  label: string;
}) {
  const C = useThema();
  const punten = React.useMemo(
    () => spoor
      .map((p) => plekVan(p.lat, p.lon))
      .filter((p): p is Plek => p != null)
      .map((p) => ({ latitude: p.lat, longitude: p.lon })),
    [spoor],
  );
  const regio = React.useMemo(() => spoorRegio(spoor), [spoor]);
  // Android zonder Maps-sleutel: geen kaart, want die crasht (zie kaartBeschikbaar).
  if (!KAART_BESCHIKBAAR || !regio || punten.length === 0) return null;
  const begin = punten[0]!;
  const eind = punten[punten.length - 1]!;
  return (
    <View
      style={[styles.vak, { height: hoogte, backgroundColor: C.chipBg }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <MapView
        // Een ander spoor = een nieuw beeld: initialRegion geldt alleen bij het opbouwen.
        key={`${punten.length}:${begin.latitude}:${begin.longitude}:${eind.latitude}:${eind.longitude}`}
        style={StyleSheet.absoluteFill}
        initialRegion={regio}
        scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}
        toolbarEnabled={false}
        pointerEvents="none"
        customMapStyle={kaartStijlVoor(C.donker)}
        {...appleKaartVoor(C.donker)}
      >
        {punten.length >= 2 ? (
          <>
            {/* Witte rand onder de lijn: leesbaar op water, land en in het donker. */}
            <Polyline coordinates={punten} strokeColor="#ffffff" strokeWidth={6} lineCap="round" lineJoin="round" zIndex={1} />
            <Polyline coordinates={punten} strokeColor={kleur} strokeWidth={3} lineCap="round" lineJoin="round" zIndex={2} />
            <Marker coordinate={begin} anchor={{ x: 0.5, y: 0.5 }} zIndex={3}>
              <View style={[styles.begin, { borderColor: kleur }]} />
            </Marker>
          </>
        ) : null}
        <Marker coordinate={eind} anchor={{ x: 0.5, y: 0.5 }} zIndex={4}>
          <View style={[styles.eind, { backgroundColor: kleur }]} />
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  vak: { borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden' },
  begin: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, backgroundColor: '#fff' },
  eind: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#fff' },
});
