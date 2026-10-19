/**
 * Getekende kaartstijl, warm palet (keuze Chris 18-08).
 *
 * Waarom: de standaard Google-kaart staat vol winkels, horeca, ov-haltes en
 * wijknamen. Die concurreren allemaal met het enige wat hier telt, de melding.
 * Deze stijl haalt dat weg en geeft de ondergrond een rustig, wat
 * tekenfilmachtig palet: crèmekleurig land, groene parken, helderblauw water
 * en gele snelwegen. De rode, oranje en blauwe pins zijn daarmee het felste
 * op het scherm, en dat is precies de bedoeling.
 *
 * LET OP: dit werkt alleen waar Google Maps de kaart tekent, dus op Android.
 * Op iOS rendert react-native-maps standaard Apple Maps en die negeert
 * customMapStyle; daar blijft de kaart de vertrouwde Apple-look. Zetten we de
 * app ooit op Google Maps voor iOS, dan geldt deze stijl daar meteen ook.
 *
 * De volgorde van poi en poi.park is geen toeval: een latere regel wint, dus
 * staat het park ná de algemene poi-regel, anders blijft het groen grijs.
 */
import { Platform } from 'react-native';
import type { MapStyleElement, MapType, MKPointOfInterestCategoryType } from 'react-native-maps';

/**
 * Apple Maps kent geen eigen kleurstijl, maar heeft twee knoppen die dezelfde
 * kant op werken:
 *
 * - `mutedStandard` is Apples eigen gedempte ondergrond, gemaakt om er data
 *   overheen te leggen. Minder kleur en minder nadruk op wegen, precies wat we
 *   op Android met het crème palet doen. Android kent deze kaartsoort niet en
 *   houdt gewoon 'standard'.
 * - `pointsOfInterestFilter` bepaalt wélke plaatsen er nog op mogen. Wij laten
 *   alleen kazerne, ziekenhuis en politiebureau staan: winkels, kroegen en
 *   kappers verdwijnen, maar het bureau of ziekenhuis naast het incident is
 *   nou juist nuttige context.
 */
export const APPLE_KAART: {
  mapType?: MapType;
  pointsOfInterestFilter?: MKPointOfInterestCategoryType[];
} = Platform.OS === 'ios'
  ? { mapType: 'mutedStandard', pointsOfInterestFilter: ['fireStation', 'hospital', 'police'] }
  // Android krijgt deze twee helemaal niet: mutedStandard bestaat daar niet en
  // het plaatsenfilter is een MapKit-ding. De kaartstijl hierboven doet daar
  // hetzelfde werk.
  : {};

export const WARME_KAART: MapStyleElement[] = [
  // Alles wat niet over de melding gaat: uit.
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  { elementType: 'geometry', stylers: [{ color: '#fbf5e6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b5a45' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fffdf6' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#f3ecdb' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#dcecc0' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e9e6d4' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#a8dd8c' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e3d6b8' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7a6a52' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fff3d6' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffcc57' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e3a52a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#7fcdee' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#35708e' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#dccfb0' }] },
];

/**
 * Donkere variant, voor wie de app op donker heeft staan. Zelfde opzet als de
 * warme kaart (alles wat niet over de melding gaat blijft uit), maar dan met
 * een nachtpalet: de kaart mag niet als een lamp uit een verder donker scherm
 * springen. De snelweg houdt zijn geel-oranje accent, want dat is precies wat
 * je bij een melding op de A-wegen wilt zien.
 */
export const DONKERE_KAART: MapStyleElement[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  { elementType: 'geometry', stylers: [{ color: '#1b1c1f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa0a6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121316' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#212226' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1e2620' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#23242a' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#24382a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e3035' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1b1c1f' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8b9198' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#3a3c42' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#8a6a1f' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#5d4715' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#16232b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4d7f96' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a3c42' }] },
];

/** De kaartstijl die bij het geldende thema hoort. */
export function kaartStijlVoor(donker: boolean): MapStyleElement[] {
  return donker ? DONKERE_KAART : WARME_KAART;
}

/**
 * Apple-kaartopties per thema. `mutedStandard` bestaat in beide smaken; de
 * kaart volgt daar de systeeminstelling van het toestel. Zet de gebruiker in
 * ONZE app het thema handmatig vast, dan dwingen we het ook op de kaart af
 * met userInterfaceStyle.
 */
export function appleKaartVoor(donker: boolean) {
  if (Platform.OS !== 'ios') return {};
  return { ...APPLE_KAART, userInterfaceStyle: donker ? ('dark' as const) : ('light' as const) };
}
