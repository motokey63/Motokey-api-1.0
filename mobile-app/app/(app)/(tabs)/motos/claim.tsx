import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack, router } from 'expo-router';
import { apiPost, errMsg } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { showToast } from '../../../../components/Toast';
import { TextField } from '../../../../components/TextField';
import { Button } from '../../../../components/Button';
import { colors } from '../../../../theme/colors';
import { validateClaim, buildClaimPayload } from '../../../../lib/garageLiaison';

/**
 * Réclamer une moto (MPARITY-04, D-02). Ports MotoKey_Client.html's
 * renderClaimTab/submitClaim (lines 1174-1223): VIN + plaque only, photo
 * upload disabled (no CLOUDINARY_CLOUD equivalent wired on mobile yet) —
 * shows the disabled-photo notice in its place.
 */
export default function ClaimMotoScreen() {
  const { getValidAccessToken } = useAuth();

  const [vin, setVin] = useState('');
  const [plaque, setPlaque] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const e = validateClaim(vin, plaque);
    if (e) {
      setErr(e);
      return;
    }
    setErr('');
    setSubmitting(true);
    const token = await getValidAccessToken();
    const { ok, data } = await apiPost(
      '/client/reclamations',
      buildClaimPayload(vin, plaque),
      token || undefined
    );
    setSubmitting(false);
    if (!ok) {
      setErr(errMsg(data));
      return;
    }
    showToast('Réclamation soumise — en attente de validation du garage', 'success');
    router.replace('/(app)/(tabs)/motos/reclamations');
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Réclamer une moto' }} />
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Moto déjà référencée dans MotoKey ? Soumettez votre réclamation — le garage vérifiera vos
          documents.
        </Text>

        <View style={styles.card}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <TextField
            label="VIN *"
            value={vin}
            onChangeText={setVin}
            placeholder="17 caractères"
            autoCapitalize="characters"
          />
          <TextField
            label="Plaque *"
            value={plaque}
            onChangeText={setPlaque}
            placeholder="AB-123-CD"
            autoCapitalize="characters"
          />

          <View style={styles.photoBox}>
            <Text style={styles.photoLabel}>Photo carte grise</Text>
            <Text style={styles.photoText}>
              Upload désactivé temporairement — contactez votre garage pour finaliser la
              réclamation.
            </Text>
          </View>

          <View style={styles.submitWrap}>
            <Button title="Soumettre la réclamation" loading={submitting} onPress={submit} />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  intro: { fontSize: 13, color: colors.tx2, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  err: { color: colors.rd, fontSize: 13, marginBottom: 12 },
  photoBox: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  photoLabel: { fontSize: 13, fontWeight: '600', color: colors.tx2, marginBottom: 4 },
  photoText: { fontSize: 13, color: colors.tx2 },
  submitWrap: { marginTop: 4 },
});
