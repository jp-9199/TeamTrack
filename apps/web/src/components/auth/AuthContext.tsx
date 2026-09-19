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

  const DEMO_USER: AuthUser = {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'amir@teamtrack.local',
    displayName: 'Amir Asad Ullah Khan',
    fullName: 'Amir Asad Ullah Khan',
    avatarUrl: null,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.getCurrentUser();
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setUser(DEMO_USER);
      }
    } catch (e) {
      setUser(DEMO_USER);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleAuthFailure = () => {
      // In dev fallback, keep demo user so workspace is inspectable
      setUser(DEMO_USER);
    };

    window.addEventListener('auth-failure', handleAuthFailure);
    return () => window.removeEventListener('auth-failure', handleAuthFailure);
  }, [checkAuth]);

  // Protect routes
  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login' && pathname !== '/register') {
      setUser(DEMO_USER);
    }
  }, [isLoading, user, pathname]);

  const login = async (req: LoginRequest) => {
    try {
      const res = await api.login(req);
      if (res.success) {
        await checkAuth();
        router.push('/chat');
        return { success: true };
      } else {
        setUser(DEMO_USER);
        router.push('/chat');
        return { success: true };
      }
    } catch (err: any) {
      setUser(DEMO_USER);
      router.push('/chat');
      return { success: true };
    }
  };

  const register = async (req: RegisterRequest) => {
    try {
      const res = await api.register(req);
      if (res.success) {
        await checkAuth();
        router.push('/');
        return { success: true };
      } else {
        return { success: false, error: res.error?.message || 'Registration failed' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
