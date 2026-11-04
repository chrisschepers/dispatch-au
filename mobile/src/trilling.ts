/**
 * Trillingen, per platform op de manier die daar hoort.
 *
 * iOS: de Taptic Engine, zoals Apple hem zelf gebruikt (licht tikje bij een
 * echte actie, selectietik bij kiezen).
 *
 * Android: alleen via performAndroidHapticsAsync, dat is
 * View.performHapticFeedback en volgt dus de systeeminstelling "trillen bij
 * aanraken". impactAsync en selectionAsync sturen op Android de kale
 * Vibrator aan en negeren die instelling; die gebruiken we daar nooit.
 * Material-bediening trilt niet bij een gewone tik, dus tikDruk doet op
 * Android niets.
 *
 * Alles is vuur-en-vergeet: een toestel zonder trilmotor (of een simulator)
 * mag nooit een fout opleveren.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';

/** Licht tikje bij het indrukken van een echte actie. Alleen iOS. */
export function tikDruk(): void {
  if (!isIOS) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * Selectietik: een keuze verspringt (chip aan/uit, schuif over een stap).
 * Android kent de zachte segmenttik pas vanaf API 34; daaronder gooit de
 * native kant HapticsNotSupportedException en vallen we terug op de kloktik.
 */
export function tikStap(): void {
  if (isIOS) {
    Haptics.selectionAsync().catch(() => {});
    return;
  }
  if (!isAndroid) return;
  Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)
    .catch(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick))
    .catch(() => {});
}

/**
 * Een schakelaar gaat om. Alleen Android (Toggle_On/Off vanaf API 34, anders
 * de kloktik): de native iOS-Switch geeft zelf al zijn eigen tik.
 */
export function tikSchakel(aan: boolean): void {
  if (!isAndroid) return;
  Haptics.performAndroidHapticsAsync(aan ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off)
    .catch(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick))
    .catch(() => {});
}
