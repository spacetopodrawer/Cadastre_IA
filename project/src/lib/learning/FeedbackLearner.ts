import { v4 as uuidv4 } from 'uuid';
import { auditLog } from '../audit/FusionAuditLog';
import { userReputationManager } from '../reputation/UserReputation';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { LLMAssistantV2 } from '../ai/LLMAssistantV2';

type FeedbackType = 'correction' | 'validation' | 'suggestion' | 'rejection' | 'modification';
type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';
type FeedbackStatus = 'pending' | 'reviewed' | 'applied' | 'rejected';

type FeedbackAdjustment = {
  type: FeedbackType;
  field?: string;
  previousValue?: any;
  newValue: any;
  explanation?: string;
};

type FeedbackRecord = {
  id: string;
  suggestionId: string;
  userId: string;
  missionId: string;
  featureId: string;
  sessionId?: string;
  source: 'web' | 'mobile' | 'api';
  feedback: {
    type: FeedbackType;
    severity: FeedbackSeverity;
    accepted: boolean;
    adjustments: FeedbackAdjustment[];
    reason: string;
    comment?: string;
  };
  context: {
    userRole: string;
    userReputation: number;
    deviceInfo?: {
      type?: string;
      os?: string;
    };
    location?: {
      coordinates: [number, number];
      accuracy?: number;
    };
  };
  reputationWeight: number;
  status: FeedbackStatus;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
};

type LearningStats = {
  totalFeedbacks: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptanceRate: number;
  weightedScore: number;
  topReasons: Array<{ reason: string; count: number; percentage: number }>;
  feedbackByType: Record<FeedbackType, number>;
  feedbackBySeverity: Record<FeedbackSeverity, number>;
};

type FeedbackFilter = {
  startDate?: number;
  endDate?: number;
  missionId?: string;
  userId?: string;
  featureId?: string;
  sessionId?: string;
  type?: FeedbackType | FeedbackType[];
  accepted?: boolean;
  minReputationWeight?: number;
  tags?: string[];
};

class FeedbackLearner {
  private records: FeedbackRecord[] = [];
  private readonly VERSION = 1;
  private readonly TOP_REASONS_LIMIT = 10;
  
  // Cache for performance optimization
  private statsCache: Map<string, { timestamp: number; data: LearningStats }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Register new feedback from users
   */
  async registerFeedback(params: {
    suggestionId: string;
    userId: string;
    missionId: string;
    featureId: string;
    type: FeedbackType;
    accepted: boolean;
    adjustments: FeedbackAdjustment[];
    reason: string;
    comment?: string;
    source?: 'web' | 'mobile' | 'api';
    severity?: FeedbackSeverity;
    deviceInfo?: { type?: string; os?: string };
    location?: { coordinates: [number, number]; accuracy?: number };
    tags?: string[];
  }): Promise<FeedbackRecord> {
    const now = Date.now();
    const userReputation = await userReputationManager.getUserReputation(params.userId);
    
    const record: FeedbackRecord = {
      id: `fb_${uuidv4()}`,
      suggestionId: params.suggestionId,
      userId: params.userId,
      missionId: params.missionId,
      featureId: params.featureId,
      source: params.source || 'web',
      feedback: {
        type: params.type,
        severity: params.severity || this.determineSeverity(params),
        accepted: params.accepted,
        adjustments: params.adjustments,
        reason: params.reason,
        comment: params.comment,
      },
      context: {
        userRole: await this.getUserRole(params.userId, params.missionId),
        userReputation: userReputation.score,
        deviceInfo: params.deviceInfo,
        location: params.location,
      },
      reputationWeight: this.calculateReputationWeight(userReputation, params),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      tags: params.tags,
    };

    this.records.push(record);
    
    // Invalidate cache for this mission
    this.invalidateCache(params.missionId);
    
    // Log the feedback
    await auditLog.record('feedback_received', params.userId, {
      feedbackId: record.id,
      suggestionId: record.suggestionId,
      missionId: record.missionId,
      featureId: record.featureId,
      type: record.feedback.type,
      accepted: record.feedback.accepted,
      severity: record.feedback.severity,
      reputationWeight: record.reputationWeight,
    }, params.missionId);
    
    // Process feedback asynchronously
    this.processFeedback(record).catch(error => {
      console.error('Error processing feedback:', error);
      auditLog.recordError('feedback_processing_error', {
        feedbackId: record.id,
        error: error.message,
      });
    });

    return record;
  }

