/**
 * Een getekend kaartje voor de voorbeeldschermpjes. Geen echte MapView: een
 * native kaart laat zich niet netjes mee schalen in het telefoontje, laadt
 * tegels over het netwerk en vraagt om een locatie die we op dat moment nog
 * niet hebben. Dit is een rustige stadsplattegrond in de kleuren van Apple
 * Kaarten: water, parken, wegen, en daarop de pinnen.
 */
import React from 'react';
import Svg, { Rect, Path, Circle, G } from 'react-native-svg';

export interface NepPin { x: number; y: number; kleur: string }

export function NepKaart({
  b, h, pinnen = [], straal, ik,
}: {
  b: number; h: number;
  pinnen?: NepPin[];
  /** Straalcirkel rond "ik", in punten. */
  straal?: number;
  /** Blauwe stip van de gebruiker. */
  ik?: { x: number; y: number };
}) {
  // Alles is getekend op 320 breed en wordt naar b geschaald.
  const s = b / 320;
  return (
    <Svg width={b} height={h} viewBox={`0 0 320 ${h / s}`}>
      <Rect x={0} y={0} width={320} height={h / s} fill="#f3f1ea" />
      {/* Parken */}
      <Path d="M-10 60 L90 40 L120 120 L20 150 Z" fill="#d4ebc8" />
      <Path d="M210 250 Q260 230 300 270 L290 340 Q240 350 205 320 Z" fill="#d4ebc8" />
      <Path d="M40 420 L130 400 L150 470 L60 500 Z" fill="#d4ebc8" />
      {/* Rivier */}
      <Path d="M-20 330 C60 300 110 380 180 360 S290 300 350 330 L350 372 C290 342 240 400 180 404 S60 348 -20 372 Z" fill="#b5d8f2" />
      {/* Wegen: witte banen met een grijze rand */}
      <G stroke="#dcd8cc" strokeWidth={11} strokeLinecap="round" fill="none">
        <Path d="M-10 200 L330 170" />
        <Path d="M150 -10 L170 700" />
        <Path d="M-10 480 L330 520" />
        <Path d="M60 -10 L20 700" />
        <Path d="M260 -10 L300 700" />
      </G>
      <G stroke="#ffffff" strokeWidth={8} strokeLinecap="round" fill="none">
        <Path d="M-10 200 L330 170" />
        <Path d="M150 -10 L170 700" />
        <Path d="M-10 480 L330 520" />
        <Path d="M60 -10 L20 700" />
        <Path d="M260 -10 L300 700" />
      </G>
      {/* Doorgaande weg in geel */}
      <Path d="M-10 110 C100 130 200 90 330 60" stroke="#e8c96b" strokeWidth={12} strokeLinecap="round" fill="none" />
      <Path d="M-10 110 C100 130 200 90 330 60" stroke="#fbe29a" strokeWidth={8} strokeLinecap="round" fill="none" />
      {/* Straatjes */}
      <G stroke="#ffffff" strokeWidth={4} strokeLinecap="round" fill="none">
        <Path d="M60 260 L150 250" /><Path d="M170 240 L260 230" /><Path d="M90 200 L100 330" />
        <Path d="M220 180 L230 330" /><Path d="M40 560 L160 575" /><Path d="M180 580 L300 600" />
        <Path d="M100 400 L110 490" /><Path d="M230 410 L240 510" /><Path d="M170 420 L300 440" />
      </G>

      {straal != null && ik ? (
        <Circle cx={ik.x} cy={ik.y} r={straal} fill="rgba(229,55,44,0.10)" stroke="#e5372c" strokeWidth={2} />
      ) : null}

      {pinnen.map((p, i) => (
        <G key={i}>
          <Circle cx={p.x} cy={p.y + 2} r={10} fill="rgba(0,0,0,0.18)" />
          <Circle cx={p.x} cy={p.y} r={10} fill="#ffffff" />
          <Circle cx={p.x} cy={p.y} r={7} fill={p.kleur} />
        </G>
      ))}

      {ik ? (
        <G>
          <Circle cx={ik.x} cy={ik.y} r={14} fill="rgba(0,122,255,0.18)" />
          <Circle cx={ik.x} cy={ik.y} r={7} fill="#ffffff" />
          <Circle cx={ik.x} cy={ik.y} r={5} fill="#007aff" />
        </G>
      ) : null}
    </Svg>
  );
}
