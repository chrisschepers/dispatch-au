/**
 * Schakelaar: op iOS de native Switch (die hoort daar en oogt goed), op
 * Android een eigen schuifje naar de Material 3-specificatie. De native
 * Android-Switch kleurt de knop mee met het systeemaccent van het toestel,
 * wat botste met onze rode baan (groene knop op rode baan, melding Chris
 * 17-08) en er per merk anders uitziet.
 *
 * M3-maten: baan 52x32 met ronde hoeken; uit een kleine knop (16) met een
 * omlijnde baan, aan een grote witte knop (24) op een gevulde baan. Samsung
 * One UI volgt dezelfde basis, dus dit oogt op elk Android-toestel vertrouwd.
 * De uit-kleuren komen uit het palet (schakelBaan/-Rand/-Knop): in het donker
 * een donkere baan met lichte rand, geen lichtgrijze baan op een donkere kaart.
 *
 * Schermlezers: `label` en `hint` geven de schakelaar een naam en uitleg. Zit
 * hij in een rij die zelf al de schakelaar is (Android-instellingen), dan
 * zwijgt hij met `verborgenVoorLezer`, zodat TalkBack hem één keer voorleest.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Switch } from 'react-native';
import { type Palet } from '../theme';
import { useThema, useStijlen, useMinderBeweging } from '../thema';
import { tikSchakel } from '../trilling';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** Wat de schermlezer als naam voorleest, meestal de titel van de rij. */
  label?: string;
  /** Uitleg ná de naam, meestal de regel onder de titel. */
  hint?: string;
  /** Onzichtbaar voor de schermlezer: de rij eromheen leest naam en stand al voor. */
  verborgenVoorLezer?: boolean;
}

const BAAN_B = 52;
const BAAN_H = 32;
const KNOP_UIT = 16;
const KNOP_AAN = 24;

export function Schakelaar({ value, onValueChange, disabled, label, hint, verborgenVoorLezer }: Props) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const minderBeweging = useMinderBeweging();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // "Verminder beweging": meteen in de eindstand, zonder schuiven.
    if (minderBeweging) {
      anim.setValue(value ? 1 : 0);
      return;
    }
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,   // we animeren kleur en maat, dat kan niet native
    }).start();
  }, [value, anim, minderBeweging]);

  // Verbergen werkt op iOS met accessibilityElementsHidden, op Android met
  // importantForAccessibility; accessible={false} haalt de focus eraf.
  const verborgen = verborgenVoorLezer
    ? {
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants' as const,
    }
    : null;

  if (Platform.OS !== 'android') {
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        // Het merkrood als aan-kleur: de HIG laat een app zijn eigen
        // tintkleur op bediening zetten, en iOS-instellingen doen dat ook.
        trackColor={{ true: C.accent }}
        accessibilityLabel={label}
        accessibilityHint={hint}
        {...verborgen}
      />
    );
  }

  const knopMaat = anim.interpolate({ inputRange: [0, 1], outputRange: [KNOP_UIT, KNOP_AAN] });
  // Knop-linkerkant: uit gecentreerd in de baan, aan tegen de rechterrand.
  const knopLinks = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [(BAAN_H - KNOP_UIT) / 2, BAAN_B - KNOP_AAN - 4],
  });
  const baanKleur = anim.interpolate({ inputRange: [0, 1], outputRange: [C.schakelBaan, C.accent] });
  const randKleur = anim.interpolate({ inputRange: [0, 1], outputRange: [C.schakelRand, C.accent] });
  const knopKleur = anim.interpolate({ inputRange: [0, 1], outputRange: [C.schakelKnop, '#ffffff'] });

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        // View-haptiek (Toggle_On/Off): volgt de systeeminstelling.
        tikSchakel(!value);
        onValueChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: disabled ?? false }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      {...verborgen}
      hitSlop={8}
      // M3: uitgeschakeld = 38% dekking.
      style={disabled && { opacity: 0.38 }}
    >
      <Animated.View style={[styles.baan, { backgroundColor: baanKleur, borderColor: randKleur }]}>
        <Animated.View
          style={[styles.knop, {
            width: knopMaat, height: knopMaat, borderRadius: 12,
            left: knopLinks, backgroundColor: knopKleur,
          }]}
        />
      </Animated.View>
    </Pressable>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  baan: {
    width: BAAN_B, height: BAAN_H, borderRadius: BAAN_H / 2,
    borderWidth: 2, justifyContent: 'center',
  },
  knop: { position: 'absolute', boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.20)' },
});
