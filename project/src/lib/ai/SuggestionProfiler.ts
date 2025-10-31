import { FusionAuditLog } from '../audit/FusionAuditLog';
import { RealtimeBridge } from '../realtime/RealtimeBridge';

type ImpactLevel = 'low' | 'medium' | 'high';
type SuggestionStatus = 'accepted' | 'rejected' | 'modified' | 'pending';
type SuggestionSource = 'boundary' | 'attribute' | 'relation' | 'correction' | 'other';

interface SuggestionProfile {
  suggestionId: string;
  missionId: string;
  featureId: string;
  userId?: string;
  modelVersion: string;
  confidence: number;
  status: SuggestionStatus;
  impact: ImpactLevel;
  source: SuggestionSource;
  reason?: string;
  adjustments?: string[];
  timestamp: number;
  metadata?: Record<string, any>;
  processingTimeMs?: number;
  context?: {
    featureType?: string;
    complexity?: number;
    previousSuggestions?: number;
  };
}

interface ProfileStats {
  missionId: string;
  period: { start: number; end: number };
  totalSuggestions: number;
  statusDistribution: Record<SuggestionStatus, number>;
  acceptanceRate: number;
  averageConfidence: number;
  confidenceByStatus: Record<SuggestionStatus, number>;
  impactDistribution: Record<ImpactLevel, number>;
  sourceDistribution: Record<SuggestionSource, number>;
  rejectionReasons: Array<{ reason: string; count: number; percentage: number }>;
  averageProcessingTimeMs: number;
  userStats: Array<{
    userId: string;
    suggestions: number;
    acceptanceRate: number;
    averageConfidence: number;
  }>;
  featureTypeStats: Record<string, {
    count: number;
    acceptanceRate: number;
    averageConfidence: number;
  }>;
}

