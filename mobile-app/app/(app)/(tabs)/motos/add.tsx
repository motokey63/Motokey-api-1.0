import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { apiGet, apiPost, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { showToast } from '../../../../components/Toast';
import { TextField } from '../../../../components/TextField';
import { Button } from '../../../../components/Button';
import { colors } from '../../../../theme/colors';
import {
  parseLimite,
  validateAddMoto,
  buildAddMotoPayload,
  LimiteMotos,
  AddMotoForm,
} from '../../../../lib/garageLiaison';

/**
 * Ajouter une moto (MPARITY-04, D-01). Ports MotoKey_Client.html's
 * renderAddMotoTab/submitAddMoto (lines 1127-1172): fetches the plan limit
 * first, hides the form and shows the "Passer Pro" CTA when the limit is
 * reached, otherwise renders the free-form add form.
 */
const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'achat_neuf', label: 'Achat neuf' },
  { value: 'achat_occasion', label: 'Achat occasion' },
  { value: 'don', label: 'Don' },
  { value: 'heritage', label: 'Héritage' },
  { value: 'cession_perso', label: 'Cession personnelle' },
  { value: 'reprise_garage', label: 'Reprise par garage' },
  { value: 'mise_en_stock', label: 'Mise en stock' },
  { value: 'inconnu', label: 'Non précisé' },
];

export default function AddMotoScreen() {
  const { getValidAccessToken } = useAuth();

  const [loadingLimite, setLoadingLimite] = useState(true);
  const [lim, setLim] = useState<LimiteMotos>({ count: 0, limite: 3, can_add: true, cta_pro: false });

  const [marque, setMarque] = useState('');
  const [modele, setModele] = useState('');
  const [annee, setAnnee] = useState('');
  const [km, setKm] = useState('');
  const [plaque, setPlaque] = useState('');
  const [vin, setVin] = useState('');
  const [modeAcquisition, setModeAcquisition] = useState('achat_neuf');

  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getValidAccessToken();
      const res = await apiGet('/client/limite-motos', token || undefined);
      setLim(parseLimite(res.ok ? res.data : null));
      setLoadingLimite(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    const form: AddMotoForm = {
      marque,
      modele,
      plaque,
      vin,
      annee,
      km,
      mode_acquisition: modeAcquisition,
    };
    const e = validateAddMoto(form);
    if (e) {
      setErr(e);
      return;
    }
    setErr('');
    setSubmitting(true);
    const token = await getValidAccessToken();
    const { ok, data, status } = await apiPost(
      '/client/motos',
      buildAddMotoPayload(form),
      token || undefined
    );
    setSubmitting(false);
    if (!ok) {
      setErr(status === 402 ? 'Limite atteinte — passez Pro.' : errMsg(data));
      return;
    }
    showToast('Moto ajoutée !', 'success');
    router.replace('/(app)/(tabs)/motos');
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Ajouter une moto' }} />
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        {loadingLimite ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.acc} />
            <Text style={styles.loadingText}>Vérification de la limite…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.subLine}>
              {lim.count} / {lim.limite} utilisée{lim.count > 1 ? 's' : ''}
            </Text>

            {!lim.can_add ? (
              <View style={styles.ctaCard}>
                <Text style={styles.ctaCrown}>👑</Text>
                <Text style={styles.ctaTitle}>Passez Pro pour plus de motos</Text>
                <Text style={styles.ctaSub}>
                  {`Limite de ${lim.limite} moto${lim.limite > 1 ? 's' : ''} atteinte (plan Standard). Le plan Pro vous permet d'en gérer jusqu'à 10.`}
                </Text>
                <Button title="Passer au plan Pro (bientôt)" onPress={() => {}} disabled />
              </View>
            ) : (
              <View style={styles.card}>
                {err ? <Text style={styles.err}>{err}</Text> : null}

                <TextField label="Marque *" value={marque} onChangeText={setMarque} placeholder="Yamaha" />
                <TextField label="Modèle *" value={modele} onChangeText={setModele} placeholder="MT-07" />
                <TextField
                  label="Année"
                  value={annee}
                  onChangeText={setAnnee}
                  placeholder="2021"
                  keyboardType="numeric"
                />
                <TextField
                  label="Kilométrage"
                  value={km}
                  onChangeText={setKm}
                  placeholder="0"
                  keyboardType="numeric"
                />
                <TextField
                  label="Plaque *"
                  value={plaque}
                  onChangeText={setPlaque}
                  placeholder="AB-123-CD"
                  autoCapitalize="characters"
                />
                <TextField
                  label="VIN *"
                  value={vin}
                  onChangeText={setVin}
                  placeholder="17 caractères"
                  autoCapitalize="characters"
                />

                <Text style={styles.label}>Mode d'acquisition</Text>
                <View style={styles.chipsRow}>
                  {MODE_OPTIONS.map((opt) => {
                    const selected = opt.value === modeAcquisition;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setModeAcquisition(opt.value)}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.submitWrap}>
                  <Button title="Enregistrer ma moto" loading={submitting} onPress={submit} />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 13, color: colors.tx2 },
  subLine: { fontSize: 13, color: colors.tx2, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  ctaCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  ctaCrown: { fontSize: 28 },
  ctaTitle: { fontSize: 16, fontWeight: '700', color: colors.tx },
  ctaSub: { fontSize: 13, color: colors.tx2, textAlign: 'center', marginBottom: 8 },
  err: { color: colors.rd, fontSize: 13, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.tx2, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card2,
  },
  chipSelected: {
    borderColor: colors.acc,
    backgroundColor: colors.accbg,
  },
  chipText: { fontSize: 13, color: colors.tx2, fontWeight: '600' },
  chipTextSelected: { color: colors.acc },
  submitWrap: { marginTop: 4 },
});
