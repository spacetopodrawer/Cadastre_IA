import { create } from 'zustand';
import { authAPI } from '../lib/api';
import { socketManager } from '../lib/socket';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('cadastre_token'),
  isAuthenticated: false,
  loading: true,

  login: async (email: string, password: string) => {
    const response = await authAPI.login({ email, password });
    const { token, user } = response.data;
    localStorage.setItem('cadastre_token', token);
    set({ user, token, isAuthenticated: true });

    const deviceName = `${user.name}'s PC`;
    socketManager.connect(user.id, deviceName);
  },

  register: async (email: string, password: string, name: string) => {
    const response = await authAPI.register({ email, password, name });
    const { token, user } = response.data;
    localStorage.setItem('cadastre_token', token);
    set({ user, token, isAuthenticated: true });

    const deviceName = `${user.name}'s PC`;
    socketManager.connect(user.id, deviceName);
  },

  logout: () => {
    localStorage.removeItem('cadastre_token');
    socketManager.disconnect();
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('cadastre_token');
    if (!token) {
      set({ loading: false, isAuthenticated: false });
      return;
    }
    try {
      const response = await authAPI.getMe();
      const { user } = response.data;
      set({ user, token, isAuthenticated: true, loading: false });
      const deviceName = `${user.name}'s PC`;
      socketManager.connect(user.id, deviceName);
    } catch (err) {
      localStorage.removeItem('cadastre_token');
      set({ user: null, token: null, isAuthenticated: false, loading: false });
    }
  }
}));