export class SuggestionProfiler {
  private profiles: Map<string, SuggestionProfile> = new Map();
  private statsCache: Map<string, { timestamp: number; data: any }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize with default values
  }

  /**
   * Record a new suggestion profile
   */
  recordProfile(profile: Omit<SuggestionProfile, 'timestamp'>): SuggestionProfile {
    const timestamp = Date.now();
    const fullProfile: SuggestionProfile = {
      ...profile,
      timestamp,
      metadata: profile.metadata || {}
    };

    this.profiles.set(profile.suggestionId, fullProfile);
    this.invalidateCache(profile.missionId);

    FusionAuditLog.record(
      'suggestion_profile_created',
      profile.userId || 'system',
      {
        suggestionId: profile.suggestionId,
        missionId: profile.missionId,
        featureId: profile.featureId,
        status: profile.status,
        confidence: profile.confidence,
        impact: profile.impact
      },
      profile.missionId
    );

    RealtimeBridge.broadcast('suggestion:profile:updated', {
      missionId: profile.missionId,
      suggestionId: profile.suggestionId,
      status: profile.status,
      timestamp
    });

    return fullProfile;
  }

  /**
   * Update an existing suggestion profile
   */
  updateProfile(
    suggestionId: string,
    updates: Partial<Omit<SuggestionProfile, 'suggestionId' | 'timestamp'>>,
    userId?: string
  ): SuggestionProfile | null {
    const existing = this.profiles.get(suggestionId);
    if (!existing) return null;

    const updated: SuggestionProfile = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...(updates.metadata || {})
      },
      suggestionId: existing.suggestionId,
      timestamp: existing.timestamp,
      metadata: {
        ...existing.metadata,
        updatedAt: Date.now(),
        updatedBy: userId,
        updateCount: (existing.metadata?.updateCount || 0) + 1
      }
    };

    this.profiles.set(suggestionId, updated);
    this.invalidateCache(updated.missionId);

    FusionAuditLog.record(
      'suggestion_profile_updated',
      userId || 'system',
      {
        suggestionId,
        missionId: updated.missionId,
        updates: Object.keys(updates),
        newStatus: updates.status
      },
      updated.missionId
    );

    if (updates.status && updates.status !== existing.status) {
      RealtimeBridge.broadcast('suggestion:status:updated', {
        suggestionId,
        missionId: updated.missionId,
        previousStatus: existing.status,
        newStatus: updates.status,
        timestamp: Date.now()
      });
    }

    return updated;
  }

  /**
   * Get statistics for a specific mission
   */
  getMissionStats(missionId: string, timeRange?: { start: number; end: number }): ProfileStats {
    const cacheKey = this.getCacheKey('mission', missionId, timeRange);
    const now = Date.now();
    
    // Check cache
    const cached = this.statsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      return cached.data as ProfileStats;
    }

    // Get relevant profiles
    const profiles = this.getProfilesByMission(missionId, timeRange);
    if (profiles.length === 0) {
      return this.getEmptyStats(missionId, timeRange);
    }

    // Calculate statistics
    const stats = this.calculateStats(profiles, missionId, timeRange);
    
    // Update cache
    this.statsCache.set(cacheKey, { timestamp: now, data: stats });
    
    return stats;
  }

  /**
   * Get profiles by mission ID with optional time range
   */
  private getProfilesByMission(missionId: string, timeRange?: { start: number; end: number }): SuggestionProfile[] {
    const profiles = Array.from(this.profiles.values()).filter(
      p => p.missionId === missionId
    );

    if (!timeRange) return profiles;
    
    return profiles.filter(profile => {
      return profile.timestamp >= timeRange.start && profile.timestamp <= timeRange.end;
    });
  }

  /**
   * Calculate statistics for a set of profiles
   */
  private calculateStats(
    profiles: SuggestionProfile[],
    missionId: string,
    timeRange?: { start: number; end: number }
  ): ProfileStats {
    const now = Date.now();
    const period = {
      start: timeRange?.start || Math.min(...profiles.map(p => p.timestamp)),
      end: timeRange?.end || now
    };

    // Initialize distributions
    const statusDistribution: Record<SuggestionStatus, number> = {
      accepted: 0,
      rejected: 0,
      modified: 0,
      pending: 0
    };

    const impactDistribution: Record<ImpactLevel, number> = {
      low: 0,
      medium: 0,
      high: 0
    };

    const sourceDistribution: Record<SuggestionSource, number> = {
      boundary: 0,
      attribute: 0,
      relation: 0,
      correction: 0,
      other: 0
    };

    const userStats = new Map<string, { count: number; accepted: number; confidenceSum: number }>();
    const featureTypeStats = new Map<string, { count: number; accepted: number; confidenceSum: number }>();
    const rejectionReasons: Record<string, number> = {};
    
    let totalConfidence = 0;
    let totalProcessingTime = 0;
    let totalWithProcessingTime = 0;

    // Process each profile
    for (const profile of profiles) {
      // Update status distribution
      statusDistribution[profile.status]++;
      
      // Update impact distribution
      impactDistribution[profile.impact]++;
      
      // Update source distribution
      sourceDistribution[profile.source]++;
      
      // Update user statistics
      if (profile.userId) {
        const userStat = userStats.get(profile.userId) || { count: 0, accepted: 0, confidenceSum: 0 };
        userStat.count++;
        if (profile.status === 'accepted') userStat.accepted++;
        userStat.confidenceSum += profile.confidence;
        userStats.set(profile.userId, userStat);
      }
      
      // Update feature type statistics
      const featureType = profile.context?.featureType || 'unknown';
      const featureStat = featureTypeStats.get(featureType) || { count: 0, accepted: 0, confidenceSum: 0 };
      featureStat.count++;
      if (profile.status === 'accepted') featureStat.accepted++;
      featureStat.confidenceSum += profile.confidence;
      featureTypeStats.set(featureType, featureStat);
      
      // Track rejection reasons
      if ((profile.status === 'rejected' || profile.status === 'modified') && profile.reason) {
        rejectionReasons[profile.reason] = (rejectionReasons[profile.reason] || 0) + 1;
      }
      
      // Update confidence and processing time
      totalConfidence += profile.confidence;
      if (profile.processingTimeMs) {
        totalProcessingTime += profile.processingTimeMs;
        totalWithProcessingTime++;
      }
    }

    // Calculate acceptance rate
    const totalAccepted = statusDistribution.accepted;
    const totalProcessed = profiles.length - statusDistribution.pending;
    const acceptanceRate = totalProcessed > 0 ? totalAccepted / totalProcessed : 0;

    // Prepare rejection reasons with percentages
    const rejectionReasonStats = Object.entries(rejectionReasons)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: (count / profiles.length) * 100
      }))
      .sort((a, b) => b.count - a.count);

    // Prepare user statistics
    const userStatsArray = Array.from(userStats.entries()).map(([userId, stats]) => ({
      userId,
      suggestions: stats.count,
      acceptanceRate: stats.count > 0 ? stats.accepted / stats.count : 0,
      averageConfidence: stats.count > 0 ? stats.confidenceSum / stats.count : 0
    }));

    // Prepare feature type statistics
    const featureTypeStatsObj: Record<string, { count: number; acceptanceRate: number; averageConfidence: number }> = {};
    featureTypeStats.forEach((stats, featureType) => {
      featureTypeStatsObj[featureType] = {
        count: stats.count,
        acceptanceRate: stats.count > 0 ? stats.accepted / stats.count : 0,
        averageConfidence: stats.count > 0 ? stats.confidenceSum / stats.count : 0
      };
    });

    return {
      missionId,
      period,
      totalSuggestions: profiles.length,
      statusDistribution,
      acceptanceRate,
      averageConfidence: profiles.length > 0 ? totalConfidence / profiles.length : 0,
      confidenceByStatus: this.calculateAverageConfidenceByStatus(profiles),
      impactDistribution,
      sourceDistribution,
      rejectionReasons: rejectionReasonStats,
      averageProcessingTimeMs: totalWithProcessingTime > 0 
        ? totalProcessingTime / totalWithProcessingTime 
        : 0,
      userStats: userStatsArray,
      featureTypeStats: featureTypeStatsObj
    };
  }

  /**
   * Calculate average confidence by status
   */
  private calculateAverageConfidenceByStatus(profiles: SuggestionProfile[]): Record<SuggestionStatus, number> {
    const result: Record<SuggestionStatus, { sum: number; count: number }> = {
      accepted: { sum: 0, count: 0 },
      rejected: { sum: 0, count: 0 },
      modified: { sum: 0, count: 0 },
      pending: { sum: 0, count: 0 }
    };

    for (const profile of profiles) {
      result[profile.status].sum += profile.confidence;
      result[profile.status].count++;
    }

    const averages: Partial<Record<SuggestionStatus, number>> = {};
    for (const [status, data] of Object.entries(result) as [SuggestionStatus, { sum: number; count: number }][]) {
      averages[status] = data.count > 0 ? data.sum / data.count : 0;
    }

    return averages as Record<SuggestionStatus, number>;
  }

  /**
   * Invalidate cache for a mission
   */
  private invalidateCache(missionId: string): void {
    // Invalidate all cache entries for this mission
    for (const [key] of this.statsCache) {
      if (key.startsWith(`mission:${missionId}:`)) {
        this.statsCache.delete(key);
      }
    }
  }

  /**
   * Generate a cache key
   */
  private getCacheKey(type: string, id: string, timeRange?: { start: number; end: number }): string {
    if (timeRange) {
      return `${type}:${id}:${timeRange.start}:${timeRange.end}`;
    }
    return `${type}:${id}:all`;
  }

  /**
   * Get empty stats object
   */
  private getEmptyStats(missionId: string, timeRange?: { start: number; end: number }): ProfileStats {
    const now = Date.now();
    return {
      missionId,
      period: {
        start: timeRange?.start || now,
        end: timeRange?.end || now
      },
      totalSuggestions: 0,
      statusDistribution: {
        accepted: 0,
        rejected: 0,
        modified: 0,
        pending: 0
      },
      acceptanceRate: 0,
      averageConfidence: 0,
      confidenceByStatus: {
        accepted: 0,
        rejected: 0,
        modified: 0,
        pending: 0
      },
      impactDistribution: {
        low: 0,
        medium: 0,
        high: 0
      },
      sourceDistribution: {
        boundary: 0,
        attribute: 0,
        relation: 0,
        correction: 0,
        other: 0
      },
      rejectionReasons: [],
      averageProcessingTimeMs: 0,
      userStats: [],
      featureTypeStats: {}
    };
  }
}

// Singleton instance
export const suggestionProfiler = new SuggestionProfiler();
