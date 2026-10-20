/**
 * De nagebouwde schermen in het telefoontje van het startscherm, op de vaste
 * maat van Toestel (320×693). Waar het kan met de échte onderdelen van de app
 * (MeldingRij, de dienstkleuren, de geluidsnamen), zodat het voorbeeld er
 * precies zo uitziet als wat je daarna krijgt.
 *
 * The sample incidents are typical VicEmergency rows around Kilmore, Victoria.
 */
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import type { Melding } from '../../api';
import { DIENSTEN } from '../../diensten';
import { PALET_LICHT as C, T } from '../../theme';
import { MeldingRij } from '../MeldingRij';
import { NepKaart } from './NepKaart';
import { SCHERM_B, SCHERM_H } from './Toestel';

const minuten = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const VOORBEELDEN: Melding[] = [
  {
    id: 'v1', timestamp: minuten(2), priority: 'Watch and Act', level: 'Watch and Act', discipline: 'Fire',
    title: 'Grass fire', rawMessage: 'Grass fire · Responding', city: 'Kilmore', location: 'Lancefield Rd',
  },
  {
    id: 'v2', timestamp: minuten(9), priority: 'Responding', discipline: 'Rescue',
    title: 'Road crash rescue', rawMessage: 'Road crash rescue · Responding', city: 'Wallan', location: 'Hume Fwy',
  },
  {
    id: 'v3', timestamp: minuten(24), priority: 'Responding', discipline: 'Storm',
    title: 'Tree down', rawMessage: 'Tree down · Responding', city: 'Broadford', location: 'High St',
  },
  {
    id: 'v4', timestamp: minuten(41), priority: 'Under control', discipline: 'Fire',
    title: 'Structure fire', rawMessage: 'Structure fire · Under control', city: 'Seymour', location: 'Emily St',
  },
  {
    id: 'v5', timestamp: minuten(58), priority: 'Responding', discipline: 'Fire',
    title: 'Fire alarm', rawMessage: 'Fire alarm · Responding', city: 'Kilmore', location: 'Sydney St',
  },
];
const AFSTANDEN = [1.2, 4.8, 2.3, 7.9, 3.1];

const niets = () => {};

// ── Losse onderdelen ────────────────────────────────────────────────────────

/** De zwevende tabbalk van de app, met één tab actief. */
function TabBalk({ actief }: { actief: 0 | 1 | 2 }) {
  const tabs = [
    { icoon: 'map-marker-radius', label: 'Nearby' },
    { icoon: 'map', label: 'Map' },
    { icoon: 'cog', label: 'Settings' },
  ] as const;
  return (
    <View style={s.tabOmhulsel}>
      <View style={s.tabRij}>
      <View style={s.tabPil}>
        {tabs.map((t, i) => (
          <View key={t.label} style={[s.tab, i === actief && s.tabActief]}>
            <MaterialCommunityIcons
              name={(i === actief ? t.icoon : `${t.icoon}-outline`) as never}
              size={20}
              color={i === actief ? C.accent : C.textMuted}
            />
            <Text style={[s.tabLabel, i === actief && { color: C.accent }]}>{t.label}</Text>
          </View>
        ))}
      </View>
      {/* Zoeken zit rechts naast de tabs, als in de echte balk. */}
      <View style={s.tabZoek}>
        <MaterialCommunityIcons name="magnify" size={20} color={C.textPrimary} />
      </View>
      </View>
    </View>
  );
}

function Pil() {
  return (
    <View style={s.pil}>
      <View style={s.pilStip} />
      <Text style={s.pilTekst}>Live</Text>
    </View>
  );
}

function Schakelaar() {
  return (
    <View style={s.schakelaar}>
      <View style={s.schakelBol} />
    </View>
  );
}

// ── Schermen ────────────────────────────────────────────────────────────────

