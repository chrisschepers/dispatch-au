import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import {
  parseNafc,
  parsePlaneAlert,
  readTar1090,
  buildFleet,
  fetchFleet,
  orgFor,
  isAustralian,
  KNOWN,
  NAFC_URL,
  PLANE_ALERT_URL,
  TAR1090_URL,
} from '../fleet.mjs';

const nafcPage = `<table>
<tr><th>callsign</th><th>registration</th><th>category</th><th>make</th><th>model</th></tr>
<tr><td>BOMBER 355</td><td>VH-ABC</td><td>FW - Type 4 SEAT</td><td>AIR TRACTOR INC</td><td>AT-802</td></tr>
<tr><td>RESCUE 26</td><td>VH-NVE</td><td>Unspecified</td><td>AGUSTAWESTLAND S.P.A.</td><td>AW139</td></tr>
<tr><td>FIREBIRD 200</td><td>VH-XYZ</td><td>RW - Type 3 Light</td><td>BELL</td><td>206B</td></tr>
<tr><td>HELITAK 345</td><td>N4875A</td><td>RW - Type 2 Medium</td><td>BELL</td><td>205 A1</td></tr>
</table>`;

const alertCsv = `$ICAO,$Registration,$Operator,$Type,$ICAO Type,#CMPG,$Tag 1,$#Tag 2,$#Tag 3,Category,$#Link
7C4D26,VH-PIW,New South Wales Police,Eurocopter AS350 Squirrel,AS50,Pol,Police Squad,Coppa,Copper Chopper,Police Forces,
7C44C8,VH-NVE,Westpac Rescue Helicopter Service,AgustaWestland AW.139,A139,Civ,Air Ambo,Medical Evac,Saving Lives,Flying Doctors,
7C7193,VH-WPX,Western Australia Police Force,Eurocopter AS365 Dauphin,AS65,Pol,Police Squad,Coppa,Copper Chopper,Police Forces,
7C7180,VH-WPE,Western Australia Police Force,Pilatus PC-12 47,PC12,Pol,Police Squad,Coppa,Surveillance,Police Forces,
7C2BA6,VH-IWO,Royal Flying Doctor Service,Pilatus PC-24,PC24,Civ,Air Ambo,Medical Evac,RFDS,Flying Doctors,
7C49F8,VH-OWA,Royal Flying Doctor Service,Pilatus PC-12 47E,PC12,Civ,Air Ambo,Medical Evac,RFDS,Flying Doctors,
7C1A0C,VH-FFI,Royal Flying Doctor Service,B200 Super King Air,BE20,Civ,Air Ambo,Medical Evac,RFDS,Flying Doctors,
7C1A9E,VH-FJK,New South Wales Police,Cessna 206H Stationair,C206,Pol,Police Squad,Coppa,Surveillance,Police Forces,
7C1563,VH-EID,Australian Federal Police,B350 Super King Air,B350,Pol,Police Squad,Coppa,Surveillance,Police Forces,
7CF85C,A36-001,Royal Australian Air Force,Boeing 737-BBJ,B737,Mil,Australia,Government,Government,Governments,
AB4C7E,N827ST,MI State Police,Bell UH-1H Iroquois,UH1,Pol,Police Squad,Los Judis,Copper Chopper,Police Forces,"https://example.org/a,b"
`;

