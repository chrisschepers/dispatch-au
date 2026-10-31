/**
 * Eén melding in mensentaal: wat, waar, wie erheen gaat en met welk soort
 * voertuig, plus de oorspronkelijke meldtekst voor wie het naadje wil weten.
 * Codes vertalen we; we verbergen ze niet voor wie doorleest.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share, Image, Linking, Platform, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MiniKaart } from '../components/MiniKaart';
import { BrandendIcoon, BotsingIcoon, VlammenIcoon } from '../components/IncidentIcoon';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeBottomTabNavigationProp } from '@react-navigation/bottom-tabs/unstable';
import {
  haalMelding, haalVerloop,
  type Melding, type VerloopRegel,
} from '../api';
import { afstandKm } from '../afstand';
import { misschienVragen } from '../recensie';
import { LookAround } from '../../modules/look-around';
import { useInstellingen } from '../instellingen';
import { bepaalPlekSnel } from '../locatie';
import { vertaalMelding, tijdTekst, nettePlaats, plaatsRegel, afstandTekst } from '../vertaal';
import { T, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { Drukbaar } from '../components/Drukbaar';
import { Icoon } from '../components/Icoon';
import { ICONEN, type IcoonNaam } from '../iconen';
import { bronVan, domeinVan } from '../bronnen';
import type { StapelParams, TabParams } from '../navigatie';

type Rt =RouteProp<{ Detail: { melding: Melding } }, 'Detail'>;
// Detail zit in de stapel van een tabblad, en het kaartje springt naar een
// ander tabblad: dus beide navigators in één type.
type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<StapelParams, 'Detail'>,
  NativeBottomTabNavigationProp<TabParams>
>;

/**
 * Staat de pin op de echte plek? De backend zegt zelf hoe nauwkeurig hij de
 * melding kon plaatsen: 'street' is de straat zelf, 'city' het midden van
 * de plaats, 'region' nog ruwer.
 */
function plaatsOnnauwkeurig(m: Melding): boolean {
  const p = m.geoPrecision;
  return !!p && p !== 'street' && p !== 'hecto' && p !== 'none';
}

/**
 * De uitspaartruc in BrandendIcoon schildert de vlamrand in de fondkleur en
 * heeft dus een dékkende kleur nodig. De tegel achter het titel-icoon is de
 * dienstkleur op 9% over een witte kaart; dit mengt die tint naar één vaste
 * kleur zodat de rand naadloos wegvalt.
 */
