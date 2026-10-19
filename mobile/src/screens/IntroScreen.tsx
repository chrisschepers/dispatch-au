/**
 * Startscherm (wens Chris 27-09, naar het voorbeeld van Alarmeringen P2000):
 * zeven stappen, elk met een telefoontje dat laat zien wat je krijgt. Na de
 * laatste stap volgt de proefperiode (BetaalmuurScreen), in dezelfde opmaak.
 *
 * Volgorde met een reden:
 * 1. eerst laten zien wát dit is;
 * 2. dan de twee toestemmingen, elk met uitleg vooraf. Een app die meteen om
 *    je locatie vraagt krijgt vaker "niet toestaan", en dan werkt de kern
 *    niet. Zeg je eerst waaróm, dan is de vraag logisch. Nee zeggen kan
 *    gewoon in de vraag van het systeem; de app gaat daarna door;
 * 3. dan wat je kunt instellen en wat er in een melding zit;
 * 4. als laatste "klaar", zodat wie de proef start een werkende app heeft.
 *
 * Bewust géén vegen: twee stappen zijn vragen, en die beantwoord je met de
 * knop, niet per ongeluk met je duim. Terug kan altijd met de knop linksboven.
 */
import React, { useState } from 'react';
import { useInstellingen } from '../instellingen';
import { vraagLocatiePermissie } from '../locatie';
import { registreerVoorPushMetInstellingen } from '../push';
import { IntroSchil } from '../components/intro/IntroSchil';
import {
  SchermLijst, SchermStraal, SchermVergrendel, SchermDiensten, SchermDetail,
} from '../components/intro/Schermpjes';

interface Props { klaar: () => void }

interface Stap {
  titel: string;
  tekst: string;
  knop: string;
  scherm: React.ReactNode;
  donker?: boolean;
  actie?: 'locatie' | 'meldingen';
}

const STAPPEN: Stap[] = [
  {
    titel: 'Welcome to Dispatch',
    tekst: 'See what is happening around you right now: fires, rescues, storms, floods and other emergencies, straight from the official agencies.',
    knop: 'Get started',
    scherm: <SchermLijst />,
  },
  {
    titel: 'Location',
    tekst: 'Allow your location to see incidents nearby. Prefer a fixed suburb? You can set one later in Settings.',
    knop: 'Allow location',
    scherm: <SchermStraal />,
    actie: 'locatie',
  },
  {
    titel: 'Alerts',
    tekst: 'Get an alert as soon as something happens inside your radius. You choose which services and how far.',
    knop: 'Allow alerts',
    scherm: <SchermVergrendel />,
    donker: true,
    actie: 'meldingen',
  },
  {
    titel: 'Your services',
    tekst: 'Choose what you follow, each with its own radius: a bushfire 50 km away matters, a road crash usually only nearby.',
    knop: 'Continue',
    scherm: <SchermDiensten />,
  },
  {
    titel: 'Everything about an incident',
    tekst: 'Map, Look Around, directions, the agency, warning level and timeline.',
    knop: 'Continue',
    scherm: <SchermDetail />,
  },
  {
    titel: 'Ready to go',
    tekst: 'New incidents appear automatically. Use the magnifier at the bottom to search all of Australia. Dispatch is not an emergency service: in an emergency call 000.',
    knop: 'Start',
    scherm: <SchermLijst />,
  },
];

export default function IntroScreen({ klaar }: Props) {
  const { inst, zet } = useInstellingen();
  const [stap, setStap] = useState(0);
  const [bezig, setBezig] = useState(false);
  const huidig = STAPPEN[stap]!;

  async function verder() {
    if (huidig.actie === 'locatie') {
      setBezig(true);
      await vraagLocatiePermissie().catch(() => false);
      setBezig(false);
    } else if (huidig.actie === 'meldingen') {
      setBezig(true);
      // Only switch alerts on when the device is really registered; until the
      // push service exists (docs/PUSH-API.md) the switch stays off.
      const ok = await registreerVoorPushMetInstellingen({ ...inst, notificaties: true }).catch(() => false);
      zet('notificaties', ok === true);
      setBezig(false);
    }
    if (stap === STAPPEN.length - 1) klaar();
    else setStap(stap + 1);
  }

  return (
    <IntroSchil
      sleutel={stap}
      scherm={huidig.scherm}
      schermDonker={huidig.donker}
      titel={huidig.titel}
      tekst={huidig.tekst}
      stap={stap}
      aantal={STAPPEN.length}
      knop={huidig.knop}
      onKnop={verder}
      bezig={bezig}
      onTerug={stap > 0 ? () => setStap(stap - 1) : undefined}
    />
  );
}
