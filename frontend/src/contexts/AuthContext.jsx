import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await authAPI.me();
      setUser(data);
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (login, password) => {
    const { data } = await authAPI.login({ login, password });
    localStorage.setItem('access_token',  data.access);
    localStorage.setItem('refresh_token', data.refresh);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      const refresh = localStorage.getItem('refresh_token');
      await authAPI.logout(refresh);
    } catch {}
    localStorage.clear();
    setUser(null);
  };

  const hasRole = (roles) => {
    if (!user?.role) return false;
    return Array.isArray(roles) ? roles.includes(user.role.code) : user.role.code === roles;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
};
