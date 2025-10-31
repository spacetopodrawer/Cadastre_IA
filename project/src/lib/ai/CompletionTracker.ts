/**
 * @module CompletionTracker
 * @description Tracks completion status of cartographic features including creation, modification, merging, validation, and enrichment.
 */

type CompletionEvent = {
  id: string;
  featureId: string;
  missionId: string;
  userId: string;
  action: 'created' | 'modified' | 'validated' | 'merged' | 'enriched';
  timestamp: number;
  metadata?: Record<string, any>;
};

type CompletionStats = {
  missionId: string;
  totalFeatures: number;
  validated: number;
  merged: number;
  enriched: number;
  contributors: Record<string, number>;
};

export const CompletionTracker = {
  events: [] as CompletionEvent[],

  /**
   * Records a new completion event
   * @param data Event data without id and timestamp (auto-generated)
   * @returns The created event with id and timestamp
   */
  recordEvent(data: Omit<CompletionEvent, 'id' | 'timestamp'>): CompletionEvent {
    const id = `comp_${Date.now()}`;
    const timestamp = Date.now();
    const event: CompletionEvent = { ...data, id, timestamp };
    this.events.push(event);
    
    // Log the event if FusionAuditLog is available
    if (typeof FusionAuditLog !== 'undefined') {
      FusionAuditLog.record('completion_event', data.userId, event, data.missionId);
    }
    
    return event;
  },

  /**
   * Retrieves completion statistics for a specific mission
   * @param missionId ID of the mission to get stats for
   * @returns Object containing completion statistics
   */
  getStatsByMission(missionId: string): CompletionStats {
    const relevant = this.events.filter(e => e.missionId === missionId);
    const contributors: Record<string, number> = {};
    let validated = 0, merged = 0, enriched = 0;
    const uniqueFeatures = new Set<string>();

    relevant.forEach(e => {
      uniqueFeatures.add(e.featureId);
      contributors[e.userId] = (contributors[e.userId] || 0) + 1;
      if (e.action === 'validated') validated++;
      if (e.action === 'merged') merged++;
      if (e.action === 'enriched') enriched++;
    });

    return {
      missionId,
      totalFeatures: uniqueFeatures.size,
      validated,
      merged,
      enriched,
      contributors
    };
  },

  /**
   * Gets all events for a specific feature
   * @param featureId ID of the feature
   * @returns Array of events related to the feature, sorted by timestamp
   */
  getFeatureHistory(featureId: string): CompletionEvent[] {
    return this.events
      .filter(e => e.featureId === featureId)
      .sort((a, b) => a.timestamp - b.timestamp);
  },

  /**
   * Gets the current status of a feature
   * @param featureId ID of the feature
   * @returns The most recent event for the feature, or undefined if not found
   */
  getFeatureStatus(featureId: string): CompletionEvent | undefined {
    const featureEvents = this.events
      .filter(e => e.featureId === featureId)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return featureEvents[0];
  },

  /**
   * Gets all features that match a specific status
   * @param status Status to filter by
   * @param missionId Optional mission ID to filter by
   * @returns Array of feature IDs matching the criteria
   */
  getFeaturesByStatus(
    status: CompletionEvent['action'],
    missionId?: string
  ): string[] {
    const statusMap = new Map<string, CompletionEvent>();
    
    this.events.forEach(event => {
      if (missionId && event.missionId !== missionId) return;
      if (event.action === status) {
        statusMap.set(event.featureId, event);
      } else if (statusMap.has(event.featureId)) {
        statusMap.delete(event.featureId);
      }
    });
    
    return Array.from(statusMap.keys());
  }
};

// Declare FusionAuditLog if not already declared
declare const FusionAuditLog: {
  record: (type: string, userId: string, data: any, missionId?: string) => void;
} | undefined;
