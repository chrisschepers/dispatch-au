/**
 * Eén melding in een lijst: gekleurde balk per dienst, vakicoon, titel in
 * gewone taal, plaats en urgentie eronder, tijd en afstand rechts. Gedeeld
 * door de Buurt-lijst en Zoeken, zodat een melding er overal hetzelfde uitziet.
 */
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Melding } from '../api';
import {
  vertaalMelding, afstandTekst, klokTekst, plaatsRegel, urgentieTekst,
} from '../vertaal';
import { T, F, isIOS, type Palet } from '../theme';
import { useThema, useStijlen, useKaartStijl } from '../thema';
import { Drukbaar } from './Drukbaar';
import { Icoon } from './Icoon';
import { rijLabel } from '../rijLabel';

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
  // Ended: that is the whole status now, not the last "Responding".
  const urgentie = v.afgelopen ? 'Ended' : urgentieTekst(m.priority);
  const tijd = metDatum ? datumTekst(m.timestamp) : klokTekst(m.timestamp);
  // Grote tekst (vanaf 150%): de titel mag dan doorlopen tot vier regels en
  // plaats en urgentie tot twee, anders staat er bij AX5 vooral '…'.
  const groot = useWindowDimensions().fontScale >= 1.5;
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
      // Afgelopen: geen kaart erachter, wel dezelfde tekst (keuze Chris
      // 08-11: niet grijs, de achtergrond verdwijnt). Wat nog loopt springt
      // er zo uit, en de geschiedenis blijft leesbaar.
      style={[kaartStijl, styles.rij, v.afgelopen && styles.afgelopen]}
      // Oplichten in plaats van inzakken, zoals een rij in een iOS-lijst, en
      // geen tik bij elke rij. Android houdt zijn drukstaat.
      markeer
      // De rij bestaat uit losse tekstjes; voor VoiceOver/TalkBack is
      // dit pas samen een zin (audit 20-08). Met het waarschuwingsniveau en
      // de urgentie erin, zoals in beeld (zie rijLabel.ts).
      label={rijLabel({
        kop: kopTekst, opschaling: v.opschaling, onder: onderTekst || null,
        urgentie, urgentieInOnder: draaiOm, km, tijd,
      })}
      onPress={onPress}
    >
      {/* Gekleurde balk per dienst: kleur alleen als accent, niet als
          vlak. Zo blijft de lijst rustig maar zie je in één oogopslag
          welke dienst het betreft. */}
      <View style={[styles.balk, { backgroundColor: v.afgelopen ? 'transparent' : v.kleur }]} />

      <View style={styles.icoonVak}>
        <MaterialCommunityIcons name={v.icoon as never} size={22} color={v.kleur} />
      </View>

      <View style={styles.midden}>
        <Text style={styles.titel} numberOfLines={groot ? 4 : 2}>{kopTekst}</Text>
        {/* Opschaling is het nieuws: een middelbrand die grote brand
            wordt, verandert wat er in de buurt gebeurt (wens Chris
            18-08). Alleen tonen als het speelt, dus geen vast label. */}
        {v.opschaling ? (
          <View style={styles.opschaling}>
            <Icoon naam="opschaling" grootte={11} kleur={C.accent} gewicht="bold" />
            <Text style={styles.opschalingTekst}>{v.opschaling}</Text>
          </View>
        ) : null}
        {onderTekst ? <Text style={styles.plek} numberOfLines={groot ? 2 : 1}>{onderTekst}</Text> : null}
        {/* Bij een beschrijvende titel staat de urgentie nog apart;
            bij een omgedraaide rij zit hij al in onderTekst. */}
        {!draaiOm && urgentie ? (
          <Text style={styles.urgentie} numberOfLines={groot ? 2 : 1}>{urgentie}</Text>
        ) : null}
      </View>

      <View style={styles.rechts}>
        <Text style={styles.tijd}>{tijd}</Text>
        {km ? <Text style={styles.afstand}>{km}</Text> : null}
        {/* De chevron is een iOS-gewoonte; op Android laat de drukstaat al
            zien dat de rij te tikken is. */}
        {isIOS && <Icoon naam="chevron" grootte={18} kleur={C.textMuted} gewicht="semibold" />}
      </View>
    </Drukbaar>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  rij: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingRight: 12 },
  afgelopen: { backgroundColor: 'transparent' },
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
  // accentTekst: het gewone accent haalt op accentSoft geen 4.5:1.
  opschalingTekst: { fontSize: 11.5, fontWeight: F.weightSemibold, color: C.accentTekst },
  plek: { ...T.klein, color: C.textSecondary, marginTop: 3 },
  // Urgentie en afstand zijn informatie, dus textSecondary: textMuted is op
  // wit maar ~2:1 en blijft voor de chevron.
  urgentie: { ...T.klein, color: C.textSecondary, marginTop: 1 },
  rechts: { alignItems: 'flex-end', gap: 1 },
  // Cijfers op vaste breedte, anders dansen tijd en afstand per regel.
  tijd: { ...T.klein, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  afstand: { ...T.klein, color: C.textSecondary, fontVariant: ['tabular-nums'] },
});
