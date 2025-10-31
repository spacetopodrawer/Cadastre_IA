import { v4 as uuidv4 } from 'uuid';
import { userReputationManager } from '../reputation/UserReputation';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { analyticsEngine } from '../analytics/AnalyticsEngine';
import { FusionAuditLog } from '../audit/FusionAuditLog';

export type ValidationAction = 'approve' | 'reject' | 'modify' | 'comment';
export type ValidationStatus = 'pending' | 'approved' | 'rejected' | 'conflict' | 'resolved';

export interface ValidationRecord {
  id: string;
  suggestionId: string;
  featureId: string;
  missionId: string;
  userId: string;
  action: ValidationAction;
  timestamp: number;
  comment?: string;
  metadata?: {
    coordinates?: [number, number];
    accuracy?: number;
    confidence?: number;
    modifiedProperties?: Record<string, any>;
  };
}

export interface ValidationConflict {
  id: string;
  suggestionId: string;
  status: 'open' | 'resolved';
  resolution?: 'majority' | 'admin' | 'discussion' | 'withdrawn';
  resolvedBy?: string;
  resolvedAt?: number;
  conflictingActions: Array<{
    userId: string;
    action: ValidationAction;
    timestamp: number;
    comment?: string;
  }>;
  discussion?: Array<{
    id: string;
    userId: string;
    message: string;
    timestamp: number;
  }>;
  votes?: Array<{
    userId: string;
    vote: 'approve' | 'reject';
    timestamp: number;
  }>;
}

export interface ValidationStats {
  total: number;
  approved: number;
  rejected: number;
  conflicted: number;
  pending: number;
  byUser: Record<string, {
    total: number;
    approved: number;
    rejected: number;
    conflicts: number;
    accuracy?: number;
  }>;
  byFeature: Record<string, {
    total: number;
    status: ValidationStatus;
    lastUpdated: number;
  }>;
  timeSeries: Array<{
    date: string; // YYYY-MM-DD
    actions: number;
    approvals: number;
    rejections: number;
    conflicts: number;
  }>;
}

