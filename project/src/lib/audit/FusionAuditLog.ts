import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { realtimeBridge } from '../realtime/RealtimeBridge';

export type AuditEventType = 
  | 'validation' 
  | 'suggestion' 
  | 'export' 
  | 'import' 
  | 'conflict' 
  | 'vote' 
  | 'discussion' 
  | 'reputation' 
  | 'realtime'
  | 'system';

export interface AuditEvent<T = Record<string, any>> {
  /** Unique identifier for the event */
  id: string;
  
  /** Type of the event */
  type: AuditEventType;
  
  /** When the event occurred (UNIX timestamp in milliseconds) */
  timestamp: number;
  
  /** ID of the user who triggered the event (or 'system' for automated events) */
  userId: string;
  
  /** Optional mission ID for mission-specific events */
  missionId?: string;
  
  /** Entity type this event relates to (e.g., 'feature', 'validation', 'user') */
  entityType?: string;
  
  /** ID of the entity this event relates to */
  entityId?: string;
  
  /** Event-specific data */
  payload: T;
  
  /** Cryptographic hash for integrity verification */
  hash: string;
  
  /** Optional IP address of the client (for web-based actions) */
  ipAddress?: string;
  
  /** Optional user agent string (for web-based actions) */
  userAgent?: string;
  
  /** Optional correlation ID for tracing related events */
  correlationId?: string;
}

interface FusionAuditLogConfig {
  /** Maximum number of events to keep in memory (default: 10,000) */
  maxInMemoryEvents?: number;
  
  /** Whether to persist events to localStorage (default: true) */
  persistToStorage?: boolean;
  
  /** Storage key for persisted events (default: 'fusion_audit_events') */
  storageKey?: string;
  
  /** Whether to broadcast events in real-time (default: true) */
  enableRealtime?: boolean;
  
  /** Secret key for HMAC (if not provided, will use a less secure method) */
  secretKey?: string;
}

const DEFAULT_CONFIG: Required<FusionAuditLogConfig> = {
  maxInMemoryEvents: 10000,
  persistToStorage: true,
  storageKey: 'fusion_audit_events',
  enableRealtime: true,
  secretKey: 'default-insecure-key-change-me-in-production'
};

export class FusionAuditLog {
  private events: AuditEvent[] = [];
  private config: Required<FusionAuditLog>;
  
  constructor(config: FusionAuditLogConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
    this.setupCleanupListener();
  }
  
  /**
   * Record a new audit event
   */
  public record<T = Record<string, any>>(
    type: AuditEventType,
    userId: string,
    payload: T,
    options: {
      missionId?: string;
      entityType?: string;
      entityId?: string;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ): AuditEvent<T> {
    const timestamp = Date.now();
    const id = uuidv4();
    
    const event: AuditEvent<T> = {
      id,
      type,
      timestamp,
      userId,
      missionId: options.missionId,
      entityType: options.entityType,
      entityId: options.entityId,
      payload,
      hash: '', // Will be set after creation
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      correlationId: options.correlationId
    };
    
    // Generate hash for the event
    event.hash = this.generateHash(event);
    
    // Add to in-memory store
    this.events.push(event as AuditEvent);
    
    // Persist to storage if enabled
    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
    
    // Broadcast in real-time if enabled
    if (this.config.enableRealtime) {
      this.broadcastEvent(event);
    }
    
    return event;
  }
  
  /**
   * Verify the integrity of an event
   */
  public verifyIntegrity(event: AuditEvent): boolean {
    // Create a copy of the event without the hash
    const { hash, ...eventWithoutHash } = event;
    const calculatedHash = this.generateHash(eventWithoutHash);
    
    return calculatedHash === hash;
  }
  
  /**
   * Get events filtered by various criteria
   */
  public getEvents(filters: {
    userId?: string;
    missionId?: string;
    type?: AuditEventType;
    entityType?: string;
    entityId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): AuditEvent[] {
    let events = [...this.events];
    
    // Apply filters
    if (filters.userId) {
      events = events.filter(e => e.userId === filters.userId);
    }
    
    if (filters.missionId) {
      events = events.filter(e => e.missionId === filters.missionId);
    }
    
    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }
    
    if (filters.entityType) {
      events = events.filter(e => e.entityType === filters.entityType);
    }
    
    if (filters.entityId) {
      events = events.filter(e => e.entityId === filters.entityId);
    }
    
    if (filters.startTime) {
      events = events.filter(e => e.timestamp >= filters.startTime!);
    }
    
    if (filters.endTime) {
      events = events.filter(e => e.timestamp <= filters.endTime!);
    }
    
    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply limit
    if (filters.limit) {
      events = events.slice(0, filters.limit);
    }
    
    return events;
  }
  
  /**
   * Get recent events with optional filters
   */
  public getRecentEvents(limit: number = 50): AuditEvent[] {
    return this.getEvents({ limit });
  }
  
  /**
   * Get events for a specific user
   */
  public getEventsByUser(userId: string, limit: number = 100): AuditEvent[] {
    return this.getEvents({ userId, limit });
  }
  
  /**
   * Get events for a specific mission
   */
  public getEventsByMission(missionId: string, limit: number = 100): AuditEvent[] {
    return this.getEvents({ missionId, limit });
  }
  
  /**
   * Export events for backup or analysis
   */
  public exportEvents(format: 'json' | 'csv' = 'json'): string {
    const events = [...this.events];
    
    if (format === 'csv') {
      // Convert to CSV
      const headers = [
        'id', 'type', 'timestamp', 'userId', 'missionId', 'entityType', 'entityId', 'hash'
      ];
      
      const rows = events.map(event => {
        return [
          `"${event.id}"`,
          `"${event.type}"`,
          event.timestamp,
          `"${event.userId}"`,
          event.missionId ? `"${event.missionId}"` : '',
          event.entityType ? `"${event.entityType}"` : '',
          event.entityId ? `"${event.entityId}"` : '',
          `"${event.hash}"`
        ].join(',');
      });
      
      return [headers.join(','), ...rows].join('\n');
    }
    
    // Default to JSON
    return JSON.stringify(events, null, 2);
  }
  
  /**
   * Clear all events (use with caution!)
   */
  public clearEvents(): void {
    this.events = [];
    if (this.config.persistToStorage) {
      localStorage.removeItem(this.config.storageKey);
    }
  }
  
  // Private methods
  
  private generateHash(event: Omit<AuditEvent, 'hash'>): string {
    // Create a stable string representation of the event
    const { payload, ...rest } = event;
    const eventString = JSON.stringify({
      ...rest,
      payload: typeof payload === 'object' ? this.sortObjectKeys(payload) : payload
    });
    
    // Use HMAC with secret key if available, otherwise use a simple hash
    if (this.config.secretKey) {
      return createHash('sha256')
        .update(eventString + this.config.secretKey)
        .digest('hex');
    } else {
      // Fallback to a simpler hash (less secure)
      let hash = 0;
      for (let i = 0; i < eventString.length; i++) {
        const char = eventString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return `h${Math.abs(hash).toString(36)}`;
    }
  }
  
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    const sorted: Record<string, any> = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObjectKeys(obj[key]);
    });
    
