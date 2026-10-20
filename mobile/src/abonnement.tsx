/**
 * Jaarabonnement (overgenomen uit 112 Meldingen): zonder lopend abonnement of
 * proefperiode staat de app achter de betaalmuur (BetaalmuurScreen). Voor nu
 * alleen iOS, via de App Store en RevenueCat (winkels.ts).
 *
 * Faalt zacht aan de goede kant: is er geen werkende winkel (oude build, web,
 * geen sleutel), dan is er geen muur. Is de winkel even onbereikbaar, dan geldt
 * de laatst vastgestelde toegang nog een week (abonnementRegels.ts).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bewaardGeldig, type Bewaard, type Toegang, type Uitkomst } from './abonnementRegels';
import { kiesWinkel, type Gebeurtenis, type Product } from './winkels';

const SLEUTEL = 'dispatch.abonnement.v1';
const TIJDSLIMIET_MS = 10_000;
/** Na zo lang een melding over de winkel; het antwoord mag daarna nog komen. */
const PRODUCT_WACHT_MS = 20_000;

// Alleen in een ontwikkelbuild (__DEV__) en met EXPO_PUBLIC_TEST_ZONDER_MUUR=1:
// geen betaalmuur, om in de simulator zonder sandbox-account de rest te testen.
// In een release is __DEV__ false en valt deze tak er bij het bundelen uit.
const winkel = __DEV__ && process.env.EXPO_PUBLIC_TEST_ZONDER_MUUR === '1' ? null : kiesWinkel();

interface Ctx {
  /** true = deze build vraagt een abonnement (er is een werkende winkel). */
  vereist: boolean;
  toegang: Toegang;
  /** false = opgezegd, loopt nog tot het einde van de periode. */
  verlengt: boolean;
  /** Er was eerder toegang op dit toestel; voor de tekst "verlopen". */
  wasActief: boolean;
  product: Product | null;
  productGeladen: boolean;
  fout: string | null;
  bezig: boolean;
  /** "the App Store". */
  winkelNaam: string;
  /** "Apple Account". */
  account: string;
  beheerUrl: string;
  koop: () => Promise<void>;
  /** Herstellen = de winkel opnieuw vragen wat er op dit account loopt. */
  herstel: () => Promise<Toegang>;
}

const AbonnementContext = createContext<Ctx>({
  vereist: false, toegang: 'actief', verlengt: true, wasActief: false,
  product: null, productGeladen: false, fout: null, bezig: false,
  winkelNaam: '', account: '', beheerUrl: '',
  koop: async () => {}, herstel: async () => 'actief',
});

export function useAbonnement() {
  return useContext(AbonnementContext);
}

function metTijdslimiet<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, weiger) => setTimeout(() => weiger({ code: 'tijd' }), TIJDSLIMIET_MS)),
  ]);
}

async function leesBewaard(): Promise<Bewaard | null> {
  try {
    const v = await AsyncStorage.getItem(SLEUTEL);
    return v ? (JSON.parse(v) as Bewaard) : null;
  } catch {
    return null;
  }
}

