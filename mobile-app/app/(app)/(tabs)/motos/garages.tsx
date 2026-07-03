import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { apiGet, apiFetch, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { parseGarages, GarageLink } from '../../../../lib/garageLiaison';
import { StatutBadge } from '../../../../components/StatutBadge';
import { EmptyState } from '../../../../components/EmptyState';
import { Button } from '../../../../components/Button';
import { RevokeGarageModal } from '../../../../components/RevokeGarageModal';
import { showToast } from '../../../../components/Toast';
import { colors } from '../../../../theme/colors';

/**
 * Mes garages (MPARITY-04, D-05) — ports MotoKey_Client.html's
 * loadClientGaragesTab (lines 1249-1269) + openRevokeModal/submitRevoke
 * (lines 1271-1296). ONLINE-ONLY (D-09): no cache fallback.
 */
export default function GaragesScreen() {
  const { getValidAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<GarageLink[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getValidAccessToken();
    const res = await apiGet('/client/garages', token || undefined);
    if (!res.ok) {
      setError(errMsg(res.data));
      setLoading(false);
      return;
    }
    setList(parseGarages(res.data));
    setLoading(false);
  }, [getValidAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const openRevoke = (id: string, name: string) => setRevokeTarget({ id, name });

  const doRevoke = async (motif: string | null) => {
    if (!revokeTarget) return;
    setRevoking(true);
    const t = await getValidAccessToken();
    const { ok, data } = await apiFetch('DELETE', '/client/garages/' + revokeTarget.id, { motif }, t || undefined);
    setRevoking(false);
    setRevokeTarget(null);
    if (ok) {
      showToast('Vous avez quitté le garage. Historique conservé 10 ans.', 'info');
      load();
    } else {
      showToast(errMsg(data), 'error');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Mes garages' }} />
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
          icon="🔧"
          heading="Aucun garage lié"
          body="Vos garages partenaires apparaîtront ici une fois une moto liée ou réclamée."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {list.map((g) => {
            const garage = g.garages || {};
            const isActive = g.statut === 'actif';
            return (
              <View key={g.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardMain}>
                    <Text style={styles.nom}>{garage.nom ?? 'Garage'}</Text>
                    {garage.adresse ? <Text style={styles.meta}>{garage.adresse}</Text> : null}
                    {garage.tel ? <Text style={styles.meta}>{garage.tel}</Text> : null}
                    <Text style={styles.dateText}>
                      Lié depuis le {g.date_creation ? new Date(g.date_creation).toLocaleDateString('fr-FR') : '—'}
                    </Text>
                  </View>
                  <StatutBadge label={isActive ? 'Actif' : 'Quitté'} color={isActive ? colors.gn : colors.tx3} />
                </View>
                {isActive ? (
                  <Pressable
                    onPress={() => openRevoke(g.id, garage.nom || 'ce garage')}
                    style={styles.destructive}
                  >
                    <Text style={styles.destructiveText}>Quitter ce garage</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
      <RevokeGarageModal
        visible={!!revokeTarget}
        garageName={revokeTarget?.name ?? ''}
        loading={revoking}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={doRevoke}
      />
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
  nom: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.tx,
  },
  meta: {
    fontSize: 13,
    color: colors.tx2,
    marginTop: 2,
  },
  dateText: {
    fontSize: 12,
    color: colors.tx3,
    marginTop: 4,
  },
  destructive: {
    backgroundColor: colors.rd,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  destructiveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
