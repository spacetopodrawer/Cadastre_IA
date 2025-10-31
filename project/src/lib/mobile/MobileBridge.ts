import { v4 as uuidv4 } from 'uuid';
import { auditLog } from '../audit/FusionAuditLog';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { userReputationManager } from '../reputation/UserReputation';
import { cartoValidator } from '../validation/CartoValidator';

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
};

type MediaAttachment = {
  type: 'photo' | 'audio' | 'video' | 'document';
  uri: string;
  mimeType: string;
  size: number; // in bytes
  width?: number;
  height?: number;
  duration?: number; // for audio/video, in seconds
  thumbnail?: string; // base64 or URL to thumbnail
};

type MobileAnnotation = {
  id: string;
  userId: string;
  missionId: string;
  featureId?: string; // If linked to an existing feature
  type: string; // e.g., 'damage', 'new_feature', 'correction'
  geometry: GeoJSONGeometry;
  properties: Record<string, any>;
  metadata: {
    gnss: GNSSMetadata;
    deviceInfo: {
      id: string;
      model: string;
      os: string;
      appVersion: string;
    };
    timestamps: {
      created: number;
      modified: number;
      synced?: number;
    };
    media?: MediaAttachment[];
    tags?: string[];
    status: 'draft' | 'submitted' | 'validated' | 'rejected';
    validation?: {
      validatedBy?: string;
      validatedAt?: number;
      comment?: string;
    };
  };
  version: number;
  synced: boolean;
  offlineId?: string; // For conflict resolution
};

type SyncOptions = {
  retryCount?: number;
  timeout?: number;
  force?: boolean;
};

