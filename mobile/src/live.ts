/**
 * "Live" for Dispatch. 112 Meldingen keeps a WebSocket open to its backend;
 * the Australian feed service has none, and its sources update every one to
 * thirty minutes anyway. So: refresh the national feed every minute while the
 * app is in front, and hand every incident we have not seen before to the
 * screen, which decides whether it falls inside your radius.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { haalFeed, type Melding } from './api';

export type LiveStatus = 'verbonden' | 'verbinden' | 'offline';

const ELKE_MS = 60_000;

export function useLive(opNieuw: (m: Melding) => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('verbinden');
  const gezien = useRef<Set<string> | null>(null);
  const terug = useRef(opNieuw);
  terug.current = opNieuw;

  useEffect(() => {
    let weg = false;
    const ronde = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const { meldingen, feed } = await haalFeed(24);
        if (weg) return;
        setStatus(feed.stale ? 'verbinden' : 'verbonden');
        const ids = new Set(meldingen.map((m) => m.id));
        // First round only learns what is already there; no flood on start.
        if (gezien.current) {
          for (const m of meldingen) if (!gezien.current.has(m.id)) terug.current(m);
        }
        gezien.current = ids;
      } catch {
        if (!weg) setStatus('offline');
      }
    };
    void ronde();
    const t = setInterval(() => void ronde(), ELKE_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void ronde(); });
    return () => { weg = true; clearInterval(t); sub.remove(); };
  }, []);

  return status;
}
