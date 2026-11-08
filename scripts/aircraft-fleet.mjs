// Builds backend/aircraft-fleet.json: the firefighting, rescue, police and
// flying doctor aircraft the aircraft layer follows (wish Chris 08-11-2026).
// The logic lives in backend/fleet.mjs, which the service also uses for its
// nightly rebuild; this bundled file is the fallback when that fails.
//
// Run: node scripts/aircraft-fleet.mjs   (needs internet, writes the JSON)
import { writeFileSync } from 'node:fs';
import { fetchFleet, SOURCES } from '../backend/fleet.mjs';

const { fleet, counts, missing, doubtful } = await fetchFleet();
writeFileSync(
  new URL('../backend/aircraft-fleet.json', import.meta.url),
  JSON.stringify(
    { built: new Date().toISOString().slice(0, 10), sources: SOURCES, fleet },
    null,
    1,
  ) + '\n',
);
console.log(
  `fleet: ${fleet.length} aircraft ${JSON.stringify(counts)} (${missing} NAFC registrations without a hex code)`,
);
for (const [registration, reason] of doubtful)
  console.log(`left out: ${registration} (${reason})`);
