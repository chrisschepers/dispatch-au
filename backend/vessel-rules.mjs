// Which AIS vessels are rescue, police, patrol or fire boats (vessels.mjs).
//
// Measured on Open Waters AIS around Australia on 13-11-2026. The AIS ship
// type alone is not enough, in both directions:
// - right vessel, wrong type: "MARINE RESCUE MH30" sends type 50 (pilot),
//   "WP-401", "WP43" and "QPV VEDETTE" type 37 (pleasure craft), the police
//   launch "NEMESIS" type 37, "GLADSTONERESCUE3" type 31, "JETSKI RESCUE 2"
//   no type at all;
// - right type, wrong vessel: "ADV STOKER" (a 96 m navy auxiliary) and
//   "ENGAGE CRUSADER" (33 m offshore vessel) send type 51, and type 55 also
//   holds fisheries and Border Force patrols and Pacific patrol boats.
// And a name alone is not enough either: "PV HAMELIN" (type 55) is a police
// vessel, "PV SHARP" (type 50) a pilot vessel; "VP15" (type 55) is Victoria
// Police, "VP31" (type 51) a volunteer rescue boat in Queensland.
//
// So: a few unmistakable names count whatever the type, weaker names only when
// the type does not say otherwise, and the bare type is the fallback.

/** AIS ship types. */
const SAR = 51;
const LAW = 55;
const PILOT = 50;
/** Fishing, sailing, pleasure craft, passenger, cargo and tanker. */
function isOrdinary(type) {
  return (
    type === 30 || type === 36 || type === 37 || (type >= 60 && type <= 89)
  );
}

/** A type 51 vessel longer than this without a rescue name is a ship, not a rescue boat. */
export const MAX_RESCUE_LENGTH_M = 30;

/** North of Point Danger a "MARINE RESCUE" boat belongs to Queensland. */
const QLD_BORDER_LAT = -28.17;

/** Recognised by MMSI where neither name nor type says it (measured 13-11-2026). */
const KNOWN = {
  // Call sign WP11, type 37 (pleasure craft) in AIS.
  503225100: {
    category: 'police',
    organisation: 'NSW Police Force',
    unit: 'WP 11',
  },
};

