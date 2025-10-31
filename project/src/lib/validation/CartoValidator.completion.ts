import { cartoValidator } from './CartoValidator';
import { CompletionTracker } from '../ai/CompletionTracker';

// Extend CartoValidator to track completion events
const originalRecordAction = cartoValidator.recordAction.bind(cartoValidator);
cartoValidator.recordAction = async function(...args) {
  const result = await originalRecordAction(...args);
  
  // If this is a validation action, track it
  if (result.record && ['approve', 'reject'].includes(result.record.action)) {
    const { suggestionId, featureId, missionId, userId, action } = result.record;
    
    // Record a validation event
    CompletionTracker.recordEvent({
      featureId,
      missionId,
      userId,
      action: action === 'approve' ? 'validated' : 'modified',
      metadata: {
        suggestionId,
        validationAction: action,
        timestamp: Date.now()
      }
    });
    
    // If this was a merge action, record that too
    if (action === 'approve' && result.record.metadata?.merged) {
      CompletionTracker.recordEvent({
        featureId,
        missionId,
        userId,
        action: 'merged',
        metadata: {
          suggestionId,
          timestamp: Date.now()
        }
      });
    }
  }
  
  return result;
};

// Extend CartoValidator to handle conflict resolution
type OriginalResolveConflict = typeof cartoValidator.resolveConflict;
const originalResolveConflict = cartoValidator.resolveConflict.bind(cartoValidator) as OriginalResolveConflict;

cartoValidator.resolveConflict = function(conflictId, resolution, resolvedBy) {
  const result = originalResolveConflict(conflictId, resolution, resolvedBy);
  
  if (result.resolved) {
    const conflict = result.conflict;
    
    // Record the resolution
    CompletionTracker.recordEvent({
      featureId: conflict.conflictingActions[0]?.featureId || '',
      missionId: conflict.missionId,
      userId: resolvedBy,
      action: 'validated',
      metadata: {
        conflictId: conflict.id,
        resolution,
        timestamp: Date.now()
      }
    });
  }
  
  return result;
};

// Add method to get completion stats for validation
const originalGetStats = cartoValidator.getStats.bind(cartoValidator);
cartoValidator.getStats = function(missionId: string) {
  const stats = originalGetStats(missionId);
  const completionStats = CompletionTracker.getStatsByMission(missionId);
  
  return {
    ...stats,
    completion: {
      validated: completionStats.validated,
      merged: completionStats.merged,
      enriched: completionStats.enriched,
      totalFeatures: completionStats.totalFeatures
    }
  };
};

export { cartoValidator };