// hex;registration;type;flags;description;year;ownOp;
const dbCsv = `7C1234;VH-ABC;AT8T;00;AIR TRACTOR AT-802;;;
7C44C8;VH-NVE;A139;00;AGUSTA AW-139;;;
A605A2;N4875A;B205;00;BELL 205;;;
A00001;N1;C172;00;CESSNA 172 Skyhawk;;;
7C4D26;VH-PIW;AS50;00;AEROSPATIALE AS-350 Ecureuil;;;
7C4CED;VH-PHB;B429;0001;BELL 429 GlobalRanger;2021;STATE OF NEW SOUTH WALES REPRESENTED BY NSW POLICE FORCE;
7C19C8;VH-FDM;BE20;00;BEECH 200 Super King Air;2010;ROYAL FLYING DOCTOR SERVICE OF AUSTRALIA (QUEENSLAND SECTION) LIMITED;
7C76F6;VH-XR8;SS2T;00;TRUSH Turbo Thrush 500/550;2023;WESTPAC BANKING CORPORATION;
7C19A0;VH-FCI;C172;00;CESSNA 172 Skyhawk;;POLICE AERO CLUB OF W A;
7C7599;VH-XIJ;A139;00;AGUSTA AW-139;;CAREFLIGHT LIMITED;
7C7EF0;VH-ZCY;BE20;00;BEECH 200 Super King Air;;CAREFLIGHT LIMITED;
7C6178;VH-TJE;A139;00;AGUSTA AW-139;;;
7C6179;VH-TJF;C172;00;CESSNA 172 Skyhawk;;;
7C7193;VH-WPX;R66;00;ROBINSON R-66;;;
7C7180;VH-WPE;PC12;00;PILATUS PC-12;;;
7C2BA6;VH-IWO;PC12;00;PILATUS PC-12;;;
7C49F8;VH-OWA;PC12;00;PILATUS PC-12;;;
7C1A9E;VH-FJK;C206;00;CESSNA  206 Stationair;;;
7C1563;VH-EID;B350;0001;BEECHCRAFT Super King Air 350;;;
7CF85C;A36-001;B737;10;BOEING 737-700;;;
`;
const gz = gzipSync(Buffer.from(dbCsv));
const wanted = () =>
  new Set([
    ...parseNafc(nafcPage).map((r) => r.registration),
    ...KNOWN.map(([r]) => r),
  ]);

async function built() {
  return buildFleet({
    nafc: parseNafc(nafcPage),
    planeAlert: parsePlaneAlert(alertCsv),
    db: await readTar1090(Readable.from([gz]), wanted()),
  });
}

void test('organisations by name: banks, aero clubs, the AFP and people do not count', () => {
  assert.equal(
    orgFor('STATE OF NEW SOUTH WALES REPRESENTED BY NSW POLICE FORCE').name,
    'NSW Police Force',
  );
  assert.equal(
    orgFor('Westpac Rescue Helicopter Service').name,
    'Westpac Rescue Helicopter',
  );
  assert.equal(
    orgFor('PEL-AIR AVIATION PTY LTD (NSW Ambulance)').name,
    'NSW Ambulance',
  );
  assert.equal(orgFor('Queensland Government Air Wing').name, 'QGAir');
  assert.equal(orgFor('RACQ CQ Rescue').name, 'RACQ CQ Rescue');
  assert.equal(orgFor('RACQ LifeFlight Rescue').name, 'LifeFlight');
  assert.equal(orgFor('WESTPAC BANKING CORPORATION'), null);
  assert.equal(orgFor('Police Aero Club Of W A'), null);
  assert.equal(orgFor('Australian Federal Police'), null);
  assert.equal(orgFor('STATE OF QUEENSLAND'), null);
  assert.equal(orgFor('Private'), null);
  assert.equal(orgFor('VUILLEUMIER, ANDRE'), null);
  assert.equal(orgFor(null), null);
});

void test('Australian hex range is 7c0000-7fffff', () => {
  assert.equal(isAustralian('7c0000'), true);
  assert.equal(isAustralian('7fffff'), true);
  assert.equal(isAustralian('a2fd4d'), false);
  assert.equal(isAustralian('80000a'), false);
});

void test('NAFC page: only the firefighting and rescue call signs', () => {
  assert.deepEqual(
    parseNafc(nafcPage).map((r) => r.callsign),
    ['BOMBER 355', 'RESCUE 26', 'HELITAK 345'],
  );
});

void test('plane-alert-db: Australian rows only, quoted fields survive', () => {
  const rows = parsePlaneAlert(alertCsv);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => isAustralian(r.hex)));
  assert.deepEqual(rows[0], {
    hex: '7c4d26',
    registration: 'VH-PIW',
    operator: 'New South Wales Police',
    typeName: 'Eurocopter AS350 Squirrel',
    type: 'AS50',
    cmpg: 'Pol',
    category: 'Police Forces',
  });
});

