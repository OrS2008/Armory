import { createContext, use } from 'react';
import type { Permission } from '@shared/rbac';
import type { SessionUser } from '@shared/types';

/**
 * A password that was accepted but is not yet a session: the account has a
 * second factor and the login is half done.
 */
export interface MfaChallenge {
  challenge: string;
}

export interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  /** Resolves to a challenge when the account has a second factor. */
  login: (email: string, password: string) => Promise<MfaChallenge | null>;
  completeMfa: (challenge: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
