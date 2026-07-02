import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { Logo } from '../../components/Logo';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!nom || !email || !pwd) {
      toast('Nom, email et mot de passe requis.', 'error');
      return;
    }
    if (pwd.length < 12) {
      toast(
        'Mot de passe trop court — minimum 12 caractères avec majuscule, chiffre et caractère spécial.',
        'error'
      );
      return;
    }
    if (pwd !== confirm) {
      toast('Les mots de passe ne correspondent pas.', 'error');
      return;
    }

    setLoading(true);
    const r = await register(email, pwd, nom, tel || undefined);
    setLoading(false);
    if (!r.ok) {
      toast(r.error!, 'error');
      return;
    }
    toast('Code envoyé ! Vérifiez votre boîte email.', 'success');
    router.push({ pathname: '/(auth)/verify', params: { mode: 'register', email } });
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
            <Text style={styles.title}>Créer mon compte</Text>
            <Text style={styles.subtitle}>
              Votre garage vous a enregistré ? Utilisez le même email.
            </Text>

            <TextField label="Nom complet" value={nom} onChangeText={setNom} placeholder="Jean Dupont" />
            <TextField
              label="Adresse email"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.fr"
              keyboardType="email-address"
            />
            <TextField
              label="Téléphone (optionnel)"
              value={tel}
              onChangeText={setTel}
              placeholder="06 12 34 56 78"
              keyboardType="phone-pad"
            />
            <TextField
              label="Mot de passe"
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

            <Button title="Créer mon compte" onPress={onRegister} loading={loading} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Déjà un compte ?</Text>
              <Button
                title="Se connecter"
                variant="ghost"
                onPress={() => router.push('/(auth)/login')}
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
  footerText: { fontSize: 13, color: colors.tx2 },
});
