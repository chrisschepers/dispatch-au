/**
 * Kaartje bij een melding. Apart bestand omdat react-native-maps op het web
 * niet bestaat: Metro pakt daar automatisch MiniKaart.web.tsx, zodat de app
 * in een browser te testen is zonder de kaart aan te raken.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { kaartStijlVoor, appleKaartVoor } from '../kaartstijl';
import { type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { KAART_BESCHIKBAAR } from '../kaartBeschikbaar';

export function MiniKaart({ lat, lon, kleur }: { lat: number; lon: number; kleur: string }) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  // Android zonder Maps-sleutel: geen kaart, want die crasht (zie kaartBeschikbaar).
  if (!KAART_BESCHIKBAAR) {
    return (
      <View style={[styles.kaart, styles.leeg]}>
        <Text style={styles.leegTekst}>Map coming soon on Android</Text>
      </View>
    );
  }
  return (
    <MapView
      style={styles.kaart}
      initialRegion={{ latitude: lat, longitude: lon, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}
      toolbarEnabled={false}
      // Zelfde ondergrond als het kaarttabblad (Android; iOS = Apple Maps).
      customMapStyle={kaartStijlVoor(C.donker)}
      {...appleKaartVoor(C.donker)}
    >
      <Marker coordinate={{ latitude: lat, longitude: lon }} anchor={{ x: 0.5, y: 0.5 }}>
        <View style={[styles.pin, { backgroundColor: kleur }]} />
      </Marker>
    </MapView>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  kaart: { flex: 1 },
  leeg: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.chipBg },
  leegTekst: { fontSize: 13, color: C.textSecondary },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff' },
});
