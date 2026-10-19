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
import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useColorScheme } from 'react-native';
import type { StyleSheet } from 'react-native';
import { PALET_LICHT, PALET_DONKER, kaartVoor, type Palet } from './theme';
import { useInstellingen } from './instellingen';

const ThemaContext = createContext<Palet>(PALET_LICHT);

export function ThemaProvider({ children }: { children: React.ReactNode }) {
  const systeem = useColorScheme();
  const { inst } = useInstellingen();
  // 'automatisch' = volg de telefoon. Dat is de standaard: wie zijn toestel
  // 's avonds op donker zet, wil dat hier ook.
  const palet = useMemo(() => {
    if (inst.thema === 'licht') return PALET_LICHT;
    if (inst.thema === 'donker') return PALET_DONKER;
    return systeem === 'dark' ? PALET_DONKER : PALET_LICHT;
  }, [inst.thema, systeem]);
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