/** De lijst "In de buurt", zoals na het openen van de app. */
export function SchermLijst() {
  return (
    <View style={s.scherm}>
      <View style={s.bovenRij}>
        <Pil />
      </View>
      <Text style={s.subkop}>Around your current location · 20 km</Text>
      <View style={s.chips}>
        {DIENSTEN.slice(0, 3).map((d) => (
          <View key={d.key} style={[s.chip, { backgroundColor: `${d.kleur}14`, borderColor: d.kleur }]}>
            <MaterialCommunityIcons name={d.icoon as never} size={13} color={d.kleur} />
            <Text style={[s.chipTekst, { color: d.kleur }]}>{d.label}</Text>
          </View>
        ))}
      </View>
      <Text style={s.sectie}>TODAY</Text>
      <View style={s.lijst}>
        {VOORBEELDEN.map((m, i) => (
          <MeldingRij key={m.id} m={m} km={AFSTANDEN[i] ?? null} onPress={niets} />
        ))}
      </View>
      <TabBalk actief={0} />
    </View>
  );
}

/** Kaart met je straal, voor de locatiestap. */
export function SchermStraal() {
  const ik = { x: 160, y: 300 };
  return (
    <View style={s.scherm}>
      <View style={StyleSheet.absoluteFill}>
        <NepKaart
          b={SCHERM_B} h={SCHERM_H}
          ik={ik}
          straal={112}
          pinnen={[
            { x: 118, y: 250, kleur: C.brandweer },
            { x: 214, y: 332, kleur: C.ambulance },
            { x: 236, y: 212, kleur: C.knrm },
            { x: 60, y: 520, kleur: C.ambulance },
          ]}
        />
      </View>
      <View style={s.blad}>
        <View style={s.bladGreep} />
        <Text style={s.bladKop}>How far do you want to look?</Text>
        <View style={s.straalRij}>
          <Text style={s.rijLabel}>Radius</Text>
          <Text style={s.rijWaarde}>20 km</Text>
        </View>
        <View style={s.schuif}>
          <View style={s.schuifVol} />
          <View style={s.schuifBol} />
        </View>
        <Text style={s.bladKlein}>You only see incidents inside the circle.</Text>
      </View>
    </View>
  );
}

/** Vergrendelscherm met twee pushmeldingen. */
export function SchermVergrendel() {
  return (
    <View style={[s.scherm, { backgroundColor: '#000' }]}>
      <Svg width={SCHERM_B} height={SCHERM_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="lucht" x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor="#1d2b64" />
            <Stop offset="0.55" stopColor="#4b2a6e" />
            <Stop offset="1" stopColor="#b8435a" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={SCHERM_B} height={SCHERM_H} fill="url(#lucht)" />
      </Svg>
      <Text style={s.lockDatum}>Monday 19 October</Text>
      <Text style={s.lockKlok}>9:41</Text>
      <View style={s.pushen}>
        <Push
          titel="Grass fire in Kilmore"
          tekst="Lancefield Rd · Watch and Act · 1.2 km"
          tijd="now"
        />
        <Push
          titel="Road crash rescue in Wallan"
          tekst="Hume Fwy · Responding · 4.8 km"
          tijd="7 min"
        />
      </View>
    </View>
  );
}

function Push({ titel, tekst, tijd }: { titel: string; tekst: string; tijd: string }) {
  return (
    <View style={s.push}>
      <Image source={require('../../../assets/icon.png')} style={s.pushIcoon} />
      <View style={{ flex: 1 }}>
        <View style={s.pushKopRij}>
          <Text style={s.pushApp}>Emergencies</Text>
          <Text style={s.pushTijd}>{tijd}</Text>
        </View>
        <Text style={s.pushTitel} numberOfLines={1}>{titel}</Text>
        <Text style={s.pushTekst} numberOfLines={2}>{tekst}</Text>
      </View>
    </View>
  );
}

/** Diensten aan/uit met een eigen straal. */
export function SchermDiensten() {
  const stralen = ['50 km', '10 km', '20 km', '30 km', '100 km', '10 km'];
  return (
    <View style={s.scherm}>
      <Text style={s.schermTitel}>Settings</Text>
      <Text style={s.groepKop}>ALERTS FOR</Text>
      <View style={s.groep}>
        {DIENSTEN.map((d, i) => (
          <View key={d.key} style={[s.instRij, i > 0 && s.scheiding]}>
            <View style={[s.instIcoon, { backgroundColor: d.kleur }]}>
              <MaterialCommunityIcons name={d.icoon as never} size={15} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rijLabel}>{d.label}</Text>
              <Text style={s.rijSub}>Within {stralen[i]}</Text>
            </View>
            <Schakelaar />
          </View>
        ))}
      </View>
      <Text style={s.groepKop}>GENERAL</Text>
      <View style={s.groep}>
        <View style={s.instRij}>
          <View style={[s.instIcoon, { backgroundColor: '#ff9500' }]}>
            <MaterialCommunityIcons name="alert" size={15} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rijLabel}>Warnings only</Text>
            <Text style={s.rijSub}>Alert only for Watch and Act or higher</Text>
          </View>
          <View style={[s.schakelaar, s.schakelaarUit]}>
            <View style={[s.schakelBol, s.schakelBolUit]} />
          </View>
        </View>
      </View>
      <TabBalk actief={2} />
    </View>
  );
}

