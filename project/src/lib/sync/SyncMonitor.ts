import { FusionAuditLog } from '../audit/FusionAuditLog';
import { UserRoleManager } from '../auth/UserRoleManager';

type SyncSource = 'mobile' | 'system' | 'user' | 'IA';
type SyncStatus = 'success' | 'error' | 'conflict' | 'pending' | 'warning' | 'retrying';
type AdminActionType = 'grant' | 'revoke' | 'delete' | 'hide' | 'restore';
type PermissionScope = 'annotation' | 'syncEvent' | 'auditLog' | 'admin' | 'export';

interface SyncEvent {
  id: string;
  source: SyncSource;
  userId?: string;
  missionId: string;
  featureId?: string;
  status: SyncStatus;
  message?: string;
  timestamp: number;
  metadata?: Record<string, any>;
  relatedEvents?: string[];
  retryCount?: number;
}

interface SuperAdminAction {
  id: string;
  actorId: string;
  targetId?: string;
  action: AdminActionType;
  scope: PermissionScope;
  reason: string;
  timestamp: number;
  metadata?: Record<string, any>;
  affectedItems?: string[];
}

interface Permission {
  scope: PermissionScope;
  grantedAt: number;
  grantedBy: string;
  expiresAt?: number;
  metadata?: Record<string, any>;
}

interface SyncMonitorOptions {
  maxEventsPerMission?: number;
  retentionDays?: number;
  maxRetryAttempts?: number;
  cleanupInterval?: number;
}

export class SyncMonitor {
  private events: Map<string, SyncEvent> = new Map();
  private superActions: Map<string, SuperAdminAction> = new Map();
  private userPermissions: Map<string, Map<PermissionScope, Permission>> = new Map();
  private options: Required<SyncMonitorOptions>;
  private cleanupInterval?: NodeJS.Timeout;
  private eventIndex: Map<string, Set<string>> = new Map(); // missionId → Set<eventId>
  private userEventIndex: Map<string, Set<string>> = new Map(); // userId → Set<eventId>

  constructor(options: SyncMonitorOptions = {}) {
    this.options = {
      maxEventsPerMission: 10000,
      retentionDays: 90,
      maxRetryAttempts: 3,
      cleanupInterval: 3600000, // 1 hour
      ...options
    };
  }

