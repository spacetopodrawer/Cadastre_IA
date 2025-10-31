import { v4 as uuidv4 } from 'uuid';
import { auditLog } from '../audit/FusionAuditLog';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { userReputationManager } from '../reputation/UserReputation';
import { cartoValidator } from '../validation/CartoValidator';
import { mobileBridge } from '../mobile/MobileBridge';

type SessionRole = 'annotator' | 'validator' | 'auditor' | 'assistant' | 'reviewer' | 'supervisor';
type SessionState = 'draft' | 'active' | 'paused' | 'completed' | 'conflicted' | 'archived';
type SessionType = 'mission' | 'zone' | 'object' | 'review' | 'audit';

type SessionParticipant = {
  userId: string;
  role: SessionRole;
  joinedAt: number;
  lastActive: number;
  status: 'active' | 'inactive' | 'away';
  permissions: string[];
};

type SessionLock = {
  lockedBy: string | null;
  lockedAt: number | null;
  lockType: 'exclusive' | 'shared' | null;
  lockReason?: string;
};

type SessionStats = {
  annotations: number;
  validations: number;
  conflicts: number;
  participants: number;
  duration: number; // in minutes
  lastActivity: number;
};

type Session = {
  id: string;
  missionId: string;
  zoneId?: string;
  objectId?: string;
  type: SessionType;
  title: string;
  description?: string;
  participants: SessionParticipant[];
  state: SessionState;
  lock: SessionLock;
  metadata: {
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    parentSessionId?: string;
    tags: string[];
  };
  stats: SessionStats;
  settings: {
    allowAnonymous: boolean;
    requireApproval: boolean;
    maxParticipants: number;
    autoLockInactive: boolean;
    inactivityTimeout: number; // in minutes
    retentionPeriod: number; // in days
  };
};

type SessionFilter = {
  missionId?: string;
  zoneId?: string;
  objectId?: string;
  state?: SessionState | SessionState[];
  type?: SessionType | SessionType[];
  participantId?: string;
  role?: SessionRole | SessionRole[];
  includeArchived?: boolean;
  minParticipants?: number;
  createdAfter?: number;
  updatedBefore?: number;
};

type SessionUpdate = Partial<Pick<Session, 'title' | 'description' | 'state' | 'zoneId' | 'objectId'>> & {
  metadata?: Partial<Session['metadata']>;
  settings?: Partial<Session['settings']>;
};

type SessionAuditEvent = {
  type: 'session_created' | 'session_updated' | 'session_ended' | 'participant_joined' | 
        'participant_left' | 'state_changed' | 'lock_acquired' | 'lock_released' |
        'validation_started' | 'validation_completed' | 'conflict_detected' | 'conflict_resolved';
  sessionId: string;
  userId: string;
  timestamp: number;
  details?: Record<string, any>;
};

