/**
 * Om een recensie vragen (wens Chris 27-09), met het systeemvenster van Apple
 * en Google (expo-store-review): sterren geven zonder de app te verlaten.
 *
 * Op een goed moment en niet te vaak, anders werkt het tegen je:
 * - pas vanaf de 5e keer openen en minstens 4 dagen na de eerste keer, zodat
 *   iemand de app echt kent;
 * - net nadat iemand een melding heeft bekeken en teruggaat, een moment
 *   waarop de app net iets opleverde (nooit midden in het lezen);
 * - hooguit eens per 4 maanden.
 * Apple en Google begrenzen het tonen zelf nog verder (Apple: 3× per jaar), en
 * laten niet weten óf het venster verscheen. Dus: vragen = "we hebben het
 * geprobeerd", en daarna 4 maanden stil.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const SLEUTEL = 'recensie_v1';
const MIN_KEREN = 5;
const MIN_DAGEN = 4;
const TUSSENPOOS_DAGEN = 120;
const DAG = 24 * 3600 * 1000;

interface Stand { keren: number; eerste: number; gevraagd: number | null }

function laadModule(): typeof import('expo-store-review') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-store-review');
  } catch {
    return null;
  }
}

async function lees(): Promise<Stand> {
  try {
    const v = await AsyncStorage.getItem(SLEUTEL);
    if (v) return JSON.parse(v) as Stand;
  } catch { /* opnieuw beginnen */ }
  return { keren: 0, eerste: Date.now(), gevraagd: null };
}

function schrijf(s: Stand) {
  AsyncStorage.setItem(SLEUTEL, JSON.stringify(s)).catch(() => {});
}

/** Bij elke start van de app (na het startscherm) één keer aanroepen. */
export async function telOpening(): Promise<void> {
  const s = await lees();
  schrijf({ ...s, keren: s.keren + 1 });
}

/** Na het bekijken van een melding: vraag het als het er de tijd voor is. */
export async function misschienVragen(): Promise<void> {
  const s = await lees();
  const nu = Date.now();
  if (s.keren < MIN_KEREN) return;
  if (nu - s.eerste < MIN_DAGEN * DAG) return;
  if (s.gevraagd && nu - s.gevraagd < TUSSENPOOS_DAGEN * DAG) return;
  const mod = laadModule();
  if (!mod) return;
  try {
    if (!(await mod.isAvailableAsync()) || !(await mod.hasAction())) return;
    schrijf({ ...s, gevraagd: nu });
    await mod.requestReview();
  } catch { /* een recensievraag mag nooit iets breken */ }
}

const APPLE_ID = '6811057872';
const PAKKET = 'com.chrisschepers.dispatchau';

/**
 * De knop in Instellingen: altijd naar de winkelpagina om te schrijven. Het
 * systeemvenster zou hier niets doen als Apple het quotum al vol vindt, en
 * een knop die soms niets doet is erger dan een knop die de winkel opent.
 */
export async function openRecensiePagina(): Promise<void> {
  const url = Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${APPLE_ID}?action=write-review`
    : `market://details?id=${PAKKET}`;
  try {
    await Linking.openURL(url);
  } catch {
    Linking.openURL(`https://play.google.com/store/apps/details?id=${PAKKET}`).catch(() => {});
  }
}