  /**
   * Initialize the SyncMonitor with cleanup interval
   */
  initialize(): void {
    this.scheduleCleanup();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Log a synchronization event
   */
  logSyncEvent(event: Omit<SyncEvent, 'id' | 'timestamp' | 'retryCount'>): SyncEvent {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    const fullEvent: SyncEvent = { 
      ...event, 
      id, 
      timestamp, 
      retryCount: 0,
      metadata: event.metadata || {}
    };

    // Store the event
    this.events.set(id, fullEvent);

    // Update indices
    this.addToIndex(fullEvent);

    // Log to audit log
    FusionAuditLog.record(
      'sync_event', 
      event.userId || 'system', 
      { 
        eventId: id,
        source: event.source,
        status: event.status,
        missionId: event.missionId,
        featureId: event.featureId
      },
      event.missionId
    );

    // If it's an error, check for similar recent errors
    if (event.status === 'error' || event.status === 'conflict') {
      this.checkForErrorPatterns(fullEvent);
    }

    return fullEvent;
  }

  /**
   * Retry a failed sync event
   */
  async retrySyncEvent(eventId: string, userId: string): Promise<SyncEvent | null> {
    const event = this.events.get(eventId);
    if (!event || event.status === 'success') {
      return null;
    }

    if (event.retryCount && event.retryCount >= this.options.maxRetryAttempts) {
      throw new Error(`Maximum retry attempts (${this.options.maxRetryAttempts}) exceeded`);
    }

    // Update the event
    const updatedEvent: SyncEvent = {
      ...event,
      status: 'retrying' as const,
      retryCount: (event.retryCount || 0) + 1,
      metadata: {
        ...event.metadata,
        lastRetry: new Date().toISOString(),
        retryBy: userId
      }
    };

    this.events.set(eventId, updatedEvent);

    // Here you would typically trigger the actual sync operation
    // For example: await someSyncService.retrySync(event);
    
    return updatedEvent;
  }

  /**
   * Get events filtered by various criteria
   */
  getEvents(filters: {
    missionId?: string;
    userId?: string;
    source?: SyncSource;
    status?: SyncStatus;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): SyncEvent[] {
    let events = Array.from(this.events.values());

    if (filters.missionId) {
      const eventIds = this.eventIndex.get(filters.missionId);
      if (eventIds) {
        events = events.filter(e => eventIds.has(e.id));
      } else {
        return [];
      }
    }

    if (filters.userId) {
      const eventIds = this.userEventIndex.get(filters.userId);
      if (eventIds) {
        events = events.filter(e => eventIds.has(e.id));
      } else {
        return [];
      }
    }

    if (filters.source) {
      events = events.filter(e => e.source === filters.source);
    }

    if (filters.status) {
      events = events.filter(e => e.status === filters.status);
    }

    if (filters.startTime) {
      events = events.filter(e => e.timestamp >= filters.startTime!);
    }

    if (filters.endTime) {
      events = events.filter(e => e.timestamp <= filters.endTime!);
    }

    if (filters.limit) {
      events = events.slice(0, filters.limit);
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get sync statistics
   */
  getSyncStats(missionId?: string) {
    const events = missionId 
      ? this.getEvents({ missionId }) 
      : Array.from(this.events.values());

    const stats = {
      total: events.length,
      byStatus: {} as Record<SyncStatus, number>,
      bySource: {} as Record<SyncSource, number>,
      lastSync: events[0]?.timestamp || null,
      errorRate: 0,
      successRate: 0
    };

    // Initialize counters
    const statuses: SyncStatus[] = ['success', 'error', 'conflict', 'pending', 'warning', 'retrying'];
    const sources: SyncSource[] = ['mobile', 'system', 'user', 'IA'];
    
    statuses.forEach(s => stats.byStatus[s] = 0);
    sources.forEach(s => stats.bySource[s] = 0);

    // Count events
    events.forEach(event => {
      stats.byStatus[event.status]++;
      stats.bySource[event.source]++;
    });

    // Calculate rates
    if (events.length > 0) {
      stats.errorRate = (stats.byStatus.error + stats.byStatus.conflict) / events.length;
      stats.successRate = stats.byStatus.success / events.length;
    }

    return stats;
  }

  /**
   * Grant permissions to a user
   */
  grantPermission(actorId: string, targetId: string, scope: PermissionScope, reason: string, metadata: Record<string, any> = {}): void {
    this.verifyAdminPrivileges(actorId);
    
    const action: SuperAdminAction = {
      id: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      actorId,
      targetId,
      action: 'grant',
      scope,
      reason,
      timestamp: Date.now(),
      metadata,
      affectedItems: [targetId]
    };

    this.recordAdminAction(action);

    // Update permissions
    const userPerms = this.userPermissions.get(targetId) || new Map<PermissionScope, Permission>();
    userPerms.set(scope, {
      scope,
      grantedAt: Date.now(),
      grantedBy: actorId,
      metadata
    });
    
    this.userPermissions.set(targetId, userPerms);
  }

  /**
   * Revoke permissions from a user
   */
  revokePermission(actorId: string, targetId: string, scope: PermissionScope, reason: string): void {
    this.verifyAdminPrivileges(actorId);
    
    const action: SuperAdminAction = {
      id: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      actorId,
      targetId,
      action: 'revoke',
      scope,
      reason,
      timestamp: Date.now(),
      affectedItems: [targetId]
    };

    this.recordAdminAction(action);

    // Update permissions
    const userPerms = this.userPermissions.get(targetId);
    if (userPerms) {
      userPerms.delete(scope);
      if (userPerms.size === 0) {
        this.userPermissions.delete(targetId);
      }
    }
  }

  /**
   * Delete or hide items based on scope
   */
  deleteOrHideItem(
    actorId: string, 
    scope: 'annotation' | 'syncEvent' | 'auditLog', 
    targetId: string, 
    action: 'delete' | 'hide',
    reason: string,
    metadata: Record<string, any> = {}
  ): void {
    this.verifyAdminPrivileges(actorId);

    const adminAction: SuperAdminAction = {
      id: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      actorId,
      targetId,
      action,
      scope,
      reason,
      timestamp: Date.now(),
      metadata,
      affectedItems: [targetId]
    };

    this.recordAdminAction(adminAction);

    // Perform the actual deletion/hiding based on scope
    switch (scope) {
      case 'syncEvent':
        if (action === 'delete') {
          this.events.delete(targetId);
        } else {
          const event = this.events.get(targetId);
          if (event) {
            event.metadata = event.metadata || {};
            event.metadata.hidden = true;
            event.metadata.hiddenBy = actorId;
            event.metadata.hiddenAt = new Date().toISOString();
            event.metadata.hiddenReason = reason;
          }
        }
        break;
      
      // Handle other scopes (annotation, auditLog) similarly
      // This would typically involve calling the appropriate service
      
      default:
        throw new Error(`Unsupported scope for ${action}: ${scope}`);
    }
  }

  /**
   * Check if a user has a specific permission
   */
  hasPermission(userId: string, scope: PermissionScope): boolean {
    // Super admins have all permissions
    if (UserRoleManager.isSuperAdmin(userId)) {
      return true;
    }

    const userPerms = this.userPermissions.get(userId);
    if (!userPerms) return false;

    const perm = userPerms.get(scope);
    if (!perm) return false;

    // Check if permission is expired
    if (perm.expiresAt && perm.expiresAt < Date.now()) {
      userPerms.delete(scope);
      if (userPerms.size === 0) {
        this.userPermissions.delete(userId);
      }
      return false;
    }

    return true;
  }

  /**
   * Get all permissions for a user
   */
  getUserPermissions(userId: string): Permission[] {
    const userPerms = this.userPermissions.get(userId);
    if (!userPerms) return [];

    // Filter out expired permissions
    const now = Date.now();
    const validPerms = Array.from(userPerms.entries())
      .filter(([_, perm]) => !perm.expiresAt || perm.expiresAt > now);

    // Update the stored permissions
    if (validPerms.length !== userPerms.size) {
      const newPerms = new Map(validPerms);
      if (newPerms.size > 0) {
        this.userPermissions.set(userId, newPerms);
      } else {
        this.userPermissions.delete(userId);
      }
    }

    return validPerms.map(([_, perm]) => perm);
  }

  /**
   * Get all admin actions with optional filtering
   */
  getAdminActions(filters: {
    actorId?: string;
    targetId?: string;
    action?: AdminActionType;
    scope?: PermissionScope;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): SuperAdminAction[] {
    let actions = Array.from(this.superActions.values());

    if (filters.actorId) {
      actions = actions.filter(a => a.actorId === filters.actorId);
    }

    if (filters.targetId) {
      actions = actions.filter(a => a.targetId === filters.targetId);
    }

    if (filters.action) {
      actions = actions.filter(a => a.action === filters.action);
    }

    if (filters.scope) {
      actions = actions.filter(a => a.scope === filters.scope);
    }

    if (filters.startTime) {
      actions = actions.filter(a => a.timestamp >= filters.startTime!);
    }

    if (filters.endTime) {
      actions = actions.filter(a => a.timestamp <= filters.endTime!);
    }

    if (filters.limit) {
      actions = actions.slice(0, filters.limit);
    }

    return actions.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clean up old events and actions based on retention policy
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const retentionMs = this.options.retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = now - retentionMs;

    // Clean up old events
    let deletedEvents = 0;
    for (const [id, event] of this.events.entries()) {
      if (event.timestamp < cutoff) {
        this.events.delete(id);
        this.removeFromIndex(event);
        deletedEvents++;
      }
    }

    // Clean up old admin actions (keep these longer than regular events)
    let deletedActions = 0;
    const actionCutoff = now - (this.options.retentionDays * 2 * 24 * 60 * 60 * 1000);
    for (const [id, action] of this.superActions.entries()) {
      if (action.timestamp < actionCutoff) {
        this.superActions.delete(id);
        deletedActions++;
      }
    }

    if (deletedEvents > 0 || deletedActions > 0) {
      FusionAuditLog.record(
        'sync_monitor_cleanup',
        'system',
        { deletedEvents, deletedActions },
        'system'
      );
    }
  }

  /**
   * Schedule periodic cleanup of old data
   */
  private scheduleCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      try {
        this.cleanupOldData();
      } catch (error) {
        console.error('Error during cleanup:', error);
        FusionAuditLog.recordError('sync_monitor_cleanup_failed', error);
      }
    }, this.options.cleanupInterval);
  }

  /**
   * Add an event to the appropriate indices
   */
  private addToIndex(event: SyncEvent): void {
    // Index by mission
    if (!this.eventIndex.has(event.missionId)) {
      this.eventIndex.set(event.missionId, new Set());
    }
    this.eventIndex.get(event.missionId)!.add(event.id);

    // Index by user if available
    if (event.userId) {
      if (!this.userEventIndex.has(event.userId)) {
        this.userEventIndex.set(event.userId, new Set());
      }
      this.userEventIndex.get(event.userId)!.add(event.id);
    }
  }

  /**
   * Remove an event from all indices
   */
  private removeFromIndex(event: SyncEvent): void {
    // Remove from mission index
    const missionEvents = this.eventIndex.get(event.missionId);
    if (missionEvents) {
      missionEvents.delete(event.id);
      if (missionEvents.size === 0) {
        this.eventIndex.delete(event.missionId);
      }
    }

    // Remove from user index if applicable
    if (event.userId) {
      const userEvents = this.userEventIndex.get(event.userId);
      if (userEvents) {
        userEvents.delete(event.id);
        if (userEvents.size === 0) {
          this.userEventIndex.delete(event.userId);
        }
      }
    }
  }

  /**
   * Check for patterns in errors that might indicate larger issues
   */
  private checkForErrorPatterns(event: SyncEvent): void {
    if (!event.userId || !event.featureId) return;

    // Look for similar recent errors from the same user
    const recentErrors = this.getEvents({
      userId: event.userId,
      status: 'error',
      startTime: Date.now() - 3600000, // Last hour
      limit: 5
    });

    // If we see multiple similar errors, log a warning
    if (recentErrors.length >= 3) {
      const errorPattern = {
        userId: event.userId,
        errorCount: recentErrors.length + 1,
        firstSeen: recentErrors[recentErrors.length - 1].timestamp,
        lastSeen: event.timestamp,
        message: event.message,
        source: event.source
      };

      FusionAuditLog.record(
        'error_pattern_detected',
        'system',
        errorPattern,
        event.missionId
      );
    }
  }

  /**
   * Record an admin action and log it
   */
  private recordAdminAction(action: SuperAdminAction): void {
    this.superActions.set(action.id, action);
    
    FusionAuditLog.record(
      'admin_action',
      action.actorId,
      {
        action: action.action,
        scope: action.scope,
        targetId: action.targetId,
        reason: action.reason
      },
      'system',
      action.metadata
    );
  }

  /**
   * Verify that a user has admin privileges
   */
  private verifyAdminPrivileges(userId: string): void {
    if (!UserRoleManager.isSuperAdmin(userId) && !this.hasPermission(userId, 'admin')) {
      throw new Error('Insufficient privileges');
    }
  }
}

// Singleton instance
export const syncMonitor = new SyncMonitor();