export class MobileBridge {
  private static instance: MobileBridge;
  private localStore: Map<string, MobileAnnotation> = new Map();
  private syncQueue: Set<string> = new Set();
  private syncInProgress = false;
  private readonly STORAGE_KEY = 'mobile_annotations';
  private readonly SYNC_DEBOUNCE = 5000; // 5 seconds
  private syncTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadFromStorage();
    this.setupEventListeners();
  }

  public static getInstance(): MobileBridge {
    if (!MobileBridge.instance) {
      MobileBridge.instance = new MobileBridge();
    }
    return MobileBridge.instance;
  }

  /**
   * Capture a new annotation from mobile device
   */
  public captureAnnotation(params: {
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
    };
    media?: MediaAttachment[];
    tags?: string[];
  }): MobileAnnotation {
    const now = Date.now();
    const annotation: MobileAnnotation = {
      id: `mob_${uuidv4()}`,
      userId: params.userId,
      missionId: params.missionId,
      featureId: params.featureId,
      type: params.type,
      geometry: params.geometry,
      properties: params.properties,
      metadata: {
        gnss: params.gnss,
        deviceInfo: params.deviceInfo,
        timestamps: {
          created: now,
          modified: now,
        },
        media: params.media || [],
        tags: params.tags || [],
        status: 'draft',
      },
      version: 1,
      synced: false,
      offlineId: `offline_${now}_${Math.floor(Math.random() * 1000)}`,
    };

    this.localStore.set(annotation.id, annotation);
    this.syncQueue.add(annotation.id);
    this.scheduleSync();
    this.saveToStorage();

    // Log the capture
    auditLog.record('mobile_annotation', params.userId, {
      type: 'capture',
      annotationId: annotation.id,
      featureId: annotation.featureId,
      geometryType: annotation.geometry.type,
      hasMedia: (params.media?.length || 0) > 0,
    }, {
      missionId: params.missionId,
      entityType: 'mobile_annotation',
      entityId: annotation.id,
    });

    return annotation;
  }

  /**
   * Update an existing annotation
   */
  public updateAnnotation(annotationId: string, updates: Partial<MobileAnnotation>): MobileAnnotation | null {
    const annotation = this.localStore.get(annotationId);
    if (!annotation) return null;

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
      },
      version: annotation.version + 1,
      synced: false,
    };

    this.localStore.set(annotationId, updatedAnnotation);
    this.syncQueue.add(annotationId);
    this.scheduleSync();
    this.saveToStorage();

    // Log the update
    auditLog.record('mobile_annotation', annotation.userId, {
      type: 'update',
      annotationId,
      updatedFields: Object.keys(updates),
    }, {
      missionId: annotation.missionId,
      entityType: 'mobile_annotation',
      entityId: annotationId,
    });

    return updatedAnnotation;
  }

  /**
   * Delete an annotation
   */
  public deleteAnnotation(annotationId: string, userId: string): boolean {
    const annotation = this.localStore.get(annotationId);
    if (!annotation) return false;

    // Mark as deleted instead of removing to maintain sync state
    annotation.metadata.status = 'deleted';
    annotation.synced = false;
    this.localStore.set(annotationId, annotation);
    this.syncQueue.add(annotationId);
    this.scheduleSync();
    this.saveToStorage();

    // Log the deletion
    auditLog.record('mobile_annotation', userId, {
      type: 'delete',
      annotationId,
    }, {
      missionId: annotation.missionId,
      entityType: 'mobile_annotation',
      entityId: annotationId,
    });

    return true;
  }

  /**
   * Get all annotations for a mission
   */
  public getAnnotations(missionId: string, options: {
    includeDeleted?: boolean;
    includeSynced?: boolean;
    status?: string[];
    type?: string[];
    bbox?: [number, number, number, number]; // [minX, minY, maxX, maxY]
  } = {}): MobileAnnotation[] {
    const annotations = Array.from(this.localStore.values())
      .filter(a => a.missionId === missionId)
      .filter(a => options.includeDeleted || a.metadata.status !== 'deleted')
      .filter(a => options.includeSynced || !a.synced)
      .filter(a => !options.status || (a.metadata.status && options.status.includes(a.metadata.status)))
      .filter(a => !options.type || options.type.includes(a.type));

    // Simple bounding box filter if provided
    if (options.bbox) {
      const [minX, minY, maxX, maxY] = options.bbox;
      return annotations.filter(a => {
        const coords = this.getBoundingCoordinates(a.geometry);
        return (
          coords.minLng >= minX &&
          coords.minLat >= minY &&
          coords.maxLng <= maxX &&
          coords.maxLat <= maxY
        );
      });
    }

    return annotations;
  }

  /**
   * Get unsynced annotations
   */
  public getUnsyncedAnnotations(): MobileAnnotation[] {
    return Array.from(this.localStore.values())
      .filter(a => !a.synced && a.metadata.status !== 'deleted');
  }

  /**
   * Synchronize annotations with the server
   */
  public async syncAnnotations(options: SyncOptions = {}): Promise<{
    success: boolean;
    synced: number;
    errors: Array<{ id: string; error: any }>;
  }> {
    if (this.syncInProgress) {
      return { success: false, synced: 0, errors: [{ id: 'sync_in_progress', error: 'Sync already in progress' }] };
    }

    this.syncInProgress = true;
    const errors: Array<{ id: string; error: any }> = [];
    let syncedCount = 0;

    try {
      const annotationsToSync = Array.from(this.syncQueue)
        .map(id => this.localStore.get(id))
        .filter((a): a is MobileAnnotation => a !== undefined);

      for (const annotation of annotationsToSync) {
        try {
          // In a real implementation, this would be an API call to your backend
          // const result = await api.syncAnnotation(annotation);
          const result = { success: true, id: annotation.id };

          if (result.success) {
            annotation.synced = true;
            annotation.metadata.timestamps.synced = Date.now();
            this.localStore.set(annotation.id, annotation);
            this.syncQueue.delete(annotation.id);
            syncedCount++;

            // Update user reputation for contributions
            if (annotation.metadata.status === 'submitted') {
              userReputationManager.recordEvent({
                userId: annotation.userId,
                type: 'annotation_submitted',
                weight: 1.0,
                metadata: {
                  annotationId: annotation.id,
                  missionId: annotation.missionId,
                  type: annotation.type,
                },
              });
            }
          }
        } catch (error) {
          console.error(`Failed to sync annotation ${annotation.id}:`, error);
          errors.push({
            id: annotation.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.saveToStorage();
      return { success: errors.length === 0, synced: syncedCount, errors };
    } finally {
      this.syncInProgress = false;
      this.triggerSyncEvent({
        type: 'sync_complete',
        success: errors.length === 0,
        synced: syncedCount,
        errors: errors.length,
      });
    }
  }

  /**
   * Export annotations for backup or transfer
   */
  public exportAnnotations(options: {
    format?: 'json' | 'geojson';
    includeMedia?: boolean;
  } = {}): string | object {
    const annotations = Array.from(this.localStore.values())
      .filter(a => a.metadata.status !== 'deleted');

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
              // Optionally exclude media for smaller exports
              media: options.includeMedia ? a.metadata.media : undefined,
            },
            _type: a.type,
            _userId: a.userId,
            _missionId: a.missionId,
            _featureId: a.featureId,
            _version: a.version,
            _synced: a.synced,
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
  }

  // --- Internal Methods ---

  private scheduleSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      this.syncAnnotations().catch(console.error);
    }, this.SYNC_DEBOUNCE);
  }

  private saveToStorage(): void {
    try {
      const data = JSON.stringify(Array.from(this.localStore.entries()));
      localStorage.setItem(this.STORAGE_KEY, data);
    } catch (error) {
      console.error('Failed to save annotations to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const entries = JSON.parse(data) as [string, MobileAnnotation][];
        this.localStore = new Map(entries);
        
        // Rebuild sync queue
        for (const [id, annotation] of entries) {
          if (!annotation.synced) {
            this.syncQueue.add(id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load annotations from storage:', error);
    }
  }

  private getBoundingCoordinates(geometry: GeoJSONGeometry): {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } {
    // Extract all coordinates from the geometry
    const coords: number[][] = [];
    
    const extractCoords = (array: any[]): void => {
      if (Array.isArray(array[0]) && typeof array[0][0] === 'number') {
        // This is a coordinate array
        coords.push(...array);
      } else {
        // Go deeper
        array.forEach(item => extractCoords(item));
      }
    };

    extractCoords(geometry.coordinates);

    // Calculate bounds
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);

    return {
      minLng: Math.min(...lngs),
      minLat: Math.min(...lats),
      maxLng: Math.max(...lngs),
      maxLat: Math.max(...lats),
    };
  }

  private setupEventListeners(): void {
    // Listen for network status changes
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.triggerSyncEvent({ type: 'network_online' });
        this.syncAnnotations().catch(console.error);
      });

      window.addEventListener('offline', () => {
        this.triggerSyncEvent({ type: 'network_offline' });
      });
    }

    // Listen for validation events
    realtimeBridge.subscribe('validation', 'mobile_bridge', (event) => {
      if (event.type === 'validation_result' && event.annotationId) {
        const annotation = this.localStore.get(event.annotationId);
        if (annotation) {
          annotation.metadata.status = event.isValid ? 'validated' : 'rejected';
          annotation.metadata.validation = {
            validatedBy: event.validatorId,
            validatedAt: Date.now(),
            comment: event.comment,
          };
          this.localStore.set(annotation.id, annotation);
          this.saveToStorage();

          // Notify the app about the validation
          this.triggerSyncEvent({
            type: 'annotation_validated',
            annotationId: annotation.id,
            isValid: event.isValid,
            validatorId: event.validatorId,
          });
        }
      }
    });
  }

  private triggerSyncEvent(event: {
    type: string;
    [key: string]: any;
  }): void {
    realtimeBridge.broadcast('mobile_sync', event, undefined, 'system');
  }
}

// Singleton instance
export const mobileBridge = MobileBridge.getInstance();

export type { MobileAnnotation, GeoJSONGeometry, GNSSMetadata, MediaAttachment };
