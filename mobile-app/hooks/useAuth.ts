import { useContext } from 'react';
import { AuthContext, AuthContextValue } from '../context/AuthContext';

/** Consumer hook for `AuthContext` — throws if used outside `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
