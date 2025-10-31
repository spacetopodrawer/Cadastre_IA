import { mapTileManager } from '../map/MapTileManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Types for mission data and sync status
 */
export type MissionStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'validated' | 'rejected';

export interface LocalMission {
  id: string;
  zone: string;
  altitude: number;
  resolution: number; // cm/pixel
  cadence: number; // seconds between photos
  assignedTo: string;
  status: MissionStatus;
  timestamp: number;
  synced: boolean;
  lastSynced?: number;
  tileSourceId?: string;
  offlineTiles?: string[];
  metadata?: {
    notes?: string;
    priority?: 'low' | 'medium' | 'high';
    requiredEquipment?: string[];
    estimatedDuration?: number; // in minutes
  };
  // For conflict resolution
  version: number;
  updatedAt: number;
  updatedBy: string;
}

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/**
 * MissionSync - Handles offline mission storage and synchronization
 */
class MissionSync {
  private static STORAGE_KEY = 'cadastre_missions_offline';
  private static SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private syncTimer?: number;
  private syncStatus: SyncStatus = 'idle';
  private localMissions: LocalMission[] = [];
  private syncHandlers: Array<() => void> = [];

  constructor() {
    this.loadFromStorage();
    this.setupAutoSync();
  }

  /**
   * Load missions from local storage
   */
  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(MissionSync.STORAGE_KEY);
      this.localMissions = raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Failed to load missions from storage:', error);
      this.localMissions = [];
    }
  }

  /**
   * Save missions to local storage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(MissionSync.STORAGE_KEY, JSON.stringify(this.localMissions));
    } catch (error) {
      console.error('Failed to save missions to storage:', error);
    }
  }

  /**
   * Create a new mission or update an existing one
   */
  saveMission(mission: Omit<LocalMission, 'id' | 'timestamp' | 'synced' | 'version' | 'updatedAt' | 'updatedBy'>, id?: string): LocalMission {
    const now = Date.now();
    const userId = this.getCurrentUserId();
    
    if (id) {
      // Update existing mission
      const index = this.localMissions.findIndex(m => m.id === id);
      if (index !== -1) {
        const existing = this.localMissions[index];
        const updatedMission: LocalMission = {
          ...existing,
          ...mission,
          version: existing.version + 1,
          updatedAt: now,
          updatedBy: userId,
          synced: false,
        };
        this.localMissions[index] = updatedMission;
        this.saveToStorage();
        this.notifySyncHandlers();
        return updatedMission;
      }
    }

    // Create new mission
    const newMission: LocalMission = {
      ...mission,
      id: id || `mission_${uuidv4()}`,
      timestamp: now,
      synced: false,
      version: 1,
      updatedAt: now,
      updatedBy: userId,
    };
    
    this.localMissions.push(newMission);
    this.saveToStorage();
    this.notifySyncHandlers();
    return newMission;
  }

  /**
   * Get a mission by ID
   */
  getMission(id: string): LocalMission | undefined {
    return this.localMissions.find(m => m.id === id);
  }

  /**
   * Get all missions, optionally filtered by status
   */
  getAllMissions(filter?: { status?: MissionStatus; synced?: boolean }): LocalMission[] {
    return this.localMissions.filter(mission => {
      if (filter) {
        return (
          (filter.status === undefined || mission.status === filter.status) &&
          (filter.synced === undefined || mission.synced === filter.synced)
        );
      }
      return true;
    });
  }

  /**
   * Delete a mission
   */
  deleteMission(id: string): boolean {
    const index = this.localMissions.findIndex(m => m.id === id);
    if (index !== -1) {
      this.localMissions.splice(index, 1);
      this.saveToStorage();
      this.notifySyncHandlers();
      return true;
    }
    return false;
  }

  /**
   * Synchronize all unsynced missions with the server
   */
  async syncAll(): Promise<{ success: boolean; synced: number; errors: number }> {
    if (this.syncStatus === 'syncing' || !this.isOnline()) {
      return { success: false, synced: 0, errors: 0 };
    }

    this.syncStatus = 'syncing';
    const unsynced = this.localMissions.filter(m => !m.synced);
    let syncedCount = 0;
    let errorCount = 0;

    for (const mission of unsynced) {
      try {
        // In a real app, this would be an API call to your backend
        const response = await this.syncWithServer(mission);
        
        if (response.success) {
          mission.synced = true;
          mission.lastSynced = Date.now();
          syncedCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Failed to sync mission ${mission.id}:`, error);
        errorCount++;
      }
    }

    this.saveToStorage();
    this.syncStatus = errorCount === 0 ? 'idle' : 'error';
    this.notifySyncHandlers();
    
    return {
      success: errorCount === 0,
      synced: syncedCount,
      errors: errorCount,
    };
  }

  /**
   * Simulate server sync (replace with actual API calls)
   */
  private async syncWithServer(mission: LocalMission): Promise<{ success: boolean; data?: any; error?: string }> {
    // This is a placeholder for actual server communication
    // In a real app, you would use fetch or a similar API
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate network conditions
        const shouldSucceed = Math.random() > 0.2; // 80% success rate for demo
        if (shouldSucceed) {
          resolve({ success: true, data: { id: mission.id } });
        } else {
          resolve({ success: false, error: 'Network error' });
        }
      }, 300); // Simulate network delay
    });
  }

  /**
   * Setup auto-sync when online
   */
  private setupAutoSync(): void {
    // Initial sync check
    if (this.isOnline()) {
      this.syncAll().catch(console.error);
    }

    // Set up periodic sync
    this.syncTimer = window.setInterval(() => {
      if (this.isOnline() && this.syncStatus !== 'syncing') {
        this.syncAll().catch(console.error);
      }
    }, MissionSync.SYNC_INTERVAL);

    // Sync when coming back online
    window.addEventListener('online', () => {
      this.syncStatus = 'idle';
      this.syncAll().catch(console.error);
    });

    // Save data before page unload
    window.addEventListener('beforeunload', () => {
      this.saveToStorage();
    });
  }

  /**
   * Check if the device is online
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Get the current sync status
   */
  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  /**
   * Get the number of unsynced missions
   */
  getUnsyncedCount(): number {
    return this.localMissions.filter(m => !m.synced).length;
  }

  /**
   * Register a callback for sync status changes
   */
  onSync(handler: () => void): () => void {
    this.syncHandlers.push(handler);
    return () => {
      this.syncHandlers = this.syncHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Notify all sync handlers
   */
  private notifySyncHandlers(): void {
    this.syncHandlers.forEach(handler => handler());
  }

  /**
   * Get the current user ID (replace with your auth system)
   */
  private getCurrentUserId(): string {
    // In a real app, get this from your auth context
    return 'anonymous';
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    window.removeEventListener('online', this.syncAll);
    window.removeEventListener('beforeunload', this.saveToStorage);
  }
}

// Export a singleton instance
export const missionSync = new MissionSync();

// For testing/development
if (import.meta.hot) {
  // @ts-ignore - Vite HMR
  import.meta.hot.accept(() => {
    // Handle HMR updates if needed
  });
}
