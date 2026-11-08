/**
 * Eén keuze uit een paar, per platform zoals het daar hoort.
 *
 * iOS: het gesegmenteerde bedieningselement van UIKit. Een grijze baan met de
 * gekozen waarde op een wit (in het donker: grijs) vlak met een lichte
 * schaduw.
 *
 * Android: M3-segmented buttons. Een omlijnde pil van 40 dp, de gekozen
 * waarde op secondaryContainer met een vinkje ervoor.
 *
 * Voor de schermlezer is elke waarde een radioknop: één tegelijk, en hij
 * zegt welke gekozen is.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { F, T, isIOS, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import { mengKleur } from '../kleur';
import { tikStap } from '../trilling';
import { Drukbaar } from './Drukbaar';
import { Icoon } from './Icoon';

export interface SegmentOptie<T extends string | number> {
  waarde: T;
  label: string;
  /** Voluit voor de schermlezer, als het label een afkorting is ("4 h"). */
  voluit?: string;
  /** MDI-icoon voor het label (Standard/Satellite). */
  icoon?: string;
}

export function Segment<T extends string | number>({ opties, waarde, onKies }: {
  opties: ReadonlyArray<SegmentOptie<T>>;
  waarde: T;
  onKies: (w: T) => void;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  return (
    <View style={styles.baan} accessibilityRole="radiogroup">
      {opties.map((o, i) => {
        const aan = o.waarde === waarde;
        const kleur = aan ? C.textPrimary : C.textSecondary;
        return (
          <Drukbaar
            key={String(o.waarde)}
            rol="radio"
            aan={aan}
            label={o.voluit ?? o.label}
            schaal={1}
            style={[
              styles.knop,
              !isIOS && i > 0 && styles.knopScheiding,
              aan && styles.knopAan,
            ]}
            onPress={() => {
              if (aan) return;
              tikStap();
              onKies(o.waarde);
            }}
          >
            <View style={styles.inhoud}>
              {!isIOS && aan ? <Icoon naam="gekozen" grootte={18} kleur={kleur} /> : null}
              {o.icoon && (isIOS || !aan) ? (
                <MaterialCommunityIcons name={o.icoon as never} size={16} color={kleur} />
              ) : null}
              <Text
                style={[styles.tekst, aan && styles.tekstAan]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {o.label}
              </Text>
            </View>
          </Drukbaar>
        );
      })}
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  baan: isIOS
    ? { flexDirection: 'row', backgroundColor: C.chipBg, borderRadius: 9, borderCurve: 'continuous', padding: 2 }
    // M3: omlijning in outline, 40 dp hoog, volledig rond.
    : {
      flexDirection: 'row', borderRadius: 20, borderWidth: 1,
      borderColor: mengKleur(C.textPrimary, C.bg, 0.45), overflow: 'hidden',
    },
  knop: isIOS
    ? { flex: 1, minHeight: 32, borderRadius: 7, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }
    : { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  knopScheiding: { borderLeftWidth: 1, borderLeftColor: mengKleur(C.textPrimary, C.bg, 0.45) },
  knopAan: isIOS
    ? { backgroundColor: C.donker ? '#636366' : '#ffffff', boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12)' }
    // M3 secondaryContainer: het accent zacht onder de gekozen waarde.
    : { backgroundColor: C.accentSoft },
  inhoud: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tekst: isIOS
    ? { fontSize: 13, fontWeight: F.weightMedium, color: C.textSecondary }
    // M3 labelLarge.
    : { fontSize: 14, fontWeight: F.weightMedium, letterSpacing: 0.1, color: C.textSecondary },
  tekstAan: { color: C.textPrimary, fontWeight: isIOS ? F.weightSemibold : F.weightMedium },
});

/** Kopje boven een blok in een blad: kapitalen op iOS, het M3-kopje op Android. */
export function BladKop({ children }: { children: string }) {
  const styles = useStijlen(maak_kop);
  return <Text style={styles.kop} accessibilityRole="header">{children}</Text>;
}

const maak_kop = (C: Palet) => StyleSheet.create({
  kop: isIOS
    ? { ...T.sectie, color: C.textSecondary, marginTop: 18, marginBottom: 8, marginLeft: 4 }
    : { ...T.sectie, color: C.accentTekst, marginTop: 20, marginBottom: 8, marginLeft: 4 },
});