class SessionOrchestrator {
  private sessions: Map<string, Session> = new Map();
  private sessionActivity: Map<string, Map<string, number>> = new Map(); // sessionId -> userId -> timestamp
  private cleanupInterval: NodeJS.Timeout;
  private readonly SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly DEFAULT_INACTIVITY_TIMEOUT = 30; // 30 minutes
  private readonly DEFAULT_RETENTION_DAYS = 90; // 90 days

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupInactiveSessions(), this.SESSION_CLEANUP_INTERVAL);
    this.setupEventListeners();
  }

  // --- Core Session Management ---

  createSession(params: {
    missionId: string;
    type: SessionType;
    createdBy: string;
    title: string;
    description?: string;
    zoneId?: string;
    objectId?: string;
    settings?: Partial<Session['settings']>;
  }): Session {
    const sessionId = `sess_${uuidv4()}`;
    const now = Date.now();
    
    const defaultSettings: Session['settings'] = {
      allowAnonymous: false,
      requireApproval: true,
      maxParticipants: 10,
      autoLockInactive: true,
      inactivityTimeout: this.DEFAULT_INACTIVITY_TIMEOUT,
      retentionPeriod: this.DEFAULT_RETENTION_DAYS,
    };

    const session: Session = {
      id: sessionId,
      missionId: params.missionId,
      zoneId: params.zoneId,
      objectId: params.objectId,
      type: params.type,
      title: params.title,
      description: params.description,
      participants: [],
      state: 'draft',
      lock: {
        lockedBy: null,
        lockedAt: null,
        lockType: null,
      },
      metadata: {
        createdBy: params.createdBy,
        createdAt: now,
        updatedAt: now,
        tags: [],
      },
      stats: {
        annotations: 0,
        validations: 0,
        conflicts: 0,
        participants: 0,
        duration: 0,
        lastActivity: now,
      },
      settings: {
        ...defaultSettings,
        ...params.settings,
      },
    };

    this.sessions.set(sessionId, session);
    this.sessionActivity.set(sessionId, new Map());
    
    // Add creator as first participant with appropriate role
    const creatorRole = this.determineCreatorRole(params.type);
    this.addParticipant(sessionId, params.createdBy, creatorRole);
    
    // Log the session creation
    this.logAuditEvent({
      type: 'session_created',
      sessionId,
      userId: params.createdBy,
      timestamp: now,
      details: {
        type: params.type,
        zoneId: params.zoneId,
        objectId: params.objectId,
      },
    });

    // Broadcast session creation
    realtimeBridge.broadcast({
      type: 'session_created',
      payload: {
        sessionId,
        missionId: params.missionId,
        createdBy: params.createdBy,
        type: params.type,
      },
      scope: 'mission',
      target: params.missionId,
    });

    return session;
  }

  updateSession(sessionId: string, updates: SessionUpdate, userId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if session is locked
    if (this.isSessionLocked(sessionId) && session.lock.lockedBy !== userId) {
      throw new Error(`Session is locked by ${session.lock.lockedBy}`);
    }

    const previousState = session.state;
    const now = Date.now();
    
    // Apply updates
    const updatedSession: Session = {
      ...session,
      ...updates,
      metadata: {
        ...session.metadata,
        ...updates.metadata,
        updatedAt: now,
      },
      settings: {
        ...session.settings,
        ...updates.settings,
      },
    };

    // Handle state transitions
    if (updates.state && updates.state !== session.state) {
      this.handleStateTransition(session, updates.state, userId);
      
      if (updates.state === 'completed' || updates.state === 'archived') {
        updatedSession.metadata.completedAt = now;
      }
    }

    this.sessions.set(sessionId, updatedSession);
    this.updateActivity(sessionId, userId);

    // Log the update
    this.logAuditEvent({
      type: 'session_updated',
      sessionId,
      userId,
      timestamp: now,
      details: {
        updatedFields: Object.keys(updates),
        previousState,
        newState: updates.state || session.state,
      },
    });

    // Broadcast the update
    realtimeBridge.broadcast({
      type: 'session_updated',
      payload: {
        sessionId,
        updatedBy: userId,
        updatedAt: now,
        changes: Object.keys(updates),
      },
      scope: 'session',
      target: sessionId,
    });

    return updatedSession;
  }

  // --- Participant Management ---

  addParticipant(sessionId: string, userId: string, role: SessionRole): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Check if user is already a participant
    const existingParticipant = session.participants.find(p => p.userId === userId);
    if (existingParticipant) {
      // Update role if different
      if (existingParticipant.role !== role) {
        existingParticipant.role = role;
        existingParticipant.lastActive = Date.now();
        existingParticipant.status = 'active';
        
        this.logAuditEvent({
          type: 'participant_role_updated',
          sessionId,
          userId,
          timestamp: Date.now(),
          details: { newRole: role },
        });
      }
      return true;
    }

    // Check if session allows more participants
    if (session.participants.length >= session.settings.maxParticipants) {
      throw new Error('Maximum number of participants reached');
    }

    // Add new participant
    const now = Date.now();
    const participant: SessionParticipant = {
      userId,
      role,
      joinedAt: now,
      lastActive: now,
      status: 'active',
      permissions: this.getDefaultPermissions(role),
    };

    session.participants.push(participant);
    session.stats.participants = session.participants.length;
    session.metadata.updatedAt = now;
    
    // Update activity tracking
    this.updateActivity(sessionId, userId);

    // Log the participant addition
    this.logAuditEvent({
      type: 'participant_joined',
      sessionId,
      userId,
      timestamp: now,
      details: { role },
    });

    // Broadcast participant update
    realtimeBridge.broadcast({
      type: 'participant_joined',
      payload: {
        sessionId,
        userId,
        role,
        timestamp: now,
      },
      scope: 'session',
      target: sessionId,
    });

    return true;
  }

  removeParticipant(sessionId: string, userId: string, reason = 'left'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const participantIndex = session.participants.findIndex(p => p.userId === userId);
    if (participantIndex === -1) return false;

    const [removedParticipant] = session.participants.splice(participantIndex, 1);
    session.stats.participants = session.participants.length;
    session.metadata.updatedAt = Date.now();

    // Release any locks held by this participant
    if (session.lock.lockedBy === userId) {
      this.releaseLock(sessionId, userId);
    }

    // Log the participant removal
    this.logAuditEvent({
      type: 'participant_left',
      sessionId,
      userId,
      timestamp: Date.now(),
      details: { reason, role: removedParticipant.role },
    });

    // Broadcast participant removal
    realtimeBridge.broadcast({
      type: 'participant_left',
      payload: {
        sessionId,
        userId,
        timestamp: Date.now(),
        reason,
      },
      scope: 'session',
      target: sessionId,
    });

    // If no participants left, consider archiving the session
    if (session.participants.length === 0 && session.state !== 'completed') {
      this.updateSession(sessionId, { state: 'archived' }, 'system');
    }

    return true;
  }

  updateParticipantStatus(sessionId: string, userId: string, status: 'active' | 'inactive' | 'away'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const participant = session.participants.find(p => p.userId === userId);
    if (!participant) return false;

    const previousStatus = participant.status;
    participant.status = status;
    participant.lastActive = Date.now();
    session.metadata.updatedAt = Date.now();

    // Update activity tracking
    this.updateActivity(sessionId, userId);

    // Log status change if it's different
    if (previousStatus !== status) {
      this.logAuditEvent({
        type: 'participant_status_changed',
        sessionId,
        userId,
        timestamp: Date.now(),
        details: { previousStatus, newStatus: status },
      });

      // Broadcast status change
      realtimeBridge.broadcast({
        type: 'participant_status_changed',
        payload: {
          sessionId,
          userId,
          status,
          timestamp: Date.now(),
        },
        scope: 'session',
        target: sessionId,
      });
    }

    return true;
  }

  // --- Locking Mechanism ---

  acquireLock(sessionId: string, userId: string, lockType: 'exclusive' | 'shared' = 'exclusive', reason?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    
    // Check if the session is already locked
    if (session.lock.lockedBy && session.lock.lockedBy !== userId) {
      // If it's an exclusive lock or the existing lock is exclusive, deny
      if (lockType === 'exclusive' || session.lock.lockType === 'exclusive') {
        return false;
      }
      // If it's a shared lock and the existing lock is shared, allow
    }

    // Update or acquire the lock
    session.lock = {
      lockedBy: userId,
      lockedAt: now,
      lockType,
      lockReason: reason,
    };

    session.metadata.updatedAt = now;

    // Log the lock acquisition
    this.logAuditEvent({
      type: 'lock_acquired',
      sessionId,
      userId,
      timestamp: now,
      details: { lockType, reason },
    });

    // Broadcast lock acquisition
    realtimeBridge.broadcast({
      type: 'lock_acquired',
      payload: {
        sessionId,
        userId,
        lockType,
        timestamp: now,
        reason,
      },
      scope: 'session',
      target: sessionId,
    });

    return true;
  }

  releaseLock(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.lock.lockedBy || session.lock.lockedBy !== userId) {
      return false;
    }

    const lockInfo = { ...session.lock };
    
    // Release the lock
    session.lock = {
      lockedBy: null,
      lockedAt: null,
      lockType: null,
    };

    session.metadata.updatedAt = Date.now();

    // Log the lock release
    this.logAuditEvent({
      type: 'lock_released',
      sessionId,
      userId,
      timestamp: Date.now(),
      details: { 
        previousLock: lockInfo,
        duration: lockInfo.lockedAt ? Date.now() - lockInfo.lockedAt : 0,
      },
    });

    // Broadcast lock release
    realtimeBridge.broadcast({
      type: 'lock_released',
      payload: {
        sessionId,
        userId,
        timestamp: Date.now(),
        previousLock: lockInfo,
      },
      scope: 'session',
      target: sessionId,
    });

    return true;
  }

  isSessionLocked(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.lock.lockedBy !== null : false;
  }

  // --- Session Querying ---

  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  findSessions(filter: SessionFilter): Session[] {
    return Array.from(this.sessions.values()).filter(session => {
      // Filter by mission ID
      if (filter.missionId && session.missionId !== filter.missionId) return false;
      
      // Filter by zone ID
      if (filter.zoneId && session.zoneId !== filter.zoneId) return false;
      
      // Filter by object ID
      if (filter.objectId && session.objectId !== filter.objectId) return false;
      
      // Filter by state
      if (filter.state) {
        const states = Array.isArray(filter.state) ? filter.state : [filter.state];
        if (!states.includes(session.state)) return false;
      }
      
      // Filter by type
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(session.type)) return false;
      }
      
      // Filter by participant
      if (filter.participantId) {
        const hasParticipant = session.participants.some(p => p.userId === filter.participantId);
        if (!hasParticipant) return false;
      }
      
      // Filter by role
      if (filter.role) {
        const roles = Array.isArray(filter.role) ? filter.role : [filter.role];
        const hasRole = session.participants.some(p => roles.includes(p.role as SessionRole));
        if (!hasRole) return false;
      }
      
      // Filter by minimum participants
      if (filter.minParticipants && session.participants.length < filter.minParticipants) {
        return false;
      }
      
      // Filter by creation date
      if (filter.createdAfter && session.metadata.createdAt < filter.createdAfter) {
        return false;
      }
      
      // Filter by update date
      if (filter.updatedBefore && session.metadata.updatedAt > filter.updatedBefore) {
        return false;
      }
      
      // Exclude archived sessions unless explicitly requested
      if (!filter.includeArchived && session.state === 'archived') {
        return false;
      }
      
      return true;
    });
  }

  getActiveSessions(missionId?: string): Session[] {
    return this.findSessions({
      state: 'active',
      ...(missionId && { missionId }),
    });
  }

  getSessionsForUser(userId: string, includeInactive = false): Session[] {
    const states: SessionState[] = includeInactive 
      ? ['active', 'paused', 'completed', 'conflicted'] 
      : ['active', 'paused'];
      
    return this.findSessions({
      participantId: userId,
      state: states,
    });
  }

  // --- Session State Management ---

  private handleStateTransition(session: Session, newState: SessionState, userId: string): void {
    const oldState = session.state;
    const now = Date.now();
    
    // Validate state transition
    const validTransitions: Record<SessionState, SessionState[]> = {
      draft: ['active', 'archived'],
      active: ['paused', 'completed', 'conflicted', 'archived'],
      paused: ['active', 'completed', 'archived'],
      completed: ['active', 'archived'],
      conflicted: ['active', 'archived'],
      archived: ['active'], // Allow unarchiving
    };

    if (!validTransitions[oldState]?.includes(newState)) {
      throw new Error(`Invalid state transition from ${oldState} to ${newState}`);
    }

    // Additional validation for specific transitions
    if (newState === 'completed' && session.participants.length === 0) {
      throw new Error('Cannot complete a session with no participants');
    }

    // Update session state
    session.state = newState;
    session.metadata.updatedAt = now;

    // Log the state change
    this.logAuditEvent({
      type: 'state_changed',
      sessionId: session.id,
      userId,
      timestamp: now,
      details: {
        previousState: oldState,
        newState,
      },
    });

    // Broadcast state change
    realtimeBridge.broadcast({
      type: 'state_changed',
      payload: {
        sessionId: session.id,
        previousState: oldState,
        newState,
        changedBy: userId,
        timestamp: now,
      },
      scope: 'session',
      target: session.id,
    });

    // Handle specific state transitions
    if (newState === 'completed') {
      this.handleSessionCompletion(session, userId);
    } else if (newState === 'archived') {
      this.handleSessionArchival(session, userId);
    } else if (newState === 'active' && oldState === 'paused') {
      this.handleSessionResume(session, userId);
    } else if (newState === 'paused') {
      this.handleSessionPause(session, userId);
    }
  }

  private handleSessionCompletion(session: Session, userId: string): void {
    const now = Date.now();
    session.metadata.completedAt = now;
    
    // Calculate session duration
    const durationMs = now - session.metadata.createdAt;
    session.stats.duration = Math.round(durationMs / 60000); // Convert to minutes
    
    // Update user reputations
    this.updateParticipantReputations(session);
    
    // Log completion
    this.logAuditEvent({
      type: 'session_completed',
      sessionId: session.id,
      userId,
      timestamp: now,
      details: {
        duration: session.stats.duration,
        participants: session.participants.length,
        annotations: session.stats.annotations,
        validations: session.stats.validations,
        conflicts: session.stats.conflicts,
      },
    });
  }

  private handleSessionArchival(session: Session, userId: string): void {
    // Release any locks
    if (session.lock.lockedBy) {
      this.releaseLock(session.id, session.lock.lockedBy);
    }
    
    // Log archival
    this.logAuditEvent({
      type: 'session_archived',
      sessionId: session.id,
      userId,
      timestamp: Date.now(),
      details: {
        participants: session.participants.length,
        duration: session.stats.duration,
      },
    });
  }

  private handleSessionPause(session: Session, userId: string): void {
    // Log pause
    this.logAuditEvent({
      type: 'session_paused',
      sessionId: session.id,
      userId,
      timestamp: Date.now(),
      details: {
        activeParticipants: session.participants.filter(p => p.status === 'active').length,
      },
    });
  }

  private handleSessionResume(session: Session, userId: string): void {
    // Log resume
    this.logAuditEvent({
      type: 'session_resumed',
      sessionId: session.id,
      userId,
      timestamp: Date.now(),
    });
  }

  // --- Integration with Other Modules ---

  private async updateParticipantReputations(session: Session): Promise<void> {
    const now = Date.now();
    const durationHours = (now - session.metadata.createdAt) / (1000 * 60 * 60);
    
    // Calculate base reputation points based on session duration and participation
    const basePoints = Math.min(100, Math.floor(durationHours * 5)); // Up to 5 points per hour, max 100
    
    // Award points to each participant
    for (const participant of session.participants) {
      const roleMultiplier = this.getRoleMultiplier(participant.role);
      const points = Math.round(basePoints * roleMultiplier);
      
      // Update user reputation
      await userReputationManager.recordEvent({
        userId: participant.userId,
        type: 'session_participation',
        weight: points,
        metadata: {
          sessionId: session.id,
          missionId: session.missionId,
          role: participant.role,
          duration: durationHours,
          annotations: session.stats.annotations,
          validations: session.stats.validations,
        },
      });
    }
  }

  private logAuditEvent(event: SessionAuditEvent): void {
    // Log to FusionAuditLog
    auditLog.record(
      'session_activity',
      event.userId,
      {
        type: event.type,
        sessionId: event.sessionId,
        ...event.details,
      },
      {
        sessionId: event.sessionId,
        entityType: 'session',
        entityId: event.sessionId,
      }
    );
  }

  // --- Utility Methods ---

  private determineCreatorRole(sessionType: SessionType): SessionRole {
    switch (sessionType) {
      case 'audit':
        return 'auditor';
      case 'review':
        return 'reviewer';
      default:
        return 'annotator';
    }
  }

  private getDefaultPermissions(role: SessionRole): string[] {
    const basePermissions = ['view_session'];
    
    switch (role) {
      case 'annotator':
        return [...basePermissions, 'create_annotations', 'edit_own_annotations'];
      case 'validator':
        return [...basePermissions, 'validate_annotations', 'reject_annotations'];
      case 'auditor':
        return [...basePermissions, 'view_all_annotations', 'export_data', 'generate_reports'];
      case 'assistant':
        return [...basePermissions, 'suggest_annotations', 'view_all_annotations'];
      case 'reviewer':
        return [...basePermissions, 'review_annotations', 'resolve_conflicts'];
      case 'supervisor':
        return [...basePermissions, 'manage_participants', 'modify_session', 'end_session'];
      default:
        return basePermissions;
    }
  }

  private getRoleMultiplier(role: SessionRole): number {
    // Higher multipliers for more responsible roles
    const multipliers: Record<SessionRole, number> = {
      annotator: 1.0,
      validator: 1.2,
      auditor: 1.3,
      assistant: 0.8, // AI assistant gets slightly less
      reviewer: 1.4,
      supervisor: 1.5,
    };
    
    return multipliers[role] || 1.0;
  }

  private updateActivity(sessionId: string, userId: string): void {
    const now = Date.now();
    
    // Update session's last activity
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stats.lastActivity = now;
      
      // Update participant's last active time
      const participant = session.participants.find(p => p.userId === userId);
      if (participant) {
        participant.lastActive = now;
        participant.status = 'active'; // Mark as active on any interaction
      }
    }
    
    // Update activity tracking for cleanup
    if (!this.sessionActivity.has(sessionId)) {
      this.sessionActivity.set(sessionId, new Map());
    }
    this.sessionActivity.get(sessionId)?.set(userId, now);
  }

  // --- Cleanup and Maintenance ---

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, userActivities] of this.sessionActivity.entries()) {
      const session = this.sessions.get(sessionId);
      if (!session) continue;
      
      // Skip if session is already completed or archived
      if (['completed', 'archived'].includes(session.state)) continue;
      
      // Check for inactive sessions
      const timeSinceLastActivity = now - (session.stats.lastActivity || 0);
      if (timeSinceLastActivity > inactiveThreshold) {
        // Auto-pause inactive sessions if enabled
        if (session.settings.autoLockInactive && session.state === 'active') {
          this.updateSession(sessionId, { state: 'paused' }, 'system');
          
          // Log auto-pause
          this.logAuditEvent({
            type: 'session_auto_paused',
            sessionId,
            userId: 'system',
            timestamp: now,
            details: {
              inactiveFor: Math.round(timeSinceLastActivity / (60 * 1000)), // in minutes
            },
          });
        }
      }
      
      // Clean up old activity records to prevent memory leaks
      const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours
      for (const [userId, lastActive] of userActivities.entries()) {
        if (lastActive < cutoff) {
          userActivities.delete(userId);
        }
      }
    }
  }

  // --- Event Listeners ---

  private setupEventListeners(): void {
    // Listen for annotation events
    realtimeBridge.subscribe('annotation_created', 'session_orchestrator', (event) => {
      const { annotation } = event;
      if (annotation.sessionId) {
        this.handleAnnotationEvent(annotation.sessionId, 'created', annotation.userId);
      }
    });
    
    realtimeBridge.subscribe('annotation_validated', 'session_orchestrator', (event) => {
      const { annotation } = event;
      if (annotation.sessionId) {
        this.handleAnnotationEvent(annotation.sessionId, 'validated', annotation.validatedBy);
      }
    });
    
    // Listen for validation events
    realtimeBridge.subscribe('validation_completed', 'session_orchestrator', (event) => {
      if (event.sessionId) {
        this.handleValidationEvent(event.sessionId, event.userId, event.result);
      }
    });
    
    // Listen for conflict events
    realtimeBridge.subscribe('conflict_detected', 'session_orchestrator', (event) => {
      if (event.sessionId) {
        this.handleConflictEvent(event.sessionId, event);
      }
    });
  }

  private handleAnnotationEvent(sessionId: string, type: 'created' | 'validated', userId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const now = Date.now();
    session.metadata.updatedAt = now;
    
    if (type === 'created') {
      session.stats.annotations++;
    } else if (type === 'validated') {
      session.stats.validations++;
    }
    
    // Update activity for the user who performed the action
    this.updateActivity(sessionId, userId);
  }

  private handleValidationEvent(sessionId: string, userId: string, result: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Update validation stats
    session.stats.validations++;
    
    if (result.conflicts && result.conflicts.length > 0) {
      session.stats.conflicts += result.conflicts.length;
      
      // If conflicts are detected, update session state if needed
      if (session.state !== 'conflicted') {
        this.updateSession(sessionId, { state: 'conflicted' }, 'system');
      }
    }
    
    // Update activity for the validator
    this.updateActivity(sessionId, userId);
  }

  private handleConflictEvent(sessionId: string, event: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Update conflict stats
    session.stats.conflicts++;
    
    // Update session state to conflicted if not already
    if (session.state !== 'conflicted') {
      this.updateSession(sessionId, { state: 'conflicted' }, 'system');
    }
    
    // Notify participants about the conflict
    realtimeBridge.broadcast({
      type: 'session_conflict_detected',
      payload: {
        sessionId,
        conflictId: event.conflictId,
        timestamp: Date.now(),
        details: event.details,
      },
      scope: 'session',
      target: sessionId,
    });
  }
}

// Export a singleton instance
export const sessionOrchestrator = new SessionOrchestrator();

export type {
  Session,
  SessionRole,
  SessionState,
  SessionType,
  SessionParticipant,
  SessionLock,
  SessionStats,
  SessionFilter,
  SessionUpdate,
  SessionAuditEvent,
};
