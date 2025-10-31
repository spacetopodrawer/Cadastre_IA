import { FusionAuditLog } from '../audit/FusionAuditLog';
import { UserReputation } from '../reputation/UserReputation';
import { FeedbackLearner } from '../learning/FeedbackLearner';

type MissionStats = {
  missionId: string;
  totalFeatures: number;
  validatedFeatures: number;
  rejectedFeatures: number;
  anomaliesDetected: number;
  reputationAverage: number;
  feedbackCount: number;
  lastUpdated: number;
  validationRate?: number;
  rejectionRate?: number;
  anomalyRate?: number;
  contributors?: string[];
  topValidators?: { userId: string; count: number }[];
  recentActivity?: { timestamp: number; type: string; userId: string }[];
};

type MissionDashboardOptions = {
  maxContributors?: number;
  topValidatorsLimit?: number;
  recentActivityLimit?: number;
  autoUpdateInterval?: number;
};

export class MissionDashboard {
  private stats: Map<string, MissionStats> = new Map();
  private options: Required<MissionDashboardOptions>;
  private updateInterval?: NodeJS.Timeout;

  constructor(options: MissionDashboardOptions = {}) {
    this.options = {
      maxContributors: 100,
      topValidatorsLimit: 5,
      recentActivityLimit: 10,
      autoUpdateInterval: 300000, // 5 minutes
      ...options
    };
  }

  /**
   * Initialize the dashboard with auto-update
   */
  initialize(): void {
    this.scheduleAutoUpdate();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  /**
   * Update mission statistics with new data
   */
  updateStats(missionId: string, updates: Partial<MissionStats>): MissionStats {
    const current = this.stats.get(missionId) || this.createDefaultStats(missionId);
    
    const updated: MissionStats = {
      ...current,
      ...updates,
      lastUpdated: Date.now()
    };

    // Calculate derived metrics
    updated.validationRate = updated.totalFeatures > 0 
      ? updated.validatedFeatures / updated.totalFeatures 
      : 0;
      
    updated.rejectionRate = updated.totalFeatures > 0 
      ? updated.rejectedFeatures / updated.totalFeatures 
      : 0;
      
    updated.anomalyRate = updated.validatedFeatures > 0 
      ? updated.anomaliesDetected / updated.validatedFeatures 
      : 0;

    this.stats.set(missionId, updated);
    
    // Log the update
    FusionAuditLog.record(
      'mission_stats_updated',
      'system',
      {
        missionId,
        updatedFields: Object.keys(updates),
        stats: updated
      },
      missionId
    );

    return updated;
  }

  /**
   * Get statistics for a specific mission
   */
  getStats(missionId: string): MissionStats | undefined {
    return this.stats.get(missionId);
  }

  /**
   * List all mission statistics, sorted by last updated
   */
  listAll(): MissionStats[] {
    return Array.from(this.stats.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  /**
   * Get mission statistics with additional calculated metrics
   */
  getEnhancedStats(missionId: string): MissionStats | undefined {
    const stats = this.getStats(missionId);
    if (!stats) return undefined;

    // Get feedback statistics from FeedbackLearner
    const feedbackStats = FeedbackLearner.getMissionStats(missionId);
    
    // Get top validators (users with most validations)
    const topValidators = this.getTopValidators(missionId);
    
    return {
      ...stats,
      feedbackCount: feedbackStats?.totalFeedbacks || 0,
      topValidators,
      recentActivity: this.getRecentActivity(missionId)
    };
  }

  /**
   * Record a new validation for a mission
   */
  recordValidation(missionId: string, userId: string, accepted: boolean): void {
    const stats = this.getStats(missionId) || this.createDefaultStats(missionId);
    
    this.updateStats(missionId, {
      validatedFeatures: stats.validatedFeatures + 1,
      rejectedFeatures: accepted ? stats.rejectedFeatures : stats.rejectedFeatures + 1
    });

    // Update user reputation
    UserReputation.updateUserReputation(userId, {
      type: 'validation',
      success: accepted,
      missionId
    });
  }

  /**
   * Record an anomaly detection
   */
  recordAnomaly(missionId: string, featureId: string, details: any): void {
    const stats = this.getStats(missionId) || this.createDefaultStats(missionId);
    
    this.updateStats(missionId, {
      anomaliesDetected: stats.anomaliesDetected + 1
    });

    FusionAuditLog.record(
      'anomaly_detected',
      'system',
      { featureId, details, missionId },
      missionId
    );
  }

  /**
   * Get the top validators for a mission
   */
  private getTopValidators(missionId: string, limit: number = this.options.topValidatorsLimit) {
    // In a real implementation, this would query the validation history
    // For now, return a placeholder
    return [];
  }

  /**
   * Get recent activity for a mission
   */
  private getRecentActivity(missionId: string, limit: number = this.options.recentActivityLimit) {
    // In a real implementation, this would query the audit log
    // For now, return a placeholder
    return [];
  }

  /**
   * Schedule automatic updates of mission statistics
   */
  private scheduleAutoUpdate(): void {
    this.updateInterval = setInterval(() => {
      this.updateAllMissionStats();
    }, this.options.autoUpdateInterval);
  }

  /**
   * Update statistics for all missions
   */
  private async updateAllMissionStats(): Promise<void> {
    try {
      // In a real implementation, this would fetch all mission IDs and update their stats
      // For now, just log that the update was triggered
      console.log('Updating mission statistics...');
    } catch (error) {
      console.error('Failed to update mission statistics:', error);
      FusionAuditLog.recordError('update_mission_stats_failed', error);
    }
  }

  /**
   * Create default statistics for a new mission
   */
  private createDefaultStats(missionId: string): MissionStats {
    return {
      missionId,
      totalFeatures: 0,
      validatedFeatures: 0,
      rejectedFeatures: 0,
      anomaliesDetected: 0,
      reputationAverage: 0,
      feedbackCount: 0,
      lastUpdated: Date.now(),
      validationRate: 0,
      rejectionRate: 0,
      anomalyRate: 0,
      contributors: [],
      topValidators: [],
      recentActivity: []
    };
  }
}

// Singleton instance
export const missionDashboard = new MissionDashboard();
