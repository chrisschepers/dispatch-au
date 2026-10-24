// Push alerts for the mobile app (contract: docs/PUSH-API.md).
//
// Three parts:
//  1. devices: register a device and keep its filter (place, radius per
//     service, warnings only, Emergency Warnings anywhere);
//  2. matching: after every successful ingest, compare the feed rows with
//     what we saw before. A new incident with a location, or a higher warning
//     level, is sent to every device whose filter it fits;
//  3. sending: straight to Apple (APNs, token auth with a .p8 key from the
//     environment) for iOS device tokens, or through the Expo push service for
//     Expo tokens. No Expo account is needed for the APNs route.
//
// Everything lives in the same SQLite database as the incidents.
import http2 from 'node:http2';
import crypto from 'node:crypto';
import { canonicalVIC } from './regional.mjs';

const SERVICE_OF_CATEGORY = {
  fire: 'Fire',
  planned: 'Fire',
  ambulance: 'Ambulance',
  rescue: 'Rescue',
  storm: 'Storm',
  hazmat: 'Hazmat',
  other: 'Other',
};
const NATIONWIDE_KM = 5000;
// Only incidents that started recently get an alert; a feed that suddenly
// lists something from yesterday is not news.
const FRESH_MS = 2 * 3600_000;

export function serviceOf(row) {
  return SERVICE_OF_CATEGORY[row.category] ?? 'Other';
}

/** 0 none, 1 Advice, 2 Watch and Act, 3 Emergency Warning. */
export function levelRank(level) {
  const l = String(level ?? '').toLowerCase();
  if (l.includes('emergency')) return 3;
  if (l.includes('watch')) return 2;
  if (l.includes('advice')) return 1;
  return 0;
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

// Ray casting on GeoJSON rings ([lon, lat]): inside the outer ring and in
// none of its holes.
function inPolygon(rings, lat, lon) {
  if (!Array.isArray(rings) || !rings.length) return false;
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > lat !== yj > lat &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      )
        inside = !inside;
    }
    return inside;
  };
  return inRing(rings[0]) && !rings.slice(1).some(inRing);
}

