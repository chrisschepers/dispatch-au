'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Radio,
  MapPin,
  List,
  Map,
  SlidersHorizontal,
  ArrowUpRight,
  Flame,
  LifeBuoy,
  ChevronRight,
  Bell,
  Search,
  Wind,
  RefreshCw,
  LocateFixed,
  Trash2,
  Check,
  Download,
  ShieldCheck,
  Share2,
  TriangleAlert,
  Leaf,
  FlaskConical,
  Info,
  Settings,
  X,
  Plus,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from '@/components/ui/command';
import {
  filterIncidents,
  feedIsStale,
  distanceKm,
  type Feed,
  type Incident,
  type Category,
} from '@/lib/incidents';
import { suggestedPlaces, type Place } from '@/lib/places';
import IncidentMap from './incident-map';

type Panel =
  | 'places'
  | 'filters'
  | 'pro'
  | 'settings'
  | 'install'
  | 'about'
  | null;
type Account = {
  user: { name: string; email: string } | null;
  pro: boolean;
  billingReady: boolean;
  renewsAt: number | null;
};
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const categories: {
  id: Category | 'all';
  label: string;
  icon: typeof Flame;
}[] = [
  { id: 'all', label: 'All incidents', icon: List },
  { id: 'fire', label: 'Fire', icon: Flame },
  { id: 'rescue', label: 'Rescue', icon: LifeBuoy },
  { id: 'storm', label: 'Storm & flood', icon: Wind },
  { id: 'hazmat', label: 'Hazmat', icon: FlaskConical },
  { id: 'planned', label: 'Planned burns', icon: Leaf },
];
const iconFor = (r: Incident) =>
  r.kind === 'warning'
    ? TriangleAlert
    : (categories.find((c) => c.id === r.category)?.icon ?? Info);
