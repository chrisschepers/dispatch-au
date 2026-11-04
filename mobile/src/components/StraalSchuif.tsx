/**
 * Straal-schuif die meepraat tijdens het slepen (melding Chris 16-08).
 *
 * De schuif gaf pas antwoord bij loslaten: tijdens het slepen zag je nergens
 * op hoeveel kilometer je zat, dus je moest gokken en corrigeren. Nu loopt het
 * getal mee én voel je bij elke kilometer een tikje, zodat je ook zonder
 * kijken weet hoeveel stappen je hebt gezet.
 *
 * Opslaan gebeurt nog steeds pas bij loslaten: elke tussenstand wegschrijven
 * zou de instellingen tientallen keren per sleep naar de server sturen.
 *
 * Schermlezers horen een naam en de waarde in woorden ("25 km", "Anywhere in
 * Australia") via accessibilityValue.text. Niet via accessibilityIncrements
 * en accessibilityUnits van de schuif: 5.2.0 gebruikt die alleen als er
 * maximumValue + 1 stappen zijn, en Android leest elke stap met
 * Integer.parseInt, dus "5 km" laat de app vallen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { T, F, type Palet } from '../theme';
import { LANDELIJK_KM, straalTekst } from '../diensten';
import { useThema, useStijlen } from '../thema';
import { tikStap } from '../trilling';

const isAndroid = Platform.OS === 'android';

interface Props {
  /** Het opgeslagen aantal kilometer. */
  waarde: number;
  max: number;
  /** Links in de kop: "Straal", of de dienst met zijn icoon. */
  label?: React.ReactNode;
  kleur?: string;
  /**
   * Eén stap voorbij `max` betekent "Heel Nederland" (LANDELIJK_KM). Alleen
   * voor KNRM en de traumaheli (wens Chris 27-09).
   */
  landelijk?: boolean;
  /** Geen eigen kop: de rij erboven toont naam en waarde al. */
  zonderKop?: boolean;
  onKlaar: (km: number) => void;
  /** Loopt mee tijdens het slepen, voor een waarde die elders staat. */
  onLive?: (km: number) => void;
}

export function StraalSchuif({ waarde, max, label, kleur, landelijk, zonderKop, onKlaar, onLive }: Props) {
  // Op de schuif is landelijk de stap na `max`; opgeslagen is het 500.
  const naarSchuif = (km: number) => (landelijk && km >= LANDELIJK_KM ? max + 1 : Math.min(km, max));
  const vanSchuif = (v: number) => (landelijk && v > max ? LANDELIJK_KM : v);
  const schuifMax = landelijk ? max + 1 : max;
  const C = useThema();
  // Zonder eigen kleur volgt de schuif het accent van het thema.
  const streep = kleur ?? C.accent;
  const styles = useStijlen(maak_styles);
  const [live, setLive] = useState(waarde);
  const laatste = useRef(waarde);

  // Van buitenaf gewijzigd (bv. "per dienst" aanzetten vult alles): dan moet
  // het getal boven de schuif mee.
  useEffect(() => {
    setLive(waarde);
    laatste.current = waarde;
  }, [waarde]);

  return (
    <>
      {!zonderKop && (
        <View style={styles.kop}>
          {typeof label === 'string' ? <Text style={styles.label}>{label}</Text> : label}
          <Text style={[styles.waarde, { color: streep }]}>{straalTekst(live)}</Text>
        </View>
      )}
      <Slider
        // Android: een strook van 48 dp (M3). Die hoogte geldt voor de
        // omhulling; de raakzone blijft de hoogte die de native SeekBar zelf
        // meet, want de schuif overschrijft de stijl van zijn native deel.
        // iOS houdt zijn eigen hoogte.
        style={isAndroid ? styles.schuifAndroid : undefined}
        minimumValue={1}
        maximumValue={schuifMax}
        step={1}
        value={naarSchuif(waarde)}
        minimumTrackTintColor={streep}
        // iOS houdt de witte systeemknop, zoals elke schuif in iOS; Android
        // kleurt knop en baan, met een zichtbare lege baan ook in het donker.
        thumbTintColor={isAndroid ? streep : undefined}
        maximumTrackTintColor={isAndroid ? `${streep}40` : undefined}
        accessibilityLabel={typeof label === 'string' ? label : 'Radius'}
        accessibilityValue={{ min: 1, max: schuifMax, now: naarSchuif(live), text: straalTekst(live) }}
        onValueChange={(v: number) => {
          const km = vanSchuif(Math.round(v));
          if (km === laatste.current) return;
          laatste.current = km;
          setLive(km);
          onLive?.(km);
          // Eén tik per kilometer: hetzelfde gevoel als een klikwiel. Op
          // Android de View-haptiek, die de systeeminstelling volgt; de kale
          // trilmotor zou tot vijftig keer per sleep zoemen.
          tikStap();
        }}
        onSlidingComplete={(v: number) => onKlaar(vanSchuif(Math.round(v)))}
      />
    </>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  kop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  label: { ...T.body, fontSize: 16, color: C.textPrimary },
  waarde: { ...T.body, fontSize: 16, fontWeight: F.weightSemibold },
  schuifAndroid: { height: 48 },
});