/** Does the geometry contain a warning area (not just a pin or a line)? */
export function hasArea(geometry) {
  if (!geometry) return false;
  if (geometry.type === 'GeometryCollection')
    return (geometry.geometries ?? []).some(hasArea);
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

/** Is this place inside one of the areas of the geometry? */
export function insideArea(geometry, lat, lon) {
  if (!geometry || lat == null || lon == null) return false;
  if (geometry.type === 'GeometryCollection')
    return (geometry.geometries ?? []).some((g) => insideArea(g, lat, lon));
  if (geometry.type === 'Polygon')
    return inPolygon(geometry.coordinates, lat, lon);
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates.some((p) => inPolygon(p, lat, lon));
  return false;
}

/** Does this incident belong in this device's alerts? */
export function fits(device, row, { upgrade = false } = {}) {
  if (device.filter.emergencyWarningsAnywhere && levelRank(row.level) === 3)
    return true;
  return fitsPlace(device, row, { upgrade });
}

/**
 * The filter without "Emergency Warnings anywhere": is this about the
 * device's own place? Only such alerts may break through silent mode.
 */
export function fitsPlace(device, row, { upgrade = false } = {}) {
  const f = device.filter;
  const rank = levelRank(row.level);
  if (!f.notificationsEnabled) return false;
  const service = serviceOf(row);
  if (
    Array.isArray(f.services) &&
    f.services.length &&
    !f.services.includes(service)
  )
    return false;
  if (f.warningsOnly && rank === 0) return false;
  if (device.lat == null || device.lon == null) return false;
  // A warning covers an area. Whoever is inside it must hear about it,
  // however far away its pin is, and also when it has no pin at all
  // (Queensland and SA warnings often only have the area).
  if (rank >= 1 && insideArea(row.geometry, device.lat, device.lon))
    return true;
  if (!row.point) return false;
  const radius = Number(f.radiusPerService?.[service] ?? f.radiusKm ?? 20);
  if (radius >= NATIONWIDE_KM) return true;
  // An upgrade to Watch and Act or higher reaches a bit further than the
  // radius: people just outside it want to know too.
  const reach = upgrade && rank >= 2 ? radius * 1.5 : radius;
  return distanceKm([device.lat, device.lon], row.point) <= reach;
}

function suburb(location) {
  const parts = String(location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export function messageFor(row, device, { upgrade = false } = {}) {
  const place = suburb(row.location);
  const title =
    upgrade && row.level
      ? `${row.level}: ${row.title}${place ? ` in ${place}` : ''}`
      : `${row.title}${place ? ` in ${place}` : ''}`;
  const km =
    row.point && device.lat != null
      ? distanceKm([device.lat, device.lon], row.point)
      : null;
  const body = [
    row.location?.split(',').slice(0, -1).join(',').trim() || null,
    row.level || row.status || null,
    km != null
      ? km < 1
        ? `${Math.round(km * 1000)} m`
        : `${km.toFixed(1)} km`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { title, body, data: { incidentId: row.id } };
}

// ── APNs ────────────────────────────────────────────────────────────────────

export function apnsConfigured(env = process.env) {
  return Boolean(env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID);
}

let apnsJwt = { token: null, at: 0 };
function apnsToken(env) {
  // Apple wants a fresh token at most once every 20 minutes, at least hourly.
  if (apnsJwt.token && Date.now() - apnsJwt.at < 40 * 60_000)
    return apnsJwt.token;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b64({ alg: 'ES256', kid: env.APNS_KEY_ID })}.${b64({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })}`;
  const key = env.APNS_KEY.includes('BEGIN')
    ? env.APNS_KEY
    : Buffer.from(env.APNS_KEY, 'base64').toString('utf8');
  const sig = crypto
    .sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  apnsJwt = { token: `${head}.${sig}`, at: Date.now() };
  return apnsJwt.token;
}

/**
 * A critical alert plays at full volume through silent mode and Focus.
 * iOS only honours it when the app has Apple's Critical Alerts entitlement
 * and the user allowed it; otherwise it arrives as a normal alert.
 */
export function apnsPayload(msg, sound, critical = false) {
  const name = sound ? `${sound}.wav` : 'default';
  return {
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: critical ? { critical: 1, name, volume: 1 } : name,
      ...(critical ? { 'interruption-level': 'critical' } : {}),
    },
    ...msg.data,
  };
}

/** Sends one alert per token; returns tokens Apple says are gone. */
async function sendApns(items, env) {
  const host =
    env.APNS_ENV === 'sandbox'
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';
  const topic = env.APNS_TOPIC || 'com.chrisschepers.dispatchau';
  const dead = [];
  const client = http2.connect(host);
  client.on('error', () => {});
  try {
    await Promise.all(
      items.map(
        ({ token, msg, sound, critical }) =>
          new Promise((resolve) => {
            const req = client.request({
              ':method': 'POST',
              ':path': `/3/device/${token}`,
              authorization: `bearer ${apnsToken(env)}`,
              'apns-topic': topic,
              'apns-push-type': 'alert',
              'apns-priority': '10',
            });
            let status = 0;
            let body = '';
            req.setTimeout(10_000, () => {
              req.close();
              resolve();
            });
            req.on('response', (h) => {
              status = Number(h[':status']);
            });
            req.on('data', (d) => {
              body += d;
            });
            req.on('end', () => {
              if (status === 410 || /BadDeviceToken|Unregistered/.test(body))
                dead.push(token);
              else if (status !== 200)
                console.warn(
                  JSON.stringify({
                    push: 'apns',
                    status,
                    body: body.slice(0, 120),
                  }),
                );
              resolve();
            });
            req.on('error', () => resolve());
            req.end(JSON.stringify(apnsPayload(msg, sound, critical)));
          }),
      ),
    );
  } finally {
    client.close();
  }
  return dead;
}

/** Expo tokens (ExponentPushToken[...]) go through Expo's push service. */
async function sendExpo(items) {
  const dead = [];
  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(
          batch.map(({ token, msg, sound }) => ({
            to: token,
            title: msg.title,
            body: msg.body,
            data: msg.data,
            sound: sound ? `${sound}.wav` : 'default',
            channelId: `dispatch_snd_${sound || 'zacht'}`,
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await res.json().catch(() => ({}));
      (j.data ?? []).forEach((t, k) => {
        if (t?.details?.error === 'DeviceNotRegistered')
          dead.push(batch[k].token);
      });
    } catch (error) {
      console.warn(
        JSON.stringify({ push: 'expo', error: String(error).slice(0, 120) }),
      );
    }
  }
  return dead;
}

// ── FCM (Android) ───────────────────────────────────────────────────────────

/** Service account of the Firebase project, as JSON or base64 JSON. */
function fcmAccount(env) {
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(
      raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8'),
    );
  } catch {
    return null;
  }
}

export function fcmConfigured(env = process.env) {
  return Boolean(fcmAccount(env)?.private_key);
}

let fcmAuth = { token: null, at: 0 };
/** OAuth token through the service account (JWT bearer flow), kept 50 min. */
async function fcmAccessToken(sa) {
  if (fcmAuth.token && Date.now() - fcmAuth.at < 50 * 60_000)
    return fcmAuth.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto
    .sign('sha256', Buffer.from(head), sa.private_key)
    .toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${sig}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('FCM: no access token');
  fcmAuth = { token: j.access_token, at: Date.now() };
  return fcmAuth.token;
}

/** Native FCM tokens from the Android app; returns tokens Google says are gone. */
async function sendFcm(items, env) {
  const sa = fcmAccount(env);
  const dead = [];
  let auth;
  try {
    auth = await fcmAccessToken(sa);
  } catch (error) {
    console.warn(
      JSON.stringify({ push: 'fcm', error: String(error).slice(0, 120) }),
    );
    return dead;
  }
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  for (let i = 0; i < items.length; i += 20) {
    await Promise.all(
      items.slice(i, i + 20).map(async ({ token, msg, sound, critical }) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${auth}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: msg.title, body: msg.body },
                // FCM data values must be strings.
                data: Object.fromEntries(
                  Object.entries(msg.data).map(([k, v]) => [k, String(v)]),
                ),
                android: {
                  priority: 'HIGH',
                  // The app that switches `critical` on also creates this
                  // channel (alarm audio, may bypass Do Not Disturb).
                  notification: {
                    channel_id: critical
                      ? 'dispatch_kritiek'
                      : `dispatch_snd_${sound || 'zacht'}`,
                    sound: sound || 'zacht',
                  },
                },
              },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) return;
          const body = await res.text();
          if (
            res.status === 404 ||
            /UNREGISTERED|registration-token-not-registered/.test(body)
          )
            dead.push(token);
          else
            console.warn(
              JSON.stringify({
                push: 'fcm',
                status: res.status,
                body: body.slice(0, 120),
              }),
            );
        } catch (error) {
          console.warn(
            JSON.stringify({ push: 'fcm', error: String(error).slice(0, 120) }),
          );
        }
      }),
    );
  }
  return dead;
}

// ── Store ───────────────────────────────────────────────────────────────────

const DEFAULT_FILTER = {
  radiusKm: 20,
  radiusPerService: {},
  services: [],
  warningsOnly: false,
  emergencyWarningsAnywhere: false,
  sound: 'zacht',
  notificationsEnabled: false,
  // Emergency Warnings for the device's own place break through silent mode.
  critical: false,
};

export class PushService {
  constructor(db, { env = process.env, send } = {}) {
    this.db = db;
    this.env = env;
    this.sendOverride = send;
    db.exec(`
      CREATE TABLE IF NOT EXISTS devices(
        id TEXT PRIMARY KEY, device_id TEXT UNIQUE NOT NULL, push_token TEXT, platform TEXT,
        install_hash TEXT NOT NULL, lat REAL, lon REAL, filter TEXT NOT NULL,
        app_version TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS push_seen(incident_id TEXT PRIMARY KEY, region TEXT NOT NULL, rank INTEGER NOT NULL, seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS push_sent(device TEXT NOT NULL, incident_id TEXT NOT NULL, rank INTEGER NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY(device, incident_id, rank));
    `);
  }

  register({ deviceId, pushToken, platform, lat, lon, appVersion }) {
    if (
      typeof deviceId !== 'string' ||
      deviceId.length < 8 ||
      deviceId.length > 100
    )
      throw new RangeError('deviceId');
    const token =
      typeof pushToken === 'string' && pushToken.length <= 300
        ? pushToken.trim() || null
        : null;
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id FROM devices WHERE device_id=?')
      .get(deviceId);
    const place = validPlace(lat, lon);
    if (existing) {
      this.db
        .prepare(`UPDATE devices SET push_token=COALESCE(?,push_token), platform=COALESCE(?,platform),
        lat=COALESCE(?,lat), lon=COALESCE(?,lon), app_version=COALESCE(?,app_version), updated_at=? WHERE id=?`)
        .run(
          token,
          platform ?? null,
          place?.lat ?? null,
          place?.lon ?? null,
          appVersion ?? null,
          now,
          existing.id,
        );
      return { id: existing.id };
    }
    const id = crypto.randomUUID();
    const installationToken = crypto.randomBytes(32).toString('hex');
    this.db
      .prepare(`INSERT INTO devices(id,device_id,push_token,platform,install_hash,lat,lon,filter,app_version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id,
        deviceId,
        token,
        platform ?? null,
        hash(installationToken),
        place?.lat ?? null,
        place?.lon ?? null,
        JSON.stringify(DEFAULT_FILTER),
        appVersion ?? null,
        now,
        now,
      );
    return { id, installationToken };
  }

  authorised(id, installationToken) {
    const d = this.db
      .prepare('SELECT install_hash FROM devices WHERE id=?')
      .get(id);
    if (!d || typeof installationToken !== 'string') return false;
    const a = Buffer.from(d.install_hash);
    const b = Buffer.from(hash(installationToken));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  setFilter(id, body) {
    const d = this.db.prepare('SELECT filter FROM devices WHERE id=?').get(id);
    if (!d) return false;
    const f = { ...DEFAULT_FILTER, ...JSON.parse(d.filter) };
    const num = (v, lo, hi) =>
      typeof v === 'number' && Number.isFinite(v)
        ? Math.min(hi, Math.max(lo, v))
        : undefined;
    if (num(body.radiusKm, 1, NATIONWIDE_KM) !== undefined)
      f.radiusKm = num(body.radiusKm, 1, NATIONWIDE_KM);
    if (body.radiusPerService && typeof body.radiusPerService === 'object') {
      f.radiusPerService = Object.fromEntries(
        Object.entries(body.radiusPerService)
          .filter(
            ([k, v]) =>
              typeof k === 'string' &&
              k.length < 20 &&
              num(v, 1, NATIONWIDE_KM) !== undefined,
          )
          .slice(0, 10)
          .map(([k, v]) => [k, num(v, 1, NATIONWIDE_KM)]),
      );
    }
    if (Array.isArray(body.services))
      f.services = body.services
        .filter((s) => typeof s === 'string')
        .slice(0, 10);
    for (const k of [
      'warningsOnly',
      'emergencyWarningsAnywhere',
      'notificationsEnabled',
      'critical',
    ]) {
      if (typeof body[k] === 'boolean') f[k] = body[k];
    }
    if (typeof body.sound === 'string' && /^[a-z]{2,12}$/.test(body.sound))
      f.sound = body.sound;
    const place = validPlace(body.lat, body.lon);
    this.db
      .prepare(
        'UPDATE devices SET filter=?, lat=COALESCE(?,lat), lon=COALESCE(?,lon), updated_at=? WHERE id=?',
      )
      .run(
        JSON.stringify(f),
        place?.lat ?? null,
        place?.lon ?? null,
        new Date().toISOString(),
        id,
      );
    return true;
  }

  devices() {
    return this.db
      .prepare(
        `SELECT id, push_token, lat, lon, filter FROM devices WHERE push_token IS NOT NULL`,
      )
      .all()
      .map((d) => ({
        ...d,
        filter: { ...DEFAULT_FILTER, ...JSON.parse(d.filter) },
      }));
  }

  /**
   * After a successful ingest: find new incidents and higher warning levels,
   * and send them. The first round for a region only learns what is there.
   */
  async process(region, feed, now = Date.now()) {
    const rows = [...(feed.incidents ?? []), ...(feed.warnings ?? [])].map(
      (r) => (region === 'vic' ? { ...r, id: canonicalVIC(r) } : r),
    );
    const known = this.db
      .prepare('SELECT count(*) AS n FROM push_seen WHERE region=?')
      .get(region).n;
    const getSeen = this.db.prepare(
      'SELECT rank FROM push_seen WHERE incident_id=?',
    );
    const putSeen = this.db.prepare(`INSERT INTO push_seen VALUES (?,?,?,?)
      ON CONFLICT(incident_id) DO UPDATE SET rank=MAX(rank, excluded.rank)`);
    const events = [];
    const at = new Date(now).toISOString();
    for (const row of rows) {
      const rank = levelRank(row.level);
      const seen = getSeen.get(row.id);
      putSeen.run(row.id, region, rank, at);
      if (!known) continue;
      if (!seen) {
        const started = Date.parse(row.created ?? row.updated ?? at);
        if (Number.isFinite(started) && now - started > FRESH_MS) continue;
        if (!row.point && !(rank >= 1 && hasArea(row.geometry)) && rank < 3)
          continue;
        events.push({ row, upgrade: false, rank });
      } else if (rank > seen.rank && rank >= 1) {
        events.push({ row, upgrade: true, rank });
      }
    }
    // Forget incidents that left the feed a week ago.
    this.db
      .prepare('DELETE FROM push_seen WHERE region=? AND seen_at<?')
      .run(region, new Date(now - 7 * 86400_000).toISOString());
    this.db
      .prepare('DELETE FROM push_sent WHERE sent_at<?')
      .run(new Date(now - 7 * 86400_000).toISOString());
    if (!events.length) return { events: 0, sent: 0 };

    // One event, one alert. NSW lists a Watch and Act twice: as the incident
    // with its pin and as a warning row without any place. Keep the highest
    // level, and on a tie the row that knows where it is.
    const placed = (r) => !!r.point || hasArea(r.geometry);
    const better = (a, b) =>
      a.rank !== b.rank ? a.rank > b.rank : placed(a.row) && !placed(b.row);
    const unique = new Map();
    for (const ev of events) {
      const key = `${ev.row.sourceFeed ?? region}|${ev.row.sourceId ?? ev.row.id}`;
      const kept = unique.get(key);
      if (!kept || better(ev, kept)) unique.set(key, ev);
    }

    const devices = this.devices();
    const markSent = this.db.prepare(
      'INSERT INTO push_sent VALUES (?,?,?,?) ON CONFLICT DO NOTHING',
    );
    const items = [];
    for (const ev of unique.values()) {
      for (const d of devices) {
        if (!fits(d, ev.row, { upgrade: ev.upgrade })) continue;
        if (markSent.run(d.id, ev.row.id, ev.rank, at).changes === 0) continue;
        items.push({
          device: d.id,
          token: d.push_token,
          sound: d.filter.sound,
          // Never for "Emergency Warnings anywhere": only an Emergency
          // Warning for your own place may wake you up.
          critical:
            d.filter.critical === true &&
            ev.rank === 3 &&
            fitsPlace(d, ev.row, { upgrade: ev.upgrade }),
          msg: messageFor(ev.row, d, ev),
        });
      }
    }
    if (!items.length) return { events: events.length, sent: 0 };
    const dead = await this.send(items);
    if (dead.length) {
      const clear = this.db.prepare(
        'UPDATE devices SET push_token=NULL WHERE push_token=?',
      );
      for (const t of dead) clear.run(t);
    }
    console.log(
      JSON.stringify({
        push: 'sent',
        region,
        events: events.length,
        alerts: items.length,
        dead: dead.length,
      }),
    );
    return { events: events.length, sent: items.length };
  }

  async send(items) {
    if (this.sendOverride) return this.sendOverride(items);
    const expo = items.filter((i) => i.token.startsWith('ExponentPushToken'));
    const apns = items.filter((i) => /^[0-9a-f]{64,200}$/i.test(i.token));
    // Everything else is a native FCM token from the Android app.
    const fcm = items.filter(
      (i) =>
        !i.token.startsWith('ExponentPushToken') &&
        !/^[0-9a-f]{64,200}$/i.test(i.token),
    );
    const dead = [];
    if (fcm.length) {
      if (fcmConfigured(this.env)) dead.push(...(await sendFcm(fcm, this.env)));
      else
        console.warn(
          JSON.stringify({
            push: 'fcm',
            skipped: fcm.length,
            reason: 'FCM_SERVICE_ACCOUNT not configured',
          }),
        );
    }
    if (expo.length) dead.push(...(await sendExpo(expo)));
    if (apns.length) {
      if (apnsConfigured(this.env))
        dead.push(...(await sendApns(apns, this.env)));
      else
        console.warn(
          JSON.stringify({
            push: 'apns',
            skipped: apns.length,
            reason: 'APNS_KEY not configured',
          }),
        );
    }
    return dead;
  }
}

function hash(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

function validPlace(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  return { lat, lon };
}