export function AbonnementProvider({ children }: { children: React.ReactNode }) {
  const [toegang, setToegang] = useState<Toegang>(winkel ? 'onbekend' : 'actief');
  const [verlengt, setVerlengt] = useState(true);
  const [wasActief, setWasActief] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [productGeladen, setProductGeladen] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const toegangRef = useRef<Toegang>(toegang);
  toegangRef.current = toegang;

  const pas = useCallback((u: Uitkomst) => {
    setToegang(u.toegang);
    setVerlengt(u.verlengt);
    if (u.toegang === 'actief') {
      setWasActief(true);
      setFout(null);
    }
    AsyncStorage.setItem(SLEUTEL, JSON.stringify({
      actief: u.toegang === 'actief', gecontroleerd: Date.now(),
    } satisfies Bewaard)).catch(() => {});
  }, []);

  const ververs = useCallback(async (): Promise<Toegang> => {
    if (!winkel) return 'actief';
    try {
      const u = await metTijdslimiet(winkel.toestand());
      pas(u);
      return u.toegang;
    } catch (e) {
      // Winkel onbereikbaar. Een eerdere vaststelling blijft staan; alleen bij
      // de allereerste controle vallen we terug op de bewaarde status.
      if (toegangRef.current !== 'onbekend') return toegangRef.current;
      const b = await leesBewaard();
      if (bewaardGeldig(b, Date.now())) {
        setToegang('actief');
        return 'actief';
      }
      setToegang('geen');
      setFout(winkel.leesbaar(e));
      return 'geen';
    }
  }, [pas]);

  /**
   * Product ophalen zonder het op te geven. De eerste StoreKit-aanvraag na een
   * koude start duurde in de simulator al 9 s (27-09); met offerings en de
   * proef-check erbij ging hij over de tijdslimiet, en dan bleef de knop op
   * "Opnieuw proberen" staan terwijl het product even later wél binnenkwam.
   * Nu: na de limiet een melding tonen, maar een laat antwoord alsnog
   * gebruiken en de melding weer weghalen.
   */
  const laadProduct = useCallback(async () => {
    if (!winkel) return;
    let klaar = false;
    const traag = setTimeout(() => {
      if (klaar) return;
      setFout(winkel.leesbaar({ code: 'tijd' }));
      setProductGeladen(true);
    }, PRODUCT_WACHT_MS);
    try {
      const p = await winkel.product();
      setProduct(p);
      setFout(null);
    } catch (e) {
      setFout(winkel.leesbaar(e));
    } finally {
      klaar = true;
      clearTimeout(traag);
      setProductGeladen(true);
    }
  }, []);

  useEffect(() => {
    if (!winkel) return;
    leesBewaard().then((b) => { if (b?.actief) setWasActief(true); });
    ververs();
    laadProduct();

    const stop = winkel.luister((g: Gebeurtenis) => {
      setBezig(false);
      if (g.soort === 'uitkomst') {
        if (g.volledig || g.u.toegang !== 'geen') pas(g.u);
        if (!g.volledig) ververs();
      } else if (g.soort === 'ververs') {
        ververs();
      } else if (g.soort === 'fout') {
        setFout(g.melding);
      }
      // 'geannuleerd': de gebruiker sloot het betaalvenster; geen melding.
    });

    // Terug in de app: betaling kan intussen rond zijn (van 'wacht' naar
    // 'actief'), of het abonnement is elders opgezegd of verlopen.
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') ververs();
    });
    return () => { stop(); app.remove(); };
  }, [ververs, laadProduct, pas]);

  const koop = useCallback(async () => {
    if (!winkel) return;
    setFout(null);
    if (!product) {
      await laadProduct();
      return;
    }
    setBezig(true);
    try {
      await winkel.koop(product);
      // De uitkomst komt via winkel.luister.
    } catch (e) {
      setBezig(false);
      setFout(winkel.leesbaar(e));
    }
  }, [product, laadProduct]);

  // Anders dan ververs() vraagt dit de winkel echt opnieuw (bij Apple:
  // restorePurchases, verplicht bereikbaar volgens de richtlijnen).
  const herstel = useCallback(async (): Promise<Toegang> => {
    if (!winkel) return 'actief';
    setFout(null);
    setBezig(true);
    try {
      if (!product) laadProduct();
      const u = await metTijdslimiet(winkel.herstel());
      pas(u);
      return u.toegang;
    } catch (e) {
      setFout(winkel.leesbaar(e));
      return toegangRef.current === 'onbekend' ? 'geen' : toegangRef.current;
    } finally {
      setBezig(false);
    }
  }, [product, laadProduct, pas]);

  return (
    <AbonnementContext.Provider value={{
      vereist: !!winkel, toegang, verlengt, wasActief,
      product, productGeladen, fout, bezig, koop, herstel,
      winkelNaam: winkel?.naam ?? '', account: winkel?.account ?? '',
      beheerUrl: winkel?.beheerUrl ?? '',
    }}>
      {children}
    </AbonnementContext.Provider>
  );
}
