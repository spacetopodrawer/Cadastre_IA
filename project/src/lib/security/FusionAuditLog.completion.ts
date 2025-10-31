import { fusionAuditLog } from './FusionAuditLog';
import { CompletionTracker } from '../ai/CompletionTracker';

// Extend FusionAuditLog to track completion events
const originalLog = fusionAuditLog.logSecurityEvent.bind(fusionAuditLog);
fusionAuditLog.logSecurityEvent = function(event) {
  // Check if this is a completion-related event
  if (event.type === 'completion_event') {
    const { featureId, missionId, userId, action, metadata } = event.data;
    
    // Forward the event to CompletionTracker
    CompletionTracker.recordEvent({
      featureId,
      missionId,
      userId,
      action,
      metadata: {
        ...metadata,
        auditLogId: event.id,
        timestamp: event.timestamp.getTime()
      }
    });
  }
  
  return originalLog(event);
};

// Add method to get completion audit trail
fusionAuditLog.getCompletionAuditTrail = function(missionId: string, featureId?: string) {
  const events = CompletionTracker.getEventsByMission(missionId, featureId);
  
  return events.map(event => ({
    id: event.id,
    timestamp: new Date(event.timestamp),
    action: event.action,
    userId: event.userId,
    featureId: event.featureId,
    metadata: event.metadata
  }));
};

// Add method to get completion statistics
fusionAuditLog.getCompletionStats = function(missionId: string) {
  return CompletionTracker.getStatsByMission(missionId);
};

export { fusionAuditLog };
