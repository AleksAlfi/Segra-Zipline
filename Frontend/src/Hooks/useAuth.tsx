import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from 'react';
import { sendMessageToBackend } from '../Utils/MessageUtils';

export interface ZiplineUser {
  username: string;
  avatar: string | null;
}

interface AuthContextType {
  user: ZiplineUser | null;
  serverUrl: string | null;
  isAuthenticated: boolean;
  authError: string | null;
  totpRequired: boolean;
  isAuthenticating: boolean;
  clearAuthError: () => void;
  loginWithPassword: (serverUrl: string, username: string, password: string, code?: string) => void;
  loginWithToken: (serverUrl: string, apiToken: string) => void;
  signOut: () => void;
}

interface AuthStateMessage {
  authenticated: boolean;
  serverUrl?: string | null;
  username?: string | null;
  avatar?: string | null;
  error?: string | null;
  totpRequired?: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Sign-out callbacks that external code can register (e.g. queryClient.clear())
const signOutCallbacks: Array<() => void> = [];
export function onSignOut(cb: () => void) {
  signOutCallbacks.push(cb);
}

// The backend owns the Zipline credentials (stored in settings). The frontend only
// sends Login/Logout commands over the message bridge and mirrors the AuthState
// messages the backend pushes back.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ZiplineUser | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [totpRequired, setTotpRequired] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const loginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoginTimeout = useCallback(() => {
    if (loginTimeoutRef.current) {
      clearTimeout(loginTimeoutRef.current);
      loginTimeoutRef.current = null;
    }
  }, []);

  // Clean up token storage from the pre-Zipline (Segra cloud / Supabase) versions
  useEffect(() => {
    localStorage.removeItem('segra_access_token');
    localStorage.removeItem('segra_refresh_token');
    localStorage.removeItem('sb-supabase-auth-token');
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const { method, content } = (event as CustomEvent).detail ?? {};
      if (method !== 'AuthState') return;

      const state = content as AuthStateMessage;
      clearLoginTimeout();
      setIsAuthenticating(false);
      setTotpRequired(!!state.totpRequired);
      setAuthError(state.error ?? null);

      if (state.authenticated) {
        setUser({ username: state.username ?? '', avatar: state.avatar ?? null });
        setServerUrl(state.serverUrl ?? null);
      } else {
        setUser(null);
        setServerUrl(null);
      }
    };

    window.addEventListener('websocket-message', handler);
    return () => window.removeEventListener('websocket-message', handler);
  }, [clearLoginTimeout]);

  const startLogin = useCallback(() => {
    setIsAuthenticating(true);
    setAuthError(null);
    clearLoginTimeout();
    loginTimeoutRef.current = setTimeout(() => {
      setIsAuthenticating(false);
      setAuthError('No response from the Segra backend. Please try again.');
    }, 20000);
  }, [clearLoginTimeout]);

  const loginWithPassword = useCallback(
    (server: string, username: string, password: string, code?: string) => {
      startLogin();
      sendMessageToBackend('Login', {
        serverUrl: server,
        username,
        password,
        ...(code ? { code } : {}),
      });
    },
    [startLogin],
  );

  const loginWithToken = useCallback(
    (server: string, apiToken: string) => {
      startLogin();
      sendMessageToBackend('Login', { serverUrl: server, apiToken });
    },
    [startLogin],
  );

  const signOut = useCallback(() => {
    clearLoginTimeout();
    setUser(null);
    setServerUrl(null);
    setAuthError(null);
    setTotpRequired(false);
    sendMessageToBackend('Logout');
    signOutCallbacks.forEach((cb) => cb());
  }, [clearLoginTimeout]);

  const value: AuthContextType = {
    user,
    serverUrl,
    isAuthenticated: user !== null,
    authError,
    totpRequired,
    isAuthenticating,
    clearAuthError: () => setAuthError(null),
    loginWithPassword,
    loginWithToken,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
