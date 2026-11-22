/**
 * De deur naar Premium. Elke vergrendelde functie roept `vraag(reden)` aan en
 * krijgt dan het Premium-scherm met die functie bovenaan. Eén plek, zodat een
 * slot overal hetzelfde doet.
 *
 * Het scherm staat in een eigen Modal en niet in de navigatie: hij moet ook
 * vanuit een blad (kaartlagen, toestel) en direct na het startscherm kunnen
 * openen.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { useAbonnement } from './abonnement';
import type { PremiumReden } from './premium';
import BetaalmuurScreen from './screens/BetaalmuurScreen';

interface Ctx {
  premium: boolean;
  /** Opent het Premium-scherm; doet niets voor wie al Premium heeft. */
  vraag: (reden?: PremiumReden) => void;
  /** Voor wie Premium heeft: hetzelfde overzicht, zonder koopknop. */
  toonOverzicht: () => void;
  /** Het Premium-scherm staat open; de reclamevragen wachten daarop (advertenties.ts). */
  schermOpen: boolean;
  /**
   * Is al besloten of het Premium-scherm uit zichzelf opent (na het
   * startscherm of na een afgelopen abonnement)? Tot dan wachten de
   * toestemmingsvragen van de reclame, anders valt Apple's tracking-vraag
   * over het Premium-scherm heen (simulatortest build 19, 22-11).
   */
  aanbodBeslist: boolean;
  meldAanbodBeslist: () => void;
}

const PoortContext = createContext<Ctx>({ premium: true, vraag: () => {}, toonOverzicht: () => {}, schermOpen: false, aanbodBeslist: true, meldAanbodBeslist: () => {} });

export function usePremium(): Ctx {
  return useContext(PoortContext);
}

export function PremiumPoort({ children }: { children: React.ReactNode }) {
  const { premium, vereist } = useAbonnement();
  const [reden, setReden] = useState<PremiumReden | null>(null);
  const [overzicht, setOverzicht] = useState(false);
  const toonOverzicht = useCallback(() => setOverzicht(true), []);
  const [aanbodBeslist, setAanbodBeslist] = useState(false);
  const meldAanbodBeslist = useCallback(() => setAanbodBeslist(true), []);

  const vraag = useCallback((r: PremiumReden = 'intro') => {
    if (premium || !vereist) return;
    setReden(r);
  }, [premium, vereist]);

  // Gekocht of hersteld: het scherm gaat vanzelf dicht.
  useEffect(() => { if (premium) setReden(null); }, [premium]);

  return (
    <PoortContext.Provider value={{ premium, vraag, toonOverzicht, schermOpen: overzicht || reden !== null, aanbodBeslist, meldAanbodBeslist }}>
      {children}
      <Modal
        visible={overzicht}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOverzicht(false)}
      >
        {overzicht ? <BetaalmuurScreen overzicht onSluit={() => setOverzicht(false)} /> : null}
      </Modal>
      <Modal
        visible={reden !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReden(null)}
      >
        {reden !== null ? <BetaalmuurScreen reden={reden} onSluit={() => setReden(null)} /> : null}
      </Modal>
    </PoortContext.Provider>
  );
}
