import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiGet, apiPost, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import {
  parseDevisList,
  devisStatutLabel,
  devisStatutColor,
  Devis,
  DevisLigne,
} from '../../../../lib/devisDisplay';
import { fmtDate } from '../../../../lib/motoDisplay';
import { getCached, setCached, shouldServeCache, CACHE_KEY_DEVIS } from '../../../../lib/cache';
import { Button } from '../../../../components/Button';
import { EmptyState } from '../../../../components/EmptyState';
import { OfflineBanner } from '../../../../components/OfflineBanner';
import { StatutBadge } from '../../../../components/StatutBadge';
import { showToast } from '../../../../components/Toast';
import { colors } from '../../../../theme/colors';

/**
 * Devis tab — flat list, inline expand, accept/refuse behind confirm
 * dialogs. Ports MotoKey_Client.html's loadClientDevis/acceptDevis/
 * refuseDevis (lines 943-1021). Per RESEARCH Open Question 2, stays a
 * flat list (no detail push) — each item already carries its full
 * line data server-side. A "devis reçu" push notification (MPUSH-05)
 * deep-links here with a `highlightId` param so the concerned devis is
 * scrolled to and visually highlighted instead of being left to hunt
 * for in the list.
 */
export default function DevisListScreen() {
  const { getValidAccessToken } = useAuth();
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const [devis, setDevis] = useState<Devis[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const isFirstFocus = useRef(true);
  const listRef = useRef<FlatList<Devis>>(null);

  const load = useCallback(async () => {
    setError(null);
    const token = await getValidAccessToken();
    const res = await apiGet('/devis', token ?? undefined);
    if (res.ok) {
      const list = parseDevisList(res.data);
      await setCached(CACHE_KEY_DEVIS, list);
      setDevis(list);
      setStaleSince(null);
    } else if (shouldServeCache(res.status)) {
      const cached = await getCached<Devis[]>(CACHE_KEY_DEVIS);
      if (cached) {
        setDevis(cached.data);
        setStaleSince(cached.updatedAt);
      } else {
        setError(errMsg(res.data));
      }
    } else {
      setError(errMsg(res.data));
    }
  }, [getValidAccessToken]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Deep-linked from a "devis reçu" push notification (MPUSH-05) — scroll to
  // and highlight the concerned devis once it's present in the loaded list.
  useEffect(() => {
    if (!highlightId || devis.length === 0) return;
    const index = devis.findIndex((d) => d.id === highlightId);
    if (index < 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    });
  }, [highlightId, devis]);

  const scrollToIndexFallback = useCallback((info: { index: number }) => {
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
    }, 250);
  }, []);

  const doAccept = useCallback(
    async (id: string) => {
      const t = await getValidAccessToken();
      const { ok, data } = await apiPost('/devis/' + id + '/valider', null, t ?? undefined);
      if (ok) {
        showToast('Devis accepté.', 'success');
        load();
      } else {
        showToast(errMsg(data), 'error');
      }
    },
    [getValidAccessToken, load]
  );

  const doRefuse = useCallback(
    async (id: string) => {
      const t = await getValidAccessToken();
      const { ok, data } = await apiPost('/devis/' + id + '/refuser', null, t ?? undefined);
      if (ok) {
        showToast('Devis refusé.', 'info');
        load();
      } else {
        showToast(errMsg(data), 'error');
      }
    },
    [getValidAccessToken, load]
  );

  const confirmAccept = useCallback(
    (id: string) => {
      Alert.alert('Valider ce devis ?', 'Le garage sera notifié de votre acceptation.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Valider', onPress: () => doAccept(id) },
      ]);
    },
    [doAccept]
  );

  const confirmRefuse = useCallback(
    (id: string) => {
      Alert.alert('Refuser ce devis ?', 'Cette action est définitive et sera visible par le garage.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Refuser', style: 'destructive', onPress: () => doRefuse(id) },
      ]);
    },
    [doRefuse]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.acc} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {staleSince != null ? <OfflineBanner updatedAt={staleSince} /> : null}
      <FlatList
        ref={listRef}
        data={devis}
        keyExtractor={(item) => item.id}
        contentContainerStyle={devis.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScrollToIndexFailed={scrollToIndexFallback}
        ListEmptyComponent={
          error ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <EmptyState
              icon="📋"
              heading="Aucun devis pour l'instant"
              body="Vos devis apparaîtront ici dès qu'un garage vous en envoie un."
            />
          )
        }
        renderItem={({ item }) => (
          <DevisCard
            dv={item}
            highlighted={item.id === highlightId}
            onAccept={confirmAccept}
            onRefuse={confirmRefuse}
          />
        )}
      />
    </View>
  );
}

