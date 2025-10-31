import { writable, get } from 'svelte/store';

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'offline';

export interface SyncedFile {
  id: string;
  name: string;
  status: SyncStatus;
  audit: string[];
  lastSynced?: Date;
  type?: 'layer' | 'document' | 'project';
  metadata?: Record<string, unknown>;
}

function createSyncStore() {
  const { subscribe, update, set } = writable<SyncedFile[]>([]);

  function addAuditEntry(fileId: string, message: string) {
    update(files => 
      files.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              audit: [...f.audit, `${new Date().toISOString()}: ${message}`],
              lastSynced: new Date()
            } 
          : f
      )
    );
  }

  return {
    subscribe,
    
    // Ajouter un nouveau fichier à synchroniser
    addFile: (file: Omit<SyncedFile, 'audit' | 'status'>, status: SyncStatus = 'pending') => {
      const newFile: SyncedFile = {
        ...file,
        status,
        audit: [`${new Date().toISOString()}: File added to sync queue`]
      };
      update(files => [...files, newFile]);
      return newFile.id;
    },

    // Mettre à jour le statut d'un fichier
    updateStatus: (id: string, status: SyncStatus, message?: string) => {
      if (message) {
        addAuditEntry(id, `Status changed to ${status}: ${message}`);
      }
      update(files => 
        files.map(f => f.id === id ? { ...f, status } : f)
      );
    },

    // Synchroniser un fichier
    syncFile: (id: string) => {
      update(files =>
        files.map(f =>
          f.id === id 
            ? { 
                ...f, 
                status: 'synced',
                audit: [...f.audit, `${new Date().toISOString()}: File synchronized`],
                lastSynced: new Date()
              } 
            : f
        )
      );
      return true;
    },

    // Résoudre un conflit
    resolveConflict: (id: string, resolution: 'keepLocal' | 'useRemote' | 'merge' = 'merge') => {
      const message = `Conflict resolved using strategy: ${resolution}`;
      addAuditEntry(id, message);
      
      // Ici, vous pourriez ajouter la logique de résolution spécifique
      
      return this.syncFile(id);
    },

    // Afficher l'audit d'un fichier
    showAudit: (id: string) => {
      const file = get({ subscribe }).find(f => f.id === id);
      if (file) {
        console.group(`Audit log for ${file.name} (${file.id})`);
        file.audit.forEach(entry => console.log(entry));
        console.groupEnd();
        return file.audit;
      }
      return [];
    },

    // Supprimer un fichier du suivi
    removeFile: (id: string) => {
      update(files => files.filter(f => f.id !== id));
    },

    // Réinitialiser le store (pour les tests principalement)
    reset: () => set([])
  };
}

export const syncStore = createSyncStore();
