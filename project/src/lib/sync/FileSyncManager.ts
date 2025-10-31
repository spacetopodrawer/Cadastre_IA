import { v4 as uuidv4 } from 'uuid';
import { deviceSecurityPolicy } from '../security/DeviceSecurityPolicy';
import { fusionAuditLog } from '../security/FusionAuditLog';
import { missionSync } from './MissionSync';

type FileType = 'image' | 'document' | 'geodata' | 'archive' | 'other';

/**
 * Représente une entrée de fichier dans le système
 */
export interface FileEntry {
  id: string;
  name: string;
  originalName: string;
  type: FileType;
  mimeType: string;
  size: number;
  missionId?: string;
  deviceId?: string;
  zoneId?: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  archived: boolean;
  synced: boolean;
  path: string;
  hash: string;
  metadata: {
    author?: string;
    description?: string;
    tags?: string[];
    dimensions?: {
      width?: number;
      height?: number;
      depth?: number;
    };
    coordinates?: {
      lat: number;
      lon: number;
      alt?: number;
      crs?: string;
    };
    [key: string]: any;
  };
}

/**
 * Options pour l'enregistrement d'un fichier
 */
interface FileRegistrationOptions {
  missionId?: string;
  deviceId?: string;
  zoneId?: string;
  author?: string;
  description?: string;
  tags?: string[];
  coordinates?: {
    lat: number;
    lon: number;
    alt?: number;
    crs?: string;
  };
  customMetadata?: Record<string, any>;
}

/**
 * Gestionnaire de synchronisation des fichiers
 */
class FileSyncManager {
  private static STORAGE_KEY = 'cadastre_files_v2';
  private files: FileEntry[] = [];
  private syncInProgress = false;
  private syncHandlers: Array<() => void> = [];

  constructor() {
    this.loadLocal();
    this.setupAutoSync();
  }

  /**
   * Enregistre un nouveau fichier ou met à jour une version existante
   */
  async registerFile(
    file: File | Blob,
    options: FileRegistrationOptions = {}
  ): Promise<FileEntry> {
    // Vérifier les permissions
    if (!(await deviceSecurityPolicy.checkPermission('file:write'))) {
      throw new Error('Permission denied: cannot register file');
    }

    const fileId = uuidv4();
    const now = Date.now();
    const fileName = this.generateFilename(file.name || 'unnamed', options);
    
    // Calculer le hash du fichier pour la vérification d'intégrité
    const hash = await this.calculateFileHash(file);
    
    // Vérifier si une version similaire existe déjà
    const existingFile = this.findSimilarFile(hash, options.missionId);
    
    if (existingFile) {
      // Mise à jour de la version existante
      existingFile.version++;
      existingFile.updatedAt = now;
      existingFile.synced = false;
      existingFile.path = await this.storeFile(file, existingFile.id);
      
      // Mettre à jour les métadonnées
      if (options.description) {
        existingFile.metadata.description = options.description;
      }
      
      this.saveLocal();
      this.notifySyncHandlers();
      
      // Journaliser l'action
      fusionAuditLog.record({
        action: 'file_updated',
        fileId: existingFile.id,
        version: existingFile.version,
        metadata: {
          ...options,
          size: file.size,
          mimeType: file.type
        }
      });
      
      return existingFile;
    }
    
    // Créer une nouvelle entrée
    const fileType = this.determineFileType(file.type || '');
    const filePath = await this.storeFile(file, fileId);
    
    const newFile: FileEntry = {
      id: fileId,
      name: fileName,
      originalName: file.name || 'unnamed',
      type: fileType,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      missionId: options.missionId,
      deviceId: options.deviceId || await deviceSecurityPolicy.getCurrentDeviceId(),
      zoneId: options.zoneId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      archived: false,
      synced: false,
      path: filePath,
      hash,
      metadata: {
        author: options.author || await deviceSecurityPolicy.getCurrentUserId(),
        description: options.description || '',
        tags: options.tags || [],
        coordinates: options.coordinates,
        ...(options.customMetadata || {})
      }
    };
    
    this.files.push(newFile);
    this.saveLocal();
    this.notifySyncHandlers();
    
    // Journaliser l'action
    fusionAuditLog.record({
      action: 'file_created',
      fileId: newFile.id,
      metadata: {
        name: newFile.name,
        type: newFile.type,
        size: newFile.size,
        missionId: newFile.missionId,
        deviceId: newFile.deviceId
      }
    });
    
    return newFile;
  }

  /**
   * Génère un nom de fichier structuré
   */
  private generateFilename(originalName: string, options: FileRegistrationOptions): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
    
    const parts = [
      dateStr,
      timeStr,
      options.zoneId ? `Z${options.zoneId}` : '',
      options.missionId ? `M${options.missionId.substring(0, 8)}` : '',
      originalName.replace(/[^\w\d.-]/g, '_')
    ];
    
