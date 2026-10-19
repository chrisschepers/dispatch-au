/**
 * Alle instellingen van de app in één context, bewaard in AsyncStorage.
 * Bewust géén Redux: er zijn maar acht waarden en dit moet de eenvoudigste
 * app blijven die we hebben.
 *
 * Het locatiemodel volgt het patroon dat Chris koos (15-08): "Huidige
 * locatie" aan = de app volgt je bij elke keer openen; uit = je stelt één
 * vaste plek in. Pushes gebruiken ALTIJD de laatst bekende plek (live of
 * handmatig) — er is geen achtergrondlocatie, dus onderweg even openen is
 * genoeg om alles te laten meeverhuizen.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Instellingen {
  volgLocatie: boolean;          // true = live volgen bij openen
  handLat: number | null;        // handmatige plek (alleen gebruikt als volgLocatie uit)
  handLon: number | null;
  handPlaats: string | null;     // label voor in de UI
  straalKm: number;              // 1..50, geldt voor elke dienst zonder eigen straal
  /** Eigen straal per dienst; leeg = overal dezelfde. Keuze Chris 16-08. */
  straalPerDienst: Record<string, number>;
  /** Welke diensten je gepusht krijgt (Instellingen). */
  disciplines: string[];
  /**
   * Welke diensten je in het overzicht ziet (de chips boven de lijst). Staat
   * LOS van je meldingen: even kijken wat de brandweer doet mag je pushes
   * niet omzetten (wens Chris 16-08, zelfde les als 1.4.6 in de grote app).
   */
  lijstDiensten: string[];
  /** Meldingsgeluid voor alles zonder eigen keuze. */
  geluid: string;
  /** Pro: eigen geluid per dienst. Leeg = overal hetzelfde. */
  geluidPerDienst: Record<string, string>;
  alleenGroot: boolean;          // alleen grote incidenten pushen (priorityLevel p1)
  /**
   * Push bij elke GRIP-opschaling in heel Nederland, los van straal en
   * diensten (zelfde als "GRIP-opschaling alert" in de grote app; backend
   * `gripOnly`). Wens Chris 27-09.
   */
  gripAlarm: boolean;
  notificaties: boolean;
  /**
   * Uiterlijk: 'automatisch' volgt de telefoon, 'licht'/'donker' zetten het
   * vast. Standaard automatisch, want wie zijn toestel 's avonds op donker
   * zet wil dat hier ook (wens Chris 24-08).
   */
  thema: 'automatisch' | 'licht' | 'donker';
  /** Laatst bekende status van Pro; overleeft offline zijn. */
  pro: boolean;
  userId: string | null;         // backend-gebruiker (na eerste registratie)
}

const STANDAARD: Instellingen = {
  volgLocatie: true,
  handLat: null, handLon: null, handPlaats: null,
  straalKm: 20,
  straalPerDienst: {},
  disciplines: ['Fire', 'Ambulance', 'Rescue', 'Storm', 'Hazmat', 'Other'],
  lijstDiensten: ['Fire', 'Ambulance', 'Rescue', 'Storm', 'Hazmat', 'Other'],
  geluid: 'zacht',
  geluidPerDienst: {},
  alleenGroot: false,
  gripAlarm: false,
  notificaties: false,           // pas aan na de expliciete vraag in onboarding
  thema: 'automatisch',          // volgt standaard het thema van de telefoon
  pro: false,
  userId: null,
};

const SLEUTEL = 'dispatch.settings.v2';

interface Ctx {
  inst: Instellingen;
  zet: <K extends keyof Instellingen>(k: K, v: Instellingen[K]) => void;
  /** Meerdere waarden in één keer, voor dingen die bij elkaar horen. */
  zetVeel: (waarden: Partial<Instellingen>) => void;
  geladen: boolean;
}

const InstellingenContext = createContext<Ctx>({
  inst: STANDAARD, zet: () => {}, zetVeel: () => {}, geladen: false,
});

export function InstellingenProvider({ children }: { children: React.ReactNode }) {
  const [inst, setInst] = useState<Instellingen>(STANDAARD);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    // Nooit op de opslag blijven wachten: mislukt of hangt hij, dan door met
    // de standaardinstellingen. Een eeuwig wit scherm (build 6) is erger dan
    // een keer je instellingen kwijt zijn.
    let klaar = false;
    const door = () => { if (!klaar) { klaar = true; setGeladen(true); } };
    AsyncStorage.getItem(SLEUTEL).then((raw) => {
      if (raw) {
        try {
          const opgeslagen = JSON.parse(raw) as Partial<Instellingen>;
          setInst({ ...STANDAARD, ...opgeslagen });
        } catch { /* corrupt → standaard */ }
      }
      door();
    }).catch(door);
    const t = setTimeout(door, 3000);
    return () => clearTimeout(t);
  }, []);

  function zet<K extends keyof Instellingen>(k: K, v: Instellingen[K]) {
    zetVeel({ [k]: v } as Partial<Instellingen>);
  }

  /**
   * Waarden die bij elkaar horen in één keer zetten. Een plaats bestaat uit
   * naam, breedte én lengte; los gezet bestaat er heel even een toestand met
   * wel een breedte en nog geen lengte, en wie dáárop synchroniseert stuurt de
   * verkeerde plek naar de server.
   */
  function zetVeel(waarden: Partial<Instellingen>) {
    setInst((huidig) => {
      const nieuw = { ...huidig, ...waarden };
      AsyncStorage.setItem(SLEUTEL, JSON.stringify(nieuw)).catch(() => {});
      return nieuw;
    });
  }

  return (
    <InstellingenContext.Provider value={{ inst, zet, zetVeel, geladen }}>
      {children}
    </InstellingenContext.Provider>
  );
}

export function useInstellingen(): Ctx {
  return useContext(InstellingenContext);
}
