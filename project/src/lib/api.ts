import axios from 'axios';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cadastre_token');
  if (token) {
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cadastre_token');
      if (location.pathname !== '/auth') {
        location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data: { email: string; password: string; name: string }) => api.post('/api/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/api/auth/login', data),
  getMe: () => api.get('/api/auth/me'),
  createAdmin: (data: { email: string; password: string; name: string; secretKey: string }) => 
    api.post('/api/auth/create-admin', data)
};

export const filesAPI = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/files/upload', formData, { 
      headers: { 'Content-Type': 'multipart/form-data' } 
    });
  },
  getAll: () => api.get('/api/files'),
  getById: (id: string) => api.get(`/api/files/${id}`),
  getVersions: (id: string) => api.get(`/api/files/${id}/versions`),
  delete: (id: string) => api.delete(`/api/files/${id}`)
};

export const syncAPI = {
  getDevices: () => api.get('/api/sync/devices'),
  getStatus: () => api.get('/api/sync/status'),
  addToQueue: (fileId: string, targetDeviceId?: string) => 
    api.post('/api/sync/queue', { fileId, targetDeviceId }),
  getPending: () => api.get('/api/sync/pending')
};
