import { useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeFeed, feedIsStale, type Feed } from './domain/incidents';
import { defaults, parsePreferences, type Preferences } from './preferences';
const KEY = 'dispatch.preferences.v1';
const SOURCE = 'https://emergency.vic.gov.au/public/events-geojson.json';
export function useDispatch() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [ready, setReady] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const writes = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    if (request.current || AppState.currentState !== 'active') return;
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      const response = await fetch(SOURCE, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw Error('Source unavailable');
      const body = await response.text();
      if (body.length > 6000000) throw Error('Unexpected source size');
      const next = normalizeFeed(JSON.parse(body));
      if (mounted.current) {
        setFeed(next);
        setError('');
        setNow(Date.now());
      }
    } catch {
      if (mounted.current)
        setError(
          'Could not update VicEmergency. Check your connection and try again.',
        );
    } finally {
      clearTimeout(timer);
      if (request.current === controller) request.current = null;
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (mounted.current) {
          setPrefs(parsePreferences(raw));
          setStorageLoaded(true);
        }
      })
      .catch(() => {
        if (mounted.current)
          setStorageError('Saved preferences could not be read.');
      })
      .finally(() => {
        if (mounted.current) setReady(true);
      });
    void refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 60000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        void refresh();
      } else request.current?.abort();
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      sub.remove();
      request.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (!ready || !storageLoaded) return;
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(KEY, JSON.stringify(prefs)))
      .catch(() => {
        if (mounted.current)
          setStorageError('Changes could not be saved on this device.');
      });
  }, [prefs, ready, storageLoaded]);
  return {
    feed,
    loading,
    error,
    now,
    refresh,
    prefs,
    setPrefs,
    ready,
    storageError,
    stale: !!feed && (!!error || feedIsStale(feed, now)),
  };
}
