import { CompletionTracker } from '../ai/CompletionTracker';
import { MissionDashboard } from './MissionDashboard';
import { cartoValidator } from '../validation/CartoValidator';
import { suggestionProfiler } from '../ai/SuggestionProfiler';

declare module './MissionDashboard' {
  interface MissionStats {
    completionStats?: {
      completed: number;
      validated: number;
      merged: number;
      enriched: number;
      completionRate: number;
      validationRate: number;
      mergeRate: number;
      enrichmentRate: number;
    };
  }
}

// Extend MissionDashboard with completion tracking
MissionDashboard.prototype.getCompletionStats = function(missionId: string) {
  const stats = CompletionTracker.getStatsByMission(missionId);
  const total = stats.totalFeatures || 1; // Avoid division by zero
  
  return {
    completed: stats.validated + stats.merged + stats.enriched,
    validated: stats.validated,
    merged: stats.merged,
    enriched: stats.enriched,
    completionRate: (stats.validated + stats.merged + stats.enriched) / total,
    validationRate: stats.validated / total,
    mergeRate: stats.merged / total,
    enrichmentRate: stats.enriched / total
  };
};

// Add completion stats to the main stats
const originalGetStats = MissionDashboard.prototype.getStats;
MissionDashboard.prototype.getStats = function(missionId: string) {
  const stats = originalGetStats.call(this, missionId);
  return {
    ...stats,
    completionStats: this.getCompletionStats(missionId)
  };
};

// Add method to get completion history
MissionDashboard.prototype.getCompletionHistory = function(missionId: string, days: number = 30) {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  const history = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const end = now - (i * dayInMs);
    const start = end - dayInMs;
    
    const dayStats = {
      date: new Date(start).toISOString().split('T')[0],
      completed: 0,
      validated: 0,
      merged: 0,
      enriched: 0
    };
    
    // Get events for this day
    const events = CompletionTracker.getEventsByTimeRange(missionId, start, end);
    
    events.forEach(event => {
      if (['validated', 'merged', 'enriched'].includes(event.action)) {
        dayStats[event.action as keyof typeof dayStats]++;
      }
      if (event.action !== 'modified') {
        dayStats.completed++;
      }
    });
    
    history.push(dayStats);
  }
  
  return history;
};

// Export extended MissionDashboard
export { MissionDashboard };
