import { useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { parseFeed, isStale, type Feed } from './feed-model';
import { defaults, parsePreferences, type Preferences } from './preferences';
const KEY = 'dispatch.preferences.v1';
const API = String(Constants.expoConfig?.extra?.feedApiUrl || '').replace(
  /\/$/,
  '',
);
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
  const selection = `${prefs.region}:${prefs.historyHours}`;
  const activeSelection = useRef(selection);
  activeSelection.current = selection;
  const writes = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    if (!ready || request.current || AppState.currentState !== 'active') return;
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    setLoading(true);
    try {
      if (!/^https:\/\//.test(API)) throw Error('Feed service unavailable');
      const response = await fetch(
        `${API}/v1/feed?region=${prefs.region}&hours=${prefs.historyHours}`,
        {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        },
      );
      if (!response.ok) throw Error('Source unavailable');
      const body = await response.text();
      if (body.length > 6000000) throw Error('Unexpected source size');
      const next = parseFeed(JSON.parse(body), prefs.region);
      if (mounted.current && activeSelection.current === selection) {
        setFeed(next);
        setError('');
        setNow(Date.now());
      }
    } catch {
      if (
        mounted.current &&
        activeSelection.current === selection &&
        (!controller.signal.aborted || timedOut)
      )
        setError(
          'Could not update incidents. Check your connection and try again.',
        );
    } finally {
      clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, [ready, prefs.region, prefs.historyHours, selection]);
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
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setError('');
    void refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 60000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        void refresh();
      } else {
        request.current?.abort();
        request.current = null;
        setLoading(false);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      request.current?.abort();
      request.current = null;
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
    feed: feed?.region === prefs.region ? feed : null,
    loading,
    error,
    now,
    refresh,
    prefs,
    setPrefs,
    ready,
    storageError,
    stale: feed?.region === prefs.region && (!!error || isStale(feed, now)),
  };
}
