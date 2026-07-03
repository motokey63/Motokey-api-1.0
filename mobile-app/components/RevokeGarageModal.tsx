import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { TextField } from './TextField';
import { Button } from './Button';
import { colors } from '../theme/colors';

export interface RevokeGarageModalProps {
  visible: boolean;
  garageName: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (motif: string | null) => void;
}

/**
 * Custom Modal (cannot be Alert.alert — needs free-text input) for
 * revoking a garage/moto liaison. Shows the verbatim art. L110-4 legal
 * notice + optional motif TextField + Annuler/Quitter buttons.
 */
export function RevokeGarageModal({ visible, garageName, loading, onCancel, onConfirm }: RevokeGarageModalProps) {
  const [motif, setMotif] = useState('');

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{garageName ? `Quitter ${garageName} ?` : 'Quitter ce garage ?'}</Text>
          <Text style={styles.legal}>
            Information légale (art. L110-4 Code de commerce) : votre historique d'entretien sera conservé par le
            garage pendant 10 ans après révocation. Vous perdrez uniquement l'accès en lecture à ces données.
          </Text>
          <TextField value={motif} onChangeText={setMotif} placeholder="Motif (facultatif)" />
          <View style={styles.buttons}>
            <Button variant="ghost" title="Annuler" onPress={onCancel} />
            <Pressable
              onPress={() => onConfirm(motif.trim() || null)}
              disabled={loading}
              style={[styles.destructive, loading && styles.destructiveDisabled]}
            >
              <Text style={styles.destructiveText}>Quitter le garage</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    maxWidth: 340,
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.tx,
    marginBottom: 12,
  },
  legal: {
    fontSize: 13,
    color: colors.tx2,
    marginBottom: 16,
    lineHeight: 19,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  destructive: {
    backgroundColor: colors.rd,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveDisabled: {
    opacity: 0.6,
  },
  destructiveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
