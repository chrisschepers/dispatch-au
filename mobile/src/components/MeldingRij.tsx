/**
 * Eén melding in een lijst: gekleurde balk per dienst, vakicoon, titel in
 * gewone taal, plaats en urgentie eronder, tijd en afstand rechts. Gedeeld
 * door de Buurt-lijst en Zoeken, zodat een melding er overal hetzelfde uitziet.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Melding } from '../api';
import {
  vertaalMelding, afstandTekst, klokTekst, plaatsRegel, urgentieTekst,
} from '../vertaal';
import { T, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { Drukbaar } from './Drukbaar';

interface Props {
  m: Melding;
  km: number | null;
  onPress: () => void;
  /** Zoeken toont ook de datum: daar komen meldingen van weken terug langs. */
  metDatum?: boolean;
}

function datumTekst(iso: string): string {
  const d = new Date(iso);
  const vandaag = new Date();
  if (d.toDateString() === vandaag.toDateString()) return klokTekst(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function MeldingRij({ m, km: afstand, onPress, metDatum }: Props) {
  const C = useThema();
  const styles = useStijlen(maak_styles);
  const kaartStijl = useKaartStijl();
  const v = vertaalMelding(m);
  const km = afstandTekst(afstand);
  const plek = plaatsRegel(m.location, m.city);
  const urgentie = urgentieTekst(m.priority);
  const tijd = metDatum ? datumTekst(m.timestamp) : klokTekst(m.timestamp);
  // Zet de PLAATS vooraan zodra de titel een terugval is. Van de 22
  // zichtbare rijen begonnen er zeventien met "Ambulance opgeroepen"
  // (gemeten 31-08); het grootste element op de kaart was precies wat
  // nooit verschilde. Heeft de melding wél een eigen omschrijving,
  // dan blijft die de titel — die is waardevoller dan de plaats.
  const draaiOm = v.generiek === true && !!plek;
  const kopTekst = draaiOm ? plek! : v.titel;
  const onderTekst = draaiOm
    ? [v.dienst, urgentie].filter(Boolean).join(' · ')
    : plek;
  return (
    <Drukbaar
      style={[kaartStijl, styles.rij]}
      // De rij bestaat uit losse tekstjes; voor VoiceOver/TalkBack is
      // dit pas samen een zin (audit 20-08).
      label={[kopTekst, onderTekst, km, tijd].filter(Boolean).join(', ')}
      onPress={onPress}
    >
      {/* Gekleurde balk per dienst: kleur alleen als accent, niet als
          vlak. Zo blijft de lijst rustig maar zie je in één oogopslag
          welke dienst het betreft. */}
      <View style={[styles.balk, { backgroundColor: v.kleur }]} />

      <View style={styles.icoonVak}>
        <MaterialCommunityIcons name={v.icoon as never} size={22} color={v.kleur} />
      </View>

      <View style={styles.midden}>
        <Text style={styles.titel} numberOfLines={2}>{kopTekst}</Text>
        {/* Opschaling is het nieuws: een middelbrand die grote brand
            wordt, verandert wat er in de buurt gebeurt (wens Chris
            18-08). Alleen tonen als het speelt, dus geen vast label. */}
        {v.opschaling ? (
          <View style={styles.opschaling}>
            <MaterialCommunityIcons name="arrow-up-bold" size={11} color={C.accent} />
            <Text style={styles.opschalingTekst}>{v.opschaling}</Text>
          </View>
        ) : null}
        {onderTekst ? <Text style={styles.plek} numberOfLines={1}>{onderTekst}</Text> : null}
        {/* Bij een beschrijvende titel staat de urgentie nog apart;
            bij een omgedraaide rij zit hij al in onderTekst. */}
        {!draaiOm && urgentie ? (
          <Text style={styles.urgentie} numberOfLines={1}>{urgentie}</Text>
        ) : null}
      </View>

      <View style={styles.rechts}>
        <Text style={styles.tijd}>{tijd}</Text>
        {km ? <Text style={styles.afstand}>{km}</Text> : null}
        <MaterialCommunityIcons name="chevron-right" size={18} color={C.textMuted} />
      </View>
    </Drukbaar>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  rij: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingRight: 12 },
  balk: { width: 4, alignSelf: 'stretch' },
  icoonVak: { width: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  midden: { flex: 1, paddingVertical: 12 },
  titel: { ...T.rij, color: C.textPrimary },
  opschaling: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: C.accentSoft, borderRadius: 999,
    paddingLeft: 5, paddingRight: 8, paddingVertical: 2,
  },
  opschalingTekst: { fontSize: 11.5, fontWeight: '600', color: C.accent },
  plek: { ...T.klein, color: C.textSecondary, marginTop: 3 },
  urgentie: { ...T.klein, color: C.textMuted, marginTop: 1 },
  rechts: { alignItems: 'flex-end', gap: 1 },
  // Cijfers op vaste breedte, anders dansen tijd en afstand per regel.
  tijd: { ...T.klein, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  afstand: { ...T.klein, color: C.textMuted, fontVariant: ['tabular-nums'] },
});