  /**
   * Get feedback statistics with filtering options
   */
  getStats(filter: FeedbackFilter = {}): LearningStats {
    const cacheKey = this.generateCacheKey('stats', filter);
    const cached = this.statsCache.get(cacheKey);
    
    // Return cached result if still valid
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      return cached.data;
    }
    
    const filtered = this.filterFeedbacks(filter);
    const accepted = filtered.filter(f => f.feedback.accepted);
    const rejected = filtered.filter(f => !f.feedback.accepted);
    
    // Calculate reason frequencies and weighted score
    const reasonCounts: Record<string, number> = {};
    let weightedScore = 0;
    
    filtered.forEach(f => {
      const reason = f.feedback.reason;
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      weightedScore += f.feedback.accepted ? f.reputationWeight : -f.reputationWeight;
    });
    
    // Sort and limit top reasons
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.TOP_REASONS_LIMIT)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round((count / filtered.length) * 1000) / 10, // 1 decimal place
      }));
    
    // Calculate feedback by type and severity
    const feedbackByType = {} as Record<FeedbackType, number>;
    const feedbackBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    
    filtered.forEach(f => {
      feedbackByType[f.feedback.type] = (feedbackByType[f.feedback.type] || 0) + 1;
      feedbackBySeverity[f.feedback.severity]++;
    });
    
    const stats: LearningStats = {
      totalFeedbacks: filtered.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      acceptanceRate: filtered.length > 0 ? accepted.length / filtered.length : 0,
      weightedScore,
      topReasons,
      feedbackByType,
      feedbackBySeverity,
    };
    
    // Cache the result
    this.statsCache.set(cacheKey, {
      timestamp: Date.now(),
      data: stats,
    });
    
    return stats;
  }

  /**
   * Refine AI models based on collected feedback
   */
  async refineModels(): Promise<{
    success: boolean;
    updatedModels: string[];
    metrics: Record<string, any>;
  }> {
    try {
      const feedbackForTraining = this.records.filter(
        f => f.status === 'pending' || f.status === 'reviewed'
      );
      
      if (feedbackForTraining.length === 0) {
        return {
          success: true,
          updatedModels: [],
          metrics: { message: 'No new feedback to process' },
        };
      }
      
      // Group feedback by model/feature
      const feedbackByModel = this.groupFeedbackByModel(feedbackForTraining);
      const updatedModels: string[] = [];
      const metrics: Record<string, any> = {};
      
      // Process each model/feature with LLMAssistantV2
      for (const [modelName, feedbacks] of Object.entries(feedbackByModel)) {
        try {
          // Convert feedback to training examples
          const trainingData = feedbacks.map(f => ({
            input: {
              featureId: f.featureId,
              suggestion: f.feedback.adjustments[0]?.previousValue,
              context: {
                missionId: f.missionId,
                userRole: f.context.userRole,
              },
            },
            output: {
              accepted: f.feedback.accepted,
              adjustments: f.feedback.adjustments,
              reason: f.feedback.reason,
            },
            weight: f.reputationWeight,
          }));
          
          // Update the model using LLMAssistantV2
          const modelMetrics = await LLMAssistantV2.fineTuneModel({
            modelName,
            trainingData,
            feedbackType: feedbacks[0].feedback.type,
            missionId: feedbacks[0].missionId,
          });
          
          // Mark feedback as processed
          this.markFeedbackAsProcessed(feedbacks.map(f => f.id));
          
          updatedModels.push(modelName);
          metrics[modelName] = modelMetrics;
          
          // Log the model update
          await auditLog.record('model_updated', 'system', {
            model: modelName,
            feedbackCount: feedbacks.length,
            metrics: modelMetrics,
          });
          
        } catch (error) {
          console.error(`Error refining model ${modelName}:`, error);
          await auditLog.recordError('model_update_failed', {
            model: modelName,
            error: error.message,
          });
        }
      }
      
      return {
        success: updatedModels.length > 0,
        updatedModels,
        metrics,
      };
      
    } catch (error) {
      console.error('Error in refineModels:', error);
      await auditLog.recordError('refine_models_failed', {
        error: error.message,
      });
      throw error;
    }
  }

  // --- Helper Methods ---

  private async processFeedback(record: FeedbackRecord): Promise<void> {
    try {
      // Update user reputation based on feedback quality
      await this.updateUserReputation(record);
      
      // Update feedback status
      this.updateFeedbackStatus(record.id, 'reviewed', 'system');
      
      // If feedback is a rejection, analyze for patterns
      if (!record.feedback.accepted) {
        await this.analyzeRejectionPattern(record);
      }
      
      // Broadcast feedback processed event
      realtimeBridge.broadcast({
        type: 'feedback_processed',
        payload: {
          feedbackId: record.id,
          missionId: record.missionId,
          featureId: record.featureId,
          status: 'reviewed',
          timestamp: Date.now(),
        },
        scope: 'mission',
        target: record.missionId,
      });
      
    } catch (error) {
      console.error('Error processing feedback:', error);
      await auditLog.recordError('feedback_processing_error', {
        feedbackId: record.id,
        error: error.message,
      });
    }
  }

  private async analyzeRejectionPattern(record: FeedbackRecord): Promise<void> {
    // Look for similar rejections in the same mission
    const similarRejections = this.records.filter(f => 
      f.missionId === record.missionId &&
      !f.feedback.accepted &&
      f.id !== record.id &&
      f.feedback.reason.toLowerCase() === record.feedback.reason.toLowerCase()
    );
    
    // If we find multiple similar rejections, log a pattern
    if (similarRejections.length >= 2) {
      await auditLog.record('rejection_pattern_detected', 'system', {
        missionId: record.missionId,
        reason: record.feedback.reason,
        count: similarRejections.length + 1, // +1 for current record
        exampleIds: [...similarRejections.map(f => f.id).slice(0, 3), record.id],
      });
    }
  }

  private async updateUserReputation(record: FeedbackRecord): Promise<void> {
    const reputationChange = this.calculateReputationChange(record);
    
    if (reputationChange !== 0) {
      await userReputationManager.adjustReputation({
        userId: record.userId,
        delta: reputationChange,
        reason: 'feedback_quality',
        metadata: {
          feedbackId: record.id,
          type: record.feedback.type,
          severity: record.feedback.severity,
          accepted: record.feedback.accepted,
        },
      });
    }
  }

  private calculateReputationChange(record: FeedbackRecord): number {
    // Base reputation change based on feedback type and severity
    const baseScores: Record<FeedbackType, number> = {
      correction: 5,
      validation: 3,
      suggestion: 2,
      rejection: 4,
      modification: 3,
    };
    
    const severityMultipliers: Record<FeedbackSeverity, number> = {
      low: 0.5,
      medium: 1,
      high: 1.5,
      critical: 2,
    };
    
    const baseScore = baseScores[record.feedback.type] || 1;
    const multiplier = severityMultipliers[record.feedback.severity] || 1;
    
    // Adjust based on whether feedback was accepted
    const acceptanceFactor = record.feedback.accepted ? 1 : -0.5;
    
    return Math.round(baseScore * multiplier * acceptanceFactor);
  }

  private determineSeverity(params: {
    type: FeedbackType;
    accepted: boolean;
    adjustments: FeedbackAdjustment[];
    reason: string;
  }): FeedbackSeverity {
    // Simple heuristic to determine severity
    if (!params.accepted) {
      if (params.adjustments.some(a => a.type === 'critical')) return 'critical';
      if (params.reason.toLowerCase().includes('error') || params.reason.toLowerCase().includes('incorrect')) {
        return 'high';
      }
      return 'medium';
    }
    return 'low';
  }

  private calculateReputationWeight(
    userReputation: { score: number },
    params: { type: FeedbackType; severity: FeedbackSeverity }
  ): number {
    // Base weight from user reputation (0-1)
    const baseWeight = Math.min(1, Math.max(0, userReputation.score / 1000));
    
    // Adjust based on feedback type and severity
    const typeWeights: Record<FeedbackType, number> = {
      correction: 1.2,
      validation: 1.0,
      suggestion: 0.8,
      rejection: 1.1,
      modification: 1.0,
    };
    
    const severityWeights: Record<FeedbackSeverity, number> = {
      low: 0.7,
      medium: 1.0,
      high: 1.3,
      critical: 1.5,
    };
    
    return baseWeight * typeWeights[params.type] * severityWeights[params.severity || 'medium'];
  }

  private filterFeedbacks(filter: FeedbackFilter): FeedbackRecord[] {
    return this.records.filter(record => {
      // Filter by date range
      if (filter.startDate && record.createdAt < filter.startDate) return false;
      if (filter.endDate && record.createdAt > filter.endDate) return false;
      
      // Filter by mission
      if (filter.missionId && record.missionId !== filter.missionId) return false;
      
      // Filter by user
      if (filter.userId && record.userId !== filter.userId) return false;
      
      // Filter by feature
      if (filter.featureId && record.featureId !== filter.featureId) return false;
      
      // Filter by type
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(record.feedback.type)) return false;
      }
      
      // Filter by reputation weight
      if (filter.minReputationWeight && record.reputationWeight < filter.minReputationWeight) {
        return false;
      }
      
      // Filter by tags
      if (filter.tags && filter.tags.length > 0 && record.tags) {
        if (!filter.tags.some(tag => record.tags?.includes(tag))) {
          return false;
        }
      }
      
      return true;
    });
  }

  private groupFeedbackByModel(feedbacks: FeedbackRecord[]): Record<string, FeedbackRecord[]> {
    // In a real implementation, you'd group by the model/feature that generated the suggestion
    // For now, we'll use a simple grouping by feedback type and mission
    return feedbacks.reduce((acc, feedback) => {
      const modelName = `${feedback.missionId}_${feedback.feedback.type}`;
      if (!acc[modelName]) {
        acc[modelName] = [];
      }
      acc[modelName].push(feedback);
      return acc;
    }, {} as Record<string, FeedbackRecord[]>);
  }

  private markFeedbackAsProcessed(feedbackIds: string[]): void {
    const now = Date.now();
    feedbackIds.forEach(id => {
      const feedback = this.records.find(f => f.id === id);
      if (feedback) {
        feedback.status = 'applied';
        feedback.updatedAt = now;
      }
    });
    
    // Invalidate cache
    this.invalidateCache();
  }

  private updateFeedbackStatus(
    feedbackId: string, 
    status: FeedbackStatus, 
    updatedBy: string
  ): void {
    const feedback = this.records.find(f => f.id === feedbackId);
    if (feedback) {
      feedback.status = status;
      feedback.updatedAt = Date.now();
      
      if (status === 'reviewed' && !feedback.reviewedBy) {
        feedback.reviewedBy = updatedBy;
        feedback.reviewedAt = Date.now();
      }
      
      // Log the status change
      auditLog.record('feedback_status_updated', updatedBy, {
        feedbackId,
        previousStatus: feedback.status,
        newStatus: status,
        missionId: feedback.missionId,
      });
    }
  }

  private generateCacheKey(prefix: string, filter: FeedbackFilter): string {
    // Generate a consistent cache key based on the filter parameters
    return `${prefix}_${JSON.stringify({
      ...filter,
      // Exclude functions or complex objects
      tags: filter.tags ? filter.tags.sort().join(',') : '',
    })}`;
  }

  private invalidateCache(missionId?: string): void {
    if (missionId) {
      // Invalidate cache entries for a specific mission
      for (const [key, value] of this.statsCache.entries()) {
        if (key.includes(`missionId":"${missionId}"`)) {
          this.statsCache.delete(key);
        }
      }
    } else {
      // Invalidate all cache entries
      this.statsCache.clear();
    }
  }

  private async getUserRole(userId: string, missionId: string): Promise<string> {
    // In a real implementation, fetch from your user/role management system
    // This is a simplified placeholder
    const roles = ['annotator', 'validator', 'reviewer', 'auditor'];
    return roles[Math.floor(Math.random() * roles.length)];
  }

  // --- Public API ---
  
  /**
   * Get a feedback record by ID
   */
  getFeedback(feedbackId: string): FeedbackRecord | undefined {
    return this.records.find(f => f.id === feedbackId);
  }
  
  /**
   * List feedback records with optional filtering
   */
  listFeedbacks(filter: FeedbackFilter = {}): FeedbackRecord[] {
    return this.filterFeedbacks(filter);
  }
  
  /**
   * Get feedback statistics for a mission
   */
  getMissionStats(missionId: string): LearningStats {
    return this.getStats({ missionId });
  }
  
  /**
   * Get feedback statistics for a user
   */
  getUserStats(userId: string, filter: Omit<FeedbackFilter, 'userId'> = {}): LearningStats {
    return this.getStats({ ...filter, userId });
  }
  
  /**
   * Get feedback statistics by feature type
   */
  getFeatureTypeStats(featureType: string, filter: Omit<FeedbackFilter, 'featureType'> = {}): LearningStats {
    return this.getStats({ ...filter, tags: [featureType, ...(filter.tags || [])] });
  }
  
  /**
   * Get the most common feedback reasons
   */
  getCommonReasons(limit = 5): Array<{ reason: string; count: number }> {
    const reasonCounts: Record<string, number> = {};
    
    this.records.forEach(record => {
      const reason = record.feedback.reason;
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    
    return Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([reason, count]) => ({ reason, count }));
  }
  
  /**
   * Get feedback acceptance rate over time
   */
  getAcceptanceTrend(days = 30): Array<{ date: string; accepted: number; rejected: number }> {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const result: Array<{ date: string; accepted: number; rejected: number }> = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const start = now - (i + 1) * oneDay;
      const end = now - i * oneDay;
      const date = new Date(end).toISOString().split('T')[0];
      
      const dailyFeedbacks = this.records.filter(f => 
        f.createdAt >= start && f.createdAt < end
      );
      
      const accepted = dailyFeedbacks.filter(f => f.feedback.accepted).length;
      const rejected = dailyFeedbacks.length - accepted;
      
      result.push({ date, accepted, rejected });
    }
    
    return result;
  }
  
  /**
   * Get feedback statistics by user role
   */
  async getStatsByRole(missionId: string): Promise<Record<string, LearningStats>> {
    const feedbacks = this.filterFeedbacks({ missionId });
    const roles = new Set<string>();
    
    // First, collect all unique roles
    for (const feedback of feedbacks) {
      if (feedback.context.userRole) {
        roles.add(feedback.context.userRole);
      }
    }
    
    // Get stats for each role
    const result: Record<string, LearningStats> = {};
    for (const role of roles) {
      const roleFeedbacks = feedbacks.filter(f => f.context.userRole === role);
      result[role] = this.calculateStats(roleFeedbacks);
    }
    
    return result;
  }
  
  /**
   * Calculate statistics for a set of feedbacks
   */
  private calculateStats(feedbacks: FeedbackRecord[]): LearningStats {
    const accepted = feedbacks.filter(f => f.feedback.accepted);
    const rejected = feedbacks.filter(f => !f.feedback.accepted);
    
    // Calculate reason frequencies and weighted score
    const reasonCounts: Record<string, number> = {};
    let weightedScore = 0;
    
    feedbacks.forEach(f => {
      const reason = f.feedback.reason;
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      weightedScore += f.feedback.accepted ? f.reputationWeight : -f.reputationWeight;
    });
    
    // Sort and limit top reasons
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.TOP_REASONS_LIMIT)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round((count / feedbacks.length) * 1000) / 10, // 1 decimal place
      }));
    
    // Calculate feedback by type and severity
    const feedbackByType = {} as Record<FeedbackType, number>;
    const feedbackBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    
    feedbacks.forEach(f => {
      feedbackByType[f.feedback.type] = (feedbackByType[f.feedback.type] || 0) + 1;
      feedbackBySeverity[f.feedback.severity]++;
    });
    
    return {
      totalFeedbacks: feedbacks.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      acceptanceRate: feedbacks.length > 0 ? accepted.length / feedbacks.length : 0,
      weightedScore,
      topReasons,
      feedbackByType,
      feedbackBySeverity,
    };
  }
}

// Export a singleton instance
export const feedbackLearner = new FeedbackLearner();

export type {
  FeedbackRecord,
  FeedbackType,
  FeedbackSeverity,
  FeedbackStatus,
  FeedbackAdjustment,
  LearningStats,
  FeedbackFilter,
};
