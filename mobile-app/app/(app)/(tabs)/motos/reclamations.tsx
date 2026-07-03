import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { apiGet, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { parseReclamations, Reclamation } from '../../../../lib/garageLiaison';
import { reclamationStatutLabel, reclamationStatutColor } from '../../../../lib/devisDisplay';
import { StatutBadge } from '../../../../components/StatutBadge';
import { EmptyState } from '../../../../components/EmptyState';
import { Button } from '../../../../components/Button';
import { colors } from '../../../../theme/colors';

/**
 * Mes réclamations (MPARITY-04, D-05) — ports MotoKey_Client.html's
 * loadClientReclamationsTab (lines 1225-1247). ONLINE-ONLY (D-09): no cache
 * fallback, always hits the network on mount/retry.
 */
export default function ReclamationsScreen() {
  const { getValidAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Reclamation[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getValidAccessToken();
    const res = await apiGet('/client/reclamations', token || undefined);
    if (!res.ok) {
      setError(errMsg(res.data));
      setLoading(false);
      return;
    }
    setList(parseReclamations(res.data));
    setLoading(false);
  }, [getValidAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Mes réclamations' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.acc} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState icon="⚠️" heading="Erreur" body={error} />
          <Button title="Réessayer" onPress={load} />
        </View>
      ) : list.length === 0 ? (
        <EmptyState
          icon="📋"
          heading="Aucune réclamation en cours"
          body="Réclamez une moto déjà enregistrée par un garage pour l'associer à votre compte."
          ctaTitle="Réclamer une moto"
          onCta={() => router.push('/(app)/(tabs)/motos/claim')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {list.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardMain}>
                  <Text style={styles.motoLine}>
                    {(r.motos?.marque ?? '') + ' ' + (r.motos?.modele ?? '') + ' — ' + (r.motos?.plaque ?? '—')}
                  </Text>
                  <Text style={styles.meta}>VIN fourni : {r.vin_fourni ?? '—'}</Text>
                  <Text style={styles.meta}>
                    Soumis le {r.date_creation ? new Date(r.date_creation).toLocaleDateString('fr-FR') : '—'}
                  </Text>
                  {r.motif_refus ? <Text style={styles.motif}>Motif refus : {r.motif_refus}</Text> : null}
                </View>
                <StatutBadge label={reclamationStatutLabel(r.statut)} color={reclamationStatutColor(r.statut)} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardMain: {
    flex: 1,
  },
  motoLine: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.tx,
  },
  meta: {
    fontSize: 12,
    color: colors.tx2,
    marginTop: 4,
  },
  motif: {
    fontSize: 12,
    color: colors.rd,
    marginTop: 4,
  },
});
