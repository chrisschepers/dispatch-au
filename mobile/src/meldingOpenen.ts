/**
 * Op een melding tikken moet die melding openen (wens Chris 16-08). De push
 * draagt het id in zijn data mee; hier halen we de volledige melding op en
 * sturen we de navigatie naar het detailscherm.
 *
 * Twee ingangen, want een tik komt op twee manieren binnen:
 *  - de app draaide al (of stond in de achtergrond): de listener vuurt;
 *  - de app was helemaal dicht: dan is er geen listener geweest en moet je
 *    achteraf vragen wat de laatste tik was.
 */
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import { haalMelding, type Melding } from './api';

export const navRef = createNavigationContainerRef<{
  Tabs: undefined;
  Detail: { melding: Melding };
}>();

/** Tikken kan binnenkomen vóórdat de navigatie klaar is; dan even wachten. */
async function wachtOpNavigatie(maxMs = 5000): Promise<boolean> {
  const eind = Date.now() + maxMs;
  while (!navRef.isReady()) {
    if (Date.now() > eind) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

async function openMelding(messageId: string): Promise<void> {
  if (!(await wachtOpNavigatie())) return;
  try {
    const melding = await haalMelding(messageId);
    navRef.navigate('Detail', { melding });
  } catch {
    // Melding niet op te halen (offline, of verwijderd): dan blijft de app
    // gewoon op het overzicht staan in plaats van een leeg scherm te tonen.
  }
}

function idUit(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification?.request?.content?.data as { messageId?: string; incidentId?: string } | undefined;
  const id = data?.incidentId ?? data?.messageId;
  return typeof id === 'string' && id ? id : null;
}

/** Eén keer aanroepen bij het opstarten. Levert een opruimfunctie. */
export function luisterNaarMeldingTikken(): () => void {
  // Koude start: de app was dicht toen er getikt werd.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const id = idUit(response);
      if (id) openMelding(id);
    })
    .catch(() => {});

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = idUit(response);
    if (id) openMelding(id);
  });
  return () => sub.remove();
}