    return sorted;
  }
  
  private saveToStorage(): void {
    try {
      // Only keep the most recent events up to maxInMemoryEvents
      const eventsToSave = this.events.slice(-this.config.maxInMemoryEvents);
      localStorage.setItem(
        this.config.storageKey,
        JSON.stringify(eventsToSave)
      );
    } catch (error) {
      console.error('Failed to save audit events to storage:', error);
    }
  }
  
  private loadFromStorage(): void {
    if (!this.config.persistToStorage) return;
    
    try {
      const saved = localStorage.getItem(this.config.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AuditEvent[];
        this.events = parsed;
        
        // Verify integrity of loaded events
        const invalidEvents = this.events.filter(e => !this.verifyIntegrity(e));
        if (invalidEvents.length > 0) {
          console.warn(
            `Found ${invalidEvents.length} events with invalid hashes. ` +
            'This may indicate tampering or corruption.'
          );
        }
      }
    } catch (error) {
      console.error('Failed to load audit events from storage:', error);
    }
  }
  
  private broadcastEvent(event: AuditEvent): void {
    if (this.config.enableRealtime) {
      realtimeBridge.broadcast('audit', {
        type: 'audit_event',
        event: {
          ...event,
          // Don't include sensitive data in real-time events
          payload: this.sanitizePayload(event.payload)
        }
      }, event.missionId, event.userId);
    }
  }
  
  private sanitizePayload(payload: any): any {
    if (payload === null || typeof payload !== 'object') {
      return payload;
    }
    
    // Create a shallow copy to avoid modifying the original
    const sanitized = { ...payload };
    
    // Remove potentially sensitive fields
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'auth', 'credentials',
      'accessToken', 'refreshToken', 'privateKey'
    ];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }
    
    return sanitized;
  }
  
  private setupCleanupListener(): void {
    // Clean up old events periodically
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      // Keep events from the last 30 days + the most recent maxInMemoryEvents
      const recentEvents = this.events
        .filter(e => e.timestamp >= thirtyDaysAgo)
        .slice(-this.config.maxInMemoryEvents);
      
      if (recentEvents.length < this.events.length) {
        this.events = recentEvents;
        if (this.config.persistToStorage) {
          this.saveToStorage();
        }
      }
    }, 24 * 60 * 60 * 1000); // Run once per day
    
    // Clean up on window unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        clearInterval(cleanupInterval);
      });
    }
  }
}

// Singleton instance
export const auditLog = new FusionAuditLog();

// Helper function for logging common event types
export const logEvent = {
  validation: (
    userId: string,
    action: 'approve' | 'reject' | 'modify' | 'comment',
    entityId: string,
    entityType: string,
    missionId?: string,
    details?: Record<string, any>
  ) => {
    return auditLog.record('validation', userId, {
      action,
      entityId,
      entityType,
      ...details
    }, { missionId, entityType, entityId });
  },
  
  conflict: (
    userId: string,
    conflictId: string,
    action: 'created' | 'resolved' | 'voted' | 'commented',
    missionId?: string,
    details?: Record<string, any>
  ) => {
    return auditLog.record('conflict', userId, {
      action,
      conflictId,
      ...details
    }, { missionId, entityType: 'conflict', entityId: conflictId });
  },
  
  system: (
    message: string,
    details?: Record<string, any>,
    userId: string = 'system'
  ) => {
    return auditLog.record('system', userId, {
      message,
      ...details
    });
  }
};

export default auditLog;
