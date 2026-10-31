/**
 * Aanraakbaar element met de drukreactie van het eigen platform.
 *
 * iOS, volgens de Apple-ontwerprichtlijnen:
 *  - Reactie op het INDRUKKEN, niet op het loslaten. Wachten tot iemand
 *    loslaat voelt dood; het moment dat de vinger het glas raakt moet er al
 *    iets gebeuren.
 *  - Beweging via een veer, niet via een vaste duur. Een veer start altijd
 *    vanaf de huidige waarde, dus je kunt hem halverwege onderbreken zonder
 *    zichtbare sprong.
 *  - Kritisch gedempt (geen doorschot): een knop die terugveert voelt
 *    speels waar het niet hoort. Doorschot bewaren we voor beweging die zelf
 *    momentum had.
 *  - Rijen (`markeer`) krimpen niet maar lichten op, zoals een rij in
 *    Instellingen: een hele rij die inzakt voelt alsof het scherm meegeeft.
 *  - Een licht tikje bij het indrukken alleen waar `trillen` aan staat,
 *    zodat gevoel en beeld op dezelfde frame vallen. Standaard uit: een tik
 *    op elke rij is ruis, en dan zet je trillen in je hele telefoon uit.
 *  - Bij "verminder beweging" vervalt het schalen; de tik blijft.
 *
 * Android, volgens Material 3 (R7.5): een rimpel of drukstaat over het
 * element, geen schalen en geen trilling (Material-bediening trilt niet bij
 * een gewone tik).
 *  - Hoekige vlakken, zoals rijen in een kaart, krijgen de echte rimpel; de
 *    kaart eromheen knipt hem af op haar eigen hoeken.
 *  - Ronde vormen (kaarten, chips, knoppen) krijgen een drukstaatlaag met
 *    dezelfde ronding. Het rimpelmasker van RN is altijd een rechthoek
 *    (ReactDrawableHelper.getMask geeft een ColorDrawable) en zou buiten de
 *    hoeken lekken. Een knippende omhulling kan ook niet: die breekt hitSlop,
 *    want TouchTargetHelper weigert aanrakingen buiten een ouder met
 *    overflow: 'hidden'.
 *
 * De stijl zit op de Pressable zelf. Tot 31-10 kwam hij op een binnenste
 * Animated.View in een kale Pressable die gewoon in de flow stond. Daardoor
 * was de raakzone de volle breedte van de ouder, en hingen absoluut
 * geplaatste elementen aan die lege omhulling in plaats van op hun plek. Het
 * Look Around-plaatje op de Detailkaart was zo onzichtbaar: zijn omhulling
 * stond met hoogte 0 op y=180, net onder de rand van de kaart, en die knipt
 * af (overflow: 'hidden').
 */
import React, { useRef, useState } from 'react';
import {
  Animated, Pressable, StyleSheet, View, type ViewStyle, type StyleProp, type AccessibilityActionEvent,
} from 'react-native';
import { VEER, mindeBeweging, isIOS } from '../theme';
import { useThema } from '../thema';
import { tikDruk } from '../trilling';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Uitgeschakeld: geen tik, geen veer, gedempt. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Hoe ver het element inzakt bij indrukken (iOS). 1 = niet. */
  schaal?: number;
  /** Licht tikje bij het indrukken (iOS). Standaard uit; alleen voor echte
   *  acties aanzetten, zoals de hoofdknop van het startscherm. */
  trillen?: boolean;
  /** Wat een schermlezer voorleest. Zonder label leest hij de tekst in het
   *  element voor; zet dit bij rijen waar losse tekstjes samen pas een zin
   *  vormen, en bij knoppen die alleen een icoon tonen. */
  label?: string;
  /** Extra uitleg voor de schermlezer, ná het label: wat er gebeurt als je
   *  tikt, of de uitleg onder een instelling. */
  hint?: string;
  /** Rol voor de schermlezer. Vrijwel alles hier is een knop. */
  rol?: 'button' | 'link' | 'tab' | 'checkbox' | 'radio' | 'switch' | 'none';
  /** Aan/uit voor rol checkbox, radio of switch. */
  aan?: boolean;
  /** Gekozen, zoals een gekozen chip of tab. */
  geselecteerd?: boolean;
  /** Klapt iets open; de schermlezer zegt of het open of dicht is. */
  uitgeklapt?: boolean;
  /** Bezig met laden of versturen. */
  bezig?: boolean;
  /** iOS: oplichten tijdens het indrukken in plaats van krimpen. Voor rijen. */
  markeer?: boolean;
  /** Bevat selecteerbare tekst (selectable): lang drukken opent dan alleen
   *  het kopieermenu en activeert het element niet. */
  kopieerbaar?: boolean;
  /** Extra acties voor de schermlezer (VoiceOver-rotor, TalkBack-menu), voor
   *  een knop binnen dit element die de schermlezer anders niet bereikt. */
  acties?: Array<{ naam: string; label: string; doe: () => void }>;
}