const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—';
const fullDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not supplied';
function dayLabel(value: string | null, now: number) {
  if (!value) return 'TIME NOT SUPPLIED';
  const format = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  if (format.format(new Date(value)) === format.format(now)) return 'TODAY';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(value))
    .toUpperCase();
}
const defaultAccount: Account = {
  user: null,
  pro: false,
  billingReady: false,
  renewsAt: null,
};
export default function DispatchApp() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [includePlanned, setIncludePlanned] = useState(false);
  const [respondingOnly, setRespondingOnly] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [radius, setRadius] = useState(25);
  const [view, setView] = useState('list');
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [saved, setSaved] = useState<Place[]>([]);
  const [account, setAccount] = useState<Account>(defaultAccount);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [clock, setClock] = useState(0);
  const [plan, setPlan] = useState('yearly');
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const fetching = useRef(false);
  const loadedLink = useRef(false);
  const announce = useCallback((text: string) => setMessage(text), []);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      const response = await fetch('/api/incidents', {
        cache: 'no-store',
        signal: AbortSignal.timeout(16000),
      });
      const data = (await response.json()) as Feed & { error?: string };
      if (!response.ok) throw Error(data.error || 'Could not load incidents.');
      setFeed(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the feed.');
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);
  const loadAccount = useCallback(async () => {
    try {
      const r = await fetch('/api/account', { cache: 'no-store' });
      if (!r.ok) throw Error();
      const data: Account = await r.json();
      setAccount(data);
      if (data.user) {
        const p = await fetch('/api/places', { cache: 'no-store' });
        if (!p.ok) throw Error();
        setSaved(((await p.json()) as { places: Place[] }).places);
      }
    } catch {
      announce(
        'Your account could not be loaded. The public feed is still available.',
      );
    }
  }, [announce]);
  useEffect(() => {
    void refresh();
    void loadAccount();
    setClock(Date.now());
    const stored = localStorage.getItem('dispatch-theme');
    setDark(
      stored
        ? stored === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
    const timer = setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === 'visible') void refresh();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === 'visible') {
        setClock(Date.now());
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', visible);
    const online = () => void refresh();
    window.addEventListener('online', online);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', prompt);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    const params = new URLSearchParams(location.search);
    if (params.has('settings')) setPanel('settings');
    if (params.get('billing') === 'success')
      announce(
        'You returned from checkout. Pro activates only after verified payment confirmation; refresh your account shortly.',
      );
    if (params.get('billing') === 'cancelled')
      announce('Checkout cancelled. Your plan has not changed.');
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', online);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, [refresh, loadAccount, announce]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!feed || loadedLink.current) return;
    loadedLink.current = true;
    const id = new URLSearchParams(location.search).get('incident');
    if (id) {
      const row = [...feed.incidents, ...feed.warnings].find(
        (r) => r.id === id,
      );
      if (row) setSelected(row);
      else
        announce(
          'This incident is no longer in the current public feed. Check VicEmergency for official updates.',
        );
    }
  }, [feed, announce]);
  const effectivePlace = place ? { ...place, radius } : null;
  const rows = useMemo(
    () =>
      filterIncidents(feed?.incidents ?? [], {
        query,
        category,
        includePlanned: includePlanned || category === 'planned',
        respondingOnly,
        centre: place ? [place.lat, place.lng] : null,
        radius,
      }),
    [feed, query, category, includePlanned, respondingOnly, place, radius],
  );
  const stale = !!feed && (!!error || feedIsStale(feed, clock || Date.now()));
  const groups = useMemo(() => {
    const result: { label: string; rows: Incident[] }[] = [];
    for (const row of rows) {
      const label = dayLabel(row.updated, clock || Date.now());
      const last = result.at(-1);
      if (last?.label === label) last.rows.push(row);
      else result.push({ label, rows: [row] });
    }
    return result;
  }, [rows, clock]);
  const activeSelected = selected
    ? ([...(feed?.incidents ?? []), ...(feed?.warnings ?? [])].find(
        (r) => r.id === selected.id,
      ) ?? selected)
    : null;
  const selectedRemoved =
    selected &&
    feed &&
    ![...feed.incidents, ...feed.warnings].some((r) => r.id === selected.id);
  const choosePlace = (p: Place | null) => {
    setPlace(p);
    if (p) setRadius(p.radius);
    setPanel(null);
    setPlaceQuery('');
  };
  const locate = () => {
    if (!navigator.geolocation) {
      announce(
        'Location is not available in this browser. Choose a place instead.',
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        choosePlace({
          id: 'current',
          name: 'My current location',
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          radius,
        });
        setBusy(false);
      },
      () => {
        announce(
          'Location could not be accessed. You can choose a place manually.',
        );
        setBusy(false);
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  };
  const savePlace = async () => {
    if (!place) return;
    if (!account.user) {
      announce('Sign in from Settings to save your place across devices.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...place, radius }),
      });
      const d = (await r.json()) as { error: string; place: Place };
      if (!r.ok) throw Error(d.error);
      setSaved((old) => [...old, d.place]);
      announce('Place saved to your account.');
    } catch (e) {
      announce(e instanceof Error ? e.message : 'Could not save place.');
    } finally {
      setBusy(false);
    }
  };
  const removePlace = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/places?id=' + encodeURIComponent(id), {
        method: 'DELETE',
      });
      if (!r.ok) throw Error();
      setSaved((old) => old.filter((p) => p.id !== id));
      announce('Saved place removed.');
    } catch {
      announce('Could not remove this place. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const openCheckout = async (portal = false) => {
    setBusy(true);
    try {
      const r = await fetch(
        '/api/billing/' + (portal ? 'portal' : 'checkout'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan }),
        },
      );
      const data = (await r.json()) as { error: string; url: string };
      if (!r.ok) throw Error(data.error);
      const url = new URL(data.url);
      if (
        url.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)
      )
        throw Error('Unexpected payment destination.');
      location.assign(url.href);
    } catch (e) {
      announce(e instanceof Error ? e.message : 'Billing unavailable.');
    } finally {
      setBusy(false);
    }
  };
  const share = async (row: Incident) => {
    const url = new URL(location.origin);
    url.searchParams.set('incident', row.id);
    try {
      if (navigator.share)
        await navigator.share({
          title: `${row.title} · ${row.location}`,
          url: url.href,
        });
      else {
        await navigator.clipboard.writeText(url.href);
        announce('Incident link copied.');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        announce('Sharing is unavailable in this browser.');
    }
  };
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (x: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            t: Tool,
            o: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'filter_victoria_incidents',
          description:
            'Set the visible incident search and category filter. Does not change subscriptions or saved places.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', maxLength: 100 },
              category: {
                enum: [
                  'all',
                  'fire',
                  'rescue',
                  'storm',
                  'hazmat',
                  'planned',
                  'other',
                ],
              },
            },
            required: ['query', 'category'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            const v = input as { query?: unknown; category?: unknown };
            if (
              !v ||
              typeof v.query !== 'string' ||
              v.query.length > 100 ||
              ![
                'all',
                'fire',
                'rescue',
                'storm',
                'hazmat',
                'planned',
                'other',
              ].includes(String(v.category))
            )
              throw Error('Invalid filter');
            setQuery(v.query);
            setCategory(v.category as Category | 'all');
            return new Promise((resolve) =>
              requestAnimationFrame(() =>
                resolve({ query: v.query, category: v.category }),
              ),
            );
          },
        },
        { signal: life.signal },
      ),
    ).catch(() => {});
    return () => life.abort();
  }, []);
  const renderRow = (r: Incident) => {
    const Icon = iconFor(r);
    return (
      <button
        className={'incident-row ' + r.category}
        key={r.id}
        onClick={() => setSelected(r)}
      >
        <span className="incident-icon">
          <Icon size={23} />
        </span>
        <span className="incident-copy">
          <strong>{r.title}</strong>
          <span>{r.location}</span>
          <small>
            <span
              className={
                'status-dot ' +
                (/responding|not yet/i.test(r.status) ? 'responding' : '')
              }
            />
            {r.status} · {r.agency.replace('VIC/', '')}
            {r.resources !== null
              ? ` · ${r.resources} ${r.resources === 1 ? 'resource' : 'resources'}`
              : ''}
            {place && r.point
              ? ` · ${distanceKm([place.lat, place.lng], r.point).toFixed(1)} km`
              : ''}
          </small>
        </span>
        <span className="incident-time">
          {time(r.updated)}
          <ChevronRight size={17} />
        </span>
      </button>
    );
  };
  return (
    <div className="app-shell">
      <a href="#incident-content" className="skip-link">
        Skip to incidents
      </a>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Radio size={22} />
          </span>
          dispatch<span className="edition">VICTORIA</span>
        </a>
        <span className="top-note">A little closer to your community.</span>
        <div className="header-actions">
          <button
            className="settings-button"
            aria-label="Settings"
            onClick={() => setPanel('settings')}
          >
            <Settings size={18} />
          </button>
          <button className="pro-button" onClick={() => setPanel('pro')}>
            {account.pro ? 'Dispatch Pro' : 'Discover Pro'}{' '}
            <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="main-column" id="incident-content">
          <div className="eyebrow">YOUR LOCAL INCIDENT FEED</div>
          <div className="title-row">
            <h1>What’s happening.</h1>
            <span
              className={'live-label ' + (stale || !feed ? 'not-live' : '')}
            >
              <i />
              {!feed ? 'Connecting' : stale ? 'Delayed' : 'Live feed'}
            </span>
          </div>
          <p className="intro">A clearer view of the incidents around you.</p>
          <button className="location-bar" onClick={() => setPanel('places')}>
            <MapPin size={19} />
            <strong>{place?.name ?? 'All Victoria'}</strong>
            <span>{place ? `Within ${radius} km` : 'Statewide coverage'}</span>
            <ChevronRight size={17} />
          </button>
          {(error || stale) && (
            <output className="notice">
              <TriangleAlert size={18} />
              <span>
                {feed
                  ? (feed.error ??
                    'Updates may be delayed. Showing the last received information.')
                  : error || 'Connecting to the source…'}{' '}
                {feed && `Last received ${fullDate(feed.fetchedAt)}.`}
              </span>
              <button onClick={() => void refresh()} disabled={loading}>
                Retry
              </button>
            </output>
          )}
          {!!feed?.warnings.length && (
            <div className="warning-section">
              <div className="section-title">
                <span>OFFICIAL WARNINGS · VICTORIA</span>
                <span>Shown across all filters</span>
              </div>
              {feed.warnings.map((w) => (
                <button
                  key={w.id}
                  className={
                    'warning-row ' +
                    (w.level === 'Emergency Warning'
                      ? 'emergency'
                      : w.level === 'Watch and Act'
                        ? 'watch'
                        : '')
                  }
                  onClick={() => setSelected(w)}
                >
                  <TriangleAlert size={19} />
                  <span>
                    <strong>
                      {w.level}
                      {w.action ? ` · ${w.action}` : ''}
                    </strong>
                    <small>{w.location}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          )}
          <Tabs value={view} onValueChange={(v) => setView(String(v))}>
            <div className="toolbar">
              <TabsList className="view-toggle" aria-label="Incident view">
                <TabsTrigger value="list">
                  <List size={17} />
                  List
                </TabsTrigger>
                <TabsTrigger value="map">
                  <Map size={17} />
                  Map
                </TabsTrigger>
              </TabsList>
              <div className="toolbar-end">
                <button
                  className="refresh-button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  aria-label="Refresh incidents"
                >
                  <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                </button>
                <button
                  className="filter-button"
                  onClick={() => setPanel('filters')}
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {(respondingOnly || includePlanned) && (
                    <i className="filter-dot" />
                  )}
                </button>
              </div>
            </div>
            <div className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a suburb, street or incident…"
                aria-label="Search incidents"
                maxLength={100}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="category-chips" aria-label="Incident types">
              {categories.map(({ id, label, icon: Icon }) => (
                <button
                  aria-pressed={category === id}
                  className={category === id ? 'active' : ''}
                  onClick={() => setCategory(id)}
                  key={id}
                >
                  {id !== 'all' && <Icon size={14} />} {label}
                </button>
              ))}
            </div>
            <div className="section-title">
              <span>
                {loading && !feed
                  ? 'LOADING INCIDENTS'
                  : `${rows.length} ${rows.length === 1 ? 'INCIDENT' : 'INCIDENTS'}`}
              </span>
              <span>
                Updated {feed ? time(feed.fetchedAt) : '—'} · Melbourne time
              </span>
            </div>
            <TabsContent value="list">
              <div className="groups">
                {groups.map((group) => (
                  <section key={group.label}>
                    <h3 className="day-heading">{group.label}</h3>
                    <div className="incident-list">
                      {group.rows.map(renderRow)}
                    </div>
                  </section>
                ))}
                {!rows.length && (
                  <div className="empty-state incident-list">
                    <Search size={25} />
                    <strong>
                      {loading && !feed
                        ? 'Connecting to Victoria…'
                        : error && !feed
                          ? 'The feed is unavailable'
                          : 'No matching incidents'}
                    </strong>
                    <p>
                      {loading && !feed
                        ? 'Checking the latest public incident information.'
                        : error && !feed
                          ? 'Please try refreshing in a moment.'
                          : 'Try another area or clear your filters. Not every emergency is published in this feed.'}
                    </p>
                    {!loading && (
                      <button
                        className="filter-button"
                        onClick={() => {
                          setQuery('');
                          setCategory('all');
                          setRespondingOnly(false);
                          setPlace(null);
                          void refresh();
                        }}
                      >
                        Show all Victoria
                      </button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="map">
              <IncidentMap
                incidents={rows}
                warnings={feed?.warnings ?? []}
                place={effectivePlace}
                onSelect={setSelected}
              />
              <div className="map-legend">
                <span>
                  <i style={{ background: '#d83329' }} />
                  Fire
                </span>
                <span>
                  <i style={{ background: '#2678cc' }} />
                  Rescue
                </span>
                <span>
                  <i style={{ background: '#0b8c82' }} />
                  Storm & flood
                </span>
              </div>
            </TabsContent>
          </Tabs>
          <p className="feed-credit">
            Source:{' '}
            <a
              href="https://emergency.vic.gov.au/respond/"
              target="_blank"
              rel="noreferrer"
            >
              State of Victoria, Australia · VicEmergency
            </a>
            <br />
            Source updated {feed ? fullDate(feed.sourceUpdated) : '—'}.
            Locations are approximate.
            <br />
            <button onClick={() => setPanel('about')}>
              About this feed & privacy
            </button>{' '}
            · In an emergency, call <a href="tel:000">000</a>.
          </p>
        </section>
        <aside className="context-column">
          <div className="side-card">
            <span className="side-icon">
              <MapPin size={24} />
            </span>
            <h2>
              Your places.
              <br />
              Your perspective.
            </h2>
            <p>
              Keep an eye on home, family and the places that matter to you.
            </p>
            {saved.length > 0 && (
              <div className="side-places">
                {saved.map((p) => (
                  <button key={p.id} onClick={() => choosePlace(p)}>
                    <MapPin size={13} />
                    {p.name}
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            )}
            <button
              className="primary-button"
              onClick={() => setPanel('places')}
            >
              Choose your area <ChevronRight size={17} />
            </button>
          </div>
          <div className="side-card pro-card">
            <span className="small-label">DISPATCH PRO · COMING SOON</span>
            <h2>
              Less noise.
              <br />
              More local.
            </h2>
            <p>
              Keep your favourite places together. A simple subscription to
              support an independent app.
            </p>
            <span className="price">
              A$4.99 <small>/ month · proposed</small>
            </span>
            <button className="text-button" onClick={() => setPanel('pro')}>
              Explore Pro <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="source-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Public information. Clearly presented.</strong>
              <p>
                Dispatch is independent. Always follow official advice from
                VicEmergency.
              </p>
              <a
                href="https://emergency.vic.gov.au/respond/"
                target="_blank"
                rel="noreferrer"
              >
                Visit VicEmergency <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <button className="install-link" onClick={() => setPanel('install')}>
            <Download size={15} />
            Add Dispatch to your home screen
          </button>
        </aside>
      </main>
      <nav className="mobile-nav" aria-label="Main navigation">
        <button
          className={!panel && view === 'list' ? 'active' : ''}
          onClick={() => {
            setView('list');
            setPanel(null);
          }}
        >
          <List />
          Incidents
        </button>
        <button
          className={!panel && view === 'map' ? 'active' : ''}
          onClick={() => {
            setView('map');
            setPanel(null);
          }}
        >
          <Map />
          Map
        </button>
        <button
          className={panel === 'places' ? 'active' : ''}
          onClick={() => setPanel('places')}
        >
          <MapPin />
          Places
        </button>
        <button
          className={panel === 'settings' ? 'active' : ''}
          onClick={() => setPanel('settings')}
        >
          <SlidersHorizontal />
          Settings
        </button>
      </nav>
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent
          className={'app-dialog ' + (panel === 'pro' ? 'pro-dialog' : '')}
        >
          {panel === 'places' && (
            <>
              <DialogTitle>Your area</DialogTitle>
              <DialogDescription>
                Pick a city, a location from the feed, or use your current
                position.
              </DialogDescription>
              <button
                className="location-choice"
                onClick={() => choosePlace(null)}
              >
                <Map size={18} />
                <strong>All Victoria</strong>
                {!place && <Check size={17} />}
              </button>
              <button
                className="location-choice"
                onClick={locate}
                disabled={busy}
              >
                <LocateFixed size={18} />
                <strong>
                  {busy ? 'Finding your location…' : 'Use my current location'}
                </strong>
              </button>
              <Command>
                <CommandInput
                  placeholder="Search places…"
                  value={placeQuery}
                  onValueChange={setPlaceQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    No matching place. Search the incident list or use your
                    location.
                  </CommandEmpty>
                  <CommandGroup heading="Victoria cities">
                    {suggestedPlaces.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => choosePlace({ ...p, radius })}
                      >
                        <MapPin size={15} />
                        {p.name}
                        <span className="ml-auto text-xs text-muted-foreground">
                          VIC
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {(feed?.incidents ?? []).some((r) => r.point) && (
                    <CommandGroup heading="Locations in the current feed">
                      {(feed?.incidents ?? [])
                        .filter(
                          (r, i, all) =>
                            r.point &&
                            all.findIndex((x) => x.location === r.location) ===
                              i,
                        )
                        .map((r) => (
                          <CommandItem
                            key={r.id}
                            value={r.location}
                            onSelect={() =>
                              choosePlace({
                                id: r.id,
                                name: r.location.slice(0, 60),
                                lat: r.point![0],
                                lng: r.point![1],
                                radius,
                              })
                            }
                          >
                            <MapPin size={15} />
                            {r.location}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
              {place && (
                <div className="radius-control">
                  <label id="radius-label">
                    Around {place.name}
                    <strong>{radius} km</strong>
                  </label>
                  <Slider
                    value={[radius]}
                    min={1}
                    max={200}
                    step={1}
                    onValueChange={(v) =>
                      setRadius(Array.isArray(v) ? v[0] : v)
                    }
                    aria-labelledby="radius-label"
                  />
                  <button
                    className="primary-button"
                    onClick={() => void savePlace()}
                    disabled={busy}
                  >
                    <Plus size={16} />
                    Save this place
                  </button>
                </div>
              )}
              <div className="section-title">
                <span>SAVED PLACES</span>
                <span>
                  {saved.length} / {account.pro ? 5 : 1}
                </span>
              </div>
              {saved.map((p) => (
                <div className="saved-place" key={p.id}>
                  <button onClick={() => choosePlace(p)}>
                    <MapPin size={16} />
                    <span>
                      {p.name}
                      <small>Within {p.radius} km</small>
                    </span>
                  </button>
                  <button
                    disabled={busy}
                    aria-label={'Remove ' + p.name}
                    onClick={() => void removePlace(p.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!saved.length && (
                <p className="muted-copy">
                  {account.user
                    ? 'Save one place for free.'
                    : 'Sign in from Settings to keep a place across devices.'}
                </p>
              )}
            </>
          )}
          {panel === 'filters' && (
            <>
              <DialogTitle>Your feed, your way</DialogTitle>
              <DialogDescription>
                These settings filter the incident list and map. Official
                warnings remain visible.
              </DialogDescription>
              <div className="setting-row">
                <label htmlFor="planned">
                  Include planned burns
                  <small>
                    Managed burns can remain in the source for weeks.
                  </small>
                </label>
                <Switch
                  id="planned"
                  checked={includePlanned}
                  onCheckedChange={setIncludePlanned}
                />
              </div>
              <div className="setting-row">
                <label htmlFor="responding">
                  Operational statuses only
                  <small>
                    Responding, on scene, not yet controlled or under control.
                  </small>
                </label>
                <Switch
                  id="responding"
                  checked={respondingOnly}
                  onCheckedChange={setRespondingOnly}
                />
              </div>
              {place && (
                <div className="radius-control">
                  <label id="filter-radius">
                    Distance from {place.name}
                    <strong>{radius} km</strong>
                  </label>
                  <Slider
                    value={[radius]}
                    min={1}
                    max={200}
                    step={1}
                    onValueChange={(v) =>
                      setRadius(Array.isArray(v) ? v[0] : v)
                    }
                    aria-labelledby="filter-radius"
                  />
                </div>
              )}
              <p className="muted-copy">
                Filters apply immediately. All filters are included in this
                preview.
              </p>
              <button className="primary-button" onClick={() => setPanel(null)}>
                Show {rows.length} incidents
              </button>
              <button
                className="subtle-button"
                onClick={() => {
                  setIncludePlanned(false);
                  setRespondingOnly(false);
                  setCategory('all');
                  setQuery('');
                }}
              >
                Reset filters
              </button>
            </>
          )}
          {panel === 'pro' && (
            <>
              <span className="small-label">A MORE PERSONAL DISPATCH</span>
              <DialogTitle>Closer to what matters.</DialogTitle>
              <DialogDescription>
                Your local incident feed stays free. Pro adds more places to
                follow and supports the app.
              </DialogDescription>
              <Tabs value={plan} onValueChange={(v) => setPlan(String(v))}>
                <TabsList className="billing-tabs">
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="yearly">Yearly · save 33%</TabsTrigger>
                </TabsList>
                <TabsContent value="monthly">
                  <div className="plan-price">
                    A$4.99<small>/ month</small>
                  </div>
                  <p className="muted-copy">
                    Proposed monthly subscription price.
                  </p>
                </TabsContent>
                <TabsContent value="yearly">
                  <div className="plan-price">
                    A$39.99<small>/ year</small>
                  </div>
                  <p className="muted-copy">
                    About A$3.33 per month, billed yearly. Proposed price.
                  </p>
                </TabsContent>
              </Tabs>
              <ul className="benefits">
                <li>
                  <Check />
                  Save up to five places across devices
                </li>
                <li>
                  <Check />A separate distance for each saved place
                </li>
                <li>
                  <Check />A clean, advertising-free experience
                </li>
                <li>
                  <Check />
                  Support ongoing independent development
                </li>
              </ul>
              {account.billingReady ? (
                <>
                  <p className="muted-copy">
                    Renews automatically until cancelled. Manage or cancel in
                    Settings.
                  </p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void openCheckout(account.pro)}
                  >
                    {account.pro
                      ? 'Manage subscription'
                      : busy
                        ? 'Opening checkout…'
                        : 'Continue to secure checkout'}
                  </button>
                </>
              ) : (
                <div className="coming-soon">
                  <strong>Pro is not on sale yet.</strong>
                  <p>
                    This is a working preview. No payment is requested. The
                    public feed and filters are free to explore.
                  </p>
                </div>
              )}
              <button className="subtle-button" onClick={() => setPanel(null)}>
                Continue with free Dispatch
              </button>
            </>
          )}
          {panel === 'settings' && (
            <>
              <DialogTitle>Make yourself at home.</DialogTitle>
              <DialogDescription>
                Your preferences and Dispatch account.
              </DialogDescription>
              <div className="account-card">
                <Radio size={24} />
                <div>
                  <strong>{account.user?.name ?? 'Welcome to Dispatch'}</strong>
                  <small>{account.pro ? 'Dispatch Pro' : 'Free plan'}</small>
                </div>
              </div>
              {!account.user ? (
                <a
                  className="primary-button"
                  href="/signin-with-chatgpt?return_to=%2F%3Fsettings%3D1"
                  target="_top"
                >
                  Sign in with ChatGPT
                </a>
              ) : (
                <button
                  className="subtle-button"
                  onClick={() => void loadAccount()}
                >
                  Refresh account
                </button>
              )}
              <div className="setting-row">
                <label htmlFor="dark">
                  Dark appearance<small>Saved on this device.</small>
                </label>
                <Switch
                  id="dark"
                  checked={dark}
                  onCheckedChange={(v) => {
                    setDark(v);
                    localStorage.setItem(
                      'dispatch-theme',
                      v ? 'dark' : 'light',
                    );
                  }}
                />
              </div>
              <button
                className="setting-link"
                onClick={() => setPanel('places')}
              >
                <MapPin size={18} />
                My places
                <ChevronRight size={17} />
              </button>
              <button className="setting-link" onClick={() => setPanel('pro')}>
                <ShieldCheck size={18} />
                Dispatch Pro
                <ChevronRight size={17} />
              </button>
              {account.pro && (
                <button
                  className="setting-link"
                  disabled={busy}
                  onClick={() => void openCheckout(true)}
                >
                  Manage or cancel subscription
                  <ArrowUpRight size={17} />
                </button>
              )}
              <button
                className="setting-link"
                onClick={() => setPanel('install')}
              >
                <Download size={18} />
                Install Dispatch
                <ChevronRight size={17} />
              </button>
              <div className="setting-row">
                <div>
                  <strong>Background notifications</strong>
                  <small>
                    Not available in this preview. Use the official VicEmergency
                    app for emergency alerts.
                  </small>
                </div>
                <Bell size={19} />
              </div>
              <button
                className="setting-link"
                onClick={() => setPanel('about')}
              >
                <Info size={18} />
                About, sources & privacy
                <ChevronRight size={17} />
              </button>
              {account.user && (
                <a
                  className="subtle-button"
                  target="_top"
                  href="/signout-with-chatgpt?return_to=%2F"
                >
                  Sign out
                </a>
              )}
            </>
          )}
          {panel === 'install' && (
            <>
              <span className="side-icon">
                <Download size={24} />
              </span>
              <DialogTitle>One tap away.</DialogTitle>
              <DialogDescription>
                Add Dispatch to your home screen for an app-like experience.
              </DialogDescription>
              {install ? (
                <button
                  className="primary-button"
                  onClick={async () => {
                    try {
                      await install.prompt();
                      const choice = await install.userChoice;
                      if (choice.outcome === 'accepted') setPanel(null);
                      setInstall(null);
                    } catch {
                      announce('Use your browser’s install menu.');
                    }
                  }}
                >
                  Install Dispatch
                </button>
              ) : (
                <>
                  <div className="install-step">
                    <strong>iPhone or iPad</strong>
                    <p>
                      Open this site in Safari. Tap Share, then Add to Home
                      Screen.
                    </p>
                  </div>
                  <div className="install-step">
                    <strong>Android or desktop</strong>
                    <p>
                      Open the browser menu and choose Install app or Add to
                      Home screen, if available.
                    </p>
                  </div>
                </>
              )}
              <p className="muted-copy">
                An internet connection is needed for current incidents. This
                preview does not send background alerts.
              </p>
            </>
          )}
          {panel === 'about' && (
            <>
              <DialogTitle>Public incidents. Plainly put.</DialogTitle>
              <DialogDescription>
                Dispatch is an independent app for Victoria, Australia. It is
                not an emergency service.
              </DialogDescription>
              <div className="about-copy">
                <h3>The information you see</h3>
                <p>
                  Public fire, rescue and SES incidents from VicEmergency,
                  attributed to the State of Victoria, Australia. We format
                  incident types, organise records and display times in
                  Melbourne local time. Official warning levels and action
                  statements are retained.
                </p>
                <p>
                  The feed is not a complete record of every 000 call. It does
                  not provide comprehensive police or ambulance dispatches.
                  Resource counts do not identify vehicles, stations or
                  staffing. A record disappearing from the feed does not prove
                  that an incident is resolved.
                </p>
                <h3>Updates and reliability</h3>
                <p>
                  We check for updates about once a minute while the app is
                  open. Source and received times are shown. If an update fails,
                  older information is labelled delayed. Always check official
                  advice.
                </p>
                <a
                  href="https://emergency.vic.gov.au/respond/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open VicEmergency ↗
                </a>
                <h3>Your privacy</h3>
                <p>
                  The public feed needs no account. Your device location is used
                  only after you ask, and filtering happens in your browser.
                  Saving a place stores its name, coordinates and radius with
                  your account; delete it in Places. Sign-in is provided by
                  ChatGPT. The map loads tiles from OpenStreetMap, which
                  receives your IP address and viewed map area.
                </p>
                <p>
                  Your theme preference is stored on this device. We do not add
                  advertising or analytics trackers. Payments, when enabled, use
                  Stripe; card details are not stored by Dispatch.
                </p>
                <h3>Preview status</h3>
                <p>
                  Subscriptions and background push are not live. Commercial
                  reuse of the combined feed is being verified because published
                  source conditions differ. No claim of an unrestricted licence
                  is made for every record.
                </p>
                <p>
                  In an emergency, call <a href="tel:000">000</a>.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="detail-sheet">
          {activeSelected && (
            <>
              <div className={'detail-heading ' + activeSelected.category}>
                <span className="incident-icon">
                  {(() => {
                    const Icon = iconFor(activeSelected);
                    return <Icon size={28} />;
                  })()}
                </span>
                <span className="small-label">
                  {activeSelected.kind === 'warning'
                    ? 'OFFICIAL WARNING'
                    : 'INCIDENT DETAILS'}
                </span>
                <SheetTitle>{activeSelected.title}</SheetTitle>
                <SheetDescription>{activeSelected.location}</SheetDescription>
              </div>
              {selectedRemoved && (
                <div className="notice">
                  This record is no longer in the current feed. Its final
                  outcome is not known.
                </div>
              )}
              {activeSelected.kind === 'warning' && (
                <div className="warning-detail">
                  <strong>{activeSelected.level}</strong>
                  <p>{activeSelected.action}</p>
                  <a
                    href={activeSelected.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the full official warning <ArrowUpRight size={15} />
                  </a>
                </div>
              )}
              <dl className="detail-facts">
                <div>
                  <dt>Status</dt>
                  <dd>{activeSelected.status}</dd>
                </div>
                <div>
                  <dt>Source organisation</dt>
                  <dd>{activeSelected.agency.replace('VIC/', '')}</dd>
                </div>
                <div>
                  <dt>Resources reported</dt>
                  <dd>{activeSelected.resources ?? 'Not supplied'}</dd>
                </div>
                <div>
                  <dt>First reported</dt>
                  <dd>{fullDate(activeSelected.created)}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{fullDate(activeSelected.updated)}</dd>
                </div>
                <div>
                  <dt>Public reference</dt>
                  <dd>{activeSelected.sourceId}</dd>
                </div>
              </dl>
              {activeSelected.point && (
                <>
                  <IncidentMap
                    incidents={[activeSelected]}
                    place={{
                      id: 'detail',
                      name: activeSelected.location,
                      lat: activeSelected.point[0],
                      lng: activeSelected.point[1],
                      radius: 3,
                    }}
                    onSelect={() => {}}
                  />
                  <a
                    className="setting-link"
                    href={`https://www.google.com/maps/search/?api=1&query=${activeSelected.point.join(',')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View reported location <ArrowUpRight size={16} />
                  </a>
                </>
              )}
              <button
                className="primary-button"
                onClick={() => void share(activeSelected)}
              >
                <Share2 size={16} />
                Share incident
              </button>
              <p className="muted-copy">
                Times shown in Australia/Melbourne. Resource counts are supplied
                by the source and do not identify vehicles. Location is
                approximate.
              </p>
              <a
                className="subtle-button"
                href={activeSelected.officialUrl}
                target="_blank"
                rel="noreferrer"
              >
                Check the official source ↗
              </a>
            </>
          )}
        </SheetContent>
      </Sheet>
      {message && (
        <output className="toast">
          {message}
          <button onClick={() => setMessage('')} aria-label="Dismiss message">
            <X size={15} />
          </button>
        </output>
      )}
    </div>
  );
}