void test('tar1090-db is streamed and keeps Australian hexes plus wanted registrations', async () => {
  const db = await readTar1090(Readable.from([gz]), wanted());
  assert.ok(db.byReg.has('N4875A'), 'NAFC lists a US tanker');
  assert.ok(!db.byReg.has('N1'), 'other foreign aircraft are dropped');
  assert.equal(db.byHex.get('7c4ced').flags, '0001');
  assert.equal(db.byReg.get('VH-XIJ').ownOp, 'CAREFLIGHT LIMITED');
  // A runaway download stops instead of filling the memory.
  await assert.rejects(
    readTar1090(Readable.from([gz]), wanted(), 10),
    /too large/,
  );
});

void test('fleet: NAFC first, then police, rescue and medical by organisation', async () => {
  const { fleet, counts, missing } = await built();
  assert.equal(missing, 0);
  const byReg = new Map(fleet.map((a) => [a.registration, a]));
  // NAFC wins over plane-alert-db, and an AW139 is a helicopter even when
  // NAFC's category does not say so.
  assert.equal(byReg.get('VH-NVE').callsign, 'RESCUE 26');
  assert.equal(byReg.get('VH-NVE').operator, undefined);
  assert.equal(byReg.get('VH-NVE').rotor, true);
  assert.equal(byReg.get('N4875A').role, 'helitak');
  assert.deepEqual(
    fleet
      .filter((a) => a.operator)
      .map((a) => [a.registration, a.role, a.operator]),
    [
      ['VH-FDM', 'medical', 'Royal Flying Doctor Service'],
      ['VH-IWO', 'medical', 'Royal Flying Doctor Service'],
      ['VH-OWA', 'medical', 'Royal Flying Doctor Service'],
      ['VH-PIW', 'police', 'NSW Police Force'],
      ['VH-TJE', 'rescue', 'Toll Ambulance Rescue'],
      ['VH-WPE', 'police', 'WA Police'],
      // CareFlight's helicopter rescues, its plane is an air ambulance.
      ['VH-XIJ', 'rescue', 'CareFlight'],
      ['VH-ZCY', 'medical', 'CareFlight'],
    ],
  );
  assert.deepEqual(counts, {
    bomber: 1,
    rescue: 3,
    helitak: 1,
    medical: 4,
    police: 2,
  });
  for (const reg of ['VH-XR8', 'VH-FCI', 'VH-EID', 'A36-001'])
    assert.ok(!byReg.has(reg), `${reg} is not in the fleet`);
});

void test('doubtful matches are left out with a reason', async () => {
  const { fleet, doubtful } = await built();
  const why = new Map(doubtful);
  const regs = new Set(fleet.map((a) => a.registration));
  assert.match(why.get('VH-PHB'), /privacy/); // LADD
  assert.match(why.get('VH-WPX'), /listed as AS65, register says R66/);
  assert.match(why.get('VH-TJF'), /not a A139/); // re-issued registration
  assert.match(why.get('VH-FJK'), /another owner/);
  assert.match(why.get('VH-FFI'), /not in tar1090-db/);
  for (const reg of why.keys()) assert.ok(!regs.has(reg));
});

void test('fetchFleet downloads every source with its own timeout and our User-Agent', async () => {
  const seen = [];
  const bodies = {
    [NAFC_URL]: nafcPage,
    [PLANE_ALERT_URL]: alertCsv,
    [TAR1090_URL]: gz,
  };
  const fetcher = async (url, init) => {
    seen.push([
      url,
      init.headers['User-Agent'],
      init.signal instanceof AbortSignal,
    ]);
    return new Response(bodies[url]);
  };
  const { fleet } = await fetchFleet({ fetcher });
  assert.equal(fleet.length, 11);
  assert.equal(seen.length, 3);
  for (const [, agent, signal] of seen) {
    assert.equal(agent, 'EmergenciesNearMe/1.0');
    assert.equal(signal, true);
  }
  // A source that fails fails the whole build; the service keeps its fleet.
  await assert.rejects(
    fetchFleet({
      fetcher: async (url) =>
        url === PLANE_ALERT_URL
          ? new Response('busy', { status: 503 })
          : new Response(bodies[url]),
    }),
    /HTTP 503/,
  );
});
