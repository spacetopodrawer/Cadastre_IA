import { v4 as uuidv4 } from 'uuid';
import { auditLog } from '../audit/FusionAuditLog';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { userReputationManager } from '../reputation/UserRepository';
import { cartoValidator } from '../validation/CartoValidator';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Types for IndexedDB schema
interface MobileAnnotationDB extends DBSchema {
  annotations: {
    key: string;
    value: MobileAnnotation;
    indexes: { 'by-mission': string; 'by-user': string; 'by-sync': boolean };
  };
  syncQueue: {
    key: string;
    value: { id: string; retryCount: number; lastAttempt: number };
  };
  media: {
    key: string;
    value: { id: string; data: Blob; annotationId: string };
    indexes: { 'by-annotation': string };
  };
}

type GeoJSONGeometry = {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
  coordinates: any[];
};

type GNSSMetadata = {
  accuracy?: number;  // in meters
  altitude?: number;  // in meters
  speed?: number;     // in m/s
  heading?: number;   // in degrees
  hdop?: number;      // Horizontal Dilution of Precision
  vdop?: number;      // Vertical Dilution of Precision
  pdop?: number;      // Position Dilution of Precision
  satCount?: number;  // Number of satellites
  fixType?: 'none' | '2d' | '3d' | 'dgps' | 'rtk';
  geohash?: string;   // Geohash for spatial indexing
};

type MediaAttachment = {
  id: string;
  type: 'photo' | 'audio' | 'video' | 'document';
  uri: string;
  mimeType: string;
  size: number; // in bytes
  width?: number;
  height?: number;
  duration?: number; // for audio/video, in seconds
  thumbnail?: string; // base64 or URL to thumbnail
  compressed?: boolean;
  originalSize?: number;
  storagePath?: string; // Path in IndexedDB or remote storage
};

type MobileAnnotation = {
  id: string;
  userId: string;
  missionId: string;
  featureId?: string;
  type: string;
  geometry: GeoJSONGeometry;
  properties: Record<string, any>;
  metadata: {
    gnss: GNSSMetadata;
    deviceInfo: {
      id: string;
      model: string;
      os: string;
      appVersion: string;
      networkType?: 'wifi' | 'cellular' | 'ethernet' | 'none';
      batteryLevel?: number;
    };
    timestamps: {
      created: number;
      modified: number;
      synced?: number;
      validated?: number;
    };
    media?: MediaAttachment[];
    tags?: string[];
    status: 'draft' | 'submitted' | 'validated' | 'rejected' | 'conflict';
    validation?: {
      validatedBy?: string;
      validatedAt?: number;
      comment?: string;
      score?: number;
      rulesApplied?: string[];
    };
    changeset?: {
      previousVersion?: number;
      changes: Record<string, { from: any; to: any }>;
    };
  };
  version: number;
  synced: boolean;
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
  offlineId?: string;
  authToken?: string; // JWT for authentication
  signature?: string; // Digital signature for integrity verification
};

type SyncOptions = {
  retryCount?: number;
  timeout?: number;
  force?: boolean;
  batchSize?: number;
  networkType?: 'any' | 'wifi' | 'cellular';
  requireCharging?: boolean;
};

type SyncStats = {
  success: boolean;
  synced: number;
  errors: Array<{ id: string; error: string; retryable: boolean }>;
  totalBytesTransferred: number;
  timestamp: number;
  duration: number;
};

const DB_NAME = 'MobileAnnotationDB';
const DB_VERSION = 3;
const SYNC_BATCH_SIZE = 10;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

export class MobileBridge {
  private static instance: MobileBridge;
  private dbPromise: Promise<IDBPDatabase<MobileAnnotationDB>>;
  private syncInProgress = false;
  private syncQueue: Set<string> = new Set();
  private syncStats: SyncStats = {
    success: false,
    synced: 0,
    errors: [],
    totalBytesTransferred: 0,
    timestamp: 0,
    duration: 0,
  };
  private networkStatus: {
    online: boolean;
    type?: 'wifi' | 'cellular' | 'ethernet' | 'none';
    lastChecked: number;
  } = { online: navigator.onLine, lastChecked: Date.now() };

  private constructor() {
    this.dbPromise = this.initDB();
    this.setupEventListeners();
    this.cleanupOldData().catch(console.error);
  }

  public static getInstance(): MobileBridge {
    if (!MobileBridge.instance) {
      MobileBridge.instance = new MobileBridge();
    }
    return MobileBridge.instance;
  }

