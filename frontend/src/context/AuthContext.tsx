'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  referralCode: string;
  isVerified: boolean;
  wallet: {
    id: string;
    balance: string;
    totalWinnings: string;
    referralEarnings: string;
  } | null;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, username: string, password: string, referralCode?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  const loadProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setToken(authToken);
      } else {
        // Token expired or invalid
        localStorage.removeItem('bingo_token');
        setUser(null);
        setToken(null);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('bingo_token');
    if (storedToken) {
      loadProfile(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      localStorage.setItem('bingo_token', data.token);
      setToken(data.token);
      await loadProfile(data.token);
      
      if (data.user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Server error' };
    }
  };

  const register = async (email: string, username: string, password: string, referralCode?: string) => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, referralCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Registration failed' };
      }

      localStorage.setItem('bingo_token', data.token);
      setToken(data.token);
      await loadProfile(data.token);
      router.push('/dashboard');

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Server error' };
    }
  };

  const logout = () => {
    localStorage.removeItem('bingo_token');
    setUser(null);
    setToken(null);
    router.push('/');
  };

  const refreshProfile = async () => {
    const storedToken = localStorage.getItem('bingo_token');
    if (storedToken) {
      await loadProfile(storedToken);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
