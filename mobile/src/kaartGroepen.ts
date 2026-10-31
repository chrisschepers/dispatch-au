/**
 * Pins groeperen op afstand OP HET SCHERM, niet in graden. Los van
 * react-native, zodat de tests het zonder toestel nalopen
 * (tests/kaartGroepen.test.mjs).
 *
 * Eerder een raster over het kaartbeeld (8 of 6 vakken breed): dat raster
 * schoof mee met elke veeg, dus groepjes vielen bij slepen steeds anders
 * uiteen, en twee pins vlak naast een vakgrens bleven los over elkaar heen
 * liggen. Nu ligt het raster vast aan de wereld (Web Mercator, de projectie
 * van Apple en Google): slepen groepeert nooit opnieuw, alleen zoomen.
 */

/** Wat groeperen van een item moet weten. */
export interface GroepPunt {
  id: string;
  lat: number;
  lon: number;
  /** Hoger wint: wordt eerder het middelpunt van een groep. */
  gewicht: number;
  /** Tijdstip in ms; bij gelijk gewicht wint de nieuwste. */
  tijd: number;
}

export interface KaartGroep<T> {
  /** Het id van de pin zelf, of `g:<id>` van het middelpunt bij een groep. */
  sleutel: string;
  lat: number;
  lon: number;
  /** Het middelpunt eerst, daarna in dezelfde volgorde (gewicht, tijd, id). */
  leden: T[];
}

/**
 * Zoomniveau uit de breedte van het kaartbeeld in graden en in punten. Op
 * halve stappen afgerond, zodat kleine verschillen tussen twee beelden op
 * dezelfde zoom (Android rondt anders af dan iOS) niet opnieuw groeperen.
 */
export function zoomVan(longitudeDelta: number, breedtePt: number): number {
  const zoom = Math.log2((360 * breedtePt) / (256 * longitudeDelta));
  return Math.round(zoom * 2) / 2;
}

/** Plek in wereldpixels (Web Mercator, wereld = 256 · 2^zoom). */
export function naarWereldPixels(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const wereld = 256 * 2 ** zoom;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  return {
    x: ((lon + 180) / 360) * wereld,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * wereld,
  };
}

/** Vaste volgorde: zwaarste eerst, dan de nieuwste, dan op id. */
function vergelijk(a: GroepPunt, b: GroepPunt): number {
  if (a.gewicht !== b.gewicht) return b.gewicht - a.gewicht;
  const ta = Number.isFinite(a.tijd) ? a.tijd : 0;
  const tb = Number.isFinite(b.tijd) ? b.tijd : 0;
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Groepeert items die op `zoom` dichter dan `afstandPt` bij elkaar staan
 * (Chebyshev: horizontaal én verticaal). Het zwaarste nog vrije item is
 * telkens het middelpunt en neemt alle vrije items binnen die afstand mee;
 * de groep staat op zijn plek. De volgorde van de invoer maakt niet uit.
 */
export function groepeer<T>(
  items: readonly T[],
  punt: (t: T) => GroepPunt,
  zoom: number,
  afstandPt: number,
): KaartGroep<T>[] {
  const lijst = items.map((item) => {
    const p = punt(item);
    return { item, p, px: naarWereldPixels(p.lat, p.lon, zoom), vrij: true, volgorde: 0 };
  });
  lijst.sort((a, b) => vergelijk(a.p, b.p));
  lijst.forEach((e, i) => { e.volgorde = i; });

  // Vakken zo groot als de afstand: wat binnen bereik ligt, zit in hetzelfde
  // vak of een van de acht buren.
  const vakken = new Map<string, typeof lijst>();
  const vakVan = (x: number, y: number) => `${Math.floor(x / afstandPt)}:${Math.floor(y / afstandPt)}`;
  for (const e of lijst) {
    const k = vakVan(e.px.x, e.px.y);
    const vak = vakken.get(k);
    if (vak) vak.push(e); else vakken.set(k, [e]);
  }

  const groepen: KaartGroep<T>[] = [];
  for (const kern of lijst) {
    if (!kern.vrij) continue;
    kern.vrij = false;
    const mee = [kern];
    const kx = Math.floor(kern.px.x / afstandPt), ky = Math.floor(kern.px.y / afstandPt);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const e of vakken.get(`${kx + dx}:${ky + dy}`) ?? []) {
          if (!e.vrij) continue;
          if (Math.abs(e.px.x - kern.px.x) <= afstandPt && Math.abs(e.px.y - kern.px.y) <= afstandPt) {
            e.vrij = false;
            mee.push(e);
          }
        }
      }
    }
    mee.sort((a, b) => a.volgorde - b.volgorde);
    groepen.push({
      sleutel: mee.length === 1 ? kern.p.id : `g:${kern.p.id}`,
      lat: kern.p.lat,
      lon: kern.p.lon,
      leden: mee.map((e) => e.item),
    });
  }
  return groepen;
}

/**
 * Liggen alle punten binnen `margeGraden` van elkaar? Dan valt een groep met
 * inzoomen nooit uit elkaar (meldingen in het midden van een plaats delen
 * één coördinaat) en heeft inzoomen geen zin.
 */
export function opEenPlek(punten: ReadonlyArray<{ lat: number; lon: number }>, margeGraden = 0.0003): boolean {
  if (punten.length === 0) return false;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of punten) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  return maxLat - minLat <= margeGraden && maxLon - minLon <= margeGraden;
}
