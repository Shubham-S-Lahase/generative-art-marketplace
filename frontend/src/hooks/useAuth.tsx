import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import type { AuthModalState, AuthResult, LoginPayload, RegisterPayload, User } from '../types';

interface AuthContextValue {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  authModal: AuthModalState;
  setAuthModal: React.Dispatch<React.SetStateAction<AuthModalState>>;
  login: (payload: LoginPayload) => Promise<AuthResult>;
  register: (payload: RegisterPayload) => Promise<AuthResult>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authModal, setAuthModal] = useState<AuthModalState>({ isOpen: false, mode: 'login' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getMe();
        setCurrentUser(me);
      } catch {
        setCurrentUser(null);
      }
    })();
  }, []);

  const login = async (payload: LoginPayload): Promise<AuthResult> => {
    setLoading(true);
    try {
      const res = await api.login(payload);
      setCurrentUser(res.user);
      return { success: true };
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      return { success: false, error: err?.response?.data?.error || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: RegisterPayload): Promise<AuthResult> => {
    setLoading(true);
    try {
      await api.register(payload);
      const res = await api.login({ email: payload.email, password: payload.password });
      setCurrentUser(res.user);
      return { success: true };
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      return { success: false, error: err?.response?.data?.error || 'Registration failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, authModal, setAuthModal, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
