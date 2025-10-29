import { create } from 'zustand';
import { filesAPI, syncAPI } from '../lib/api';
import { socketManager } from '../lib/socket';

interface FileItem {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  sync_status: string;
  created_at: string;
  updated_at: string;
  thumbnail?: string;
}

interface FileState {
  files: FileItem[];
  loading: boolean;
  uploadProgress: number;
  syncStatus: any;
  fetchFiles: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  requestSync: (fileId: string, targetDeviceId?: string) => void;
  getSyncStatus: () => Promise<void>;
  setupSyncListeners: () => void;
  createFile: (name: string, initialContent: any) => Promise<FileItem>;
  updateFile: (fileId: string, data: any) => Promise<void>;
  saveVersion: (fileId: string, json: any, message?: string) => Promise<void>;
  currentFile?: any;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  loading: false,
  uploadProgress: 0,
  syncStatus: null,
  currentFile: null,

  fetchFiles: async () => {
    set({ loading: true });
    try {
      const response = await filesAPI.getAll();
      set({ files: response.data.files, loading: false });
    } catch (error) {
      console.error('Erreur chargement fichiers:', error);
      set({ loading: false });
    }
  },

  createFile: async (name: string, initialContent: any) => {
    // Create a JSON blob and upload it so the backend registers a new file
    const jsonString = typeof initialContent === 'string' ? initialContent : JSON.stringify(initialContent);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const uploadFile = new File([blob], `${name}.json`, { type: 'application/json' });
    const response = await filesAPI.upload(uploadFile);
    const newFile: FileItem = response.data.file;
    set((state) => ({ files: [newFile, ...state.files] }));
    socketManager.notifyFileUpdate(newFile.id, 'Nouveau fichier créé');
    return newFile;
  },

  updateFile: async (_fileId: string, _data: any) => {
    // No-op for now; backend lacks an update endpoint
    return;
  },

  saveVersion: async (_fileId: string, _json: any, _message?: string) => {
    // No-op for now; backend exposes versions listing only
    return;
  },

  uploadFile: async (file: File) => {
    try {
      set({ uploadProgress: 0 });
      const response = await filesAPI.upload(file);
      const newFile = response.data.file;
      set((state) => ({ files: [newFile, ...state.files], uploadProgress: 100 }));
      socketManager.notifyFileUpdate(newFile.id, 'Nouveau fichier uploadé');
      setTimeout(() => set({ uploadProgress: 0 }), 2000);
    } catch (error) {
      console.error('Erreur upload:', error);
      set({ uploadProgress: 0 });
      throw error;
    }
  },

  deleteFile: async (id: string) => {
    try {
      await filesAPI.delete(id);
      set((state) => ({ files: state.files.filter(f => f.id !== id) }));
    } catch (error) {
      console.error('Erreur suppression:', error);
      throw error;
    }
  },

  requestSync: (fileId: string, targetDeviceId?: string) => {
    socketManager.requestFileSync(fileId, targetDeviceId);
  },

  getSyncStatus: async () => {
    try {
      const response = await syncAPI.getStatus();
      set({ syncStatus: response.data });
    } catch (error) {
      console.error('Erreur statut sync:', error);
    }
  },

  setupSyncListeners: () => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    socket.on('file-sync-available', (data) => {
      if (window.confirm(`Synchroniser le fichier "${data.fileName}" ?`)) {
        socketManager.acceptFileSync(data.fileId);
      }
    });

    let receivedChunks: string[] = [];
    let currentFileId: string | null = null;
    let totalChunks = 0;

    socket.on('file-sync-start', (data) => {
      currentFileId = data.fileId;
      totalChunks = data.totalChunks;
      receivedChunks = [];
    });

    socket.on('file-sync-chunk', (data) => {
      if (data.fileId === currentFileId) {
        receivedChunks[data.chunkIndex] = data.data;
      }
    });

    socket.on('file-sync-complete', async (data) => {
      const base64Data = receivedChunks.join('');
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) bytes[i] = binaryData.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName;
      a.click();
      receivedChunks = [];
      currentFileId = null;
      get().fetchFiles();
    });

    socket.on('file-changed', () => {
      get().fetchFiles();
    });

    socket.on('device-online', () => {
      get().getSyncStatus();
    });
    socket.on('device-offline', () => {
      get().getSyncStatus();
    });
  }
}));
