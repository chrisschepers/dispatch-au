/**
 * Pushregistratie via het bestaande gebruikersmodel van de backend: deze app
 * is daar gewoon een gebruiker met een straal-filter. Twee stappen, zoals de
 * backend het verwacht: register (deviceId + token) en daarna het filter.
 *
 * Stille uren is bewust geschrapt (Chris 15-08): wie nachtrust wil zet zijn
 * telefoon op Niet storen, dat is het patroon dat iedereen al kent.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registreerGebruiker, zetPushFilter, zetInstallToken } from './api';
import Constants from 'expo-constants';
import { bepaalPlek, bepaalPlekSnel } from './locatie';
import type { Instellingen } from './instellingen';
import { GELUIDEN, geldigGeluid, kanaalVoor } from './geluiden';

const DEVICE_KEY = 'device_id_v1';
const TOKEN_KEY = 'install_token_v1';
const USER_KEY = 'user_id_v1';

async function deviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dispatch-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function laadInstallToken(): Promise<void> {
  zetInstallToken(await AsyncStorage.getItem(TOKEN_KEY));
}

/** In de voorgrond: banner tonen, zacht geluid. */
export function zetNotificatieGedrag(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Eén kanaal per geluid: een kanaalgeluid ligt vast zodra het kanaal
    // bestaat, dus je kunt het achteraf niet meer omzetten. De server stuurt
    // het kanaal mee dat bij de keuze van de gebruiker hoort.
    for (const g of GELUIDEN) {
      Notifications.setNotificationChannelAsync(kanaalVoor(g.sleutel), {
        name: `Alerts (${g.naam.toLowerCase()})`,
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: `${g.sleutel}.wav`,
      }).catch(() => {});
    }
  }
}

/**
 * Alleen de installatie aanmelden, zonder push-token. Nodig omdat we anders
 * niemand tellen die de app installeert maar geen meldingen aanzet: de
 * installatieteller op het dashboard telt rijen in `users` (les 17-08, de
 * grote app zakte daardoor van ~150 naar ~90 per dag terwijl Play doortelde).
 * Idempotent: doet niets zodra er al een gebruiker bekend is.
 */
export async function meldInstallatie(): Promise<void> {
  if (!Device.isDevice) return;
  if (await AsyncStorage.getItem(USER_KEY)) return;
  try {
    const user = await registreerGebruiker({ deviceId: await deviceId(), fcmToken: '' });
    if (user.installationToken) {
      await AsyncStorage.setItem(TOKEN_KEY, user.installationToken);
      zetInstallToken(user.installationToken);
    }
    await AsyncStorage.setItem(USER_KEY, user.id);
  } catch { /* offline: volgende start opnieuw */ }
}

/**
 * Vraagt permissie (indien nodig), haalt het pushtoken en zet registratie +
 * filter op de backend. Veilig om vaker aan te roepen.
 */
export async function registreerVoorPushMetInstellingen(inst: Instellingen): Promise<boolean> {
  if (!Device.isDevice) return false;
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) { await meldInstallatie(); return false; }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const plek = await bepaalPlek(inst);

  // Zie werkPushFilterBij: de noodplek midden in Nederland gaat nooit mee.
  const plekVelden = plek.bron === 'geen' ? {} : { lat: plek.lat, lon: plek.lon };

  const user = await registreerGebruiker({
    deviceId: await deviceId(), fcmToken: token, ...plekVelden,
  });
  if (user.installationToken) {
    await AsyncStorage.setItem(TOKEN_KEY, user.installationToken);
    zetInstallToken(user.installationToken);
  }
  await AsyncStorage.setItem(USER_KEY, user.id);

  await zetPushFilter(user.id, {
    ...plekVelden,
    radius: inst.straalKm,
    radiusPerDienst: inst.straalPerDienst,
    disciplines: inst.disciplines,
    priorityLevel: inst.alleenGroot ? 'p1' : 'all',
    geluid: geldigGeluid(inst.geluid),
    geluidPerDienst: inst.geluidPerDienst,
    notificationsEnabled: inst.notificaties,
    gripOnly: inst.gripAlarm,
  });
  return true;
}

/** Het opgeslagen gebruikers-id, of null zolang er nog niet geregistreerd is. */
export async function huidigeGebruiker(): Promise<string | null> {
  return AsyncStorage.getItem(USER_KEY);
}

/**
 * Zorgt dat er een gebruiker bestaat, en vraagt zo nodig eerst toestemming
 * voor meldingen. Nodig voor capcodes: een capcode volgen betekent pushes
 * voor die capcode, ook als de gewone buurtmeldingen uit staan.
 * Levert null als de gebruiker de toestemming weigert.
 */
export async function zorgVoorGebruiker(inst: Instellingen): Promise<string | null> {
  const bestaand = await AsyncStorage.getItem(USER_KEY);
  if (bestaand) return bestaand;
  const gelukt = await registreerVoorPushMetInstellingen(inst);
  if (!gelukt) return null;
  return AsyncStorage.getItem(USER_KEY);
}

/**
 * Filter bijwerken zonder opnieuw te registreren (bij gewijzigde instellingen).
 *
 * Gooit door bij een mislukking, zodat de aanroeper de gebruiker kan
 * waarschuwen. Dat is nodig voor de schakelaar "meldingen ontvangen": stil
 * falen betekent daar dat de app "uit" toont terwijl de server vrolijk door
 * pusht — zichtbaar aan, onzichtbaar kapot (melding Geert 24-08).
 */
export async function werkPushFilterBij(inst: Instellingen): Promise<void> {
  const userId = await AsyncStorage.getItem(USER_KEY);
  if (!userId) return;
  // GEEN verse GPS-fix afwachten. bepaalPlek gunt zichzelf tot zes seconden
  // voor een fix, en pas dáárna ging het filter de deur uit. Wie de schakelaar
  // omzette en meteen zijn telefoon wegleefde, bevroor de app voordat het
  // verzoek verstuurd was — precies wat Geert overkwam: 's avonds meldingen
  // uitgezet, toch de hele nacht pushes. Het anker verandert hier trouwens
  // toch niet: dat verhuist alleen bij een expliciete actie.
  const plek = await bepaalPlekSnel(inst);
  // Niets bekend (null) of de noodplek midden in Nederland: geen coördinaten
  // meesturen. Die noodplek mag je nooit naar de server sturen — dan verhuist
  // iemands pushgebied naar de Veluwe omdat hij de locatietoestemming introk
  // of de app een fix miste (gevonden 18-08). De server laat de opgeslagen
  // plek staan als lat/lon ontbreken, dus de rest van het filter gaat gewoon
  // door; juist bij het UITZETTEN van meldingen is dat wat telt.
  const plekVelden = !plek || plek.bron === 'geen' ? {} : { lat: plek.lat, lon: plek.lon };
  await zetPushFilter(userId, {
    ...plekVelden,
    radius: inst.straalKm,
    radiusPerDienst: inst.straalPerDienst,
    disciplines: inst.disciplines,
    priorityLevel: inst.alleenGroot ? 'p1' : 'all',
    geluid: geldigGeluid(inst.geluid),
    geluidPerDienst: inst.geluidPerDienst,
    notificationsEnabled: inst.notificaties,
    gripOnly: inst.gripAlarm,
  });
}