    return parts.filter(Boolean).join('_');
  }

  /**
   * Stocke le fichier localement
   */
  private async storeFile(file: File | Blob, fileId: string): Promise<string> {
    // Dans une vraie implémentation, cela pourrait stocker le fichier dans IndexedDB ou le système de fichiers
    // Pour cette version, on simule un stockage avec un chemin relatif
    return `local://files/${fileId}/${(file as File).name || 'file'}`;
  }

  /**
   * Calcule le hash d'un fichier pour la détection de doublons
   */
  private async calculateFileHash(file: Blob): Promise<string> {
    // Implémentation simplifiée - dans une vraie application, utilisez une fonction de hachage cryptographique
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Trouve un fichier similaire basé sur le hash et la mission
   */
  private findSimilarFile(hash: string, missionId?: string): FileEntry | undefined {
    return this.files.find(f => 
      f.hash === hash && 
      (missionId ? f.missionId === missionId : true) &&
      !f.archived
    );
  }

  /**
   * Détermine le type de fichier à partir du type MIME
   */
  private determineFileType(mimeType: string): FileType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    if (mimeType.includes('json') || mimeType.includes('geojson') || mimeType.includes('shp')) return 'geodata';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive';
    return 'other';
  }

  /**
   * Archive un fichier
   */
  archiveFile(fileId: string): boolean {
    const file = this.files.find(f => f.id === fileId);
    if (file) {
      file.archived = true;
      file.updatedAt = Date.now();
      this.saveLocal();
      this.notifySyncHandlers();
      
      fusionAuditLog.record({
        action: 'file_archived',
        fileId: file.id,
        metadata: {
          name: file.name,
          version: file.version
        }
      });
      
      return true;
    }
    return false;
  }

  /**
   * Récupère un fichier par son ID
   */
  getFile(fileId: string): FileEntry | undefined {
    return this.files.find(f => f.id === fileId);
  }

  /**
   * Récupère les fichiers associés à une mission
   */
  getFilesByMission(missionId: string, includeArchived = false): FileEntry[] {
    return this.files.filter(f => 
      f.missionId === missionId && 
      (includeArchived || !f.archived)
    );
  }

  /**
   * Récupère les fichiers associés à un appareil
   */
  getFilesByDevice(deviceId: string, includeArchived = false): FileEntry[] {
    return this.files.filter(f => 
      f.deviceId === deviceId && 
      (includeArchived || !f.archived)
    );
  }

  /**
   * Synchronise tous les fichiers non synchronisés avec le serveur
   */
  async syncAll(): Promise<{ success: boolean; synced: number; errors: number }> {
    if (this.syncInProgress || !navigator.onLine) {
      return { success: false, synced: 0, errors: 0 };
    }

    this.syncInProgress = true;
    const unsynced = this.files.filter(f => !f.synced && !f.archived);
    let syncedCount = 0;
    let errorCount = 0;

    for (const file of unsynced) {
      try {
        // Dans une vraie application, ce serait un appel API pour téléverser le fichier
        const response = await this.uploadFileToServer(file);
        
        if (response.success) {
          file.synced = true;
          file.updatedAt = Date.now();
          syncedCount++;
          
          fusionAuditLog.record({
            action: 'file_synced',
            fileId: file.id,
            metadata: {
              name: file.name,
              version: file.version,
              size: file.size
            }
          });
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Failed to sync file ${file.name}:`, error);
        errorCount++;
      }
    }

    this.saveLocal();
    this.syncInProgress = false;
    this.notifySyncHandlers();
    
    return {
      success: errorCount === 0,
      synced: syncedCount,
      errors: errorCount
    };
  }

  /**
   * Simule le téléversement d'un fichier vers le serveur
   */
  private async uploadFileToServer(file: FileEntry): Promise<{ success: boolean; url?: string }> {
    // Dans une vraie application, ce serait un appel API pour téléverser le fichier
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simuler un taux de réussite de 90%
        const success = Math.random() < 0.9;
        resolve({ 
          success,
          url: success ? `https://api.cadastre-ia.sync/files/${file.id}` : undefined
        });
      }, 300);
    });
  }

  /**
   * Configure la synchronisation automatique
   */
  private setupAutoSync(): void {
    // Synchroniser au démarrage si en ligne
    if (navigator.onLine) {
      this.syncAll().catch(console.error);
    }

    // Synchroniser lors du retour en ligne
    window.addEventListener('online', () => {
      this.syncAll().catch(console.error);
    });

    // Synchroniser périodiquement
    setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        this.syncAll().catch(console.error);
      }
    }, 5 * 60 * 1000); // Toutes les 5 minutes
  }

  /**
   * Enregistre un gestionnaire de synchronisation
   */
  onSync(handler: () => void): () => void {
    this.syncHandlers.push(handler);
    return () => {
      this.syncHandlers = this.syncHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Notifie tous les gestionnaires de synchronisation
   */
  private notifySyncHandlers(): void {
    this.syncHandlers.forEach(handler => handler());
  }

  /**
   * Charge les fichiers depuis le stockage local
   */
  private loadLocal(): void {
    try {
      const data = localStorage.getItem(FileSyncManager.STORAGE_KEY);
      if (data) {
        this.files = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load files from local storage:', error);
      this.files = [];
    }
  }

  /**
   * Sauvegarde les fichiers dans le stockage local
   */
  private saveLocal(): void {
    try {
      localStorage.setItem(FileSyncManager.STORAGE_KEY, JSON.stringify(this.files));
    } catch (error) {
      console.error('Failed to save files to local storage:', error);
    }
  }

  /**
   * Nettoie les ressources
   */
  destroy(): void {
    this.syncHandlers = [];
    window.removeEventListener('online', this.syncAll);
  }
}

// Exporte une instance singleton
export const fileSyncManager = new FileSyncManager();

// Pour le support HMR
if (import.meta.hot) {
  // @ts-ignore - Vite HMR
  import.meta.hot.accept(() => {
    // Gérer les mises à jour si nécessaire
  });
}
