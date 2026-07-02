import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (msg: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4500;

/** Module-level escape hatch — lets non-React code (AuthContext.onHardExpiry,
 * per D-08) trigger a toast without a hook. `ToastProvider` registers its
 * `toast` fn here on mount. */
let showToastRef: ((msg: string, type?: ToastType) => void) | null = null;
export function showToast(msg: string, type: ToastType = 'info') {
  if (showToastRef) showToastRef(msg, type);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback(
    (msg: string, type: ToastType = 'info') => {
      const id = nextId++;
      setMessages((prev) => [...prev, { id, msg, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  useEffect(() => {
    showToastRef = toast;
    return () => {
      showToastRef = null;
    };
  }, [toast]);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {messages.map((m) => (
          <View key={m.id} style={[styles.toast, toastStyleForType(m.type)]}>
            <Text style={styles.toastText}>{m.msg}</Text>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function toastStyleForType(type: ToastType) {
  if (type === 'success') return { backgroundColor: colors.gn };
  if (type === 'error') return { backgroundColor: colors.rd };
  return { backgroundColor: colors.tx2 };
}

export function useToast(): (msg: string, type?: ToastType) => void {
  const c = useContext(ToastContext);
  if (!c) throw new Error('useToast must be used within ToastProvider');
  return c.toast;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    gap: 8,
  },
  toast: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