/** Detail van een melding: kaart, straatbeeld, route en voertuigen. */
export function SchermDetail() {
  return (
    <View style={s.scherm}>
      <View style={s.detailKaart}>
        <NepKaart b={SCHERM_B} h={250} pinnen={[{ x: 170, y: 150, kleur: C.brandweer }]} />
        <View style={s.straatbeeld}>
          <Svg width="100%" height="100%" viewBox="0 0 110 70" preserveAspectRatio="none">
            <Rect x={0} y={0} width={110} height={40} fill="#c9dcef" />
            <Rect x={0} y={40} width={110} height={30} fill="#8f9194" />
            <Rect x={8} y={14} width={40} height={30} fill="#9b5a45" />
            <Rect x={52} y={10} width={50} height={34} fill="#b46a4f" />
            <Rect x={14} y={22} width={8} height={9} fill="#e8eef5" />
            <Rect x={30} y={22} width={8} height={9} fill="#e8eef5" />
            <Rect x={60} y={18} width={9} height={10} fill="#e8eef5" />
            <Rect x={78} y={18} width={9} height={10} fill="#e8eef5" />
          </Svg>
          <View style={s.verrekijker}>
            <MaterialCommunityIcons name="binoculars" size={11} color="#fff" />
          </View>
        </View>
      </View>
      <View style={s.detailInhoud}>
        <View style={s.titelRij}>
          <View style={[s.titelIcoon, { backgroundColor: `${C.brandweer}18` }]}>
            <MaterialCommunityIcons name="fire" size={22} color={C.brandweer} />
          </View>
          <Text style={s.detailTitel}>Grass fire</Text>
        </View>
        <View style={s.kaartje}>
          <View style={s.navRij}>
            <View style={s.navIcoon}>
              <MaterialCommunityIcons name="navigation-variant" size={15} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rijLabel}>Lancefield Rd, Kilmore</Text>
              <Text style={s.rijSub}>Directions to the incident</Text>
            </View>
            <Text style={s.rijWaarde}>1.2 km</Text>
          </View>
        </View>
        <Text style={s.groepKop}>FROM THE AGENCY</Text>
        <View style={s.kaartje}>
          {[
            ['shield-check-outline', 'CFA', 'Country Fire Authority', 'VIC'],
            ['account-group-outline', '6 resources', 'assigned to this incident', 'Live'],
          ].map(([icoon, naam, post, nr], i) => (
            <View key={nr} style={[s.voertuig, i > 0 && s.scheiding]}>
              <MaterialCommunityIcons name={icoon as never} size={18} color={C.brandweer} />
              <View style={{ flex: 1 }}>
                <Text style={s.rijLabel}>{naam}</Text>
                <Text style={s.rijSub}>{post}</Text>
              </View>
              <Text style={s.nummer}>{nr}</Text>
            </View>
          ))}
        </View>
        <Text style={s.groepKop}>TIMELINE</Text>
        <View style={[s.kaartje, { paddingVertical: 10 }]}>
          {[
            ['2:02 pm', 'Grass fire reported by CFA', C.brandweer],
            ['2:09 pm', 'Watch and Act issued for Kilmore', C.accent],
          ].map(([tijd, tekst, kleur]) => (
            <View key={tijd} style={s.verloopRij}>
              <View style={[s.verloopBol, { backgroundColor: kleur }]} />
              <Text style={s.nummer}>{tijd}</Text>
              <Text style={[s.rijSub, { flex: 1, marginTop: 0 }]}>{tekst}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Trial preview on the paywall: what you get today, during and after. */
export function SchermProef({ prijsZin, proefTekst }: { prijsZin: string | null; proefTekst: string }) {
  const stappen = [
    { icoon: 'lock-open-variant', kleur: C.success, kop: 'Today', tekst: 'Everything unlocked, free.' },
    { icoon: 'bell-ring', kleur: C.ambulance, kop: proefTekst === 'The trial' ? 'During the trial' : `For ${proefTekst}`, tekst: 'Alerts, the map and every incident near you.' },
    { icoon: 'star', kleur: C.accent, kop: 'After that', tekst: prijsZin ? `${prijsZin}. Cancel any time.` : 'The yearly price. Cancel any time.' },
  ];
  return (
    <View style={s.scherm}>
      <View style={s.proefKop}>
        <Image source={require('../../../assets/icon.png')} style={s.proefIcoon} />
        <Text style={[s.schermTitel, { paddingTop: 10 }]}>Emergencies Near Me</Text>
        <Text style={s.proefSub}>Free trial</Text>
      </View>
      <View style={s.tijdlijn}>
        {stappen.map((st, i) => (
          <View key={st.kop} style={s.tlRij}>
            <View style={s.tlKolom}>
              <View style={[s.tlBol, { backgroundColor: st.kleur }]}>
                <MaterialCommunityIcons name={st.icoon as never} size={15} color="#fff" />
              </View>
              {i < stappen.length - 1 && <View style={s.tlLijn} />}
            </View>
            <View style={s.tlInhoud}>
              <Text style={s.rijLabel}>{st.kop}</Text>
              <Text style={s.tlTekst}>{st.tekst}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.voordelen}>
        {['Live incidents near you', 'Bushfire, flood and crash alerts', 'Every state in one app', 'No ads'].map((t) => (
          <View key={t} style={s.voordeel}>
            <MaterialCommunityIcons name="check-circle" size={17} color={C.success} />
            <Text style={s.voordeelTekst}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  scherm: { width: SCHERM_B, height: SCHERM_H, backgroundColor: C.bg, overflow: 'hidden' },
  bovenRij: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 56,
  },
  pil: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  pilStip: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success },
  pilTekst: { fontSize: 12, fontWeight: '600', color: C.textPrimary },
  subkop: { ...T.klein, fontSize: 12, color: C.textSecondary, paddingHorizontal: 18, marginTop: 10 },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
  },
  chipTekst: { fontSize: 11.5, fontWeight: '600' },
  sectie: { ...T.sectie, fontSize: 11, color: C.textSecondary, marginTop: 14, marginBottom: 6, marginLeft: 18 },
  lijst: { paddingHorizontal: 12 },

  tabOmhulsel: { position: 'absolute', left: 0, right: 0, bottom: 22, alignItems: 'center' },
  tabRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabZoek: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  tabPil: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 24,
    padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  tab: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  tabActief: { backgroundColor: C.accentSoft },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.textMuted, marginTop: 1 },

  blad: {
    position: 'absolute', left: 10, right: 10, bottom: 18, backgroundColor: C.card,
    borderRadius: 22, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 3 },
  },
  bladGreep: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 10 },
  bladKop: { ...T.kop, fontSize: 16, color: C.textPrimary, marginBottom: 10 },
  bladKlein: { fontSize: 11.5, color: C.textSecondary, marginTop: 10 },
  straalRij: { flexDirection: 'row', justifyContent: 'space-between' },
  schuif: { height: 4, borderRadius: 2, backgroundColor: C.chipBg, marginTop: 12, justifyContent: 'center' },
  schuifVol: { width: '22%', height: 4, borderRadius: 2, backgroundColor: C.accent },
  schuifBol: {
    position: 'absolute', left: '19%', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },

  lockDatum: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 70 },
  lockKlok: { color: '#fff', fontSize: 78, fontWeight: '700', textAlign: 'center', marginTop: -4, letterSpacing: -2 },
  pushen: { position: 'absolute', left: 10, right: 10, bottom: 120, gap: 8 },
  push: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: 'rgba(245,245,247,0.86)', borderRadius: 20, padding: 12,
  },
  pushIcoon: { width: 34, height: 34, borderRadius: 8 },
  pushKopRij: { flexDirection: 'row', justifyContent: 'space-between' },
  pushApp: { fontSize: 12, fontWeight: '600', color: '#1c1c1e' },
  pushTijd: { fontSize: 11, color: '#6e6e73' },
  pushTitel: { fontSize: 13, fontWeight: '700', color: '#1c1c1e', marginTop: 1 },
  pushTekst: { fontSize: 12, color: '#3a3a3c', marginTop: 1 },

  schermTitel: { ...T.titel, fontSize: 26, color: C.textPrimary, paddingHorizontal: 18, paddingTop: 58 },
  groepKop: { ...T.sectie, fontSize: 11, color: C.textSecondary, marginTop: 18, marginBottom: 6, marginLeft: 18 },
  groep: { backgroundColor: C.card, borderRadius: 14, marginHorizontal: 12, paddingLeft: 12 },
  instRij: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingRight: 12 },
  scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  instIcoon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rijLabel: { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  rijSub: { fontSize: 11.5, color: C.textSecondary, marginTop: 1 },
  rijWaarde: { fontSize: 13, color: C.textSecondary },
  schakelaar: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: C.success, padding: 2, alignItems: 'flex-end',
  },
  schakelaarUit: { backgroundColor: C.chipBg, alignItems: 'flex-start' },
  schakelBol: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  schakelBolUit: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  speelt: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 22,
    backgroundColor: C.accentSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  speeltTekst: { fontSize: 13, fontWeight: '600', color: C.accent },

  detailKaart: { height: 250 },
  straatbeeld: {
    position: 'absolute', left: 12, top: 58, width: 110, height: 70, borderRadius: 10,
    overflow: 'hidden', borderWidth: 2, borderColor: '#fff',
  },
  verrekijker: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: 3 },
  detailInhoud: { padding: 12, gap: 10 },
  titelRij: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titelIcoon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  detailTitel: { ...T.titel, fontSize: 22, color: C.textPrimary },
  kaartje: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 12 },
  navRij: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  navIcoon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#2f6fde', alignItems: 'center', justifyContent: 'center' },
  voertuig: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  nummer: { fontSize: 12, color: C.textMuted },

  proefKop: { alignItems: 'center', paddingTop: 66 },
  voordelen: { marginHorizontal: 22, marginTop: 20, gap: 10 },
  voordeel: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  voordeelTekst: { fontSize: 13.5, color: C.textPrimary },
  verloopRij: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  verloopBol: { width: 9, height: 9, borderRadius: 5 },
  proefIcoon: { width: 76, height: 76, borderRadius: 18 },
  proefSub: { ...T.body, color: C.textSecondary, marginTop: 4 },
  tijdlijn: { backgroundColor: C.card, borderRadius: 18, marginHorizontal: 14, marginTop: 22, padding: 16, paddingBottom: 2 },
  tlRij: { flexDirection: 'row', gap: 12 },
  tlKolom: { alignItems: 'center', width: 30 },
  tlBol: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tlLijn: { flex: 1, width: 3, backgroundColor: C.chipBg, marginVertical: 3, minHeight: 22 },
  tlInhoud: { flex: 1, paddingBottom: 16, paddingTop: 4 },
  tlTekst: { fontSize: 13, color: C.textSecondary, marginTop: 2, lineHeight: 18 },
});