  private async initDB(): Promise<IDBPDatabase<MobileAnnotationDB>> {
    return openDB<MobileAnnotationDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('annotations')) {
          const store = db.createObjectStore('annotations', { keyPath: 'id' });
          store.createIndex('by-mission', 'missionId');
          store.createIndex('by-user', 'userId');
          store.createIndex('by-sync', 'synced');
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('media')) {
          const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
          mediaStore.createIndex('by-annotation', 'annotationId');
        }
      },
    });
  }

  private async cleanupOldData(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['annotations', 'media', 'syncQueue'], 'readwrite');
    
    try {
      // Delete synced annotations older than 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const annotations = await tx.objectStore('annotations')
        .index('by-sync')
        .getAll(IDBKeyRange.only(true));
      
      for (const annotation of annotations) {
        if (annotation.metadata.timestamps.synced && 
            annotation.metadata.timestamps.synced < thirtyDaysAgo) {
          await tx.objectStore('annotations').delete(annotation.id);
          // Delete associated media
          const media = await tx.objectStore('media')
            .index('by-annotation')
            .getAll(annotation.id);
          for (const mediaItem of media) {
            await tx.objectStore('media').delete(mediaItem.id);
          }
        }
      }
      
      // Clean up old sync queue items
      const queueItems = await tx.objectStore('syncQueue').getAll();
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const item of queueItems) {
        if (item.lastAttempt < weekAgo) {
          await tx.objectStore('syncQueue').delete(item.id);
        }
      }
      
      await tx.done;
    } catch (error) {
      console.error('Error during cleanup:', error);
      tx.abort();
      throw error;
    }
  }

  private async compressAndStoreMedia(
    media: MediaAttachment[],
    annotationId: string,
    options: { maxWidth?: number; quality?: number } = {}
  ): Promise<MediaAttachment[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('media', 'readwrite');
    const compressedMedia: MediaAttachment[] = [];

    try {
      for (const item of media) {
        let processedItem: MediaAttachment = { ...item };
        
        // Skip if already compressed or not a compressible type
        if (item.compressed || !['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType)) {
          compressedMedia.push(item);
          continue;
        }

        try {
          // Compress the image (implementation depends on your compression library)
          // const compressedBlob = await compressImage(
          //   await (await fetch(item.uri)).blob(),
          //   {
          //     maxWidth: options.maxWidth || 1920,
          //     quality: options.quality || 0.8,
          //     mimeType: item.mimeType,
          //   }
          // );
          
          // For now, we'll just use the original blob
          const mediaBlob = await (await fetch(item.uri)).blob();
          const mediaId = `media_${uuidv4()}`;
          
          await tx.store.put({
            id: mediaId,
            data: mediaBlob,
            annotationId,
          });

          // Update media item with storage info
          processedItem = {
            ...item,
            id: mediaId,
            compressed: false, // Set to true when implementing compression
            originalSize: item.size,
            size: mediaBlob.size,
            storagePath: `media/${mediaId}`,
            uri: URL.createObjectURL(mediaBlob),
          };
        } catch (error) {
          console.error('Error processing media:', error, item);
          // Fallback to original if processing fails
          processedItem = item;
        }

        compressedMedia.push(processedItem);
      }

      await tx.done;
      return compressedMedia;
    } catch (error) {
      console.error('Error in media processing transaction:', error);
      tx.abort();
      throw error;
    }
  }

  private async ensureAuthToken(): Promise<string> {
    // In a real implementation, this would check for a valid JWT
    // and refresh it if necessary
    const token = localStorage.getItem('authToken');
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    // Here you would validate the token and refresh if needed
    // For now, we'll just return the token
    return token;
  }

  private async validateAnnotation(annotation: MobileAnnotation): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    score: number;
  }> {
    const result = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
      score: 1.0,
    };

    // Basic validation
    if (!annotation.geometry || !annotation.geometry.coordinates) {
      result.valid = false;
      result.errors.push('Invalid geometry');
    }

    if (!annotation.userId) {
      result.valid = false;
      result.errors.push('Missing user ID');
    }

    if (!annotation.missionId) {
      result.valid = false;
      result.errors.push('Missing mission ID');
    }

    // GNSS quality check
    const { gnss } = annotation.metadata;
    if (gnss) {
      if (gnss.accuracy && gnss.accuracy > 50) {
        result.warnings.push('Low GNSS accuracy');
        result.score *= 0.8;
      }
      
      if (gnss.hdop && gnss.hdop > 5) {
        result.warnings.push('High horizontal dilution of precision (HDOP)');
        result.score *= 0.9;
      }
      
      if (gnss.satCount && gnss.satCount < 4) {
        result.warnings.push('Low number of satellites');
        result.score *= 0.85;
      }
    }

    // Media validation
    if (annotation.metadata.media && annotation.metadata.media.length > 0) {
      for (const media of annotation.metadata.media) {
        if (media.size > 10 * 1024 * 1024) { // 10MB
          result.warnings.push(`Large media file: ${media.uri} (${(media.size / 1024 / 1024).toFixed(2)}MB)`);
        }
      }
    }

    // Apply business rules via CartoValidator
    try {
      const validation = await cartoValidator.validate(annotation);
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        result.warnings.push(...validation.warnings);
        result.valid = false;
      }
      result.score *= validation.score || 1.0;
    } catch (error) {
      console.error('Error during carto validation:', error);
      result.warnings.push('Could not complete all validations');
    }

    return result;
  }

  private async updateSyncQueue(annotationId: string, status: 'pending' | 'processing' | 'completed' | 'failed', error?: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['syncQueue', 'annotations'], 'readwrite');
    
    try {
      if (status === 'completed') {
        await tx.objectStore('syncQueue').delete(annotationId);
        
        // Update annotation sync status
        const annotation = await tx.objectStore('annotations').get(annotationId);
        if (annotation) {
          annotation.syncStatus = 'synced';
          annotation.synced = true;
          annotation.metadata.timestamps.synced = Date.now();
          delete annotation.syncError;
          await tx.objectStore('annotations').put(annotation);
        }
      } else if (status === 'failed') {
        const queueItem = await tx.objectStore('syncQueue').get(annotationId) || {
          id: annotationId,
          retryCount: 0,
          lastAttempt: 0,
        };
        
        queueItem.retryCount += 1;
        queueItem.lastAttempt = Date.now();
        
        if (queueItem.retryCount <= MAX_RETRY_ATTEMPTS) {
          await tx.objectStore('syncQueue').put(queueItem);
          
          // Update annotation with error status
          const annotation = await tx.objectStore('annotations').get(annotationId);
          if (annotation) {
            annotation.syncStatus = 'error';
            annotation.syncError = error || 'Sync failed';
            await tx.objectStore('annotations').put(annotation);
          }
          
          // Schedule retry with exponential backoff
          const delay = Math.min(
            RETRY_DELAY * Math.pow(2, queueItem.retryCount - 1),
            300000 // 5 minutes max delay
          );
          
          setTimeout(() => {
            this.syncQueue.add(annotationId);
            this.scheduleSync();
          }, delay);
        } else {
          // Max retries reached, give up
          await tx.objectStore('syncQueue').delete(annotationId);
          
          const annotation = await tx.objectStore('annotations').get(annotationId);
          if (annotation) {
            annotation.syncStatus = 'error';
            annotation.syncError = `Sync failed after ${MAX_RETRY_ATTEMPTS} attempts`;
            await tx.objectStore('annotations').put(annotation);
          }
        }
      } else if (status === 'processing') {
        // Mark as being processed
        const queueItem = await tx.objectStore('syncQueue').get(annotationId) || {
          id: annotationId,
          retryCount: 0,
          lastAttempt: Date.now(),
        };
        
        queueItem.lastAttempt = Date.now();
        await tx.objectStore('syncQueue').put(queueItem);
        
        // Update annotation status
        const annotation = await tx.objectStore('annotations').get(annotationId);
        if (annotation) {
          annotation.syncStatus = 'syncing';
          delete annotation.syncError;
          await tx.objectStore('annotations').put(annotation);
        }
      }
      
      await tx.done;
    } catch (error) {
      console.error('Error updating sync queue:', error);
      tx.abort();
      throw error;
    }
  }

  private async processSyncBatch(batch: string[]): Promise<{ success: boolean; synced: number; errors: Array<{ id: string; error: string }> }> {
    const results = {
      success: true,
      synced: 0,
      errors: [] as Array<{ id: string; error: string }>,
    };

    const db = await this.dbPromise;
    const token = await this.ensureAuthToken();
    
    for (const annotationId of batch) {
      try {
        // Mark as processing
        await this.updateSyncQueue(annotationId, 'processing');
        
        // Get the annotation with its media
        const tx = db.transaction(['annotations', 'media'], 'readonly');
        const annotation = await tx.objectStore('annotations').get(annotationId);
        
        if (!annotation) {
          throw new Error('Annotation not found');
        }
        
        // Get associated media
        const media = await tx.objectStore('media')
          .index('by-annotation')
          .getAll(annotationId);
        
        await tx.done;
        
        // Prepare the payload
        const payload = {
          ...annotation,
          media: media.map(m => ({
            ...m,
            data: m.data ? URL.createObjectURL(m.data) : undefined,
          })),
          authToken: token,
        };

        // Simulate API call - replace with actual implementation
        // const response = await fetch('/api/annotations/sync', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${token}`,
        //   },
        //   body: JSON.stringify(payload),
        // });
        
        // if (!response.ok) {
        //   throw new Error(`HTTP error! status: ${response.status}`);
        // }
        
        // const result = await response.json();
        
        // Simulate successful sync
        await new Promise(resolve => setTimeout(resolve, 500));
        const result = { success: true };

        if (result.success) {
          // Update sync status
          await this.updateSyncQueue(annotationId, 'completed');
          results.synced++;
          
          // Log successful sync
          await auditLog.record('sync_success', annotation.userId, {
            type: 'annotation_sync',
            annotationId: annotation.id,
            missionId: annotation.missionId,
            size: JSON.stringify(annotation).length,
            mediaCount: annotation.metadata.media?.length || 0,
          });
        } else {
          throw new Error('Sync failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error syncing annotation ${annotationId}:`, error);
        
        await this.updateSyncQueue(annotationId, 'failed', errorMessage);
        
        results.errors.push({
          id: annotationId,
          error: errorMessage,
        });
        
        results.success = false;
        
        // Log sync failure
        await auditLog.record('sync_error', 'system', {
          type: 'annotation_sync_error',
          annotationId,
          error: errorMessage,
          retryCount: (await db.get('syncQueue', annotationId))?.retryCount || 0,
        });
      }
    }

    return results;
  }

  private async getNetworkStatus(): Promise<{ online: boolean; type?: string }> {
    // In a real app, you might use the Network Information API
    // @ts-ignore
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    return {
      online: navigator.onLine,
      type: connection?.effectiveType,
    };
  }

  private async checkNetworkConditions(options: SyncOptions): Promise<boolean> {
    const status = await this.getNetworkStatus();
    
    if (!status.online) {
      return false;
    }
    
    // Check if we have specific network type requirements
    if (options.networkType && options.networkType !== 'any') {
      if (options.networkType === 'wifi' && status.type !== 'wifi') {
        return false;
      }
      if (options.networkType === 'cellular' && status.type === 'wifi') {
        return false;
      }
    }
    
    // Check if we require charging
    // @ts-ignore
    if (options.requireCharging && navigator.getBattery) {
      try {
        const battery = await navigator.getBattery();
        if (!battery.charging) {
          return false;
        }
      } catch (error) {
        console.warn('Could not check battery status:', error);
      }
    }
    
    return true;
  }

  private setupEventListeners(): void {
    // Network status changes
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));
    
    // Service Worker messages for background sync
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_ANNOTATIONS') {
          this.syncAnnotations().catch(console.error);
        }
      });
    }
    
    // Visibility changes to sync when app comes to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.syncAnnotations({ force: true }).catch(console.error);
      }
    });
  }

  private handleNetworkChange(online: boolean): void {
    this.networkStatus = {
      ...this.networkStatus,
      online,
      lastChecked: Date.now(),
    };
    
    if (online) {
      // Trigger sync when coming back online
      this.syncAnnotations().catch(console.error);
    }
  }

  private async scheduleSync(): Promise<void> {
    if (this.syncInProgress) {
      return;
    }
    
    // Check if we have anything to sync
    const db = await this.dbPromise;
    const count = await db.count('syncQueue');
    
    if (count === 0) {
      return;
    }
    
    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      // @ts-ignore
      window.requestIdleCallback(
        () => this.syncAnnotations().catch(console.error),
        { timeout: 5000 }
      );
    } else {
      setTimeout(() => this.syncAnnotations().catch(console.error), 5000);
    }
  }

  // --- Public API ---

  public async captureAnnotation(params: {
    userId: string;
    missionId: string;
    featureId?: string;
    type: string;
    geometry: GeoJSONGeometry;
    properties: Record<string, any>;
    gnss: GNSSMetadata;
    deviceInfo: {
      id: string;
      model: string;
      os: string;
      appVersion: string;
      networkType?: 'wifi' | 'cellular' | 'ethernet' | 'none';
      batteryLevel?: number;
    };
    media?: Omit<MediaAttachment, 'id' | 'compressed' | 'originalSize' | 'storagePath'>[];
    tags?: string[];
    authToken?: string;
  }): Promise<MobileAnnotation> {
    const db = await this.dbPromise;
    const now = Date.now();
    const tx = db.transaction(['annotations', 'syncQueue'], 'readwrite');
    
    try {
      const annotationId = `mob_${uuidv4()}`;
      
      // Process and store media
      let processedMedia: MediaAttachment[] = [];
      if (params.media && params.media.length > 0) {
        processedMedia = await this.compressAndStoreMedia(
          params.media.map(m => ({
            ...m,
            id: `media_${uuidv4()}`,
            compressed: false,
          })),
          annotationId,
          { maxWidth: 1920, quality: 0.8 }
        );
      }

      // Create the annotation
      const annotation: MobileAnnotation = {
        id: annotationId,
        userId: params.userId,
        missionId: params.missionId,
        featureId: params.featureId,
        type: params.type,
        geometry: params.geometry,
        properties: params.properties,
        metadata: {
          gnss: params.gnss,
          deviceInfo: {
            ...params.deviceInfo,
            networkType: params.deviceInfo.networkType || (await this.getNetworkStatus()).type as any,
            batteryLevel: params.deviceInfo.batteryLevel,
          },
          timestamps: {
            created: now,
            modified: now,
          },
          media: processedMedia,
          tags: params.tags || [],
          status: 'draft',
        },
        version: 1,
        synced: false,
        syncStatus: 'pending',
        offlineId: `offline_${now}_${Math.floor(Math.random() * 1000)}`,
        authToken: params.authToken,
      };

      // Validate the annotation
      const validation = await this.validateAnnotation(annotation);
      if (!validation.valid) {
        annotation.metadata.status = 'draft';
        annotation.metadata.validation = {
          ...annotation.metadata.validation,
          score: validation.score,
          rulesApplied: validation.errors.concat(validation.warnings),
        };
      } else {
        annotation.metadata.status = 'submitted';
      }

      // Store the annotation
      await tx.objectStore('annotations').put(annotation);
      
      // Add to sync queue
      await tx.objectStore('syncQueue').put({
        id: annotationId,
        retryCount: 0,
        lastAttempt: 0,
      });
      
      await tx.done;

      // Log the capture
      await auditLog.record('mobile_annotation', params.userId, {
        type: 'capture',
        annotationId: annotation.id,
        featureId: annotation.featureId,
        geometryType: annotation.geometry.type,
        hasMedia: processedMedia.length > 0,
        validation: {
          valid: validation.valid,
          score: validation.score,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      }, {
        missionId: params.missionId,
        entityType: 'mobile_annotation',
        entityId: annotation.id,
      });

      // Update user reputation
      await userReputationManager.recordEvent({
        userId: params.userId,
        type: 'annotation_created',
        weight: 1.0,
        metadata: {
          annotationId: annotation.id,
          missionId: params.missionId,
          type: params.type,
          hasMedia: processedMedia.length > 0,
          validationScore: validation.score,
        },
      });

      // Schedule sync
      this.syncQueue.add(annotationId);
      this.scheduleSync();

      // Broadcast new annotation via RealtimeBridge
      realtimeBridge.broadcast({
        type: 'annotation_created',
        payload: {
          annotationId: annotation.id,
          missionId: annotation.missionId,
          userId: annotation.userId,
          timestamp: now,
        },
        scope: 'mission',
        target: annotation.missionId,
      });

      return annotation;
    } catch (error) {
      console.error('Error capturing annotation:', error);
      tx.abort();
      throw error;
    }
  }

  public async updateAnnotation(
    annotationId: string, 
    updates: Partial<MobileAnnotation>,
    options: { validate?: boolean } = { validate: true }
  ): Promise<MobileAnnotation | null> {
    const db = await this.dbPromise;
    const tx = db.transaction(['annotations', 'syncQueue'], 'readwrite');
    
    try {
      const annotation = await tx.objectStore('annotations').get(annotationId);
      if (!annotation) return null;

      // Store previous version for change tracking
      const previousVersion = { ...annotation };
      
      // Apply updates
      const updatedAnnotation: MobileAnnotation = {
        ...annotation,
        ...updates,
        metadata: {
          ...annotation.metadata,
          ...updates.metadata,
          timestamps: {
            ...annotation.metadata.timestamps,
            modified: Date.now(),
          },
          changeset: {
            previousVersion: annotation.version,
            changes: this.calculateChanges(previousVersion, { ...annotation, ...updates }),
          },
        },
        version: annotation.version + 1,
        synced: false,
        syncStatus: 'pending',
      };

      // Validate if requested
      if (options.validate !== false) {
        const validation = await this.validateAnnotation(updatedAnnotation);
        if (!validation.valid) {
          updatedAnnotation.metadata.status = 'draft';
          updatedAnnotation.metadata.validation = {
            ...updatedAnnotation.metadata.validation,
            score: validation.score,
            rulesApplied: validation.errors.concat(validation.warnings),
          };
        } else {
          updatedAnnotation.metadata.status = 'submitted';
        }
      }

      // Update storage
      await tx.objectStore('annotations').put(updatedAnnotation);
      
      // Add to sync queue if not already there
      const existingQueueItem = await tx.objectStore('syncQueue').get(annotationId);
      if (!existingQueueItem) {
        await tx.objectStore('syncQueue').put({
          id: annotationId,
          retryCount: 0,
          lastAttempt: 0,
        });
      }
      
      await tx.done;

      // Log the update
      await auditLog.record('mobile_annotation', updatedAnnotation.userId, {
        type: 'update',
        annotationId,
        updatedFields: Object.keys(updates),
        previousVersion: previousVersion.version,
        newVersion: updatedAnnotation.version,
      }, {
        missionId: updatedAnnotation.missionId,
        entityType: 'mobile_annotation',
        entityId: annotationId,
      });

      // Schedule sync
      this.syncQueue.add(annotationId);
      this.scheduleSync();

      // Broadcast update via RealtimeBridge
      realtimeBridge.broadcast({
        type: 'annotation_updated',
        payload: {
          annotationId,
          missionId: updatedAnnotation.missionId,
          userId: updatedAnnotation.userId,
          timestamp: Date.now(),
          updatedFields: Object.keys(updates),
        },
        scope: 'mission',
        target: updatedAnnotation.missionId,
      });

      return updatedAnnotation;
    } catch (error) {
      console.error('Error updating annotation:', error);
      tx.abort();
      throw error;
    }
  }

  public async deleteAnnotation(annotationId: string, userId: string): Promise<boolean> {
    const db = await this.dbPromise;
    const tx = db.transaction(['annotations', 'syncQueue', 'media'], 'readwrite');
    
    try {
      const annotation = await tx.objectStore('annotations').get(annotationId);
      if (!annotation) return false;

      // Mark as deleted instead of removing to maintain sync state
      annotation.metadata.status = 'deleted';
      annotation.synced = false;
      annotation.syncStatus = 'pending';
      
      // Update storage
      await tx.objectStore('annotations').put(annotation);
      
      // Add to sync queue if not already there
      const existingQueueItem = await tx.objectStore('syncQueue').get(annotationId);
      if (!existingQueueItem) {
        await tx.objectStore('syncQueue').put({
          id: annotationId,
          retryCount: 0,
          lastAttempt: 0,
        });
      }
      
      await tx.done;

      // Log the deletion
      await auditLog.record('mobile_annotation', userId, {
        type: 'delete',
        annotationId,
      }, {
        missionId: annotation.missionId,
        entityType: 'mobile_annotation',
        entityId: annotationId,
      });

      // Schedule sync
      this.syncQueue.add(annotationId);
      this.scheduleSync();

      // Broadcast deletion via RealtimeBridge
      realtimeBridge.broadcast({
        type: 'annotation_deleted',
        payload: {
          annotationId,
          missionId: annotation.missionId,
          userId,
          timestamp: Date.now(),
        },
        scope: 'mission',
        target: annotation.missionId,
      });

      return true;
    } catch (error) {
      console.error('Error deleting annotation:', error);
      tx.abort();
      throw error;
    }
  }

  public async getAnnotations(missionId: string, options: {
    includeDeleted?: boolean;
    includeSynced?: boolean;
    status?: string[];
    type?: string[];
    bbox?: [number, number, number, number];
    limit?: number;
    offset?: number;
    sortBy?: 'created' | 'modified' | 'type';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<MobileAnnotation[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('annotations', 'readonly');
    
    try {
      let annotations = await tx.store
        .index('by-mission')
        .getAll(IDBKeyRange.only(missionId));
      
      // Apply filters
      annotations = annotations
        .filter(a => options.includeDeleted || a.metadata.status !== 'deleted')
        .filter(a => options.includeSynced || !a.synced)
        .filter(a => !options.status || (a.metadata.status && options.status.includes(a.metadata.status)))
        .filter(a => !options.type || options.type.includes(a.type));
      
      // Apply sorting
      if (options.sortBy) {
        const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
        annotations.sort((a, b) => {
          let valA, valB;
          
          switch (options.sortBy) {
            case 'created':
              valA = a.metadata.timestamps.created;
              valB = b.metadata.timestamps.created;
              break;
            case 'modified':
              valA = a.metadata.timestamps.modified;
              valB = b.metadata.timestamps.modified;
              break;
            case 'type':
              valA = a.type;
              valB = b.type;
              break;
            default:
              return 0;
          }
          
          if (valA < valB) return -1 * sortOrder;
          if (valA > valB) return 1 * sortOrder;
          return 0;
        });
      }
      
      // Apply bbox filter if provided
      if (options.bbox) {
        const [minX, minY, maxX, maxY] = options.bbox;
        annotations = annotations.filter(a => {
          const coords = this.getBoundingCoordinates(a.geometry);
          return (
            coords.minLng >= minX &&
            coords.minLat >= minY &&
            coords.maxLng <= maxX &&
            coords.maxLat <= maxY
          );
        });
      }
      
      // Apply pagination
      const offset = options.offset || 0;
      const limit = options.limit || annotations.length;
      
      return annotations.slice(offset, offset + limit);
    } catch (error) {
      console.error('Error getting annotations:', error);
      throw error;
    }
  }

  public async getAnnotation(annotationId: string): Promise<MobileAnnotation | null> {
    const db = await this.dbPromise;
    return db.get('annotations', annotationId) || null;
  }

  public async getUnsyncedAnnotations(limit?: number): Promise<MobileAnnotation[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('annotations', 'readonly');
    
    try {
      let annotations = await tx.store
        .index('by-sync')
        .getAll(IDBKeyRange.only(false));
      
      // Filter out deleted annotations that haven't been synced yet
      annotations = annotations.filter(a => a.metadata.status !== 'deleted');
      
      return limit ? annotations.slice(0, limit) : annotations;
    } catch (error) {
      console.error('Error getting unsynced annotations:', error);
      throw error;
    }
  }

  public async getSyncStats(): Promise<{
    total: number;
    synced: number;
    pending: number;
    errors: number;
    lastSync: number | null;
    syncInProgress: boolean;
  }> {
    const db = await this.dbPromise;
    
    try {
      const [total, synced, queueCount] = await Promise.all([
        db.count('annotations'),
        db.countFromIndex('annotations', 'by-sync', IDBKeyRange.only(true)),
        db.count('syncQueue'),
      ]);
      
      return {
        total,
        synced,
        pending: queueCount,
        errors: 0, // Would need error tracking
        lastSync: 0, // Would need to track last sync time
        syncInProgress: this.syncInProgress,
      };
    } catch (error) {
      console.error('Error getting sync stats:', error);
      throw error;
    }
  }

  public async syncAnnotations(options: SyncOptions = {}): Promise<{
    success: boolean;
    synced: number;
    errors: Array<{ id: string; error: string }>;
    stats: SyncStats;
  }> {
    if (this.syncInProgress) {
      return {
        success: false,
        synced: 0,
        errors: [{ id: 'sync_in_progress', error: 'Sync already in progress' }],
        stats: this.syncStats,
      };
    }

    // Check network conditions
    const canSync = await this.checkNetworkConditions({
      ...options,
      requireCharging: options.requireCharging ?? true, // Default to requiring charging
      networkType: options.networkType ?? 'any',
    });

    if (!canSync) {
      return {
        success: false,
        synced: 0,
        errors: [{ id: 'network_conditions', error: 'Network conditions not met for sync' }],
        stats: this.syncStats,
      };
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    
    try {
      // Get items from sync queue
      const db = await this.dbPromise;
      const queueItems = await db.getAll('syncQueue');
      
      if (queueItems.length === 0) {
        return {
          success: true,
          synced: 0,
          errors: [],
          stats: this.syncStats,
        };
      }
      
      // Process in batches
      const batchSize = options.batchSize || SYNC_BATCH_SIZE;
      const batches: string[][] = [];
      
      for (let i = 0; i < queueItems.length; i += batchSize) {
        batches.push(queueItems.slice(i, i + batchSize).map(item => item.id));
      }
      
      let totalSynced = 0;
      const allErrors: Array<{ id: string; error: string }> = [];
      
      for (const batch of batches) {
        const result = await this.processSyncBatch(batch);
        totalSynced += result.synced;
        allErrors.push(...result.errors);
        
        // If we encountered errors, stop processing more batches
        if (result.errors.length > 0 && !options.force) {
          break;
        }
      }
      
      // Update sync stats
      const duration = Date.now() - startTime;
      this.syncStats = {
        success: allErrors.length === 0,
        synced: totalSynced,
        errors: allErrors,
        totalBytesTransferred: 0, // Would track actual bytes in a real implementation
        timestamp: startTime,
        duration,
      };
      
      // Log sync completion
      await auditLog.record('sync_complete', 'system', {
        type: 'sync_session',
        success: allErrors.length === 0,
        synced: totalSynced,
        errors: allErrors.length,
        duration,
      });
      
      return {
        success: allErrors.length === 0,
        synced: totalSynced,
        errors: allErrors,
        stats: this.syncStats,
      };
    } catch (error) {
      console.error('Error during sync:', error);
      
      await auditLog.record('sync_error', 'system', {
        type: 'sync_session_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    } finally {
      this.syncInProgress = false;
      
      // Notify any listeners that sync has completed
      realtimeBridge.broadcast({
        type: 'sync_complete',
        payload: {
          success: this.syncStats.success,
          synced: this.syncStats.synced,
          errors: this.syncStats.errors.length,
          timestamp: Date.now(),
        },
        scope: 'system',
      });
    }
  }

  public async exportAnnotations(options: {
    format?: 'json' | 'geojson';
    includeMedia?: boolean;
    includeSynced?: boolean;
    missionId?: string;
    userId?: string;
    bbox?: [number, number, number, number];
  } = {}): Promise<string | object> {
    const db = await this.dbPromise;
    const tx = db.transaction(['annotations', 'media'], 'readonly');
    
    try {
      let annotations: MobileAnnotation[] = [];
      
      if (options.missionId) {
        annotations = await tx.objectStore('annotations')
          .index('by-mission')
          .getAll(IDBKeyRange.only(options.missionId));
      } else if (options.userId) {
        annotations = await tx.objectStore('annotations')
          .index('by-user')
          .getAll(IDBKeyRange.only(options.userId));
      } else {
        annotations = await tx.objectStore('annotations').getAll();
      }
      
      // Apply filters
      annotations = annotations
        .filter(a => options.includeSynced || !a.synced)
        .filter(a => a.metadata.status !== 'deleted');
      
      // Apply bbox filter if provided
      if (options.bbox) {
        const [minX, minY, maxX, maxY] = options.bbox;
        annotations = annotations.filter(a => {
          const coords = this.getBoundingCoordinates(a.geometry);
          return (
            coords.minLng >= minX &&
            coords.minLat >= minY &&
            coords.maxLng <= maxX &&
            coords.maxLat <= maxY
          );
        });
      }
      
      // Process media if needed
      if (options.includeMedia) {
        for (const annotation of annotations) {
          if (annotation.metadata.media?.length) {
            const mediaItems = await Promise.all(
              annotation.metadata.media.map(async media => {
                if (media.storagePath) {
                  try {
                    const mediaData = await tx.objectStore('media').get(media.id);
                    if (mediaData) {
                      return {
                        ...media,
                        data: await mediaData.data.text(), // Convert Blob to text for JSON
                      };
                    }
                  } catch (error) {
                    console.error(`Error loading media ${media.id}:`, error);
                  }
                }
                return media;
              })
            );
            annotation.metadata.media = mediaItems;
          }
        }
      }
      
      await tx.done;

      if (options.format === 'geojson') {
        const featureCollection: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: annotations.map(a => ({
            type: 'Feature',
            id: a.id,
            geometry: a.geometry,
            properties: {
              ...a.properties,
              _metadata: {
                ...a.metadata,
                // Exclude media URIs from GeoJSON by default
                media: options.includeMedia ? a.metadata.media : undefined,
              },
              _type: a.type,
              _userId: a.userId,
              _missionId: a.missionId,
              _featureId: a.featureId,
              _version: a.version,
              _synced: a.synced,
              _createdAt: a.metadata.timestamps.created,
              _modifiedAt: a.metadata.timestamps.modified,
            },
          })),
        };
        
        return options.format === 'geojson' 
          ? JSON.stringify(featureCollection, null, 2) 
          : featureCollection;
      }

      // Default to full JSON export
      return options.format === 'json' 
        ? JSON.stringify(annotations, null, 2)
        : annotations;
    } catch (error) {
      console.error('Error exporting annotations:', error);
      throw error;
    }
  }

  // --- Helper Methods ---

  private calculateChanges(previous: MobileAnnotation, current: MobileAnnotation): Record<string, { from: any; to: any }> {
    const changes: Record<string, { from: any; to: any }> = {};
    
    // Compare top-level properties
    const topLevelKeys: Array<keyof MobileAnnotation> = ['type', 'version', 'synced'];
    for (const key of topLevelKeys) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
        changes[key] = { from: previous[key], to: current[key] };
      }
    }
    
    // Compare geometry
    if (JSON.stringify(previous.geometry) !== JSON.stringify(current.geometry)) {
      changes.geometry = { from: previous.geometry, to: current.geometry };
    }
    
    // Compare properties
    const allPropertyKeys = new Set([
      ...Object.keys(previous.properties || {}),
      ...Object.keys(current.properties || {}),
    ]);
    
    for (const key of allPropertyKeys) {
      if (JSON.stringify(previous.properties[key]) !== JSON.stringify(current.properties[key])) {
        if (!changes.properties) changes.properties = { from: {}, to: {} };
        changes.properties.from[key] = previous.properties[key];
        changes.properties.to[key] = current.properties[key];
      }
    }
    
    // Compare metadata
    const metadataKeys: Array<keyof MobileAnnotation['metadata']> = [
      'status', 'tags', 'validation'
    ];
    
    for (const key of metadataKeys) {
      if (JSON.stringify(previous.metadata[key]) !== JSON.stringify(current.metadata[key])) {
        if (!changes.metadata) changes.metadata = { from: {}, to: {} };
        changes.metadata.from[key] = previous.metadata[key];
        changes.metadata.to[key] = current.metadata[key];
      }
    }
    
    // Compare GNSS data
    const gnssKeys: Array<keyof GNSSMetadata> = ['accuracy', 'altitude', 'hdop', 'vdop', 'pdop', 'satCount', 'fixType'];
    for (const key of gnssKeys) {
      if (JSON.stringify(previous.metadata.gnss[key]) !== JSON.stringify(current.metadata.gnss[key])) {
        if (!changes.gnss) changes.gnss = { from: {}, to: {} };
        changes.gnss.from[key] = previous.metadata.gnss[key];
        changes.gnss.to[key] = current.metadata.gnss[key];
      }
    }
    
    return changes;
  }

  private getBoundingCoordinates(geometry: GeoJSONGeometry): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
    let coords: number[][] = [];
    
    const processCoordinates = (coordinates: any[]): void => {
      if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
        // This is an array of coordinates
        coordinates.forEach(coord => processCoordinates(coord));
      } else if (typeof coordinates[0] === 'number') {
        // This is a coordinate pair [lng, lat]
        coords.push(coordinates);
      }
    };
    
    processCoordinates(geometry.coordinates);
    
    if (coords.length === 0) {
      return { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 };
    }
    
    return {
      minLng: Math.min(...coords.map(c => c[0])),
      minLat: Math.min(...coords.map(c => c[1])),
      maxLng: Math.max(...coords.map(c => c[0])),
      maxLat: Math.max(...coords.map(c => c[1])),
    };
  }

  private triggerSyncEvent(details: { type: string; [key: string]: any }): void {
    realtimeBridge.broadcast({
      type: `mobile_sync_${details.type}`,
      payload: details,
      scope: 'system',
    });
  }
}

// Singleton instance
export const mobileBridge = MobileBridge.getInstance();

export type { MobileAnnotation, GeoJSONGeometry, GNSSMetadata, MediaAttachment };
