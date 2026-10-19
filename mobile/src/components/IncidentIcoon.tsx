/**
 * Samengestelde incident-iconen die het font niet kent: een woning waar de
 * vlammen echt uit het dak komen, een auto in brand, een botsing met een
 * inslagster (wens Chris 20-08, met voorbeeldplaatje).
 *
 * De truc voor "vuur komt eruit": achter de witte vlam staat dezelfde vlam
 * iets dikker in de bolkleur. Dat vreet een randje uit het object eronder,
 * waardoor vlam en object gescheiden blijven en het als "staat in brand"
 * leest in plaats van als twee plaatjes op elkaar.
 *
 * De paden komen uit @mdi/js: dezelfde tekeningen als het icoonfont, maar
 * als SVG zodat we ze kunnen stapelen, schalen en uitsparen.
 */
import React from 'react';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import {
  mdiHome, mdiFire, mdiCar, mdiTrashCan, mdiPineTree, mdiFerry,
  mdiOfficeBuilding, mdiGrass,
} from '@mdi/js';

export type BrandendObject =
  | 'woning' | 'gebouw' | 'voertuig' | 'container' | 'natuur' | 'schip' | 'buiten';

const OBJECT_PAD: Record<BrandendObject, string> = {
  woning: mdiHome,
  gebouw: mdiOfficeBuilding,
  voertuig: mdiCar,
  container: mdiTrashCan,
  natuur: mdiPineTree,
  schip: mdiFerry,
  buiten: mdiGrass,
};

interface Props {
  maat: number;
  /** Kleur van de tekening zelf (wit op een kaartpin, dienstkleur elders). */
  kleur: string;
  /** Kleur van de ondergrond; nodig voor de uitsparing rond de vlam. */
  fond: string;
}

/** Object met vlammen die eruit slaan, als één geheel. */
export function BrandendIcoon({ object, maat, kleur, fond }: Props & { object: BrandendObject }) {
  // Het object onderin, iets kleiner; de vlam erboven, over de bovenrand heen.
  // De fond-vlam is een opgeblazen kopie die het object "wegbrandt".
  const vlamSchaal = object === 'buiten' ? 0.62 : 0.55;
  const vlamX = 12 - 12 * vlamSchaal;          // gecentreerd
  const vlamY = object === 'buiten' ? -0.5 : -1.5;
  const objSchaal = 0.8;
  const objX = 12 - 12 * objSchaal;
  const objY = 24 - 24 * objSchaal;            // onderrand gelijk
  return (
    <Svg width={maat} height={maat} viewBox="0 0 24 24">
      <G transform={`translate(${objX} ${objY}) scale(${objSchaal})`}>
        <Path d={OBJECT_PAD[object]} fill={kleur} />
      </G>
      {/* Uitsparing: zelfde vlam, dikker, in de fondkleur. */}
      <G transform={`translate(${vlamX} ${vlamY}) scale(${vlamSchaal})`}>
        <Path d={mdiFire} fill={fond} stroke={fond} strokeWidth={4.5} />
        <Path d={mdiFire} fill={kleur} />
      </G>
    </Svg>
  );
}

/** Botsing: auto met een inslagster op de neus. */
export function BotsingIcoon({ maat, kleur, fond }: Props) {
  // Vierpuntige ster, handgetekend: het font heeft geen inslag.
  const ster = '17.5,1 19,5.5 23.5,7 19,8.5 17.5,13 16,8.5 11.5,7 16,5.5';
  return (
    <Svg width={maat} height={maat} viewBox="0 0 24 24">
      <G transform="translate(0 4.5) scale(0.85)">
        <Path d={mdiCar} fill={kleur} />
      </G>
      <Polygon points={ster} fill={fond} stroke={fond} strokeWidth={3} />
      <Polygon points={ster} fill={kleur} />
    </Svg>
  );
}

/** Brandgrootte: één, twee of drie vlammen als één vuurhaard. */
export function VlammenIcoon({ vlammen, maat, kleur }: Omit<Props, 'fond'> & { vlammen: 1 | 2 | 3 }) {
  if (vlammen === 1) {
    return (
      <Svg width={maat} height={maat} viewBox="0 0 24 24">
        <Path d={mdiFire} fill={kleur} />
      </Svg>
    );
  }
  if (vlammen === 2) {
    return (
      <Svg width={maat} height={maat} viewBox="0 0 24 24">
        <G transform="translate(-1 5) scale(0.62)"><Path d={mdiFire} fill={kleur} /></G>
        <G transform="translate(9.5 5) scale(0.62)"><Path d={mdiFire} fill={kleur} /></G>
      </Svg>
    );
  }
  return (
    <Svg width={maat} height={maat} viewBox="0 0 24 24">
      <G transform="translate(-1.5 8) scale(0.5)"><Path d={mdiFire} fill={kleur} /></G>
      <G transform="translate(13.5 8) scale(0.5)"><Path d={mdiFire} fill={kleur} /></G>
      <G transform="translate(3.5 1.5) scale(0.72)"><Path d={mdiFire} fill={kleur} /></G>
    </Svg>
  );
}
