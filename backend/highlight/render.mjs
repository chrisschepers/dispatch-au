// Renders the incident of the day (concept, 14-11-2026): the still as PNG and
// JPEG, and the reel as H.264 MP4. Same pipeline as the Dutch app's reel: one
// Puppeteer screenshot per frame at `window.__zetTijd(i / FPS)`, piped as JPEG
// straight into ffmpeg (no frame files on disk).
//
// Puppeteer is not a dependency of this service. Pass a browser in, or let
// launchBrowser() load Puppeteer from PUPPETEER_DIR (a folder whose
// node_modules holds puppeteer).
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, SCENE_SEC, TOTAL_SEC, SIZES, renderSceneHtml } from './scene.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const ICON_PATH = join(HERE, '../../mobile/assets/icon.png');
/**
 * Apple's official "Download on the App Store" badge (US-UK English, black),
 * unmodified, from https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg
 * (fetched 14-11-2026, sha256 a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f).
 * Do not recolour, crop or redraw it; keep the trademark line on the end card.
 */
export const BADGE_PATH = join(HERE, 'assets/app-store-badge-en.svg');
const MAP_TIMEOUT_MS = 30_000;

/** The app icon and the badge as data URIs; null for a file that is missing. */
export function loadAssets({ icon = ICON_PATH, badge = BADGE_PATH } = {}) {
  const uri = (path, type) =>
    existsSync(path)
      ? `data:${type};base64,${readFileSync(path).toString('base64')}`
      : null;
  return { icon: uri(icon, 'image/png'), badge: uri(badge, 'image/svg+xml') };
}

export const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-font-subpixel-positioning',
];

export async function launchBrowser(dir = process.env.PUPPETEER_DIR) {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    if (!dir)
      throw new Error(
        'Puppeteer not found: set PUPPETEER_DIR to a folder with node_modules/puppeteer',
      );
    puppeteer = createRequire(join(dir, 'index.js'))('puppeteer');
  }
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: CHROMIUM_ARGS,
  });
}

/** Opens the scene; when the map does not load in time, the version without a map. */
export async function openScene(
  browser,
  scene,
  format,
  { assets = loadAssets(), map = true, fonts } = {},
) {
  const { w, h } = SIZES[format];
  const tries =
    map && (scene.point || scene.area.length) ? [true, false] : [false];
  let last;
  for (const withMap of tries) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.setContent(
        renderSceneHtml(scene, format, {
          map: withMap,
          icon: assets.icon,
          badge: assets.badge,
          fonts,
        }),
        {
          waitUntil: 'load',
          timeout: 30_000,
        },
      );
      await page.waitForFunction(
        'window.__klaar === true || window.__kaartFout === true',
        { timeout: MAP_TIMEOUT_MS },
      );
      if (await page.evaluate('window.__kaartFout === true'))
        throw new Error('map did not load');
      await page.evaluate(
        'document.fonts ? document.fonts.ready.then(() => true) : true',
      );
      return { page, withMap };
    } catch (err) {
      last = err;
      await page.close().catch(() => undefined);
      if (withMap)
        console.warn(
          JSON.stringify({
            iotd: 'map unavailable, rendering without map',
            error: String(err).slice(0, 160),
          }),
        );
    }
  }
  throw last ?? new Error('scene could not be opened');
}

/** The still: the end state of the scene, as PNG and as a lighter JPEG. */
export async function renderStill(browser, scene, opts = {}) {
  const { page, withMap } = await openScene(browser, scene, 'still', opts);
  try {
    await page.evaluate(`window.__zetTijd(${SCENE_SEC})`);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ type: 'png' }); // warms the glyph cache
    const png = Buffer.from(await page.screenshot({ type: 'png' }));
    const jpg = Buffer.from(
      await page.screenshot({ type: 'jpeg', quality: 88 }),
    );
    return { png, jpg, withMap };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** ffmpeg for the reel, after the Dutch reel: H.264 high, yuv420p, TV range, closed GOP, moov first, silent AAC. */
export function ffmpegArgs(out) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(FPS),
    '-c:v',
    'mjpeg',
    '-i',
    'pipe:0',
    // Instagram expects an audio track in a reel; the concept has no sound.
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=mono:sample_rate=44100',
    '-filter_complex',
    '[0:v]scale=in_range=full:out_range=tv,format=yuv420p[v]',
    '-map',
    '[v]',
    '-map',
    '1:a',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    '-preset',
    'medium',
    '-crf',
    '19',
    '-g',
    String(FPS),
    '-flags',
    '+cgop',
    '-r',
    String(FPS),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '44100',
    '-ac',
    '1',
    '-t',
    String(TOTAL_SEC),
    '-movflags',
    '+faststart',
    out,
  ];
}

/**
 * The reel: every frame a screenshot at its own time, piped into ffmpeg.
 * `frameHook(i, jpg)` may keep a few frames for checking. Returns the cover
 * (end state of the scene) as JPEG.
 */
export async function renderReel(
  browser,
  scene,
  out,
  { ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', frameHook, ...opts } = {},
) {
  const { page, withMap } = await openScene(browser, scene, 'reel', opts);
  try {
    const ff = spawn(ffmpeg, ffmpegArgs(out), {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let err = '';
    ff.stderr.on('data', (d) => {
      err = (err + d.toString()).slice(-2000);
    });
    const done = new Promise((resolve, reject) => {
      ff.on('error', (e) => reject(new Error(`ffmpeg did not start: ${e}`)));
      ff.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited with ${code}: ${err}`)),
      );
    });
    ff.stdin.on('error', () => undefined);
    const frames = Math.round(FPS * TOTAL_SEC);
    for (let i = 0; i < frames; i++) {
      await page.evaluate(`window.__zetTijd(${(i / FPS).toFixed(4)})`);
      const jpg = Buffer.from(
        await page.screenshot({ type: 'jpeg', quality: 92 }),
      );
      if (frameHook) await frameHook(i, jpg);
      if (!ff.stdin.write(jpg))
        await Promise.race([
          new Promise((r) => ff.stdin.once('drain', r)),
          done.then(() => {
            throw new Error('ffmpeg stopped before all frames were in');
          }),
        ]);
    }
    ff.stdin.end();
    await done;
    await page.evaluate(`window.__zetTijd(${SCENE_SEC})`);
    const cover = Buffer.from(
      await page.screenshot({ type: 'jpeg', quality: 92 }),
    );
    return { frames, cover, withMap };
  } finally {
    await page.close().catch(() => undefined);
  }
}
