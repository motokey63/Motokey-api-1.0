import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, StyleSheet, Text, ScrollView } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { apiGet, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { getCached, setCached, shouldServeCache, CACHE_KEY_MOTOS } from '../../../../lib/cache';
import { parseMotosList, parseInterventions, parseAlertes, Moto } from '../../../../lib/motoParse';
import { MotoListCard } from '../../../../components/MotoListCard';
import { EmptyState } from '../../../../components/EmptyState';
import { OfflineBanner } from '../../../../components/OfflineBanner';
import { Button } from '../../../../components/Button';
import { colors } from '../../../../theme/colors';

/**
 * Motos tab (MPARITY-01/03/05, D-04/D-05/D-09): lightweight list, fetched
 * and enriched (interventions+alertes) per moto, cached read-only for
 * offline fallback. Tapping a card pushes to the Fiche Moto detail screen
 * (which re-fetches online-only, D-09). Secondary garage/moto flows (D-05)
 * are reached via a ghost-button row above the list.
 */
export default function MotosScreen() {
  const { getValidAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [motos, setMotos] = useState<Moto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const isFirstFocus = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    const token = await getValidAccessToken();
    const res = await apiGet('/motos', token ?? undefined);
    if (res.ok) {
      const parsed = parseMotosList(res.data);
      const enriched = await Promise.all(
        parsed.map(async (m) => {
          const [ivRes, alRes] = await Promise.all([
            apiGet('/motos/' + m.id + '/interventions', token ?? undefined),
            apiGet('/motos/' + m.id + '/entretien/alertes', token ?? undefined),
          ]);
          return { ...m, interventions: parseInterventions(ivRes), alertes: parseAlertes(alRes) };
        })
      );
      await setCached(CACHE_KEY_MOTOS, enriched);
      setMotos(enriched);
      setStaleSince(null);
    } else if (shouldServeCache(res.status)) {
      const cached = await getCached<Moto[]>(CACHE_KEY_MOTOS);
      if (cached) {
        setMotos(cached.data);
        setStaleSince(cached.updatedAt);
      } else {
        setError(errMsg(res.data));
      }
    } else {
      setError(errMsg(res.data));
    }
    setLoading(false);
    setRefreshing(false);
  }, [getValidAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        // Initial focus coincides with mount — the mount effect already loaded.
        isFirstFocus.current = false;
        return;
      }
      // Silent background refresh on tab-return (no spinner, list stays visible).
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return (
    <View style={styles.wrap}>
      <Stack.Screen options={{ title: 'Mes motos' }} />
      <View style={styles.menuRow}>
        <Button variant="ghost" title="Ajouter" onPress={() => router.push('/(app)/(tabs)/motos/add')} />
        <Button variant="ghost" title="Réclamer" onPress={() => router.push('/(app)/(tabs)/motos/claim')} />
        <Button variant="ghost" title="Mes réclamations" onPress={() => router.push('/(app)/(tabs)/motos/reclamations')} />
        <Button variant="ghost" title="Mes garages" onPress={() => router.push('/(app)/(tabs)/motos/garages')} />
      </View>
      {staleSince != null ? <OfflineBanner updatedAt={staleSince} /> : null}
      {loading ? (
        <ActivityIndicator color={colors.acc} style={styles.loader} />
      ) : error ? (
        <ScrollView contentContainerStyle={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Réessayer" onPress={load} />
        </ScrollView>
      ) : motos.length === 0 ? (
        <EmptyState
          icon="🏍️"
          heading="Aucune moto pour l'instant"
          body="Ajoutez votre première moto ou réclamez-en une déjà enregistrée chez un garage partenaire."
          ctaTitle="Ajouter ma moto"
          onCta={() => router.push('/(app)/(tabs)/motos/add')}
          secondaryTitle="Réclamer une moto"
          onSecondary={() => router.push('/(app)/(tabs)/motos/claim')}
        />
      ) : (
        <FlatList
          data={motos}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MotoListCard moto={item} onPress={() => router.push({ pathname: '/(app)/(tabs)/motos/[id]', params: { id: item.id } })} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  menuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  loader: {
    marginTop: 48,
  },
  errorWrap: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.tx2,
    textAlign: 'center',
  },
  list: {
    padding: 16,
  },
});
