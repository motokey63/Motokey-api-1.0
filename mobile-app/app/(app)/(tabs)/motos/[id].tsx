import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { apiGet, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { parseInterventions, parseAlertes, fmtStatut, Moto, Intervention, Alerte, parseConsommables, ConsommableJauge } from '../../../../lib/motoParse';
import { couleurColor, fmtDate, CONSO_LABELS, ETAT_WORDING, etatColor } from '../../../../lib/motoDisplay';
import { ScoreBadge } from '../../../../components/ScoreBadge';
import { StatutBadge } from '../../../../components/StatutBadge';
import { Button } from '../../../../components/Button';
import { GaugeBar } from '../../../../components/GaugeBar';
import { colors } from '../../../../theme/colors';

/**
 * Fiche Moto detail (MPARITY-03, D-07/D-09): historique interventions +
 * plan d'entretien (hidden, not errored, on 403 for CLIENT — RESEARCH
 * Pitfall 1) + consommables gauges (GAUGE-05/06, Phase 28 — replaces the
 * legacy tire-only section, D-02). ONLINE-ONLY — no AsyncStorage cache
 * fallback (D-09 narrows cache scope to the motos list only).
 */
export default function FicheMotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getValidAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moto, setMoto] = useState<Moto | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [alertes, setAlertes] = useState<Alerte[] | null>(null);
  const [consommables, setConsommables] = useState<ConsommableJauge[]>([]);
  const [jaugeGenerale, setJaugeGenerale] = useState<ConsommableJauge | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getValidAccessToken();
    const [motoRes, ivRes, alRes, coRes] = await Promise.all([
      apiGet('/motos/' + id, token ?? undefined),
      apiGet('/motos/' + id + '/interventions', token ?? undefined),
      apiGet('/motos/' + id + '/entretien/alertes', token ?? undefined),
      apiGet('/motos/' + id + '/consommables', token ?? undefined),
    ]);
    if (!motoRes.ok) {
      setError(errMsg(motoRes.data) || "Serveur inaccessible — l'API est-elle démarrée ?");
      setLoading(false);
      return;
    }
    const m = motoRes.data?.data?.moto || motoRes.data?.moto || motoRes.data?.data || motoRes.data;
    setMoto(m);
    setInterventions(parseInterventions(ivRes));
    setAlertes(parseAlertes(alRes));
    const co = parseConsommables(coRes);
    setConsommables(co.items);
    setJaugeGenerale(co.jaugeGenerale);
    setLoading(false);
  }, [id, getValidAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Fiche moto' }} />
        <ActivityIndicator color={colors.acc} />
      </View>
    );
  }

  if (error || !moto) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Fiche moto' }} />
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error || "Serveur inaccessible — l'API est-elle démarrée ?"}</Text>
        <Button title="Réessayer" onPress={load} />
      </View>
    );
  }

  const garageName = moto.garage?.nom || moto.garage_nom || '—';
  const garageTel = moto.garage?.tel || moto.garage_tel;
  const showAlertes = !!(alertes && alertes.length > 0);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `${moto.marque} ${moto.modele}` }} />

      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.marque}>
            {moto.marque} {moto.modele}
            {moto.annee ? <Text style={styles.annee}> {moto.annee}</Text> : null}
          </Text>
          <Text style={styles.meta}>{moto.km ? moto.km.toLocaleString('fr-FR') + ' km' : ''}</Text>
          <Text style={styles.meta}>{moto.plaque}</Text>
        </View>
        <ScoreBadge score={moto.score} couleurDossier={moto.couleur_dossier} size="lg" />
      </View>

      {jaugeGenerale ? (
        <View style={styles.generalRow}>
          <StatutBadge
            label={'État général : ' + (ETAT_WORDING[jaugeGenerale.etat ?? ''] ?? jaugeGenerale.etat ?? '')}
            color={etatColor(jaugeGenerale.etat ?? undefined)}
          />
        </View>
      ) : (
        <Text style={styles.generalEmpty}>Pas encore suivi</Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Garage de référence</Text>
        <Text style={styles.bodyText}>{garageName}</Text>
        {garageTel ? <Text style={styles.bodyText}>{garageTel}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historique · {interventions.length} intervention(s)</Text>
        {interventions.length === 0 ? (
          <Text style={styles.emptyInline}>Aucune intervention enregistrée pour cette moto.</Text>
        ) : (
          interventions.map((i) => (
            <View key={i.id} style={styles.interventionRow}>
              <View style={[styles.dot, { backgroundColor: couleurColor(i.type) }]} />
              <View style={styles.interventionText}>
                <Text style={styles.interventionTitle}>{i.titre}</Text>
                <Text style={styles.interventionMeta}>
                  {fmtDate(i.date_intervention)}
                  {i.km ? ' · ' + i.km.toLocaleString('fr-FR') + ' km' : ''}
                  {i.technicien_nom ? ' · ' + i.technicien_nom : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Usure des Consommables</Text>
        {consommables.map((c) => (
          <GaugeBar
            key={c.type_consommable}
            label={CONSO_LABELS[c.type_consommable] ?? c.type_consommable}
            pctUsure={c.pct_usure}
            etat={c.etat}
            hasData={c.has_data}
          />
        ))}
      </View>

      {showAlertes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan d'entretien</Text>
          {alertes!.map((a, idx) => (
            <View key={idx} style={styles.alerteRow}>
              <StatutBadge label={fmtStatut(a.statut)} color={couleurColor(a.statut)} />
              <View style={styles.alerteText}>
                <Text style={styles.interventionTitle}>{a.nom || a.nom_operation}</Text>
                {a.km_prochain ? (
                  <Text style={styles.interventionMeta}>
                    Prévu à {Number(a.km_prochain).toLocaleString('fr-FR')} km
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
    gap: 12,
  },
  errorIcon: {
    fontSize: 32,
  },
  errorText: {
    fontSize: 14,
    color: colors.tx2,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexShrink: 1,
  },
  marque: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.tx,
  },
  annee: {
    fontWeight: '400',
    color: colors.tx2,
  },
  meta: {
    fontSize: 13,
    color: colors.tx2,
    marginTop: 2,
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.tx,
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 14,
    color: colors.tx2,
  },
  emptyInline: {
    fontSize: 13,
    color: colors.tx3,
  },
  interventionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  interventionText: {
    flexShrink: 1,
  },
  interventionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.tx,
  },
  interventionMeta: {
    fontSize: 13,
    color: colors.tx2,
    marginTop: 2,
  },
  alerteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  alerteText: {
    flexShrink: 1,
  },
  generalRow: {
    marginTop: 8,
  },
  generalEmpty: {
    marginTop: 8,
    fontSize: 13,
    color: colors.tx3,
  },
});
