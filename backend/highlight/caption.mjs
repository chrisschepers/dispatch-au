// The Instagram caption for the incident of the day (concept, 14-11-2026).
// Pure. Only what the scene and the selection already hold: the level, the
// type and the place, why it was chosen, the independence line with the
// official link, the attribution, and a handful of hashtags.
//
// Never a call to go and look: no "visit", "head to", "check it out" or the
// like. People near a fire need the agency's advice, not ours.
import { MAP_CREDIT, INDEPENDENT, dateTimeLabel } from './scene.mjs';

const LICENCE_LINK = new Set(['vic', 'qld', 'act']);
const STATE_TAG = {
  nsw: 'nswfires',
  vic: 'vicfires',
  qld: 'qldfires',
  act: 'canberrafires',
  sa: 'safires',
};
const STATE_EMERGENCY = {
  nsw: 'nswemergency',
  vic: 'vicemergency',
  qld: 'qldemergency',
  act: 'actemergency',
  sa: 'saemergency',
};

/** "bush fire" from ["Bush", "fire"]. */
export function typePhrase(scene) {
  return scene.headline.filter(Boolean).join(' ').toLowerCase();
}

/** The first line: "Watch and Act: bush fire at Wollombi, NSW". */
export function firstLine(scene) {
  const what = typePhrase(scene);
  const where = scene.place ? `${scene.place}, ${scene.state}` : scene.state;
  const line = `${what} at ${where}`;
  return scene.level
    ? `${scene.level.label}: ${line}`
    : line.charAt(0).toUpperCase() + line.slice(1);
}

export function hashtags(scene, max = 8) {
  const type = typePhrase(scene);
  const fire = /fire/.test(type);
  const tags = [];
  if (/grass/.test(type)) tags.push('grassfire', 'bushfire');
  else if (/bush|vegetation|scrub|forest|wildfire/.test(type))
    tags.push('bushfire');
  else if (/structure|building|house|residential/.test(type))
    tags.push('housefire');
  else if (fire) tags.push('fire');
  tags.push(fire ? STATE_TAG[scene.region] : STATE_EMERGENCY[scene.region]);
  const place = String(scene.place ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
  if (place.length >= 3) tags.push(place);
  if (scene.aircraftCount) tags.push('aerialfirefighting');
  if (fire) tags.push('fireseason');
  tags.push('australia', 'emergenciesnearme');
  return [...new Set(tags.filter(Boolean))].slice(0, max).map((t) => `#${t}`);
}

/**
 * The caption, as paragraphs separated by a blank line. `selection` is the
 * result of selectIncidentOfTheDay (its `why`).
 */
export function buildCaption(scene, selection) {
  const parts = [firstLine(scene)];
  if (selection?.why) parts.push(`Why this one: ${selection.why}.`);
  const facts = [];
  const first = scene.steps[0];
  if (first)
    facts.push(
      `${first.label} ${dateTimeLabel(Date.parse(first.at), scene.tz)}`,
    );
  if (scene.sizeHa)
    facts.push(
      `fire size ${Math.round(scene.sizeHa).toLocaleString('en-AU')} ha`,
    );
  if (scene.aircraftCount)
    facts.push(
      `${scene.aircraftCount} firefighting aircraft linked to it${scene.tracks.length ? ` (${scene.tracks.map((t) => t.name).join(', ')})` : ''}`,
    );
  if (scene.status) facts.push(`latest status: ${scene.status.toLowerCase()}`);
  if (facts.length) {
    const s = facts.join(' · ');
    parts.push(s.charAt(0).toUpperCase() + s.slice(1) + '.');
  }
  parts.push(
    `${INDEPENDENT}. For warnings and advice: ${scene.source.adviceUrl}`,
  );
  const credits = [scene.source.line];
  if (LICENCE_LINK.has(scene.region) && scene.source.licenseUrl)
    credits.push(`Licence: ${scene.source.licenseUrl}`);
  if (scene.aircraftLine) credits.push(scene.aircraftLine);
  credits.push(`Map: ${MAP_CREDIT}.`);
  parts.push(credits.join('\n'));
  parts.push(hashtags(scene).join(' '));
  return parts.join('\n\n');
}
