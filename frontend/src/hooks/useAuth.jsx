import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authModal, setAuthModal] = useState({ isOpen: false, mode: 'login' });
  const [loading, setLoading] = useState(false);

  // Attempt to fetch current user on mount (cookie-based auth)
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

  const login = async (payload) => {
    setLoading(true);
    try {
      const res = await api.login(payload);
      setCurrentUser(res.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      await api.register(payload);
      // auto-login
      const res = await api.login({ email: payload.email, password: payload.password });
      setCurrentUser(res.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || 'Registration failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    // Clearing cookie requires backend; as a quick client-side reset we remove user.
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, authModal, setAuthModal, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

