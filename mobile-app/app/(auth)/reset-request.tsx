import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { Logo } from '../../components/Logo';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';

export default function ResetRequestScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSend = async () => {
    if (!email) {
      toast('Entrez votre adresse email.', 'error');
      return;
    }

    setLoading(true);
    await requestPasswordReset(email); // anti-enum: result ignored
    setLoading(false);

    toast('Si votre email est enregistré, un code vous a été envoyé.', 'info');
    router.push({ pathname: '/(auth)/verify', params: { mode: 'reset', email } });
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
            <Text style={styles.title}>Mot de passe oublié</Text>
            <Text style={styles.subtitle}>
              Entrez votre email — nous vous enverrons un code de réinitialisation.
            </Text>

            <TextField
              label="Adresse email"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.fr"
              keyboardType="email-address"
            />

            <Button title="Envoyer le code" onPress={onSend} loading={loading} />

            <View style={styles.footer}>
              <Button
                title="Retour à la connexion"
                variant="ghost"
                onPress={() => router.replace('/(auth)/login')}
              />
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
  footer: { alignItems: 'center', marginTop: 16 },
});
