/**
 * Het blad met meldingen die op de kaart één plek delen. Diensten zonder
 * exact adres zetten hun meldingen in het midden van de plaats; inzoomen
 * haalt die nooit uit elkaar, dus tonen we ze als lijst (zie KaartStapel in
 * navigatie.tsx voor het blad zelf).
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StapelParams } from '../navigatie';
import { plaatsOnnauwkeurig } from '../vertaal';
import { herhalingTekst } from '../kaartFilter';
import { BladGreep } from '../components/BladGreep';
import { MeldingRij } from '../components/MeldingRij';
import { T, isIOS, type Palet } from '../theme';
import { useStijlen } from '../thema';

type Nav = NativeStackNavigationProp<StapelParams, 'Groep'>;

export default function GroepScreen() {
  const styles = useStijlen(maak_styles);
  const navigation = useNavigation<Nav>();
  const { leden } = useRoute<RouteProp<StapelParams, 'Groep'>>().params;
  // Nieuwste bovenaan, net als in de lijst Nearby.
  const lijst = React.useMemo(
    () => [...leden].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)),
    [leden],
  );
  const allemaalOnnauwkeurig = lijst.length > 0 && lijst.every(plaatsOnnauwkeurig);
  // Allemaal hetzelfde adres: dan is dat het verhaal (plan 08-11).
  const herhaling = allemaalOnnauwkeurig ? null : herhalingTekst(lijst);

  const inhoud = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.inhoud}
      // Android: de lijst geeft het slepen door aan het blad, zodat je het
      // vanuit de lijst groter of dicht trekt.
      nestedScrollEnabled
    >
      <View style={styles.kop}>
        <Text style={styles.titel} accessibilityRole="header">{herhaling ?? `${lijst.length} incidents here`}</Text>
        {allemaalOnnauwkeurig && (
          <Text style={styles.sub}>
            The agencies did not publish exact addresses, so these share one pin.
          </Text>
        )}
      </View>
      {lijst.map((m) => (
        <MeldingRij
          key={m.id}
          m={m}
          km={null}
          metDatum
          onPress={() => {
            // Eerst het blad dicht, dan Detail in de kaartstapel; anders
            // opent Detail bovenop het halve blad.
            navigation.goBack();
            navigation.navigate('Detail', { melding: m });
          }}
        />
      ))}
    </ScrollView>
  );

  if (isIOS) return inhoud;
  return (
    <View style={styles.android}>
      <BladGreep onPress={() => navigation.goBack()} />
      {inhoud}
    </View>
  );
}

const maak_styles = (C: Palet) => StyleSheet.create({
  android: { flex: 1 },
  inhoud: { padding: 16, paddingBottom: 32 },
  // De rijen houden zelf 8 onder zich (MeldingRij).
  kop: { gap: 4, marginBottom: 12 },
  titel: { ...T.kop, color: C.textPrimary },
  sub: { ...T.klein, color: C.textSecondary },
});
