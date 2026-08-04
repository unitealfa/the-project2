import React, { createContext, useEffect, useRef, useState, ReactNode, FC } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const initialAuth = useRef<{ user: User | null; token: string | null } | null>(null);
  if (!initialAuth.current) {
    try {
      const rawUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      const parsed = rawUser ? JSON.parse(rawUser) as Partial<User> : null;
      const payloadPart = storedToken?.split('.')[1];
      const normalizedPayload = payloadPart
        ? payloadPart.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadPart.length / 4) * 4, '=')
        : '';
      const payload = normalizedPayload
        ? JSON.parse(atob(normalizedPayload)) as { exp?: number }
        : null;
      const validUser = Boolean(
        parsed &&
        typeof parsed.id === 'string' &&
        typeof parsed.email === 'string' &&
        typeof parsed.role === 'string'
      );
      const expired = typeof payload?.exp === 'number' && payload.exp * 1000 <= Date.now();
      initialAuth.current = validUser && storedToken && !expired
        ? { user: parsed as User, token: storedToken }
        : { user: null, token: null };
    } catch {
      initialAuth.current = { user: null, token: null };
    }
  }

  const [user, setUser] = useState<User | null>(initialAuth.current.user);
  const [token, setToken] = useState<string | null>(initialAuth.current.token);

  const login = (u: User, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('token', t);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    sessionStorage.removeItem('order-comments');
  };

  useEffect(() => {
    if (!user || !token) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  }, [user, token]);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
