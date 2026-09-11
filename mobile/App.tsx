import { useMemo, useState, useEffect } from 'react';
import {
  Alert,
  ActivityIndicator,
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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useDispatch } from './src/useDispatch';
import {
  filterIncidents,
  type Incident,
  type Category,
} from './src/domain/incidents';
import { suggestedPlaces, type Place } from './src/domain/places';
import {
  light,
  dark,
  categories,
  categoryIcons,
  rowColor,
  localTime,
  dayLabel,
  type Colours,
} from './src/theme';
import IncidentMap from './src/IncidentMap';

type Tab = 'list' | 'map' | 'places' | 'settings';
type Icon = React.ComponentProps<typeof Ionicons>['name'];
const tabs: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'list', label: 'Incidents', icon: 'list-outline' },
  { id: 'map', label: 'Map', icon: 'map-outline' },
  { id: 'places', label: 'Places', icon: 'location-outline' },
  { id: 'settings', label: 'Settings', icon: 'options-outline' },
];
function Button({
  label,
  onPress,
  colors,
  subtle = false,
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  colors: Colours;
  subtle?: boolean;
  icon?: Icon;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: subtle ? colors.field : colors.accent,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon && (
        <Ionicons name={icon} size={19} color={subtle ? colors.text : '#fff'} />
      )}
      <Text style={[s.buttonText, { color: subtle ? colors.text : '#fff' }]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Chip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: Colours;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        s.chip,
        {
          backgroundColor: active ? colors.accent : colors.card,
          borderColor: active ? colors.accent : colors.line,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? '#fff' : colors.secondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function AppContent() {
  const data = useDispatch();
  const [tab, setTab] = useState<Tab>('list');
  const [query, setQuery] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [responding, setResponding] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [panel, setPanel] = useState<'filters' | 'pro' | 'about' | null>(null);
  const [locating, setLocating] = useState(false);
  const system = useColorScheme();
  const isDark =
    data.prefs.theme === 'dark' ||
    (data.prefs.theme === 'system' && system === 'dark');
  const c = isDark ? dark : light;
  const place = data.prefs.active;
  const rows = useMemo(
    () =>
      filterIncidents(data.feed?.incidents ?? [], {
        query,
        category,
        includePlanned: data.prefs.includePlanned || category === 'planned',
        respondingOnly: responding,
        centre: place ? [place.lat, place.lng] : null,
        radius: place?.radius ?? 25,
      }),
    [data.feed, query, category, data.prefs.includePlanned, responding, place],
  );
  const warnings = data.feed?.warnings ?? [];
  const current = selected
    ? ([...warnings, ...(data.feed?.incidents ?? [])].find(
        (row) => row.id === selected.id,
      ) ?? selected)
    : null;
  const removed =
    selected &&
    data.feed &&
    ![...warnings, ...data.feed.incidents].some(
      (row) => row.id === selected.id,
    );
  const choices = useMemo(() => {
    const options = [...suggestedPlaces];
    for (const row of data.feed?.incidents ?? [])
      if (row.point && !options.some((p) => p.name === row.location))
        options.push({
          id: row.id,
          name: row.location,
          lat: row.point[0],
          lng: row.point[1],
          radius: 25,
        });
    return options
      .filter((p) =>
        p.name.toLowerCase().includes(placeQuery.trim().toLowerCase()),
      )
      .slice(0, 30);
  }, [data.feed, placeQuery]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selected) {
        setSelected(null);
        return true;
      }
      if (panel) {
        setPanel(null);
        return true;
      }
      if (tab !== 'list') {
        setTab('list');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab, selected, panel]);
  const choose = (p: Place | null) => {
    data.setPrefs((old) => ({ ...old, active: p }));
    setTab('list');
    setPlaceQuery('');
  };
  async function openUrl(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', 'Please try again.');
    }
  }
  async function locate() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Location unavailable',
          'Choose a place below, or allow location in your device settings.',
        );
        return;
      }
      let timer: ReturnType<typeof setTimeout>;
      const position = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error('Location timeout')), 20000);
        }),
      ]).finally(() => clearTimeout(timer));
      choose({
        id: 'my-location',
        name: 'My current location',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        radius: 25,
      });
    } catch {
      Alert.alert('Could not find your location', 'Choose a place manually.');
    } finally {
      setLocating(false);
    }
  }
  function savePlace() {
    if (!place) return;
    if (
      data.prefs.saved.length &&
      !data.prefs.saved.some((p) => p.id === place.id)
    ) {
      Alert.alert(
        'One saved place',
        'Remove your saved place to save a different one.',
      );
      return;
    }
    data.setPrefs((old) => ({ ...old, saved: [place] }));
    Alert.alert('Place saved', 'Saved on this device.');
  }
  const heading = (title: string, caption?: string) => (
    <View style={s.sectionHeader}>
      <Text style={[s.sectionTitle, { color: c.text }]}>{title}</Text>
      {caption && (
        <Text style={[s.small, { color: c.secondary }]}>{caption}</Text>
      )}
    </View>
  );
  const incidentRow = (row: Incident) => (
    <Pressable
      onPress={() => setSelected(row)}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${row.location}, ${row.status}, ${localTime(row.updated)}`}
      style={({ pressed }) => [
        s.incident,
        {
          backgroundColor: c.card,
          borderLeftColor: rowColor(row),
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[s.incidentIcon, { backgroundColor: rowColor(row) + '15' }]}>
        <Ionicons
          name={
            row.kind === 'warning'
              ? 'warning-outline'
              : categoryIcons[row.category]
          }
          color={rowColor(row)}
          size={23}
        />
      </View>
      <View style={s.grow}>
        <Text style={[s.rowTitle, { color: c.text }]}>{row.title}</Text>
        <Text numberOfLines={2} style={[s.location, { color: c.secondary }]}>
          {row.location}
        </Text>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: rowColor(row) }]} />
          <Text style={[s.small, { color: c.secondary }]}>{row.status}</Text>
        </View>
      </View>
      <View style={s.timeColumn}>
        <Text style={[s.time, { color: c.secondary }]}>
          {row.updated ? localTime(row.updated) : '—'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={c.secondary} />
      </View>
    </Pressable>
  );
  const warningBanner = warnings.length > 0 && (
    <View style={{ marginBottom: 14 }}>
      {heading('Official warnings', 'All Victoria')}
      {warnings.map((w) => (
        <Pressable
          key={w.id}
          onPress={() => setSelected(w)}
          accessibilityRole="button"
          style={[
            s.warning,
            { backgroundColor: c.card, borderColor: rowColor(w) },
          ]}
        >
          <Ionicons name="warning" size={23} color={rowColor(w)} />
          <View style={s.grow}>
            <Text style={[s.rowTitle, { color: c.text }]}>{w.level}</Text>
            <Text style={[s.small, { color: c.secondary }]}>
              {w.action || w.location}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={c.secondary} />
        </Pressable>
      ))}
    </View>
  );
  const status = (
    <View style={s.statusRow}>
      <View
        style={[
          s.dot,
          {
            backgroundColor: data.feed
              ? data.stale
                ? '#b67c19'
                : c.green
              : c.secondary,
          },
        ]}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[s.small, { color: c.secondary }]}
      >
        {!data.feed
          ? data.loading
            ? 'Getting incidents…'
            : 'No live data'
          : data.stale
            ? 'Updates delayed'
            : `Updated ${localTime(data.feed.fetchedAt)} · Melbourne time`}
      </Text>
      {data.loading && <ActivityIndicator size="small" color={c.secondary} />}
    </View>
  );
  if (!data.ready)
    return (
      <SafeAreaView
        style={[s.root, s.center, { backgroundColor: c.background }]}
      >
        <Ionicons name="radio-outline" size={42} color={c.accent} />
        <ActivityIndicator style={{ marginTop: 20 }} color={c.accent} />
      </SafeAreaView>
    );
  return (
    <SafeAreaView
      style={[s.root, { backgroundColor: c.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={s.header}>
        <View style={s.row}>
          <View style={[s.brand, { backgroundColor: c.accent }]}>
            <Ionicons name="radio-outline" size={23} color="#fff" />
          </View>
          <Text style={[s.brandName, { color: c.text }]}>Dispatch</Text>
          <View style={[s.region, { backgroundColor: c.field }]}>
            <Text style={[s.regionText, { color: c.secondary }]}>VIC</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About Dispatch Pro"
          onPress={() => setPanel('pro')}
          style={[s.proTag, { backgroundColor: c.tint }]}
        >
          <Text style={{ fontWeight: '700', color: c.accent, fontSize: 12 }}>
            PRO
          </Text>
        </Pressable>
      </View>
      {(tab === 'list' || tab === 'map') && (
        <View style={s.feedControls}>
          <View style={s.headingRow}>
            <View>
              <Text style={[s.pageTitle, { color: c.text }]}>
                Nearby incidents
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose area"
                onPress={() => setTab('places')}
                style={[s.row, { paddingVertical: 8 }]}
              >
                <Ionicons name="location-outline" color={c.accent} size={15} />
                <Text style={{ color: c.secondary, fontSize: 14 }}>
                  {place
                    ? `${place.name} · ${place.radius} km`
                    : 'All Victoria'}
                </Text>
                <Ionicons name="chevron-down" size={13} color={c.secondary} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter incidents"
              onPress={() => setPanel('filters')}
              style={[s.iconButton, { backgroundColor: c.card }]}
            >
              <Ionicons name="options-outline" size={22} color={c.text} />
            </Pressable>
          </View>
          <View style={[s.search, { backgroundColor: c.field }]}>
            <Ionicons name="search-outline" color={c.secondary} size={19} />
            <TextInput
              accessibilityLabel="Search incidents"
              value={query}
              onChangeText={setQuery}
              placeholder="Search a suburb or incident"
              placeholderTextColor={c.secondary}
              style={[s.input, { color: c.text }]}
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
            >
              {query ? (
                <Ionicons name="close-circle" color={c.secondary} size={18} />
              ) : null}
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            {categories.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                active={category === item.id}
                onPress={() => setCategory(item.id)}
                colors={c}
              />
            ))}
          </ScrollView>
          {status}
        </View>
      )}
      {tab === 'list' && (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={data.loading}
              onRefresh={() => void data.refresh()}
              tintColor={c.accent}
              colors={[c.accent]}
            />
          }
          ListHeaderComponent={
            <>
              {warningBanner}
              {data.error && (
                <View style={[s.notice, { backgroundColor: c.card }]}>
                  <Text style={{ color: c.secondary }}>
                    {data.error}
                    {data.feed ? ' Showing the last successful update.' : ''}
                  </Text>
                  <Button
                    label="Try again"
                    colors={c}
                    onPress={() => void data.refresh()}
                    subtle
                  />
                </View>
              )}
              {heading('Incidents', `${rows.length} in view`)}
            </>
          }
          renderItem={({ item, index }) => (
            <>
              {(index === 0 ||
                dayLabel(item.updated, data.now) !==
                  dayLabel(rows[index - 1].updated, data.now)) && (
                <Text style={[s.dateLabel, { color: c.secondary }]}>
                  {dayLabel(item.updated, data.now).toUpperCase()}
                </Text>
              )}
              {incidentRow(item)}
            </>
          )}
          ListEmptyComponent={
            <View style={[s.empty, { backgroundColor: c.card }]}>
              <Ionicons
                name={data.loading ? 'radio-outline' : 'search-outline'}
                size={33}
                color={c.secondary}
              />
              <Text style={[s.rowTitle, { color: c.text, marginTop: 12 }]}>
                {data.loading
                  ? 'Loading Victoria incidents'
                  : data.feed
                    ? 'No matching incidents'
                    : 'Incidents unavailable'}
              </Text>
              <Text
                style={[s.body, { color: c.secondary, textAlign: 'center' }]}
              >
                {data.feed
                  ? 'Try another area or fewer filters. An empty list is not an all-clear.'
                  : 'Pull down to refresh. Current incidents need an internet connection.'}
              </Text>
              {data.feed && (
                <Button
                  label="Reset filters"
                  colors={c}
                  subtle
                  onPress={() => {
                    setCategory('all');
                    setQuery('');
                    setResponding(false);
                    data.setPrefs((old) => ({
                      ...old,
                      active: null,
                      includePlanned: false,
                    }));
                  }}
                />
              )}
            </View>
          }
          ListFooterComponent={
            <View style={s.footer}>
              <Text
                style={[s.small, { color: c.secondary, textAlign: 'center' }]}
              >
                Source: VicEmergency · Public fire, rescue and SES incidents
              </Text>
              <Pressable
                onPress={() =>
                  void openUrl('https://emergency.vic.gov.au/respond/')
                }
                accessibilityRole="link"
              >
                <Text style={[s.footerLink, { color: c.accent }]}>
                  Read official emergency advice ↗
                </Text>
              </Pressable>
              <Text
                style={[s.small, { color: c.secondary, textAlign: 'center' }]}
              >
                Independent preview. In an emergency, call 000.
              </Text>
            </View>
          }
        />
      )}
      {tab === 'map' && (
        <View style={s.grow}>
          {warnings.length > 0 && (
            <Pressable
              onPress={() => {
                setTab('list');
              }}
              accessibilityRole="button"
              style={[s.mapWarnings, { backgroundColor: c.card }]}
            >
              <Ionicons name="warning" size={17} color="#ab8210" />
              <Text style={{ color: c.text, fontSize: 13 }}>
                {warnings.length} official{' '}
                {warnings.length === 1 ? 'warning' : 'warnings'} across Victoria
                · View
              </Text>
            </Pressable>
          )}
          <IncidentMap
            rows={rows}
            warnings={warnings}
            place={place}
            colors={c}
            dark={isDark}
            onSelect={setSelected}
          />
        </View>
      )}
      {tab === 'places' && (
        <ScrollView
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[s.pageTitle, { color: c.text, marginTop: 10 }]}>
            Your places
          </Text>
          <Text style={[s.body, { color: c.secondary }]}>
            Choose the area you want to follow.
          </Text>
          <View style={[s.card, { backgroundColor: c.card }]}>
            <Button
              label="All Victoria"
              icon="globe-outline"
              colors={c}
              subtle
              onPress={() => choose(null)}
            />
            <Button
              label={locating ? 'Finding location…' : 'Use my location'}
              icon="locate-outline"
              colors={c}
              subtle
              disabled={locating}
              onPress={() => void locate()}
            />
          </View>
          {heading('Saved place', 'On this device')}
          {data.prefs.saved.length ? (
            data.prefs.saved.map((p) => (
              <View
                key={p.id}
                style={[s.savedRow, { backgroundColor: c.card }]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => choose(p)}
                  style={s.grow}
                >
                  <Text style={[s.rowTitle, { color: c.text }]}>{p.name}</Text>
                  <Text style={[s.small, { color: c.secondary, marginTop: 4 }]}>
                    {p.radius} km radius
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    data.setPrefs((old) => ({
                      ...old,
                      saved: old.saved.filter((x) => x.id !== p.id),
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove saved ${p.name}`}
                  style={s.iconButton}
                >
                  <Ionicons name="trash-outline" color={c.accent} size={20} />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={[s.body, { color: c.secondary }]}>
              No saved place yet. Choose an area, then save it below.
            </Text>
          )}
          {place && (
            <View style={[s.card, { backgroundColor: c.card }]}>
              <Text style={[s.rowTitle, { color: c.text }]}>{place.name}</Text>
              <Text style={[s.body, { color: c.secondary }]}>
                Show incidents within {place.radius} km
              </Text>
              <View style={s.chips}>
                {[5, 10, 25, 50, 100].map((radius) => (
                  <Chip
                    key={radius}
                    label={`${radius}`}
                    active={place.radius === radius}
                    colors={c}
                    onPress={() =>
                      data.setPrefs((old) => ({
                        ...old,
                        active: old.active ? { ...old.active, radius } : null,
                      }))
                    }
                  />
                ))}
              </View>
              <Button
                label="Save this place"
                icon="bookmark-outline"
                colors={c}
                onPress={savePlace}
              />
            </View>
          )}
          {heading('Find a place')}
          <View style={[s.search, { backgroundColor: c.field }]}>
            <Ionicons name="search-outline" size={19} color={c.secondary} />
            <TextInput
              value={placeQuery}
              onChangeText={setPlaceQuery}
              accessibilityLabel="Search places"
              placeholder="Search Victoria"
              placeholderTextColor={c.secondary}
              style={[s.input, { color: c.text }]}
            />
          </View>
          <View style={[s.card, { backgroundColor: c.card }]}>
            {choices.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => choose(p)}
                style={[s.option, { borderBottomColor: c.line }]}
              >
                <Ionicons
                  name="location-outline"
                  size={19}
                  color={c.secondary}
                />
                <Text style={[s.grow, { color: c.text, fontSize: 15 }]}>
                  {p.name}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={c.secondary}
                />
              </Pressable>
            ))}
            {choices.length === 0 && (
              <Text style={[s.body, { color: c.secondary }]}>
                No match in suggested places or current incident locations.
              </Text>
            )}
          </View>
          <Text style={[s.small, { color: c.secondary }]}>
            One saved place is included. Places and preferences stay on this
            device; they do not sync with the website yet.
          </Text>
        </ScrollView>
      )}
      {tab === 'settings' && (
        <ScrollView contentContainerStyle={s.list}>
          <Text style={[s.pageTitle, { color: c.text, marginTop: 10 }]}>
            Settings
          </Text>
          {heading('Appearance')}
          <View style={[s.card, { backgroundColor: c.card }]}>
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <Pressable
                key={theme}
                onPress={() => data.setPrefs((old) => ({ ...old, theme }))}
                accessibilityRole="radio"
                accessibilityState={{ checked: data.prefs.theme === theme }}
                style={[s.option, { borderBottomColor: c.line }]}
              >
                <Text style={[s.grow, { color: c.text, fontSize: 16 }]}>
                  {theme === 'system'
                    ? 'Use device setting'
                    : theme === 'dark'
                      ? 'Dark'
                      : 'Light'}
                </Text>
                {data.prefs.theme === theme && (
                  <Ionicons name="checkmark" color={c.accent} size={20} />
                )}
              </Pressable>
            ))}
          </View>
          {heading('Notifications')}
          <View style={[s.card, { backgroundColor: c.card }]}>
            <View style={s.row}>
              <Ionicons
                name="notifications-outline"
                size={22}
                color={c.secondary}
              />
              <Text style={[s.rowTitle, { color: c.text }]}>
                Background alerts
              </Text>
            </View>
            <Text style={[s.body, { color: c.secondary }]}>
              Not available in this first version. The feed refreshes while the
              app is open. Use VicEmergency for official warnings.
            </Text>
          </View>
          {heading('Dispatch Pro')}
          <View style={[s.card, { backgroundColor: c.card }]}>
            <Text style={[s.rowTitle, { color: c.text }]}>
              A little more local
            </Text>
            <Text style={[s.body, { color: c.secondary }]}>
              More saved places and future notification options. Mobile
              subscriptions are not on sale yet.
            </Text>
            <Button
              label="View planned features"
              colors={c}
              subtle
              onPress={() => setPanel('pro')}
            />
          </View>
          {heading('About your data')}
          <View style={[s.card, { backgroundColor: c.card }]}>
            <Text style={[s.body, { color: c.secondary }]}>
              No account is needed for this preview. Your saved place and
              appearance are stored on this device. Location is requested only
              when you choose “Use my location”. No background location
              tracking.
            </Text>
            <Text style={[s.body, { color: c.secondary }]}>
              Current incident data comes directly from VicEmergency. The map
              uses Apple Maps on iOS and Google Maps on Android.
            </Text>
            <Button
              label="Sources & app information"
              colors={c}
              subtle
              onPress={() => setPanel('about')}
            />
          </View>
          <Text style={[s.footerLink, { color: c.secondary }]}>
            Dispatch · Victoria · {Constants.expoConfig?.version ?? 'Preview'}
          </Text>
        </ScrollView>
      )}
      {!!data.storageError && (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.storageError, { color: c.accent }]}
        >
          {data.storageError}
        </Text>
      )}
      <View
        style={[s.tabbar, { backgroundColor: c.card, borderTopColor: c.line }]}
      >
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tab === t.id }}
            onPress={() => setTab(t.id)}
            style={s.tab}
          >
            <Ionicons
              name={t.icon}
              size={23}
              color={tab === t.id ? c.accent : c.secondary}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: tab === t.id ? '700' : '500',
                color: tab === t.id ? c.accent : c.secondary,
                marginTop: 4,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!current || !!panel}
        onRequestClose={() => {
          setSelected(null);
          setPanel(null);
        }}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: c.line }]}>
            <Text style={[s.rowTitle, { color: c.text }]}>
              {current
                ? 'Incident details'
                : panel === 'filters'
                  ? 'Filters'
                  : panel === 'pro'
                    ? 'Dispatch Pro'
                    : 'About Dispatch'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => {
                setSelected(null);
                setPanel(null);
              }}
              style={[s.iconButton, { backgroundColor: c.field }]}
            >
              <Ionicons name="close" size={23} color={c.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.list}>
            {current && (
              <>
                <View
                  style={[
                    s.detailIcon,
                    { backgroundColor: rowColor(current) + '18' },
                  ]}
                >
                  <Ionicons
                    name={
                      current.kind === 'warning'
                        ? 'warning-outline'
                        : categoryIcons[current.category]
                    }
                    size={36}
                    color={rowColor(current)}
                  />
                </View>
                <Text style={[s.pageTitle, { color: c.text }]}>
                  {current.title}
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  {current.location}
                </Text>
                {(removed || data.stale) && (
                  <View style={[s.notice, { backgroundColor: c.card }]}>
                    <Text style={{ color: c.accent }}>
                      {removed
                        ? 'This record is no longer in the current feed. This does not confirm it is resolved.'
                        : 'Updates are delayed. Check the official source for current advice.'}
                    </Text>
                  </View>
                )}
                {current.action && (
                  <Text style={[s.body, { color: c.text }]}>
                    {current.action}
                  </Text>
                )}
                <View style={[s.card, { backgroundColor: c.card }]}>
                  {[
                    ['Status', current.status],
                    ['Agency', current.agency],
                    ['Updated', localTime(current.updated, true)],
                    ['Reported', localTime(current.created, true)],
                    [
                      'Resources',
                      current.resources === null
                        ? 'Not supplied'
                        : String(current.resources),
                    ],
                    ['Reference', current.sourceId],
                  ].map(([k, v]) => (
                    <View
                      key={k}
                      style={[s.detailRow, { borderBottomColor: c.line }]}
                    >
                      <Text
                        style={{ color: c.secondary, fontSize: 13, flex: 1 }}
                      >
                        {k}
                      </Text>
                      <Text
                        selectable
                        style={{
                          color: c.text,
                          fontSize: 14,
                          flex: 2,
                          textAlign: 'right',
                        }}
                      >
                        {v}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text
                  style={[s.small, { color: c.secondary, marginBottom: 15 }]}
                >
                  Times are in Melbourne time. Resource counts do not identify
                  individual vehicles. Reported locations are approximate.
                </Text>
                <Button
                  label="Read official advice"
                  icon="open-outline"
                  colors={c}
                  onPress={() => void openUrl(current.officialUrl)}
                />
                {current.point && (
                  <Button
                    label="Open location in maps"
                    icon="map-outline"
                    colors={c}
                    subtle
                    onPress={() =>
                      void openUrl(
                        `https://www.google.com/maps/search/?api=1&query=${current.point![0]},${current.point![1]}`,
                      )
                    }
                  />
                )}
                <Button
                  label="Share incident"
                  icon="share-outline"
                  colors={c}
                  subtle
                  onPress={() => {
                    void Share.share({
                      message: `${current.title} · ${current.location}\n${current.status}\nUpdated ${localTime(current.updated, true)} (Melbourne time)\nVicEmergency reference ${current.sourceId}\n${current.officialUrl}`,
                    }).catch(() =>
                      Alert.alert('Could not share', 'Please try again.'),
                    );
                  }}
                />
              </>
            )}
            {panel === 'filters' && (
              <>
                <Text style={[s.body, { color: c.secondary }]}>
                  Filters apply to incidents. Official warnings remain visible
                  across Victoria.
                </Text>
                <View style={[s.card, { backgroundColor: c.card }]}>
                  <View style={s.option}>
                    <Text style={[s.grow, { color: c.text, fontSize: 16 }]}>
                      Include planned burns
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
                  <View style={s.option}>
                    <Text style={[s.grow, { color: c.text, fontSize: 16 }]}>
                      Operational incidents only
                    </Text>
                    <Switch
                      accessibilityLabel="Operational incidents only"
                      value={responding}
                      onValueChange={setResponding}
                      trackColor={{ true: c.accent }}
                    />
                  </View>
                  <Text style={[s.small, { color: c.secondary }]}>
                    Operational includes responding, on scene and under control
                    statuses supplied by the source.
                  </Text>
                </View>
                <Button
                  label="Apply filters"
                  colors={c}
                  onPress={() => setPanel(null)}
                />
                <Button
                  label="Reset filters"
                  colors={c}
                  subtle
                  onPress={() => {
                    setQuery('');
                    setCategory('all');
                    setResponding(false);
                    data.setPrefs((old) => ({
                      ...old,
                      includePlanned: false,
                      active: null,
                    }));
                    setPanel(null);
                  }}
                />
              </>
            )}
            {panel === 'pro' && (
              <>
                <View style={[s.detailIcon, { backgroundColor: c.tint }]}>
                  <Ionicons
                    name="sparkles-outline"
                    color={c.accent}
                    size={34}
                  />
                </View>
                <Text style={[s.pageTitle, { color: c.text }]}>
                  Your neighbourhood.{`\n`}A little closer.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Pro is in development. There are no purchases or paid
                  entitlements in this preview.
                </Text>
                <View style={[s.card, { backgroundColor: c.card }]}>
                  {[
                    'Up to five saved places',
                    'A radius for each place',
                    'Background alerts in a later release',
                  ].map((t) => (
                    <View key={t} style={s.option}>
                      <Ionicons
                        name="ellipse-outline"
                        size={17}
                        color={c.accent}
                      />
                      <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>
                        {t}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[s.body, { color: c.secondary }]}>
                  Final subscription prices will be shown by the App Store or
                  Google Play when purchases become available. Current official
                  warnings remain free.
                </Text>
                <Button
                  label="Back to Dispatch"
                  colors={c}
                  onPress={() => setPanel(null)}
                />
              </>
            )}
            {panel === 'about' && (
              <>
                <Text style={[s.pageTitle, { color: c.text }]}>
                  A clearer local view.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Dispatch is an independent preview of public fire, rescue and
                  SES incidents in Victoria. It is not an emergency service or a
                  complete police and ambulance pager feed.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  The source is checked about once a minute while the app is
                  active. Older data is labelled delayed. This app cannot
                  guarantee that every incident is shown or that updates arrive
                  immediately.
                </Text>
                <Text style={[s.body, { color: c.secondary }]}>
                  Source content belongs to the relevant agencies. Commercial
                  reuse conditions are still being confirmed before a public
                  paid launch.
                </Text>
                <Button
                  label="Visit VicEmergency"
                  colors={c}
                  onPress={() =>
                    void openUrl('https://emergency.vic.gov.au/respond/')
                  }
                />
                <Text style={[s.body, { color: c.text, fontWeight: '700' }]}>
                  In an emergency, call 000.
                </Text>
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
  center: { alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 23, fontWeight: '800', letterSpacing: -0.8 },
  region: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 3,
  },
  regionText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  proTag: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9 },
  pageTitle: { fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  feedControls: { paddingHorizontal: 20 },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  iconButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 44,
    marginVertical: 8,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 40,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  small: { fontSize: 12, lineHeight: 17 },
  list: { paddingHorizontal: 20, paddingBottom: 26 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  dateLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 9,
  },
  incident: {
    borderRadius: 13,
    padding: 14,
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: 11,
    marginBottom: 8,
  },
  incidentIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  location: { fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 5 },
  timeColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    maxWidth: 56,
  },
  time: { fontSize: 12, fontVariant: ['tabular-nums'] },
  warning: {
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  notice: { padding: 16, gap: 10, borderRadius: 14, marginBottom: 12 },
  button: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginVertical: 5,
    minHeight: 48,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  empty: { padding: 25, alignItems: 'center', borderRadius: 16 },
  body: { fontSize: 15, lineHeight: 23, marginTop: 9, marginBottom: 14 },
  footer: { paddingTop: 23, paddingBottom: 8, gap: 7 },
  footerLink: { fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  card: { padding: 16, borderRadius: 16, marginVertical: 8 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 14,
    marginBottom: 8,
  },
  tabbar: {
    flexDirection: 'row',
    paddingTop: 9,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailIcon: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    marginTop: 20,
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mapWarnings: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  storageError: { fontSize: 12, padding: 8, textAlign: 'center' },
});
