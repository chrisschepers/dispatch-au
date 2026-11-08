/**
 * Een dienst om aan of uit te zetten: de chips boven de lijst Nearby en in
 * het filterblad van de kaart. Tot 08-11 stond deze code in BuurtScreen.
 *
 * iOS: een chip met een getint vlak in de dienstkleur als hij aan staat. De
 * tekst blijft in de dienstkleur, maar zo donker (in het donker: zo licht) dat
 * hij 4.5:1 haalt op dat vlak; puur amber op lichtgrijs was zo'n 2:1. Icoon
 * en rand houden de echte kleur.
 *
 * Android: een M3-filterchip. Gekozen is een getint vlak met een vinkje
 * vooraan, niet gekozen alleen een rand met het vakicoon. TalkBack leest hem
 * als aangevinkt of niet.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { F, T, isIOS, type Palet } from '../theme';
import { useThema, useStijlen } from '../thema';
import type { Dienst } from '../diensten';
import { leesbaar, mengKleur } from '../kleur';
import { tikStap } from '../trilling';
import { Drukbaar } from './Drukbaar';
import { Icoon, DienstIcoon } from './Icoon';

/** iOS: het vlak van een gekozen chip is de dienstkleur op 0x14 (8%). */
const TINT_IOS = '14';

export function DienstChip({ dienst: d, aan, onWissel }: {
  dienst: Dienst;
  aan: boolean;
  onWissel: () => void;
}) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const tekstIOS = useMemo(
    () => leesbaar(d.kleur, mengKleur(d.kleur, C.bg, parseInt(TINT_IOS, 16) / 255)),
    [d.kleur, C.bg],
  );
  // Een keuze die verspringt: selectietik, geen druktik.
  const wissel = () => {
    tikStap();
    onWissel();
  };
  if (isIOS) {
    return (
      <Drukbaar
        schaal={0.94}
        geselecteerd={aan}
        style={[styles.chip, aan && { backgroundColor: `${d.kleur}${TINT_IOS}`, borderColor: d.kleur }]}
        onPress={wissel}
      >
        <View style={styles.chipInhoud}>
          <DienstIcoon dienst={d} grootte={15} kleur={aan ? d.kleur : C.textMuted} />
          <Text style={[styles.chipTekst, aan && { color: tekstIOS, fontWeight: F.weightSemibold }]}>
            {d.label}
          </Text>
        </View>
      </Drukbaar>
    );
  }
  return (
    <Drukbaar
      rol="checkbox"
      aan={aan}
      style={[styles.chip, aan && { backgroundColor: `${d.kleur}29`, borderColor: 'transparent' }]}
      onPress={wissel}
    >
      <View style={styles.chipInhoud}>
        {aan
          ? <Icoon naam="gekozen" grootte={18} kleur={C.textPrimary} />
          : <DienstIcoon dienst={d} grootte={18} kleur={d.kleur} />}
        <Text style={[styles.chipTekst, aan && { color: C.textPrimary }]}>{d.label}</Text>
      </View>
    </Drukbaar>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  chip: isIOS ? {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  } : {
    // M3-filterchip: 32 hoog (48 met de hitSlop), hoek 8, vooraan 8 voor
    // het icoon en achteraan 16. De rand is M3's outlineVariant: 25% van de
    // tekstkleur over de grond. In Android-donker is dat precies C.border
    // (#474747); in licht haalt C.border op de grijze grond maar 1.1:1 en
    // viel de chip weg.
    minHeight: 32, paddingVertical: 0, justifyContent: 'center',
    borderRadius: 8, paddingLeft: 8, paddingRight: 16,
    backgroundColor: 'transparent', borderWidth: 1,
    borderColor: mengKleur(C.textPrimary, C.bg, 0.25),
  },
  chipInhoud: { flexDirection: 'row', alignItems: 'center', gap: isIOS ? 5 : 8 },
  chipTekst: isIOS
    ? { ...T.klein, color: C.textSecondary }
    // M3 labelLarge: 14/500 met letterafstand 0.1.
    : { fontSize: 14, fontWeight: F.weightMedium, letterSpacing: 0.1, lineHeight: 20, color: C.textSecondary },
});
