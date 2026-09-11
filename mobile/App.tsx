import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import { useDispatch } from "./src/useDispatch";
import {
  filterIncidents,
  type Incident,
  type Category,
} from "./src/domain/incidents";
import { suggestedPlaces, type Place } from "./src/domain/places";
import {
  light,
  dark,
  categories,
  categoryIcons,
  categoryColors,
  rowColor,
  localTime,
  dayLabel,
  type Colours,
} from "./src/theme";
import IncidentMap from "./src/IncidentMap";

type Tab = "nearby" | "map" | "settings";
type Panel = "area" | "about" | null;
type Icon = React.ComponentProps<typeof Ionicons>["name"];
const tabs: { id: Tab; label: string; icon: Icon; activeIcon: Icon }[] = [
  {
    id: "nearby",
    label: "Nearby",
    icon: "location-outline",
    activeIcon: "location",
  },
  { id: "map", label: "Map", icon: "map-outline", activeIcon: "map" },
  {
    id: "settings",
    label: "Settings",
    icon: "settings-outline",
    activeIcon: "settings",
  },
];

function SettingRow({
  title,
  value,
  icon,
  onPress,
  colors,
}: {
  title: string;
  value?: string;
  icon: Icon;
  onPress: () => void;
  colors: Colours;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.settingRow, { borderBottomColor: colors.line }]}
    >
      <Ionicons name={icon} size={20} color={colors.secondary} />
      <Text style={[s.settingTitle, { color: colors.text }]}>{title}</Text>
      {value && (
        <Text
          numberOfLines={1}
          style={[s.settingValue, { color: colors.secondary }]}
        >
          {value}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={15} color={colors.secondary} />
    </Pressable>
  );
}
function AppContent() {
  const data = useDispatch();
  const insets = useSafeAreaInsets();
  const system = useColorScheme();
  const isDark =
    data.prefs.theme === "dark" ||
    (data.prefs.theme === "system" && system === "dark");
  const c = isDark ? dark : light;
  const [tab, setTab] = useState<Tab>("nearby");
  const [category, setCategory] = useState<Category | "all">("all");
  const [responding, setResponding] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [mapFocus, setMapFocus] = useState<[number, number] | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const place = data.prefs.active;
  const rows = useMemo(
    () =>
      filterIncidents(data.feed?.incidents ?? [], {
        query: "",
        category,
        includePlanned: data.prefs.includePlanned || category === "planned",
        respondingOnly: responding,
        centre: place ? [place.lat, place.lng] : null,
        radius: place?.radius ?? 25,
      }),
    [data.feed, category, data.prefs.includePlanned, responding, place],
  );
  const warnings = data.feed?.warnings ?? [];
  const current = selected
    ? ([...warnings, ...(data.feed?.incidents ?? [])].find(
        (r) => r.id === selected.id,
      ) ?? selected)
    : null;
  const removed =
    !!selected &&
    !!data.feed &&
    ![...warnings, ...data.feed.incidents].some((r) => r.id === selected.id);
  const choices = useMemo(() => {
    const options = [...suggestedPlaces];
    for (const row of data.feed?.incidents ?? []) {
      if (row.point && !options.some((p) => p.name === row.location))
        options.push({
          id: row.id,
          name: row.location,
          lat: row.point[0],
          lng: row.point[1],
          radius: 25,
        });
    }
    return options
      .filter((p) =>
        p.name.toLowerCase().includes(placeQuery.trim().toLowerCase()),
      )
      .slice(0, 30);
  }, [data.feed, placeQuery]);
  const bottom = insets.bottom + 88;
  const areaLabel = place
    ? `${place.name} · ${place.radius} km`
    : "All Victoria";
  const close = () => {
    setSelected(null);
    setPanel(null);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selected || panel) {
        close();
        return true;
      }
      if (tab !== "nearby") {
        setTab("nearby");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selected, panel, tab]);
  function choose(next: Place | null) {
    data.setPrefs((old) => ({ ...old, active: next }));
    setPanel(null);
    setPlaceQuery("");
    setMapFocus(null);
  }
  async function openUrl(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open link", "Please try again.");
    }
  }
  async function locate() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Location unavailable",
          "Choose a place or allow location in your device settings.",
        );
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const position = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Location timeout")), 20000);
        }),
      ]).finally(() => clearTimeout(timer));
      choose({
        id: "my-location",
        name: "My location",
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        radius: place?.radius ?? 25,
      });
    } catch {
      Alert.alert("Location unavailable", "Please choose a place manually.");
    } finally {
      setLocating(false);
    }
  }
  const section = (title: string) => (
    <Text style={[s.section, { color: c.secondary }]}>{title}</Text>
  );
  const areaButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose area: ${areaLabel}`}
      onPress={() => setPanel("area")}
      style={s.area}
    >
      <Ionicons name="location-outline" size={15} color={c.secondary} />
      <Text numberOfLines={1} style={[s.areaLabel, { color: c.secondary }]}>
        {areaLabel}
      </Text>
      <Ionicons name="chevron-down" size={12} color={c.secondary} />
    </Pressable>
  );
  const filters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.chipScroll}
      contentContainerStyle={s.chips}
    >
      {categories.map((item) => {
        const color = item.id === "all" ? c.accent : categoryColors[item.id];
        const active = category === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setCategory(item.id)}
            style={[
              s.chip,
              {
                backgroundColor: active ? color + "12" : c.card,
                borderColor: active ? color : c.line,
              },
            ]}
          >
            {item.id !== "all" && (
              <Ionicons
                name={categoryIcons[item.id]}
                size={15}
                color={active ? color : c.secondary}
              />
            )}
            <Text
              style={{
                fontSize: 13,
                fontWeight: active ? "600" : "400",
                color: active ? color : c.secondary,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  const warningRows = warnings.map((w) => (
    <Pressable
      key={w.id}
      accessibilityRole="button"
      accessibilityLabel={`${w.level}, ${w.action || w.location}, official warning for Victoria`}
      onPress={() => setSelected(w)}
      style={[
        s.warning,
        { backgroundColor: c.card, borderColor: rowColor(w) + "65" },
      ]}
    >
      <Ionicons name="warning-outline" size={20} color={rowColor(w)} />
      <View style={s.grow}>
        <Text style={[s.warningTitle, { color: c.text }]}>
          {w.level}{" "}
          <Text style={{ color: c.secondary, fontWeight: "400" }}>
            · Victoria
          </Text>
        </Text>
        <Text
          numberOfLines={2}
          style={[s.small, { color: c.secondary, marginTop: 2 }]}
        >
          {w.action || w.location}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={c.secondary} />
    </Pressable>
  ));
  const errorNotice = !!data.error && (
    <View style={[s.notice, { backgroundColor: c.card }]}>
      <Text style={[s.small, { color: c.secondary }]}>
        {data.error}
        {data.feed ? " Showing the last successful update." : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void data.refresh()}
        style={s.retry}
      >
        <Text style={{ color: c.accent, fontWeight: "600" }}>Try again</Text>
      </Pressable>
    </View>
  );
  if (!data.ready)
    return (
      <View style={[s.root, s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
        <Text style={[s.small, { color: c.secondary, marginTop: 12 }]}>
          Opening Dispatch…
        </Text>
      </View>
    );
  return (
    <SafeAreaView
      style={[s.root, { backgroundColor: c.background }]}
      edges={["top", "left", "right"]}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      {tab === "nearby" && (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[s.list, { paddingBottom: bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={data.loading}
              onRefresh={() => void data.refresh()}
              tintColor={c.secondary}
              colors={[c.accent]}
            />
          }
          ListHeaderComponent={
            <>
              {areaButton}
              {filters}
              {data.stale && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.small, { color: c.accent, marginBottom: 10 }]}
                >
                  Updates delayed · Check VicEmergency for current advice
                </Text>
              )}
              {warningRows}
              {errorNotice}
            </>
          }
          renderItem={({ item, index }) => (
            <>
              {(index === 0 ||
                dayLabel(item.updated, data.now) !==
                  dayLabel(rows[index - 1].updated, data.now)) &&
                section(dayLabel(item.updated, data.now))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.location}, ${item.status}, ${localTime(item.updated)}`}
                onPress={() => setSelected(item)}
                style={({ pressed }) => [
                  s.incident,
                  {
                    backgroundColor: c.card,
                    borderColor: c.line,
                    opacity: pressed ? 0.65 : 1,
                  },
                ]}
              >
                <View style={[s.stripe, { backgroundColor: rowColor(item) }]} />
                <View style={s.incidentIcon}>
                  <Ionicons
                    name={categoryIcons[item.category]}
                    size={22}
                    color={rowColor(item)}
                  />
                </View>
                <View style={s.incidentBody}>
                  <Text
                    numberOfLines={2}
                    style={[s.rowTitle, { color: c.text }]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[s.small, { color: c.secondary, marginTop: 3 }]}
                  >
                    {item.location}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[s.small, { color: c.secondary }]}
                  >
                    {item.status}
                  </Text>
                </View>
                <View style={s.timeColumn}>
                  <Text style={[s.time, { color: c.text }]}>
                    {item.updated ? localTime(item.updated) : "—"}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={c.secondary}
                  />
                </View>
              </Pressable>
            </>
          )}
          ListEmptyComponent={
            <View style={[s.empty, { backgroundColor: c.card }]}>
              {data.loading && <ActivityIndicator color={c.secondary} />}
              <Text style={[s.rowTitle, { color: c.text, marginTop: 8 }]}>
                {data.loading
                  ? "Loading incidents…"
                  : data.feed
                    ? "No incidents in this view"
                    : "Incidents unavailable"}
              </Text>
              <Text
                style={[s.body, { color: c.secondary, textAlign: "center" }]}
              >
                {data.feed
                  ? "Choose another area or category. An empty list is not an all-clear."
                  : "Pull down to try again."}
              </Text>
            </View>
          }
          ListFooterComponent={
            <Text style={[s.feedFoot, { color: c.secondary }]}>
              {data.feed
                ? `Updated ${localTime(data.feed.fetchedAt)} · Melbourne time\n`
                : ""}
              VicEmergency
            </Text>
          }
        />
      )}
      {tab === "map" && (
        <View style={s.root}>
          <View style={s.mapHeading}>{areaButton}</View>
          <IncidentMap
            rows={rows}
            warnings={warnings}
            place={place}
            focus={mapFocus}
            onSelect={setSelected}
            colors={c}
            dark={isDark}
          />
          {(warnings.length > 0 ||
            data.error ||
            data.stale ||
            category !== "all" ||
            responding) && (
            <View style={s.mapNotices}>
              {warnings.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setTab("nearby")}
                  style={[s.mapNotice, { backgroundColor: c.card }]}
                >
                  <Ionicons name="warning-outline" size={18} color="#a8810b" />
                  <Text style={[s.small, { color: c.text, flex: 1 }]}>
                    {warnings.length} official{" "}
                    {warnings.length === 1 ? "warning" : "warnings"} · Victoria
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={c.secondary}
                  />
                </Pressable>
              )}
              {(data.error || data.stale) && (
                <Text
                  style={[
                    s.mapNotice,
                    s.small,
                    { color: c.accent, backgroundColor: c.card },
                  ]}
                >
                  Updates unavailable · Check VicEmergency
                </Text>
              )}
              {(category !== "all" || responding) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show all incident categories"
                  onPress={() => {
                    setCategory("all");
                    setResponding(false);
                  }}
                  style={[s.mapNotice, { backgroundColor: c.card }]}
                >
                  <Text style={[s.small, { color: c.secondary }]}>
                    Filtered view · Show all
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
      {tab === "settings" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.list, { paddingBottom: bottom }]}
        >
          <Text style={[s.pageTitle, { color: c.text }]}>Settings</Text>
          {section("Your area")}
          <View style={[s.group, { backgroundColor: c.card }]}>
            <SettingRow
              title="Location"
              value={place?.name ?? "All Victoria"}
              icon="location-outline"
              onPress={() => setPanel("area")}
              colors={c}
            />
            {place && (
              <View style={s.radiusSection}>
                <Text
                  style={[s.small, { color: c.secondary, marginBottom: 10 }]}
                >
                  Radius
                </Text>
                <View style={s.segments}>
                  {[5, 10, 25, 50, 100].map((radius) => (
                    <Pressable
                      key={radius}
                      accessibilityRole="radio"
                      accessibilityLabel={`${radius} kilometres`}
                      accessibilityState={{ checked: place.radius === radius }}
                      onPress={() =>
                        data.setPrefs((old) => ({
                          ...old,
                          active: old.active ? { ...old.active, radius } : null,
                        }))
                      }
                      style={[
                        s.segment,
                        {
                          backgroundColor:
                            place.radius === radius ? c.tint : c.field,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            place.radius === radius ? c.accent : c.secondary,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {radius} km
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
          {section("Incidents")}
          <View style={[s.group, { backgroundColor: c.card }]}>
            <View style={[s.settingRow, { borderBottomColor: c.line }]}>
              <Text style={[s.settingTitle, { color: c.text }]}>
                Planned burns
              </Text>
              <Switch
                accessibilityLabel="Include planned burns"
                value={data.prefs.includePlanned}
                onValueChange={(includePlanned) =>
                  data.setPrefs((old) => ({ ...old, includePlanned }))
                }
                trackColor={{ true: c.accent }}
              />
            </View>
            <View style={[s.settingRow, { borderBottomColor: c.line }]}>
              <Text style={[s.settingTitle, { color: c.text }]}>
                Operational incidents only
              </Text>
              <Switch
                accessibilityLabel="Operational incidents only"
                value={responding}
                onValueChange={setResponding}
                trackColor={{ true: c.accent }}
              />
            </View>
          </View>
          {section("Appearance")}
          <View style={[s.group, s.appearance, { backgroundColor: c.card }]}>
            <View style={s.segments}>
              {(["system", "light", "dark"] as const).map((theme) => (
                <Pressable
                  key={theme}
                  accessibilityRole="radio"
                  accessibilityLabel={`${theme} appearance`}
                  accessibilityState={{ checked: data.prefs.theme === theme }}
                  onPress={() => data.setPrefs((old) => ({ ...old, theme }))}
                  style={[
                    s.segment,
                    {
                      backgroundColor:
                        data.prefs.theme === theme ? c.tint : c.field,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        data.prefs.theme === theme ? c.accent : c.secondary,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {theme[0].toUpperCase() + theme.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {section("Information")}
          <View style={[s.group, { backgroundColor: c.card }]}>
            <SettingRow
              title="VicEmergency"
              icon="open-outline"
              onPress={() =>
                void openUrl("https://emergency.vic.gov.au/respond/")
              }
              colors={c}
            />
            <SettingRow
              title="About Dispatch"
              icon="information-circle-outline"
              onPress={() => setPanel("about")}
              colors={c}
            />
          </View>
          <Text style={[s.settingsFoot, { color: c.secondary }]}>
            Dispatch {Constants.expoConfig?.version}
            {"\n"}In an emergency, call 000.
          </Text>
        </ScrollView>
      )}
      {!!data.storageError && (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            s.storageError,
            { bottom, color: c.accent, backgroundColor: c.card },
          ]}
        >
          {data.storageError}
        </Text>
      )}
      <View
        pointerEvents="box-none"
        style={[s.tabDock, { bottom: Math.max(insets.bottom, 12) }]}
      >
        <View
          style={[s.tabbar, { backgroundColor: c.card, borderColor: c.line }]}
        >
          {tabs.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => setTab(t.id)}
              style={[s.tab, tab === t.id && { backgroundColor: c.tint }]}
            >
              <Ionicons
                name={tab === t.id ? t.activeIcon : t.icon}
                size={21}
                color={tab === t.id ? c.accent : c.secondary}
              />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  s.tabLabel,
                  { color: tab === t.id ? c.accent : c.secondary },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Modal
        visible={!!current || !!panel}
        onRequestClose={close}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: c.line }]}>
            <Text style={[s.rowTitle, { color: c.text }]}>
              {current
                ? "Incident details"
                : panel === "area"
                  ? "Your area"
                  : "About Dispatch"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              style={s.close}
            >
              <Ionicons name="close" size={23} color={c.secondary} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[s.list, { paddingBottom: 32 }]}
          >
            {panel === "area" && (
              <>
                <View style={[s.search, { backgroundColor: c.field }]}>
                  <Ionicons
                    name="search-outline"
                    size={19}
                    color={c.secondary}
                  />
                  <TextInput
                    accessibilityLabel="Search places"
                    value={placeQuery}
                    onChangeText={setPlaceQuery}
                    placeholder="Search Victoria"
                    placeholderTextColor={c.secondary}
                    autoCorrect={false}
                    style={[s.input, { color: c.text }]}
                  />
                </View>
                <View style={[s.group, { backgroundColor: c.card }]}>
                  <SettingRow
                    title="All Victoria"
                    icon="globe-outline"
                    onPress={() => choose(null)}
                    colors={c}
                  />
                  <SettingRow
                    title={locating ? "Finding location…" : "Use my location"}
                    icon="locate-outline"
                    onPress={() => {
                      if (!locating) void locate();
                    }}
                    colors={c}
                  />
                </View>
                {section("Places")}
                <View style={[s.group, { backgroundColor: c.card }]}>
                  {choices.map((p) => (
                    <SettingRow
                      key={p.id}
                      title={p.name}
                      icon="location-outline"
                      onPress={() =>
                        choose({ ...p, radius: place?.radius ?? p.radius })
                      }
                      colors={c}
                    />
                  ))}
                </View>
                {!choices.length && (
                  <Text style={[s.body, { color: c.secondary }]}>
                    No matching places. Try a nearby suburb.
                  </Text>
                )}
              </>
            )}
            {panel === "about" && (
              <>
                <Text style={[s.pageTitle, { color: c.text }]}>Dispatch</Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Public fire, rescue and SES incidents in Victoria, sourced
                  from VicEmergency. Independent of the emergency services.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Updates refresh while the app is open. Background alerts are
                  not available. Always follow official advice and call 000 in
                  an emergency.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Your area and appearance stay on this device. Location is only
                  requested when you choose Use my location. No background
                  location tracking.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Locations are approximate. Pins do not show affected areas.
                  Times use Melbourne time. This is a preview; source reuse
                  conditions are being confirmed before a paid launch.
                </Text>
                <SettingRow
                  title="Official emergency advice"
                  icon="open-outline"
                  onPress={() =>
                    void openUrl("https://emergency.vic.gov.au/respond/")
                  }
                  colors={c}
                />
              </>
            )}
            {current && (
              <>
                <View
                  style={[
                    s.detailIcon,
                    { backgroundColor: rowColor(current) + "15" },
                  ]}
                >
                  <Ionicons
                    name={
                      current.kind === "warning"
                        ? "warning-outline"
                        : categoryIcons[current.category]
                    }
                    size={30}
                    color={rowColor(current)}
                  />
                </View>
                <Text style={[s.detailTitle, { color: c.text }]}>
                  {current.title}
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  {current.location}
                </Text>
                {(removed || data.stale) && (
                  <Text
                    style={[
                      s.notice,
                      { color: c.accent, backgroundColor: c.card },
                    ]}
                  >
                    {removed
                      ? "This record is no longer in the feed. This does not confirm it is resolved."
                      : "Updates delayed. Check the official source."}
                  </Text>
                )}
                {!!current.action && (
                  <Text style={[s.body, { color: c.text }]}>
                    {current.action}
                  </Text>
                )}
                <View style={[s.group, { backgroundColor: c.card }]}>
                  {[
                    ["Status", current.status],
                    ["Agency", current.agency],
                    ["Updated", localTime(current.updated, true)],
                    ["Reported", localTime(current.created, true)],
                    [
                      "Resources",
                      current.resources === null
                        ? "Not supplied"
                        : String(current.resources),
                    ],
                    ["Reference", current.sourceId],
                  ].map(([label, value]) => (
                    <View
                      key={label}
                      style={[s.settingRow, { borderBottomColor: c.line }]}
                    >
                      <Text style={[s.small, { color: c.secondary, flex: 1 }]}>
                        {label}
                      </Text>
                      <Text
                        selectable
                        style={[
                          s.small,
                          { color: c.text, flex: 2, textAlign: "right" },
                        ]}
                      >
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[s.detailFoot, { color: c.secondary }]}>
                  Melbourne time · Reported locations are approximate.
                </Text>
                <View style={[s.group, { backgroundColor: c.card }]}>
                  <SettingRow
                    title="Official advice"
                    icon="open-outline"
                    onPress={() => void openUrl(current.officialUrl)}
                    colors={c}
                  />
                  {current.point && (
                    <SettingRow
                      title="Show on map"
                      icon="map-outline"
                      onPress={() => {
                        setMapFocus(current.point);
                        setSelected(null);
                        setTab("map");
                      }}
                      colors={c}
                    />
                  )}
                  <SettingRow
                    title="Share incident"
                    icon="share-outline"
                    onPress={() =>
                      void Share.share({
                        message: `${current.title} · ${current.location}\n${current.status}\nUpdated ${localTime(current.updated, true)} (Melbourne time)\n${current.officialUrl}`,
                      }).catch(() =>
                        Alert.alert("Could not share", "Please try again."),
                      )
                    }
                    colors={c}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
  grow: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16 },
  area: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 4,
  },
  areaLabel: { fontSize: 13, flexShrink: 1 },
  chipScroll: { flexGrow: 0, marginBottom: 12 },
  chips: { gap: 7, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  section: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  incident: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingRight: 12,
  },
  stripe: { width: 4, alignSelf: "stretch" },
  incidentIcon: { width: 43, alignItems: "center" },
  incidentBody: { flex: 1, paddingVertical: 12, paddingRight: 9 },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.1,
    lineHeight: 21,
  },
  small: { fontSize: 13, lineHeight: 18 },
  timeColumn: {
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  time: { fontSize: 12, fontVariant: ["tabular-nums"] },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: 6,
  },
  warningTitle: { fontSize: 13, fontWeight: "600" },
  notice: { padding: 14, borderRadius: 12, marginBottom: 8 },
  retry: { alignSelf: "flex-start", paddingTop: 12, minHeight: 40 },
  empty: { alignItems: "center", padding: 22, marginTop: 16, borderRadius: 12 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 16 },
  feedFoot: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 18,
  },
  mapHeading: { paddingHorizontal: 16 },
  mapNotices: { position: "absolute", top: 58, left: 12, right: 12, gap: 6 },
  mapNotice: {
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageTitle: {
    fontSize: 29,
    fontWeight: "700",
    letterSpacing: -0.6,
    marginTop: 12,
    marginBottom: 4,
  },
  group: { borderRadius: 12, overflow: "hidden" },
  settingRow: {
    minHeight: 51,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingTitle: { fontSize: 15, flex: 1 },
  settingValue: { fontSize: 14, maxWidth: "46%" },
  radiusSection: { padding: 14 },
  segments: { flexDirection: "row", gap: 5 },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  appearance: { padding: 8 },
  settingsFoot: {
    fontSize: 12,
    lineHeight: 20,
    marginTop: 20,
    textAlign: "center",
  },
  tabDock: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  tabbar: {
    flexDirection: "row",
    padding: 5,
    borderRadius: 29,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 78,
    minHeight: 49,
    paddingHorizontal: 15,
    borderRadius: 24,
  },
  tabLabel: { fontSize: 10, fontWeight: "600" },
  storageError: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 10,
    fontSize: 12,
    borderRadius: 10,
  },
  modalHeader: {
    paddingLeft: 20,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 57,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 16 },
  detailIcon: {
    height: 56,
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    marginTop: 22,
    marginBottom: 14,
  },
  detailTitle: { fontSize: 25, fontWeight: "700", letterSpacing: -0.5 },
  detailFoot: { fontSize: 12, lineHeight: 18, marginVertical: 15 },
});