function DevisCard({
  dv,
  highlighted,
  onAccept,
  onRefuse,
}: {
  dv: Devis;
  highlighted?: boolean;
  onAccept: (id: string) => void;
  onRefuse: (id: string) => void;
}) {
  const lignes: DevisLigne[] = dv.devis_lignes || dv.lignes || [];
  const total = typeof dv.total_ttc === 'number' ? dv.total_ttc.toFixed(2) + ' €' : '—';
  const motoInfo = dv.motos
    ? dv.motos.marque + ' ' + dv.motos.modele + (dv.motos.plaque ? ' — ' + dv.motos.plaque : '')
    : '—';

  return (
    <View style={[styles.card, highlighted ? styles.cardHighlighted : null]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.numero}>{dv.numero || dv.id}</Text>
          <Text style={styles.sub}>{`${fmtDate(dv.created_at)} · ${motoInfo}`}</Text>
        </View>
        <StatutBadge label={devisStatutLabel(dv.statut)} color={devisStatutColor(dv.statut)} />
      </View>

      <View style={styles.lignesWrap}>
        {lignes.length ? (
          lignes.map((l, idx) => {
            const desc = l.description || l.desc || '';
            const qty = l.quantite || 1;
            const pu = typeof l.prix_unitaire === 'number' ? l.prix_unitaire.toFixed(2) : '—';
            return (
              <View key={idx} style={styles.ligneRow}>
                <Text style={styles.ligneDesc}>{desc}</Text>
                <Text style={styles.ligneQty}>{`${qty} × ${pu} €`}</Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.noLignes}>Aucune ligne.</Text>
        )}
      </View>

      <Text style={styles.total}>{`Total TTC : ${total}`}</Text>

      {dv.statut === 'envoye' ? (
        <View style={styles.actions}>
          <View style={styles.actionBtn}>
            <Button title="Valider" onPress={() => onAccept(dv.id)} />
          </View>
          <Pressable style={styles.refuseBtn} onPress={() => onRefuse(dv.id)}>
            <Text style={styles.refuseText}>Refuser</Text>
          </Pressable>
        </View>
      ) : dv.date_acceptation || dv.date_refus ? (
        <Text style={styles.decision}>{`Décision le ${fmtDate(dv.date_acceptation || dv.date_refus)}`}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  errorText: {
    fontSize: 14,
    color: colors.tx2,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardHighlighted: {
    borderColor: colors.acc,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  headerLeft: {
    flexShrink: 1,
  },
  numero: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.tx,
  },
  sub: {
    fontSize: 12,
    color: colors.tx3,
    marginTop: 2,
  },
  lignesWrap: {
    backgroundColor: colors.card2,
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
  },
  ligneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 8,
  },
  ligneDesc: {
    fontSize: 13,
    color: colors.tx2,
    flexShrink: 1,
  },
  ligneQty: {
    fontSize: 13,
    color: colors.tx,
  },
  noLignes: {
    fontSize: 13,
    color: colors.tx3,
  },
  total: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.tx,
    textAlign: 'right',
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
  },
  refuseBtn: {
    flex: 1,
    backgroundColor: colors.rd,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refuseText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  decision: {
    fontSize: 12,
    color: colors.tx3,
    marginTop: 10,
  },
});