export function cleanName(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const hit = (category, organisation, unit, basis) => ({
  category,
  organisation: organisation ?? null,
  unit: unit ? unit.replace(/\s+/g, ' ').trim() : null,
  basis,
});

/**
 * The category of a vessel, or null when it is not one of ours.
 * `basis` says how sure: 'known' (MMSI list), 'name', 'type+name' or 'type'.
 * `lat` (optional) only picks the state organisation of a "MARINE RESCUE" boat.
 */
export function classify({ mmsi, name, type, callsign, length, lat } = {}) {
  // Australian vessels only: the Solomon Islands and Kiribati patrol boats
  // off Cairns also send type 55.
  if (!/^503\d{6}$/.test(String(mmsi))) return null;
  const n = cleanName(name);
  const cs = cleanName(callsign);
  const t = Number.isInteger(type) ? type : null;
  const known = KNOWN[mmsi];
  if (known)
    return hit(known.category, known.organisation, known.unit, 'known');
  // Navy: "ADV STOKER" sends type 51.
  if (/^(ADV|HMAS|NUSHIP)\b/.test(n)) return null;

  // 1. Names that say it whatever the type.
  let m;
  if ((m = n.match(/^MARINE RESCUE\b[ -]*(.*)$/)))
    return hit(
      'rescue',
      typeof lat === 'number'
        ? lat > QLD_BORDER_LAT
          ? 'Marine Rescue Queensland'
          : 'Marine Rescue NSW'
        : 'Marine Rescue',
      // "PJ-31", "FO 20" and "BW21" are the same kind of unit code.
      m[1].replace(/^([A-Z]{2})[ -]?(\d{2})$/, '$1 $2'),
      'name',
    );
  if ((m = n.match(/^QPV\b ?(.*)$/)))
    return hit('police', 'Queensland Police Service', m[1], 'name');
  if ((m = n.match(/^WP[- ]?(\d{1,3})$/) ?? cs.match(/^WP[- ]?(\d{1,3})$/)))
    return hit('police', 'NSW Police Force', `WP ${m[1]}`, 'name');
  if ((m = n.match(/^AFP ?(\d{1,3})$/) ?? cs.match(/^AFP ?(\d{1,3})$/)))
    return hit('police', 'Australian Federal Police', `AFP ${m[1]}`, 'name');
  if (/^ABFC\b/.test(n))
    return hit('patrol', 'Australian Border Force', n.slice(5), 'name');
  // "FIRE BOAT 1", "FIREBOAT", "FIRE RESCUE 2", "FRNSW ...". Not "SPITFIRE",
  // "FIREBIRD" or "HELLFIRE BAY" (a tug).
  if (
    /\bFIRE ?BOAT\b|^FIRE (AND |& )?RESCUE\b|^FIRE ?\d|\b(FRNSW|FRV|QFES|QFD|DFES)\b/.test(
      n,
    )
  )
    return hit('fire', null, null, 'name');

  // 2. Names that need the type to agree.
  if (/^PV\b/.test(n)) {
    // "PV" is a police vessel with type 55 and a pilot vessel otherwise.
    return t === LAW ? hit('police', null, n.slice(3), 'type+name') : null;
  }
  if ((m = n.match(/^VP ?(\d{1,3})$/)) && t === LAW)
    return hit('police', 'Victoria Police', `VP ${m[1]}`, 'type+name');
  if (t === PILOT) return null;

  // 3. Names that count unless the type says fishing boat, yacht or ship.
  const basis = t === SAR || t === LAW ? 'type+name' : 'name';
  if (!isOrdinary(t)) {
    if (/\bPOLICE\b/.test(n)) return hit('police', null, null, basis);
    if (/\bVMR\b/.test(n) || /^VMR ?\d/.test(cs))
      return hit('rescue', 'Volunteer Marine Rescue', null, basis);
    if ((m = n.match(/\bQF ?(\d{1,2})\b/) ?? cs.match(/\bQF ?(\d{1,2})$/)))
      return hit(
        'rescue',
        'Australian Volunteer Coast Guard',
        `QF${m[1]}`,
        basis,
      );
    if (
      (m = n.match(/^CG ?-?(\d{1,3})\b/) ?? cs.match(/^CG[- ]?(\d{1,3})$/)) ||
      /^CG [A-Z]|\bCOAST ?GUARD\b|\bC\/GUARD\b/.test(n)
    )
      return hit(
        'rescue',
        'Australian Volunteer Coast Guard',
        m ? `CG ${m[1]}` : null,
        basis,
      );
    if (/\bSURF[- ]?RESCUE|\bSURF LIFE ?SAVING\b|\bSLS\b|\bLIFEGUARD\b/.test(n))
      return hit('rescue', 'Surf Life Saving', null, basis);
    if (/\bSES\b/.test(n))
      return hit('rescue', 'State Emergency Service', null, basis);
    // "RESCUE 307", "RESCUE302", "RESCUE SP2", "COOLOOLA RESCUE III",
    // "GLADSTONERESCUE3", "JETSKI RESCUE 2".
    if (
      /^RESCUE ?-?[A-Z]{0,2} ?\d{1,3}$/.test(n) ||
      /RESCUE ?-?(\d{1,3}|I{1,3}|IV|V|ONE|TWO|THREE)$/.test(n)
    )
      return hit('rescue', null, null, basis);
    // "MOOLOOLABA RESCUE", "SANDS RESCUE": a place and the word. Not the
    // yacht called "TO THE RESCUE"; "RESCUE ME" does not end in the word.
    if (
      /[A-Z] RESCUE$/.test(n) &&
      !/\b(TO THE|MY|OUR|THE|NO|LAST) RESCUE$/.test(n)
    )
      return hit('rescue', null, null, basis);
  }

  // 4. The type alone.
  if (t === SAR) {
    if (typeof length === 'number' && length > MAX_RESCUE_LENGTH_M) return null;
    return hit(
      'rescue',
      /^VMR ?\d/.test(cs) ? 'Volunteer Marine Rescue' : null,
      null,
      'type',
    );
  }
  // Law enforcement without a police name: fisheries, maritime safety and
  // other patrols. Its own category, so the map does not call them police.
  if (t === LAW) return hit('patrol', null, null, 'type');
  return null;
}