function tegelFond(kleur: string): string {
  const n = parseInt(kleur.slice(1), 16);
  const meng = (kanaal: number) => Math.round(kanaal + (255 - kanaal) * (1 - 0x18 / 255));
  const r = meng((n >> 16) & 255), g = meng((n >> 8) & 255), b = meng(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Navigeren naar de melding (wens Chris 27-09). iOS: routebeschrijving in
 * Apple Kaarten. Android: een geo:-link, dan kiest de telefoon zelf (Google
 * Maps, Waze, ...). Lukt geen van beide, dan Google Maps op het web.
 */
async function navigeer(lat: number, lon: number, label: string) {
  const naam = encodeURIComponent(label);
  const url = Platform.OS === 'ios'
    ? `maps://?daddr=${lat},${lon}&q=${naam}&dirflg=d`
    : `geo:0,0?q=${lat},${lon}(${naam})`;
  try {
    await Linking.openURL(url);
  } catch {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`).catch(() => {});
  }
}

/** Street View on the web, when Apple Look Around has nothing here. */
function openStraatbeeld(lat: number, lon: number) {
  Linking.openURL(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`).catch(() => {});
}

export default function DetailScreen() {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const { melding: begin } = useRoute<Rt>().params;
  const navigation = useNavigation<Nav>();
  const [melding, setMelding] = useState<Melding>(begin);
  const v = vertaalMelding(melding);
  const [verloop, setVerloop] = useState<VerloopRegel[]>([]);
  const { inst } = useInstellingen();
  const [mijnPlek, setMijnPlek] = useState<{ lat: number; lon: number } | null>(null);
  // Pas tonen als het plaatje er echt is: bij 404 (geen beeld, of functie
  // uit op de server) blijft de hoek van het kaartje gewoon leeg.
  const [straatbeeld, setStraatbeeld] = useState<'laden' | 'ok' | 'geen'>('laden');
  // Waar het plaatje vandaan komt. iOS eerst Apple Look Around (gratis, op het
  // toestel, en de Google-daglimiet blijft voor Android); heeft Apple op die
  // plek niets, dan alsnog Google via de backend (wens Chris 27-09).
  const [beeldBron, setBeeldBron] = useState<{ soort: 'apple'; bron: { uri: string } } | null>(null);

  // Terug uit een melding: het moment om eventueel om een recensie te vragen
  // (recensie.ts beslist of het er de tijd voor is). Kort wachten zodat de
  // terug-animatie eerst klaar is.
  useEffect(() => () => { setTimeout(() => { void misschienVragen(); }, 700); }, []);

  useEffect(() => {
    bepaalPlekSnel(inst).then((p) => { if (p && p.bron !== 'geen' && p.bron !== 'buiten-au') setMijnPlek(p); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Verloop is nice-to-have: bij een korte melding is er niets te vertellen
    // en dan blijft het blok gewoon weg.
    haalVerloop(begin.id).then(setVerloop).catch(() => {});
    // Volledige melding ophalen: de lijst levert een compacte versie zonder
    // straat en zonder eenheidsnamen.
    haalMelding(begin.id).then(setMelding).catch(() => {});
  }, [begin.id]);

  // Delen hoort in de kop: het is een bijactie, geen hoofdknop (audit 20-08).
  // iOS: een echte UIBarButtonItem met het deelsymbool van het systeem, in de
  // tintkleur van de kop (het accent); op iOS 26 krijgt hij vanzelf een
  // glazen capsule. Met een icoon toont iOS het label niet; VoiceOver leest
  // 'Share incident'.
  // Android: een M3-actie in de kopbalk. Raakvlak 48 dp, icoon in
  // onSurfaceVariant, ronde rimpel van 40 dp zoals een M3-icoonknop. Gewone
  // Pressable: Drukbaar kent geen randloze rimpel.
  // Elke optie alleen op haar eigen platform: native-stack verwerkt de
  // knoppenlijst ook op Android. Opnieuw zetten als de volledige melding
  // binnen is (met straat en status), anders deelt de knop de korte versie.
  useLayoutEffect(() => {
    navigation.setOptions(isIOS
      ? {
        unstable_headerRightItems: () => [{
          type: 'button',
          label: 'Share',
          icon: { type: 'sfSymbol', name: ICONEN.delen.ios },
          onPress: deel,
          accessibilityLabel: 'Share incident',
        }],
      }
      : {
        headerRight: () => (
          <Pressable
            onPress={deel}
            accessibilityRole="button"
            accessibilityLabel="Share incident"
            android_ripple={{ color: C.rimpel, borderless: true, radius: 20 }}
            style={styles.deelKnop}
          >
            <Icoon naam="delen" grootte={24} kleur={C.textSecondary} />
          </Pressable>
        ),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, melding, C]);

  const lat = melding.lat, lon = melding.lon ?? melding.lng;
  const opStraat = lat != null && lon != null && !plaatsOnnauwkeurig(melding);

  useEffect(() => {
    if (!opStraat || lat == null || lon == null) return;
    let levend = true;
    // Apple Look Around only: free, on the device, and it covers the
    // Australian capitals and many towns. No image is better than a paid one.
    if (LookAround) {
      LookAround.snapshot(lat, lon, 348, 222)
        .then((uri) => { if (levend && uri) setBeeldBron({ soort: 'apple', bron: { uri } }); })
        .catch(() => {});
    }
    return () => { levend = false; };
  }, [opStraat, lat, lon]);

  function openBeeld() {
    if (lat == null || lon == null) return;
    if (beeldBron?.soort === 'apple' && LookAround) {
      LookAround.open(lat, lon).then((ok) => { if (!ok) openStraatbeeld(lat, lon); }).catch(() => openStraatbeeld(lat, lon));
    } else {
      openStraatbeeld(lat, lon);
    }
  }
  const afstand = mijnPlek ? afstandTekst(afstandKm(mijnPlek.lat, mijnPlek.lon, melding)) : null;
  const plaatsNaam = melding.city ? nettePlaats(melding.city) : null;
  const bron = bronVan(melding.sourceRegion);
  // Rijen van het blok "From the agency" hieronder.
  const vanDeDienst: Array<{ icoon: IcoonNaam; titel: string; sub: string | null }> = [
    { icoon: 'bron', titel: melding.agency || 'Emergency services', sub: bron ? `Source: ${bron.naam}` : melding.sourceRegion ? melding.sourceRegion.toUpperCase() : null },
    { icoon: 'status', titel: melding.status || 'Status not published', sub: melding.updated ? `updated ${tijdTekst(melding.updated)}` : null },
    ...(melding.resources ? [{ icoon: 'eenheden' as const, titel: `${melding.resources} ${melding.resources === 1 ? 'resource' : 'resources'} assigned`, sub: null }] : []),
  ];

  async function deel() {
    const plek = plaatsRegel(melding.location, melding.city);
    await Share.share({
      message: `${v.emoji} ${v.titel}${plek ? ` · ${plek}` : ''}${melding.status ? ` · ${melding.status}` : ''}${melding.officialUrl ? `\n${melding.officialUrl}` : ''}`,
    });
  }

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.inhoud}>
      {/* Icoon in plaats van emoji (audit 20-08): dezelfde reden als in de
          lijst en de tabbalk. Het is meteen het soort-icoon van de kaart. */}
      <View style={styles.titelRij}>
        <View style={[styles.titelIcoon, { backgroundColor: `${v.kleur}18` }]}>
          {v.kaartBrandend ? (
            <BrandendIcoon object={v.kaartBrandend} maat={30} kleur={v.kleur} fond={tegelFond(v.kleur)} />
          ) : v.kaartBotsing ? (
            <BotsingIcoon maat={30} kleur={v.kleur} fond={tegelFond(v.kleur)} />
          ) : v.kaartVlammen ? (
            <VlammenIcoon vlammen={v.kaartVlammen} maat={28} kleur={v.kleur} />
          ) : (
            <MaterialCommunityIcons name={v.kaartIcoon as never} size={26} color={v.kleur} />
          )}
        </View>
        <Text style={[styles.titel, { flex: 1 }]}>{v.titel}</Text>
      </View>
      <Text style={styles.sub}>
        {[plaatsRegel(melding.location, melding.city), tijdTekst(melding.timestamp)].filter(Boolean).join(' · ')}
      </Text>

      {/* Opschaling. De brandweer schaalt op van middel naar groot, zeer groot
          en GRIP; dat is precies het verschil tussen "er staat wat te roken" en
          "de halve regio rijdt uit" (wens Chris 18-08). De backend heelt dit
          uit de ether, dus het kan uren na de melding nog binnenkomen. */}
      {/* Australian Warning System level, with the agency's own advice. */}
      {v.opschaling ? (
        <View style={styles.opschaling}>
          <Icoon naam="waarschuwing" grootte={20} kleur={C.accent} />
          <Text style={styles.opschalingTekst}>
            {v.opschaling}{melding.action ? ` · ${melding.action}` : ''}
          </Text>
        </View>
      ) : null}

      {lat != null && lon != null && (
        // Tikken opent het kaarttabblad ingezoomd op dit incident: het
        // kaartje is een voorproefje, geen doodlopend plaatje (wens Chris).
        <Drukbaar
          schaal={0.99}
          trillen={false}
          style={[kaartStijl, styles.kaartWrap]}
          // pop: in de kaartstapel terug naar de bestaande kaart in plaats
          // van een tweede kaart erbovenop. t: ook bij dezelfde plek als de
          // vorige keer opnieuw inzoomen.
          onPress={() => navigation.navigate('KaartTab', {
            screen: 'Kaart', params: { lat, lon, id: melding.id, t: Date.now() }, pop: true,
          })}
        >
          <MiniKaart lat={lat} lon={lon} kleur={v.kleur} />
          {/* Straatbeeld linksboven, zoals in de grote app. Alleen als de pin
              op een straat staat: een foto van "midden in de plaats" zegt
              niets en wekt de indruk dat het dáár is. */}
          {opStraat && beeldBron && straatbeeld !== 'geen' && (
            <Drukbaar
              style={[styles.straatbeeld, straatbeeld === 'laden' && styles.verborgen]}
              onPress={openBeeld}
              label="Look around this place"
              schaal={0.96}
            >
              <Image
                key={beeldBron.soort}
                source={beeldBron.bron}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onLoad={() => setStraatbeeld('ok')}
                onError={() => {
                  // Apple-plaatje stuk (cache gewist)? Dan alsnog Google.
                  setStraatbeeld('geen');
                }}
              />
              <View style={styles.straatbeeldIcoon}>
                <Icoon naam="straatbeeld" grootte={14} kleur="#fff" />
              </View>
            </Drukbaar>
          )}
          <View style={styles.kaartHint}>
            <Text style={styles.kaartHintTekst}>Tap for the map</Text>
          </View>
        </Drukbaar>
      )}

      {/* Eerlijk zijn over de pin. Niet elke alarmering bevat een straat; dan
          zetten we hem midden in de plaats en dat ziet er even precies uit als
          een echte locatie (wens Chris 16-08). Alleen tonen als het speelt:
          bij de brandweer staat er vrijwel altijd een straat bij, dus die
          krijgt deze regel vanzelf nooit te zien. */}
      {plaatsOnnauwkeurig(melding) && (
        <Text style={styles.pinHint}>
          The agency did not publish an exact address, so the pin is
          {melding.city ? ` in the middle of ${nettePlaats(melding.city)}` : ' approximate'}
          {' '}and not at the exact spot.
        </Text>
      )}

      {lat != null && lon != null && (
        <Drukbaar
          style={[kaartStijl, styles.navRij]}
          onPress={() => navigeer(lat, lon, plaatsRegel(melding.location, melding.city) || v.titel)}
          label={`Directions to ${plaatsNaam ?? 'the incident'}${afstand ? `, ${afstand}` : ''}`}
        >
          <View style={styles.navIcoon}>
            <Icoon naam="route" grootte={19} kleur="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rijTitel} numberOfLines={1}>
              {plaatsRegel(melding.location, melding.city) || 'Incident location'}
            </Text>
            <Text style={styles.rijSub}>
              {opStraat ? 'Directions to the incident' : `Directions to ${plaatsNaam ?? 'the area'} (approximate)`}
            </Text>
          </View>
          {afstand ? <Text style={styles.nummer}>{afstand}</Text> : null}
          <Icoon naam="chevron" grootte={18} kleur={C.textMuted} gewicht="semibold" />
        </Drukbaar>
      )}

      {/* What the agency publishes: who, the status, how many resources.
          Met de bron en het overheidsdomein erbij: Google Play wil dat elke
          melding herleidbaar is tot de officiële site (afwijzing 26-10). */}
      <View style={[kaartStijl, styles.blok]}>
        <Text style={styles.blokKop}>From the agency</Text>
        {vanDeDienst.map(({ icoon, titel, sub }, i) => (
          <View key={icoon} style={[styles.rij, i > 0 && styles.scheiding]}>
            <Icoon naam={icoon} grootte={20} kleur={v.kleur} style={styles.rijIcoon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rijTitel}>{titel}</Text>
              {sub ? <Text style={styles.rijSub}>{sub}</Text> : null}
            </View>
          </View>
        ))}
        {melding.officialUrl ? (
          <Drukbaar
            style={[styles.rij, styles.scheiding]}
            onPress={() => { Linking.openURL(melding.officialUrl!).catch(() => {}); }}
            label={`Open official advice on ${domeinVan(melding.officialUrl)}`}
          >
            <Icoon naam="extern" grootte={20} kleur={C.accent} style={styles.rijIcoon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rijTitel, { color: C.accent }]}>Official advice and warnings</Text>
              <Text style={styles.rijSub}>{domeinVan(melding.officialUrl)}</Text>
            </View>
          </Drukbaar>
        ) : null}
      </View>

      {/* Verloop: wie werd wanneer opgeroepen, in gewone zinnen. De backend
          maakt de zinnen (services/verloop.ts); hier staat alleen de vorm.
          Eén regel is geen verloop, dus dan tonen we het blok niet: dat is
          precies wat de eenheden-lijst hierboven al zegt. */}
      {verloop.length > 1 && (
        <View style={[kaartStijl, styles.blok]}>
          <Text style={styles.blokKop}>Timeline</Text>
          {verloop.map((r, i) => (
            <View key={`${r.at}-${i}`} style={styles.tlRij}>
              {/* De lijn loopt door tussen de bolletjes, maar niet ná de
                  laatste: anders lijkt het alsof er nog iets komt. */}
              <View style={styles.tlKolom}>
                <View style={[styles.tlBol, { backgroundColor: r.soort === 'alarmering' ? v.kleur : C.accent }]}>
                  <Icoon
                    naam={r.soort === 'alarmering' ? 'alarmering' : r.soort === 'opschaling' ? 'opschaling' : 'afgerond'}
                    grootte={13}
                    kleur="#fff"
                    gewicht={r.soort === 'opschaling' ? 'bold' : 'regular'}
                  />
                </View>
                {i < verloop.length - 1 && <View style={styles.tlLijn} />}
              </View>
              <View style={styles.tlInhoud}>
                <Text style={styles.tlTijd}>
                  {new Date(r.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                  {r.kop ? `  ·  ${r.kop}` : ''}
                </Text>
                <Text style={styles.tlTekst}>{r.tekst}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={[kaartStijl, styles.blok]}>
        <Text style={styles.blokKop}>Good to know</Text>
        <Text style={styles.blokTekst}>
          This app shows public information published by the emergency services. It is not an
          emergency service and it can be delayed or incomplete. In an emergency, call 000. Always
          follow the advice of the agency.
        </Text>
      </View>

    </ScrollView>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  deelKnop: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  inhoud: { padding: 16, paddingBottom: 32, gap: 12 },
  titel: { ...T.titel, color: C.textPrimary },
  titelRij: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titelIcoon: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  sub: { ...T.body, color: C.textSecondary, marginTop: -6 },
  kaartWrap: { height: 180, overflow: 'hidden' },
  straatbeeld: {
    position: 'absolute', left: 10, top: 10, width: 116, height: 74,
    borderRadius: 10, overflow: 'hidden', backgroundColor: C.chipBg,
    borderWidth: 2, borderColor: '#fff',
  },
  // Onzichtbaar tot het plaatje er is, en dan ook niet aanraakbaar: een tik
  // op die plek opent gewoon de kaart.
  verborgen: { opacity: 0, pointerEvents: 'none' },
  straatbeeldIcoon: {
    position: 'absolute', right: 5, bottom: 5, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)', padding: 4,
  },
  navRij: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  navIcoon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: '#2f6fde',
    alignItems: 'center', justifyContent: 'center',
  },
  kaartHint: {
    position: 'absolute', right: 10, bottom: 10,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  pinHint: { ...T.klein, color: C.textMuted, marginTop: 6, marginHorizontal: 4, lineHeight: 18 },
  kaartHintTekst: { fontSize: 12, fontWeight: '600', color: C.textPrimary },
  blok: { padding: 16 },
  tlRij: { flexDirection: 'row', gap: 12 },
  tlKolom: { alignItems: 'center', width: 24 },
  tlBol: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tlLijn: { flex: 1, width: 2, backgroundColor: C.separator, marginVertical: 2 },
  tlInhoud: { flex: 1, paddingBottom: 14 },
  tlTijd: { ...T.klein, color: C.textMuted, marginBottom: 2 },
  tlTekst: { ...T.body, color: C.textPrimary, lineHeight: 21 },
  blokKop: { ...T.sectie, color: C.textSecondary, textTransform: 'uppercase', marginBottom: 8 },
  blokTekst: { ...T.body, color: C.textPrimary },
  meldtekst: { ...T.klein, color: C.textSecondary },
  opschaling: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accentSoft, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 2,
  },
  opschalingTekst: { ...T.rij, color: C.accent, flex: 1 },
  rijIcoon: { width: 24 },
  rij: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rijTitel: { ...T.body, color: C.textPrimary },
  rijSub: { ...T.klein, color: C.textMuted, marginTop: 2 },
  nummer: { fontSize: 13, color: C.textMuted, fontVariant: ['tabular-nums'] },
});
