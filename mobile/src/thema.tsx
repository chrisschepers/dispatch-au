/**
 * Welk kleurenpalet is nu geldig, en hoe komen schermen eraan.
 *
 * Twee haken, bewust met korte namen zodat de schermen nauwelijks hoeven te
 * veranderen:
 *
 *   const C = useThema();                 // kleuren voor losse plekken in JSX
 *   const styles = useStijlen(maakStijlen); // de StyleSheet van dit scherm
 *
 * `maakStijlen` is de oude `StyleSheet.create({...})` met een `C`-parameter
 * eromheen. De hook onthoudt het resultaat per palet, dus er wordt hooguit
 * twee keer een stylesheet gebouwd (licht en donker) in plaats van bij elke
 * render — dat is precies wat StyleSheet.create op moduleniveau ook deed.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import type { StyleSheet } from 'react-native';
import { PALET_LICHT, PALET_DONKER, kaartVoor, mindeBeweging, type Palet } from './theme';
import { useInstellingen } from './instellingen';

const ThemaContext = createContext<Palet>(PALET_LICHT);

type SysteemStand = 'light' | 'dark' | 'unspecified';

export function ThemaProvider({ children }: { children: React.ReactNode }) {
  const systeem = useColorScheme();
  const { inst, geladen } = useInstellingen();
  // 'automatisch' = volg de telefoon. Dat is de standaard: wie zijn toestel
  // 's avonds op donker zet, wil dat hier ook.
  const palet = useMemo(() => {
    if (inst.thema === 'licht') return PALET_LICHT;
    if (inst.thema === 'donker') return PALET_DONKER;
    return systeem === 'dark' ? PALET_DONKER : PALET_LICHT;
  }, [inst.thema, systeem]);

  /**
   * Het systeem volgt de keuze in de app, niet alleen de telefoon: meldingen
   * (Alert), het toetsenbord, het deelvenster, de betaalmuur van RevenueCat,
   * de tab- en kopbalken. iOS zet daarvoor overrideUserInterfaceStyle op de
   * vensters; Android roept AppCompatDelegate.setDefaultNightMode aan, en
   * omdat MainActivity uiMode zelf afhandelt, wordt de activity daarbij niet
   * opnieuw gemaakt. useColorScheme geeft daarna de gekozen stand terug, dus
   * het palet hierboven blijft kloppen.
   *
   * Pas als de instellingen geladen zijn, en alleen bij een andere stand: bij
   * het opstarten is er nog niets overschreven ('unspecified'), dus een
   * gebruiker op 'automatisch' raakt het systeem nooit aan en niemand ziet
   * eerst de verkeerde stand.
   */
  const toegepast = useRef<SysteemStand>('unspecified');
  useEffect(() => {
    if (!geladen) return;
    const stand: SysteemStand =
      inst.thema === 'licht' ? 'light' : inst.thema === 'donker' ? 'dark' : 'unspecified';
    if (stand === toegepast.current) return;
    toegepast.current = stand;
    Appearance.setColorScheme(stand);
  }, [geladen, inst.thema]);

  return <ThemaContext.Provider value={palet}>{children}</ThemaContext.Provider>;
}

/**
 * Een vast palet voor een stukje scherm, los van de instelling. Het
 * startscherm is donker, maar de voorbeeldschermpjes in het telefoontje
 * blijven licht, precies zoals in de grote app.
 */
export function VastThema({ palet, children }: { palet: Palet; children: React.ReactNode }) {
  return <ThemaContext.Provider value={palet}>{children}</ThemaContext.Provider>;
}

/** De kleuren van het geldende thema. */
export function useThema(): Palet {
  return useContext(ThemaContext);
}

/** De kaartstijl (achtergrond + ronding) in de kleur van het thema. */
export function useKaartStijl() {
  const C = useThema();
  return useMemo(() => kaartVoor(C), [C]);
}

type StijlFabriek<T> = (C: Palet) => T;

/**
 * Bouwt de stylesheet van een scherm voor het geldende palet en onthoudt het
 * resultaat, zodat wisselen tussen licht en donker niet elke render opnieuw
 * een stylesheet kost.
 */
export function useStijlen<T extends StyleSheet.NamedStyles<T>>(fabriek: StijlFabriek<T>): T {
  const C = useThema();
  const cache = useRef(new Map<Palet, T>());
  return useMemo(() => {
    const bestaand = cache.current.get(C);
    if (bestaand) return bestaand;
    const nieuw = fabriek(C);
    cache.current.set(C, nieuw);
    return nieuw;
  }, [C, fabriek]);
}

/**
 * "Verminder beweging" als haak: het scherm rendert opnieuw zodra je het in
 * de systeeminstellingen omzet. Begint bij de momentopname uit theme.ts (die
 * is bij de start al opgehaald), zodat er geen flits van de verkeerde
 * animatie is; daarna vraagt hij het zelf nog eens na en luistert mee.
 */
export function useMinderBeweging(): boolean {
  const [aan, zetAan] = useState(mindeBeweging);
  useEffect(() => {
    let actief = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (actief) zetAan(!!v); })
      .catch(() => {});
    const luisteraar = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
      if (actief) zetAan(!!v);
    });
    return () => {
      actief = false;
      luisteraar?.remove();
    };
  }, []);
  return aan;
}
