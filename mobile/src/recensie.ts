/**
 * Om een beoordeling en feedback vragen (wens Chris 27-09, tekst 25-11).
 *
 * Een eigen melding en niet het systeemvenster van Apple en Google: dat kan
 * geen eigen tekst tonen, en Chris wil zeggen dat hij net begonnen is en
 * feedback welkom is. Beide knoppen staan er altijd naast elkaar, zonder
 * eerst te vragen of iemand de app goed vindt (dat mag niet volgens Google,
 * en ook niet de tevreden mensen naar de winkel sturen en de rest niet).
 * "Rate the app" opent de schrijfpagina in de winkel; die werkt altijd, het
 * systeemvenster niet (Apple's quotum).
 *
 * Wanneer: recensieRegels.ts. Net nadat iemand een melding heeft bekeken en
 * teruggaat (DetailScreen), nooit midden in het lezen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
import { magVragen, VRAAG, type RecensieStand } from './recensieRegels';

const SLEUTEL = 'recensie_v1';
const FEEDBACK_EMAIL = 'chrisschepers22@gmail.com';

async function lees(): Promise<RecensieStand> {
  try {
    const v = await AsyncStorage.getItem(SLEUTEL);
    if (v) return JSON.parse(v) as RecensieStand;
  } catch { /* opnieuw beginnen */ }
  return { keren: 0, eerste: Date.now(), gevraagd: null };
}

function schrijf(s: RecensieStand) {
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
  if (!magVragen(s, nu)) return;
  schrijf({ ...s, gevraagd: nu });
  Alert.alert(VRAAG.titel, VRAAG.tekst, [
    { text: VRAAG.later, style: 'cancel' },
    { text: VRAAG.feedback, onPress: () => { void stuurFeedback(); } },
    { text: VRAAG.beoordelen, onPress: () => { void openRecensiePagina(); } },
  ], { cancelable: true });
}

/** Een mail aan Chris, met versie en toestel erbij. */
export async function stuurFeedback(): Promise<void> {
  let versie = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const A = require('expo-application');
    versie = `${A.nativeApplicationVersion ?? ''} (${A.nativeBuildVersion ?? ''})`;
  } catch { /* zonder versie */ }
  const body = ['', '', '---', `App: Emergencies Near Me ${versie}`, `Device: ${Platform.OS} ${Platform.Version}`].join('\n');
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Feedback on Emergencies Near Me')}&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No mail app', `Send your feedback to ${FEEDBACK_EMAIL}.`);
  }
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