export class CartoValidator {
  private static instance: CartoValidator;
  private records: ValidationRecord[] = [];
  private conflicts: Map<string, ValidationConflict> = new Map();
  private auditLog = FusionAuditLog.getInstance();
  private statsCache: {
    [key: string]: { stats: ValidationStats; timestamp: number };
  } = {};
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.loadFromStorage();
    this.setupEventListeners();
  }

  public static getInstance(): CartoValidator {
    if (!CartoValidator.instance) {
      CartoValidator.instance = new CartoValidator();
    }
    return CartoValidator.instance;
  }

  /**
   * Record a validation action
   */
  public async recordAction(
    suggestionId: string,
    featureId: string,
    missionId: string,
    userId: string,
    action: ValidationAction,
    comment?: string,
    metadata?: Record<string, any>
  ): Promise<{ record: ValidationRecord; conflict?: ValidationConflict }> {
    const timestamp = Date.now();
    const record: ValidationRecord = {
      id: uuidv4(),
      suggestionId,
      featureId,
      missionId,
      userId,
      action,
      timestamp,
      comment,
      metadata
    };

    // Add to records
    this.records.push(record);
    this.saveToStorage();

    // Log the action
    await this.auditLog.logEvent({
      type: 'validation_action',
      userId,
      entityType: 'validation',
      entityId: record.id,
      metadata: {
        suggestionId,
        featureId,
        missionId,
        action,
        hasComment: !!comment,
        ...metadata
      }
    });

    // Check for conflicts
    const conflict = await this.checkForConflict(suggestionId, record);
    
    // Update user reputation
    if (action === 'approve' || action === 'reject') {
      userReputationManager.recordEvent({
        userId,
        type: 'validation',
        weight: action === 'approve' ? 2 : 1,
        metadata: {
          suggestionId,
          featureId,
          missionId,
          hasConflict: !!conflict,
          accuracy: metadata?.accuracy
        }
      });
    }

    // Invalidate stats cache
    this.invalidateStatsCache(missionId);

    // Broadcast the action in real-time
    realtimeBridge.broadcast('validation', {
      type: 'action_recorded',
      record,
      conflict
    }, missionId, userId);

    return { record, conflict };
  }

  /**
   * Vote on a conflict resolution
   */
  public async voteOnConflict(
    conflictId: string,
    userId: string,
    vote: 'approve' | 'reject'
  ): Promise<{ conflict: ValidationConflict; resolved?: boolean }> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.status !== 'open') {
      throw new Error('Conflict not found or already resolved');
    }

    // Add or update vote
    if (!conflict.votes) {
      conflict.votes = [];
    }

    // Remove existing vote if exists
    conflict.votes = conflict.votes.filter(v => v.userId !== userId);
    
    // Add new vote
    conflict.votes.push({
      userId,
      vote,
      timestamp: Date.now()
    });

    // Check for resolution by majority
    const voteCounts = conflict.votes.reduce(
      (acc, v) => {
        acc[v.vote] = (acc[v.vote] || 0) + 1;
        return acc;
      },
      { approve: 0, reject: 0 }
    );

    const totalVotes = voteCounts.approve + voteCounts.reject;
    const userReputations = await Promise.all(
      conflict.votes.map(v => 
        userReputationManager.getUserReputation(v.userId)
      )
    );

    // Calculate weighted votes based on user reputation
    const weightedVotes = conflict.votes.reduce(
      (acc, v, i) => {
        const rep = userReputations[i];
        const weight = rep ? rep.level / 10 : 1; // Scale reputation impact
        acc[v.vote] = (acc[v.vote] || 0) + weight;
        return acc;
      },
      { approve: 0, reject: 0 }
    );

    // Resolve if clear majority (60% threshold)
    const threshold = 0.6;
    const totalWeighted = weightedVotes.approve + weightedVotes.reject;
    
    if (totalWeighted > 0) {
      if (weightedVotes.approve / totalWeighted >= threshold) {
        return this.resolveConflict(conflictId, 'majority', userId);
      } else if (weightedVotes.reject / totalWeighted >= threshold) {
        return this.resolveConflict(conflictId, 'withdrawn', userId);
      }
    }

    this.conflicts.set(conflictId, conflict);
    this.saveToStorage();

    // Broadcast the vote
    realtimeBridge.broadcast('validation', {
      type: 'vote_recorded',
      conflictId,
      userId,
      vote,
      weightedVotes
    }, conflict.missionId, userId);

    return { conflict };
  }

  /**
   * Add a comment to a conflict discussion
   */
  public addCommentToConflict(
    conflictId: string,
    userId: string,
    message: string
  ): ValidationConflict {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.status !== 'open') {
      throw new Error('Conflict not found or already resolved');
    }

    if (!conflict.discussion) {
      conflict.discussion = [];
    }

    const comment = {
      id: uuidv4(),
      userId,
      message,
      timestamp: Date.now()
    };

    conflict.discussion.push(comment);
    this.conflicts.set(conflictId, conflict);
    this.saveToStorage();

    // Broadcast the comment
    realtimeBridge.broadcast('validation', {
      type: 'comment_added',
      conflictId,
      comment,
      userId
    }, conflict.missionId, userId);

    // Update user reputation for constructive participation
    if (message.length > 20) { // Basic quality check
      userReputationManager.recordEvent({
        userId,
        type: 'collaboration',
        weight: 0.5,
        metadata: {
          conflictId,
          commentLength: message.length
        }
      });
    }

    return conflict;
  }

  /**
   * Resolve a conflict
   */
  public resolveConflict(
    conflictId: string,
    resolution: 'majority' | 'admin' | 'discussion' | 'withdrawn',
    resolvedBy: string
  ): { conflict: ValidationConflict; resolved: boolean } {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.status !== 'open') {
      throw new Error('Conflict not found or already resolved');
    }

    conflict.status = 'resolved';
    conflict.resolution = resolution;
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = Date.now();

    this.conflicts.set(conflictId, conflict);
    this.saveToStorage();

    // Log the resolution
    this.auditLog.logEvent({
      type: 'conflict_resolved',
      userId: resolvedBy,
      entityType: 'validation',
      entityId: conflictId,
      metadata: {
        suggestionId: conflict.suggestionId,
        resolution,
        votes: conflict.votes?.length || 0,
        comments: conflict.discussion?.length || 0
      }
    });

    // Broadcast the resolution
    realtimeBridge.broadcast('validation', {
      type: 'conflict_resolved',
      conflictId,
      resolution,
      resolvedBy,
      resolvedAt: conflict.resolvedAt
    }, conflict.missionId, resolvedBy);

    return { conflict, resolved: true };
  }

  /**
   * Get validation statistics
   */
  public getStats(missionId: string): ValidationStats {
    // Check cache first
    const cached = this.statsCache[missionId];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.stats;
    }

    // Calculate fresh stats
    const missionRecords = this.records.filter(r => r.missionId === missionId);
    const conflicts = Array.from(this.conflicts.values()).filter(
      c => c.missionId === missionId
    );

    const stats: ValidationStats = {
      total: missionRecords.length,
      approved: missionRecords.filter(r => r.action === 'approve').length,
      rejected: missionRecords.filter(r => r.action === 'reject').length,
      conflicted: conflicts.filter(c => c.status === 'open').length,
      pending: missionRecords.filter(
        r => !['approve', 'reject'].includes(r.action)
      ).length,
      byUser: {},
      byFeature: {},
      timeSeries: []
    };

    // Calculate user stats
    const userActions = missionRecords.reduce((acc, r) => {
      if (!acc[r.userId]) {
        acc[r.userId] = {
          total: 0,
          approved: 0,
          rejected: 0,
          conflicts: 0
        };
      }
      acc[r.userId].total++;
      if (r.action === 'approve') acc[r.userId].approved++;
      if (r.action === 'reject') acc[r.userId].rejected++;
      return acc;
    }, {} as Record<string, { total: number; approved: number; rejected: number; conflicts: number }>);

    // Add conflict counts to user stats
    conflicts.forEach(c => {
      c.conflictingActions.forEach(a => {
        if (userActions[a.userId]) {
          userActions[a.userId].conflicts++;
        }
      });
    });

    stats.byUser = userActions;

    // Calculate feature stats
    const featureMap = missionRecords.reduce((acc, r) => {
      if (!acc[r.featureId]) {
        acc[r.featureId] = {
          actions: [],
          lastUpdated: 0
        };
      }
      acc[r.featureId].actions.push(r);
      acc[r.featureId].lastUpdated = Math.max(
        acc[r.featureId].lastUpdated,
        r.timestamp
      );
      return acc;
    }, {} as Record<string, { actions: ValidationRecord[]; lastUpdated: number }>);

    Object.entries(featureMap).forEach(([featureId, data]) => {
      const actions = data.actions;
      const lastAction = actions.reduce((latest, current) => 
        current.timestamp > latest.timestamp ? current : latest
      );
      
      stats.byFeature[featureId] = {
        total: actions.length,
        status: this.determineFeatureStatus(featureId, actions, conflicts),
        lastUpdated: data.lastUpdated
      };
    });

    // Calculate time series (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const dateMap: Record<string, { actions: number; approvals: number; rejections: number; conflicts: number }> = {};
    
    // Initialize last 30 days
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dateMap[dateStr] = { actions: 0, approvals: 0, rejections: 0, conflicts: 0 };
    }

    // Count actions by date
    missionRecords.forEach(r => {
      const dateStr = new Date(r.timestamp).toISOString().split('T')[0];
      if (dateMap[dateStr]) {
        dateMap[dateStr].actions++;
        if (r.action === 'approve') dateMap[dateStr].approvals++;
        if (r.action === 'reject') dateMap[dateStr].rejections++;
      }
    });

    // Count conflicts by date
    conflicts.forEach(c => {
      const dateStr = new Date(c.conflictingActions[0]?.timestamp || Date.now())
        .toISOString()
        .split('T')[0];
      if (dateMap[dateStr]) {
        dateMap[dateStr].conflicts++;
      }
    });

    // Convert to array and sort by date
    stats.timeSeries = Object.entries(dateMap)
      .map(([date, counts]) => ({
        date,
        ...counts
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Update cache
    this.statsCache[missionId] = {
      stats,
      timestamp: Date.now()
    };

    return stats;
  }

  /**
   * Get all conflicts for a mission
   */
  public getConflicts(missionId: string, status?: 'open' | 'resolved'): ValidationConflict[] {
    let conflicts = Array.from(this.conflicts.values()).filter(
      c => c.missionId === missionId
    );

    if (status) {
      conflicts = conflicts.filter(c => 
        status === 'open' ? c.status === 'open' : c.status === 'resolved'
      );
    }

    return conflicts.sort((a, b) => {
      // Sort by most recent action first
      const aLatest = Math.max(...a.conflictingActions.map(ca => ca.timestamp));
      const bLatest = Math.max(...b.conflictingActions.map(cb => cb.timestamp));
      return bLatest - aLatest;
    });
  }

  /**
   * Get validation history for a feature
   */
  public getFeatureHistory(featureId: string): {
    validations: ValidationRecord[];
    conflicts: ValidationConflict[];
  } {
    const validations = this.records
      .filter(r => r.featureId === featureId)
      .sort((a, b) => b.timestamp - a.timestamp);

    const conflicts = Array.from(this.conflicts.values())
      .filter(c => c.conflictingActions.some(ca => 
        this.records.find(r => 
          r.id === ca.id && r.featureId === featureId
        )
      ))
      .sort((a, b) => {
        const aLatest = Math.max(...a.conflictingActions.map(ca => ca.timestamp));
        const bLatest = Math.max(...b.conflictingActions.map(cb => cb.timestamp));
        return bLatest - aLatest;
      });

    return { validations, conflicts };
  }

  /**
   * Get user's validation history
   */
  public getUserHistory(userId: string, missionId?: string): ValidationRecord[] {
    return this.records
      .filter(r => 
        r.userId === userId && 
        (!missionId || r.missionId === missionId)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // Private helper methods

  private async checkForConflict(
    suggestionId: string,
    newRecord: ValidationRecord
  ): Promise<ValidationConflict | undefined> {
    const existingActions = this.records.filter(
      r => 
        r.suggestionId === suggestionId && 
        r.id !== newRecord.id &&
        ['approve', 'reject', 'modify'].includes(r.action)
    );

    // Check if new action conflicts with existing ones
    const conflictingActions = existingActions.filter(existing => {
      // Different users with different actions on the same suggestion
      return (
        existing.userId !== newRecord.userId &&
        existing.action !== newRecord.action &&
        ['approve', 'reject', 'modify'].includes(existing.action)
      );
    });

    if (conflictingActions.length === 0) {
      return undefined; // No conflict
    }

    // Create or update conflict
    const conflictId = Array.from(this.conflicts.entries()).find(
      ([_, c]) => c.suggestionId === suggestionId && c.status === 'open'
    )?.[0] || uuidv4();

    const conflict: ValidationConflict = {
      id: conflictId,
      suggestionId,
      status: 'open',
      conflictingActions: [
        ...conflictingActions.map(a => ({
          userId: a.userId,
          action: a.action as 'approve' | 'reject' | 'modify',
          timestamp: a.timestamp,
          comment: a.comment
        })),
        {
          userId: newRecord.userId,
          action: newRecord.action as 'approve' | 'reject' | 'modify',
          timestamp: newRecord.timestamp,
          comment: newRecord.comment
        }
      ]
    };

    this.conflicts.set(conflictId, conflict);
    this.saveToStorage();

    // Log the conflict
    await this.auditLog.logEvent({
      type: 'validation_conflict',
      userId: 'system',
      entityType: 'validation',
      entityId: conflictId,
      metadata: {
        suggestionId,
        featureId: newRecord.featureId,
        missionId: newRecord.missionId,
        actionCount: conflict.conflictingActions.length,
        users: conflict.conflictingActions.map(a => a.userId)
      }
    });

    // Notify relevant users about the conflict
    const involvedUsers = new Set(conflict.conflictingActions.map(a => a.userId));
    involvedUsers.forEach(userId => {
      if (userId !== newRecord.userId) { // Don't notify the user who caused the conflict
        realtimeBridge.broadcast('notification', {
          type: 'validation_conflict',
          conflictId,
          suggestionId,
          message: 'Un conflit de validation a été détecté',
          timestamp: Date.now()
        }, newRecord.missionId, userId);
      }
    });

    return conflict;
  }

  private determineFeatureStatus(
    featureId: string,
    actions: ValidationRecord[],
    conflicts: ValidationConflict[]
  ): ValidationStatus {
    // Check if there's an open conflict for this feature
    const hasOpenConflict = conflicts.some(
      c => 
        c.status === 'open' && 
        c.conflictingActions.some(ca => 
          actions.some(a => a.id === ca.id)
        )
    );

    if (hasOpenConflict) return 'conflict';

    // Check the most recent validation action
    const lastValidation = [...actions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .find(a => ['approve', 'reject'].includes(a.action));

    if (!lastValidation) return 'pending';
    
    return lastValidation.action === 'approve' ? 'approved' : 'rejected';
  }

  private invalidateStatsCache(missionId: string): void {
    delete this.statsCache[missionId];
  }

  // Persistence
  private saveToStorage(): void {
    try {
      localStorage.setItem('cartoValidator_records', JSON.stringify(this.records));
      localStorage.setItem(
        'cartoValidator_conflicts',
        JSON.stringify(Array.from(this.conflicts.entries()))
      );
    } catch (error) {
      console.error('Failed to save CartoValidator data:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const records = localStorage.getItem('cartoValidator_records');
      const conflicts = localStorage.getItem('cartoValidator_conflicts');

      if (records) {
        this.records = JSON.parse(records);
      }

      if (conflicts) {
        this.conflicts = new Map(JSON.parse(conflicts));
      }
    } catch (error) {
      console.error('Failed to load CartoValidator data:', error);
    }
  }

  private setupEventListeners(): void {
    // Listen for real-time events
    realtimeBridge.subscribe('*', 'carto-validator', (event) => {
      // Handle real-time events from other instances
      if (event.type === 'validation_action' && event.record) {
        // Update local state if needed
        const exists = this.records.some(r => r.id === event.record.id);
        if (!exists) {
          this.records.push(event.record);
          this.invalidateStatsCache(event.record.missionId);
        }
      }
    });
  }
}

// Singleton instance
export const cartoValidator = CartoValidator.getInstance();
