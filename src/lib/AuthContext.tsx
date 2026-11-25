import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import * as api from './apiService';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string, avatar?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (
    nameOrUpdates: string | { name?: string; avatar?: string; phone?: string; bio?: string },
    avatar?: string
  ) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('uniao_pet_user_v2');
    const savedToken = localStorage.getItem('uniao_pet_token');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }
    if (savedToken) {
      setToken(savedToken);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    try {
      const res = await api.login(email, pass);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('uniao_pet_user_v2', JSON.stringify(res.user));
      localStorage.setItem('uniao_pet_token', res.token);
      toast.success('Bem-vindo de volta!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fazer login');
      throw err;
    }
  };

  const register = async (name: string, email: string, pass: string, avatar?: string) => {
    try {
      const res = await api.register(name, email, pass, avatar);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('uniao_pet_user_v2', JSON.stringify(res.user));
      localStorage.setItem('uniao_pet_token', res.token);
      toast.success('Conta criada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta');
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('uniao_pet_user_v2');
    localStorage.removeItem('uniao_pet_token');
    toast.success('Sessão encerrada');
  };

  const updateProfile = async (
    nameOrUpdates: string | { name?: string; avatar?: string; phone?: string; bio?: string },
    avatarParam?: string
  ) => {
    if (!user) return;
    try {
      const updates = typeof nameOrUpdates === 'string'
        ? { name: nameOrUpdates, avatar: avatarParam }
        : nameOrUpdates;
      const updated = await api.updateProfile(user.email, updates);
      setUser(updated);
      localStorage.setItem('uniao_pet_user_v2', JSON.stringify(updated));
      toast.success('Perfil atualizado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar perfil');
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
