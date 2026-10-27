/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { clearAuthToken, getAuthToken, saveAuthToken } from './tokenCookie';

export type UserRole = 'AUDIENCE' | 'ORGANIZER' | 'STAFF' | 'ADMIN';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthContextType {
  user: UserSummary | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserSummary>;
  register: (email: string, password: string, fullName: string, phone: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<UserSummary | null>;
  updateUserSummary: (nextUser: UserSummary) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  fullName: string;
  exp: number;
}

interface LoginResponse {
  accessToken: string;
  user: UserSummary;
}

function decodeJwt(token: string): TokenPayload | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedToken = getAuthToken();
      if (!storedToken) {
        setLoading(false);
        return;
      }

      const decoded = decodeJwt(storedToken);
      if (!decoded || decoded.exp * 1000 <= Date.now()) {
        clearAuthToken();
        setLoading(false);
        return;
      }

      setToken(storedToken);
      setUser({
        id: decoded.sub,
        email: decoded.email,
        fullName: decoded.fullName,
        role: decoded.role,
      });

      try {
        const currentUser = await api.get<unknown, UserSummary>('/api/auth/me');
        if (!cancelled) setUser(currentUser);
      } catch {
        if (!cancelled) {
          clearAuthToken();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string): Promise<UserSummary> => {
    const data = await api.post<unknown, LoginResponse>('/api/auth/login', { email, password });
    saveAuthToken(data.accessToken);
    setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const register = async (email: string, password: string, fullName: string, phone: string): Promise<void> => {
    await api.post('/api/auth/register', { email, password, fullName, phone });
  };

  const logout = () => {
    const raw = sessionStorage.getItem('ticketbox.queue-admission');
    if (raw) {
      try {
        const admission = JSON.parse(raw);
        if (admission && admission.concertId) {
          api.post(`/api/queue/concerts/${encodeURIComponent(admission.concertId)}/leave`).catch(() => {});
        }
      } catch { /* Invalid stored admission must not prevent logout. */ }
    }
    sessionStorage.removeItem('ticketbox.queue-admission');
    clearAuthToken();
    setToken(null);
    setUser(null);
  };

  const refreshUser = async (): Promise<UserSummary | null> => {
    if (!getAuthToken()) return null;
    const currentUser = await api.get<unknown, UserSummary>('/api/auth/me');
    setUser(currentUser);
    return currentUser;
  };

  const updateUserSummary = (nextUser: UserSummary) => {
    setUser(nextUser);
  };

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refreshUser, updateUserSummary }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
