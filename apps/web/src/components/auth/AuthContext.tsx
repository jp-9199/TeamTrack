'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthUser, LoginRequest, RegisterRequest } from '@teamtrack/shared-types';
import { api } from '../../lib/api';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (req: LoginRequest) => Promise<{ success: boolean; error?: string }>;
  register: (req: RegisterRequest) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ success: false, error: 'Not initialized' }),
  register: async () => ({ success: false, error: 'Not initialized' }),
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async () => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('teamtrack_access_token') : null;
    if (storedToken) {
      api.setAccessToken(storedToken);
    }
    try {
      const res = await api.getCurrentUser();
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('teamtrack_access_token');
        }
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleAuthFailure = () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('teamtrack_access_token');
      }
      api.setAccessToken(null);
      setUser(null);
      if (pathname !== '/login' && pathname !== '/register') {
        router.push('/login');
      }
    };

    window.addEventListener('auth-failure', handleAuthFailure);
    return () => window.removeEventListener('auth-failure', handleAuthFailure);
  }, [checkAuth, pathname, router]);

  // Protect routes - redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login' && pathname !== '/register') {
      router.push('/login');
    }
  }, [isLoading, user, pathname, router]);

  const login = async (req: LoginRequest) => {
    try {
      const res = await api.login(req);
      if (res.success && res.data) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('teamtrack_access_token', res.data.tokens.accessToken);
        }
        api.setAccessToken(res.data.tokens.accessToken);
        setUser(res.data.user);
        router.push('/chat');
        return { success: true };
      } else {
        return { success: false, error: res.error?.message || 'Invalid email or password' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unable to connect to authentication server' };
    }
  };

  const register = async (req: RegisterRequest) => {
    try {
      const res = await api.register(req);
      if (res.success && res.data) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('teamtrack_access_token', res.data.tokens.accessToken);
        }
        api.setAccessToken(res.data.tokens.accessToken);
        setUser(res.data.user);
        router.push('/chat');
        return { success: true };
      } else {
        return { success: false, error: res.error?.message || 'Registration failed' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Best effort server logout
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('teamtrack_access_token');
    }
    api.setAccessToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
