'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {api} from '@/lib/api';
import type {Profile} from '@/lib/types';

interface AuthContextType {
  apiKey: string | null;
  profiles: Profile[];
  isLoading: boolean;
  error: string | null;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  refreshProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'nextdns_api_key';

export function AuthProvider({children}: {children: ReactNode}) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const storedKey = localStorage.getItem(STORAGE_KEY);
    if (storedKey) {
      api.setApiKey(storedKey);
    }
    return storedKey;
  });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async (key: string) => {
    try {
      const data = await api.getProfiles(key);
      setProfiles(data);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profiles');
      return false;
    }
  }, []);

  // Fetch profiles on mount if API key exists
  useEffect(() => {
    let isMounted = true;

    const initializeProfiles = async () => {
      if (apiKey) {
        await fetchProfiles(apiKey);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    };

    initializeProfiles();

    return () => {
      isMounted = false;
    };
  }, [apiKey, fetchProfiles]);

  const login = async (key: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    const isValid = await api.validateApiKey(key);
    if (isValid) {
      api.setApiKey(key);
      setApiKey(key);
      localStorage.setItem(STORAGE_KEY, key);
      await fetchProfiles(key);
      setIsLoading(false);
      return true;
    } else {
      setError('Invalid API key');
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    api.setApiKey('');
    setApiKey(null);
    setProfiles([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const refreshProfiles = async () => {
    if (apiKey) {
      await fetchProfiles(apiKey);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        apiKey,
        profiles,
        isLoading,
        error,
        login,
        logout,
        refreshProfiles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
