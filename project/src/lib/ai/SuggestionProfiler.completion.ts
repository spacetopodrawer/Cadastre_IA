import { suggestionProfiler } from './SuggestionProfiler';
import { CompletionTracker } from './CompletionTracker';

// Extend SuggestionProfiler to track completion events
const originalRecordProfile = suggestionProfiler.recordProfile.bind(suggestionProfiler);
suggestionProfiler.recordProfile = function(profile) {
  const result = originalRecordProfile(profile);
  
  // If this is an enrichment suggestion, track it
  if (profile.source === 'attribute' && profile.status === 'accepted') {
    CompletionTracker.recordEvent({
      featureId: profile.featureId,
      missionId: profile.missionId,
      userId: profile.userId || 'system',
      action: 'enriched',
      metadata: {
        suggestionId: profile.suggestionId,
        modelVersion: profile.modelVersion,
        confidence: profile.confidence,
        timestamp: Date.now()
      }
    });
  }
  
  return result;
};

// Extend updateProfile to track status changes
const originalUpdateProfile = suggestionProfiler.updateProfile.bind(suggestionProfiler);
suggestionProfiler.updateProfile = function(suggestionId, updates, userId) {
  const result = originalUpdateProfile(suggestionId, updates, userId);
  
  if (result && updates.status === 'accepted') {
    const profile = suggestionProfiler.getProfile(suggestionId);
    
    if (profile && profile.source === 'attribute') {
      CompletionTracker.recordEvent({
        featureId: profile.featureId,
        missionId: profile.missionId,
        userId: userId || profile.userId || 'system',
        action: 'enriched',
        metadata: {
          suggestionId: profile.suggestionId,
          modelVersion: profile.modelVersion,
          confidence: profile.confidence,
          timestamp: Date.now(),
          updated: true
        }
      });
    }
  }
  
  return result;
};

// Add method to get enrichment stats
const originalGetMissionStats = suggestionProfiler.getMissionStats.bind(suggestionProfiler);
suggestionProfiler.getMissionStats = function(missionId, timeRange) {
  const stats = originalGetMissionStats(missionId, timeRange);
  const completionStats = CompletionTracker.getStatsByMission(missionId);
  
  return {
    ...stats,
    enrichmentStats: {
      totalEnriched: completionStats.enriched,
      enrichmentRate: completionStats.enriched / (completionStats.totalFeatures || 1)
    }
  };
};

export { suggestionProfiler };
