import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { Logo } from '../../components/Logo';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email || !password) {
      toast('Email et mot de passe requis.', 'error');
      return;
    }
    setLoading(true);
    const r = await login(email, password);
    setLoading(false);
    if (!r.ok) {
      toast(r.error!, 'error');
      return;
    }
    toast('Bienvenue !', 'success');
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
            <Text style={styles.title}>Connexion</Text>
            <Text style={styles.subtitle}>Accédez à l'historique de votre moto</Text>

            <TextField
              label="Adresse email"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.fr"
              keyboardType="email-address"
            />
            <TextField
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />

            <Button title="Se connecter" onPress={onLogin} loading={loading} />

            <View style={styles.footer}>
              <Button
                title="Mot de passe oublié ?"
                variant="ghost"
                onPress={() => router.push('/(auth)/reset-request')}
              />
              <View style={styles.divider} />
              <Text style={styles.footerText}>Pas encore de compte ?</Text>
              <Button
                title="Créer un compte"
                variant="ghost"
                onPress={() => router.push('/(auth)/register')}
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
  divider: { height: 1, width: '100%', backgroundColor: colors.border, marginVertical: 12 },
  footerText: { fontSize: 13, color: colors.tx2 },
});
