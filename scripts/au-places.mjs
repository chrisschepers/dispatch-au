// Builds backend/au-places.json: every Australian suburb and locality with its
// postcodes, council (LGA) and a centre point. The website uses it to give each
// incident a place page (/incidents/nsw/penrith) and to link nearby places.
//
// Source: GeoNames postal codes for Australia, https://download.geonames.org/export/zip/AU.zip
// (CC BY 4.0, credited on /sources). Names that occur twice in one state more
// than 30 km apart are different places; their slug gets the council name
// ("glenroy-albury").
//
// Run: node scripts/au-places.mjs   (needs internet, writes the JSON)
import { writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { slugify, normName, distanceKm } from '../backend/places.mjs';

const URL_ZIP = 'https://download.geonames.org/export/zip/AU.zip';
const MERGE_KM = 30;

/**
 * The one file we need from a zip archive (stored or deflated), without a zip
 * library. Sizes come from the central directory: GeoNames writes its local
 * headers with a data descriptor, so their size fields are zero.
 */
function fileFromZip(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const entries = buf.readUInt16LE(eocd + 10);
  let o = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < entries; k++) {
    const method = buf.readUInt16LE(o + 10);
    const size = buf.readUInt32LE(o + 20);
    const nameLen = buf.readUInt16LE(o + 28);
    const extraLen = buf.readUInt16LE(o + 30);
    const commentLen = buf.readUInt16LE(o + 32);
    const local = buf.readUInt32LE(o + 42);
    const file = buf.toString('utf8', o + 46, o + 46 + nameLen);
    if (file === name) {
      const start =
        local +
        30 +
        buf.readUInt16LE(local + 26) +
        buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : inflateRawSync(data);
    }
    o += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not in the zip`);
}

const zip = Buffer.from(
  await (
    await fetch(URL_ZIP, { headers: { 'User-Agent': 'EmergenciesNearMe/1.0' } })
  ).arrayBuffer(),
);
const rows = fileFromZip(zip, 'AU.txt')
  .toString('utf8')
  .split('\n')
  .map((l) => l.split('\t'))
  .filter((f) => f.length >= 11 && f[1] && f[2] && f[4])
  .map((f) => ({
    postcode: f[1],
    name: f[2].trim(),
    state: f[4].toLowerCase(),
    lga: f[5].trim(),
    lat: Number(f[9]),
    lon: Number(f[10]),
  }))
  .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

// Same name in the same state: one place, unless the entries lie far apart.
const groups = new Map();
for (const r of rows) {
  const key = `${r.state}|${normName(r.name)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const places = [];
for (const list of groups.values()) {
  const clusters = [];
  for (const r of list) {
    const near = clusters.find(
      (c) => distanceKm([c[0].lat, c[0].lon], [r.lat, r.lon]) <= MERGE_KM,
    );
    if (near) near.push(r);
    else clusters.push([r]);
  }
  for (const c of clusters) {
    const lat = c.reduce((s, r) => s + r.lat, 0) / c.length;
    const lon = c.reduce((s, r) => s + r.lon, 0) / c.length;
    const postcodes = [...new Set(c.map((r) => r.postcode))].sort((a, b) =>
      a.localeCompare(b),
    );
    places.push({
      state: c[0].state,
      name: c[0].name,
      lga: c[0].lga,
      postcodes,
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      twin: clusters.length > 1,
    });
  }
}
// Slugs: the name, plus the council for names that are two places.
const taken = new Set();
for (const p of places.sort(
  (a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name),
)) {
  let slug = slugify(p.name);
  if (p.twin && p.lga) slug = `${slug}-${slugify(p.lga)}`;
  if (taken.has(`${p.state}/${slug}`)) slug = `${slug}-${p.postcodes[0]}`;
  taken.add(`${p.state}/${slug}`);
  p.slug = slug;
}
writeFileSync(
  new URL('../backend/au-places.json', import.meta.url),
  JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    source: 'GeoNames postal codes (CC BY 4.0), https://www.geonames.org/',
    // [state, name, slug, council, postcodes, lat, lon]
    places: places.map((p) => [
      p.state,
      p.name,
      p.slug,
      p.lga,
      p.postcodes.join(' '),
      p.lat,
      p.lon,
    ]),
  }) + '\n',
);
console.log(
  `places: ${places.length} (${places.filter((p) => p.twin).length} with a twin name)`,
);
