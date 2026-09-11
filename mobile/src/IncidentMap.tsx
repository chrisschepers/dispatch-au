import { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Circle, Polygon } from "react-native-maps";
import Constants from "expo-constants";
import type { Incident } from "./domain/incidents";
import type { Place } from "./domain/places";
import { polygons } from "./geometry";
import { rowColor, type Colours } from "./theme";
const victoria = {
  latitude: -37.2,
  longitude: 145,
  latitudeDelta: 6,
  longitudeDelta: 6,
};
export default function IncidentMap({
  rows,
  warnings,
  place,
  focus,
  onSelect,
  colors,
  dark,
}: {
  rows: Incident[];
  warnings: Incident[];
  place: Place | null;
  focus?: [number, number] | null;
  onSelect: (row: Incident) => void;
  colors: Colours;
  dark: boolean;
}) {
  const ref = useRef<MapView>(null);
  const region = focus
    ? {
        latitude: focus[0],
        longitude: focus[1],
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : place
      ? {
          latitude: place.lat,
          longitude: place.lng,
          latitudeDelta: Math.max(0.03, place.radius / 45),
          longitudeDelta: Math.max(0.03, place.radius / 36),
        }
      : victoria;
  useEffect(() => {
    ref.current?.animateToRegion(region, 300);
  }, [place?.lat, place?.lng, place?.radius, focus?.[0], focus?.[1]]);
  const available =
    Platform.OS === "ios" ||
    Constants.executionEnvironment === "storeClient" ||
    Constants.expoConfig?.extra?.androidMapsConfigured === true;
  if (!available)
    return (
      <View style={s.unavailable}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          Map setup pending
        </Text>
        <Text
          style={{
            color: colors.secondary,
            textAlign: "center",
            marginTop: 12,
          }}
        >
          This Android build needs its map configuration. All incidents are
          available in the List tab.
        </Text>
      </View>
    );
  return (
    <View style={s.wrap}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle={dark ? "dark" : "light"}
        onMapReady={() => ref.current?.animateToRegion(region, 0)}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {warnings.flatMap((row) =>
          polygons(row.geometry).map((p, index) => (
            <Polygon
              key={`${row.id}:${index}`}
              coordinates={p.coordinates}
              holes={p.holes}
              strokeColor={rowColor(row)}
              fillColor={rowColor(row) + "24"}
              strokeWidth={2}
              tappable
              onPress={() => onSelect(row)}
            />
          )),
        )}
        {[...rows, ...warnings]
          .filter((row) => row.point)
          .map((row) => (
            <Marker
              key={row.id}
              coordinate={{ latitude: row.point![0], longitude: row.point![1] }}
              pinColor={rowColor(row)}
              title={row.title}
              description={row.location}
              onPress={() => onSelect(row)}
            />
          ))}
        {place && (
          <Circle
            center={{ latitude: place.lat, longitude: place.lng }}
            radius={place.radius * 1000}
            strokeColor="#697a91"
            fillColor="#697a9114"
            strokeWidth={1}
          />
        )}
      </MapView>
      <View
        pointerEvents="none"
        style={[s.caption, { backgroundColor: colors.card }]}
      >
        <Text style={{ color: colors.secondary, fontSize: 11 }}>
          Reported locations are approximate. Pins do not show affected areas.
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, minHeight: 250 },
  unavailable: {
    flex: 1,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 112,
    padding: 10,
    borderRadius: 10,
  },
});
