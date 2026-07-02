import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { Logo } from '../../components/Logo';
import { TextField } from '../../components/TextField';
import { OtpCodeInput } from '../../components/OtpCodeInput';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';

/**
 * Shared OTP verify screen (D-01/D-04) — `mode=register` for the mandatory
 * post-signup verification, `mode=reset` for the password-reset confirm
 * flow. Both share the same `<OtpCodeInput>`.
 */
export default function VerifyScreen() {
  const { mode, email } = useLocalSearchParams<{ mode: 'register' | 'reset'; email: string }>();
  const router = useRouter();
  const { verifyEmail, confirmPasswordReset, requestPasswordReset } = useAuth();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const isReset = mode === 'reset';

  const subtitle = isReset
    ? 'Entrez le code envoyé à ' + email + ' et choisissez votre nouveau mot de passe.'
    : 'Un code à 8 chiffres a été envoyé à ' + email + '.';

  const onSubmit = async () => {
    if (!code || code.length < 6) {
      toast('Entrez le code reçu par email.', 'error');
      return;
    }

    if (isReset) {
      if (pwd.length < 12) {
        toast('Mot de passe : minimum 12 caractères avec majuscule, chiffre et caractère spécial.', 'error');
        return;
      }
      if (pwd !== confirm) {
        toast('Les mots de passe ne correspondent pas.', 'error');
        return;
      }

      setLoading(true);
      const r = await confirmPasswordReset(email, code, pwd);
      setLoading(false);
      if (!r.ok) {
        toast(r.error!, 'error');
        return;
      }
      toast('Mot de passe mis à jour. Connectez-vous.', 'success');
      router.replace('/(auth)/login');
      return;
    }

    setLoading(true);
    const r = await verifyEmail(email, code);
    setLoading(false);
    if (!r.ok) {
      toast(r.error!, 'error');
      return;
    }
    if (r.authed) {
      toast('Email vérifié — bienvenue !', 'success');
    } else {
      toast('Email vérifié ! Connectez-vous.', 'success');
      router.replace('/(auth)/login');
    }
  };

  const onResend = async () => {
    setResending(true);
    if (isReset) {
      await requestPasswordReset(email);
    }
    setResending(false);
    toast('Code renvoyé. Vérifiez vos emails et vos spams.', 'info');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.box}>
          <View style={styles.logoRow}>
            <Logo />
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Vérification email</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Code de vérification</Text>
              <OtpCodeInput value={code} onChangeText={setCode} />
              <Text style={styles.hint}>Vérifiez vos spams si vous ne recevez pas le code.</Text>
            </View>

            {isReset ? (
              <>
                <TextField
                  label="Nouveau mot de passe"
                  value={pwd}
                  onChangeText={setPwd}
                  placeholder="12 caractères minimum"
                  secureTextEntry
                />
                <TextField
                  label="Confirmer le mot de passe"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Répétez le mot de passe"
                  secureTextEntry
                />
              </>
            ) : null}

            <Button title={isReset ? 'Réinitialiser' : 'Vérifier'} onPress={onSubmit} loading={loading} />

            <View style={styles.footer}>
              <Button title="Renvoyer le code" variant="ghost" onPress={onResend} loading={resending} />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400 },
  logoRow: { alignItems: 'center', marginBottom: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.tx, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.tx2, marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.tx2, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.tx3, marginTop: 4 },
  footer: { alignItems: 'center', marginTop: 16 },
});