/**
 * Lege onLongPress voor `kopieerbaar`. Zonder onLongPress roept Pressability
 * bij het loslaten na lang drukken tóch onPress aan, en opende een rij naast
 * het kopieermenu ook zijn link, mail of deelvenster.
 */
const geenActie = () => {};

export function Drukbaar({
  children, onPress, onLongPress, disabled, style, schaal = 0.98, trillen = false,
  label, hint, rol = 'button', aan, geselecteerd, uitgeklapt, bezig, markeer, kopieerbaar, acties,
}: Props) {
  const C = useThema();
  const s = useRef(new Animated.Value(1)).current;
  const [ingedrukt, setIngedrukt] = useState(false);

  // Gelijk op beide platforms.
  const gedeeld = {
    disabled,
    onPress,
    onLongPress: onLongPress ?? (kopieerbaar ? geenActie : undefined),
    // Ruime raakzone rond het element: tikken mag onnauwkeurig zijn.
    hitSlop: 8,
    // Een vinger die een paar pixels wegglijdt, annuleert de tik niet.
    pressRetentionOffset: 16,
    // Zonder rol is elke rij voor VoiceOver/TalkBack een naamloos ding:
    // de audit van 20-08 vond precies drie gelabelde elementen in de app.
    accessibilityRole: rol === 'none' ? undefined : rol,
    accessibilityLabel: label,
    accessibilityHint: hint,
    accessibilityState: {
      disabled: !!disabled,
      checked: aan,
      selected: geselecteerd,
      expanded: uitgeklapt,
      busy: bezig,
    },
    accessibilityActions: acties?.map((a) => ({ name: a.naam, label: a.label })),
    onAccessibilityAction: acties
      ? (e: AccessibilityActionEvent) => { acties.find((a) => a.naam === e.nativeEvent.actionName)?.doe(); }
      : undefined,
  };

  if (isIOS) {
    const naar = (waarde: number) => {
      if (mindeBeweging) return;
      Animated.spring(s, {
        toValue: waarde,
        useNativeDriver: true,
        ...VEER.standaard,
      }).start();
    };

    return (
      <AnimatedPressable
        {...gedeeld}
        onPressIn={() => {
          if (markeer) setIngedrukt(true);
          else naar(schaal);
          if (trillen) tikDruk();
        }}
        onPressOut={() => {
          if (markeer) setIngedrukt(false);
          else naar(1);
        }}
        // Dekking alleen bij uitgeschakeld: zo blijft een eigen opacity uit
        // `style` werken (het Look Around-plaatje wacht onzichtbaar op zijn
        // beeld).
        style={[
          style,
          { transform: [{ scale: s }] },
          disabled && { opacity: 0.5 },
          markeer && ingedrukt && { backgroundColor: C.ingedrukt },
        ]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  const plat = StyleSheet.flatten(style) ?? {};
  const rond = typeof plat.borderRadius === 'number' && plat.borderRadius > 0;
  // De laag ligt binnen de rand (absoluteFill rekent vanaf de binnenkant van
  // borderWidth), dus zijn ronding is die van de buitenkant min de rand.
  const binnenRonding = rond
    ? Math.max(0, (plat.borderRadius as number) - (typeof plat.borderWidth === 'number' ? plat.borderWidth : 0))
    : 0;

  return (
    <Pressable
      {...gedeeld}
      // Hoekig: echte rimpel als voorgrond, zodat hij ook over een gekleurde
      // achtergrond of tegel heen zichtbaar is.
      android_ripple={rond ? undefined : { color: C.rimpel, foreground: true }}
      // M3: uitgeschakeld = 38% dekking.
      style={[style, disabled && { opacity: 0.38 }]}
    >
      {({ pressed }) => (
        <>
          {children}
          {rond && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: binnenRonding, backgroundColor: pressed ? C.rimpel : 'transparent' },
              ]}
            />
          )}
        </>
      )}
    </Pressable>
  );
}
