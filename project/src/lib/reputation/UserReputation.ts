import { FusionAuditLog } from '../audit/FusionAuditLog';

export type ReputationEventType = 'validation' | 'suggestion' | 'feedback' | 'collaboration' | 'correction' | 'export' | 'import';

export interface ReputationEvent {
  id: string;
  userId: string;
  type: ReputationEventType;
  weight: number;
  timestamp: number;
  missionId?: string;
  entityId?: string;
  metadata?: {
    accuracy?: number;
    complexity?: 'low' | 'medium' | 'high';
    impact?: 'low' | 'medium' | 'high';
  };
}

export interface UserReputation {
  userId: string;
  score: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  badges: string[];
  stats: {
    validations: {
      total: number;
      approved: number;
      rejected: number;
      accuracy: number;
    };
    suggestions: {
      total: number;
      accepted: number;
      rejected: number;
      accuracy: number;
    };
    feedback: {
      given: number;
      received: number;
      helpful: number;
      helpfulness: number;
    };
    collaboration: {
      missions: Set<string>;
      sessions: number;
      duration: number; // in minutes
    };
  };
  lastUpdated: number;
}

const XP_PER_LEVEL = 100;
const MAX_LEVEL = 100;

const BADGES = {
  BEGINNER: { name: 'Débutant', threshold: 0 },
  CONTRIBUTOR: { name: 'Contributeur', threshold: 10 },
  EXPERT: { name: 'Expert', threshold: 50 },
  MASTER: { name: 'Maître', threshold: 100 },
  COLLABORATOR: { name: 'Collaborateur', threshold: 0, type: 'collaboration' },
  VALIDATOR: { name: 'Validateur', threshold: 0, type: 'validation' },
  MENTOR: { name: 'Mentor', threshold: 0, type: 'feedback' },
  PIONEER: { name: 'Pionnier', threshold: 0, type: 'pioneer' },
} as const;

type BadgeType = keyof typeof BADGES;

export class UserReputationManager {
  private static instance: UserReputationManager;
  private reputations: Map<string, UserReputation>;
  private eventWeights: Record<ReputationEventType, number>;
  private auditLog: FusionAuditLog;

  private constructor() {
    this.reputations = new Map();
    this.auditLog = FusionAuditLog.getInstance();
    this.initializeEventWeights();
    this.loadFromStorage();
  }

  public static getInstance(): UserReputationManager {
    if (!UserReputationManager.instance) {
      UserReputationManager.instance = new UserReputationManager();
    }
    return UserReputationManager.instance;
  }

  private initializeEventWeights(): void {
    this.eventWeights = {
      validation: 5,
      suggestion: 3,
      feedback: 2,
      collaboration: 1,
      correction: 4,
      export: 1,
      import: 1,
    };
  }

  public recordEvent(event: Omit<ReputationEvent, 'id' | 'timestamp' | 'weight'>): UserReputation {
    const timestamp = Date.now();
    const weight = this.calculateEventWeight(event);
    const eventWithId: ReputationEvent = {
      ...event,
      id: `${event.userId}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      weight,
    };

    // Get or create user reputation
    let reputation = this.reputations.get(event.userId) || this.createNewUserReputation(event.userId);

    // Update reputation
    reputation = this.updateReputation(reputation, eventWithId);
    this.reputations.set(event.userId, reputation);

    // Log the event
    this.auditLog.logEvent({
      type: 'reputation_update',
      userId: event.userId,
      entityType: 'user_reputation',
      entityId: event.entityId || 'system',
      metadata: {
        eventType: event.type,
        pointsEarned: weight,
        newScore: reputation.score,
        newLevel: reputation.level,
        badgesEarned: reputation.badges,
        missionId: event.missionId,
      },
    });

    // Save to storage
    this.saveToStorage();

    return reputation;
  }

  public getUserReputation(userId: string): UserReputation | undefined {
    return this.reputations.get(userId);
  }

  public getLeaderboard(limit: number = 10): UserReputation[] {
    return Array.from(this.reputations.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  public getMissionLeaderboard(missionId: string, limit: number = 10): UserReputation[] {
    // This would be implemented to filter events by missionId
    // For now, returning global leaderboard as a fallback
    return this.getLeaderboard(limit);
  }

  public getBadges(userId: string): string[] {
    return this.reputations.get(userId)?.badges || [];
  }

  public getLevelProgress(userId: string): { current: number; total: number; percentage: number } {
    const rep = this.reputations.get(userId);
    if (!rep) return { current: 0, total: XP_PER_LEVEL, percentage: 0 };

    const currentLevelXP = (rep.level - 1) * XP_PER_LEVEL;
    const currentXP = rep.xp - currentLevelXP;
    const xpForNextLevel = rep.xpToNextLevel;
    
    return {
      current: currentXP,
      total: xpForNextLevel,
      percentage: Math.min(100, Math.round((currentXP / xpForNextLevel) * 100)),
    };
  }

  private calculateEventWeight(event: Omit<ReputationEvent, 'id' | 'timestamp' | 'weight'>): number {
    let weight = this.eventWeights[event.type] || 1;
    
    // Apply modifiers based on metadata
    if (event.metadata) {
      // Higher weight for more complex tasks
      if (event.metadata.complexity === 'high') weight *= 1.5;
      else if (event.metadata.complexity === 'medium') weight *= 1.25;
      
      // Higher weight for high impact contributions
      if (event.metadata.impact === 'high') weight *= 2;
      else if (event.metadata.impact === 'medium') weight *= 1.5;
      
      // Adjust weight based on accuracy for validations/suggestions
      if (event.type === 'validation' || event.type === 'suggestion') {
        if (event.metadata.accuracy) {
          weight *= event.metadata.accuracy; // accuracy is 0-1
        }
      }
    }

    return Math.round(weight * 10) / 10; // Round to 1 decimal place
  }

  private createNewUserReputation(userId: string): UserReputation {
    return {
      userId,
      score: 0,
      level: 1,
      xp: 0,
      xpToNextLevel: XP_PER_LEVEL,
      badges: [BADGES.BEGINNER.name],
      stats: {
        validations: { total: 0, approved: 0, rejected: 0, accuracy: 1 },
        suggestions: { total: 0, accepted: 0, rejected: 0, accuracy: 1 },
        feedback: { given: 0, received: 0, helpful: 0, helpfulness: 1 },
        collaboration: { missions: new Set(), sessions: 0, duration: 0 },
      },
      lastUpdated: Date.now(),
    };
  }

  private updateReputation(reputation: UserReputation, event: ReputationEvent): UserReputation {
    // Update XP and level
    const newXP = reputation.xp + event.weight;
    const newLevel = Math.min(
      Math.floor(Math.sqrt(newXP / XP_PER_LEVEL)) + 1,
      MAX_LEVEL
    );
    const xpToNextLevel = newLevel < MAX_LEVEL 
      ? Math.pow(newLevel, 2) * XP_PER_LEVEL - newXP 
      : 0;

    // Update stats based on event type
    const updatedStats = { ...reputation.stats };
    
    switch (event.type) {
      case 'validation':
        updatedStats.validations.total++;
        if (event.metadata?.accuracy) {
          updatedStats.validations.accuracy = 
            (updatedStats.validations.accuracy * (updatedStats.validations.total - 1) + event.metadata.accuracy) /
            updatedStats.validations.total;
        }
        break;
        
      case 'suggestion':
        updatedStats.suggestions.total++;
        if (event.metadata?.accuracy) {
          updatedStats.suggestions.accuracy = 
            (updatedStats.suggestions.accuracy * (updatedStats.suggestions.total - 1) + event.metadata.accuracy) /
            updatedStats.suggestions.total;
        }
        break;
        
      case 'collaboration':
        updatedStats.collaboration.sessions++;
        if (event.missionId) {
          updatedStats.collaboration.missions.add(event.missionId);
        }
        break;
        
      case 'feedback':
        updatedStats.feedback.given++;
        if (event.metadata?.helpful) {
          updatedStats.feedback.helpful++;
          updatedStats.feedback.helpfulness = 
            updatedStats.feedback.helpful / updatedStats.feedback.given;
        }
        break;
    }

    // Check for new badges
    const newBadges = this.checkForNewBadges({
      ...reputation,
      xp: newXP,
      level: newLevel,
      stats: updatedStats,
    });

    return {
      ...reputation,
      score: reputation.score + event.weight,
      xp: newXP,
      level: newLevel,
      xpToNextLevel,
      badges: [...new Set([...reputation.badges, ...newBadges])],
      stats: updatedStats,
      lastUpdated: Date.now(),
    };
  }

  private checkForNewBadges(reputation: UserReputation): string[] {
    const newBadges: string[] = [];
    const { level, stats } = reputation;

    // Level-based badges
    if (level >= BADGES.EXPERT.threshold && !reputation.badges.includes(BADGES.EXPERT.name)) {
      newBadges.push(BADGES.EXPERT.name);
    }
    if (level >= BADGES.MASTER.threshold && !reputation.badges.includes(BADGES.MASTER.name)) {
      newBadges.push(BADGES.MASTER.name);
    }

    // Activity-based badges
    if (stats.validations.total >= 50 && !reputation.badges.includes(BADGES.VALIDATOR.name)) {
      newBadges.push(BADGES.VALIDATOR.name);
    }
    
    if (stats.collaboration.missions.size >= 5 && !reputation.badges.includes(BADGES.COLLABORATOR.name)) {
      newBadges.push(BADGES.COLLABORATOR.name);
    }
    
    if (stats.feedback.given >= 20 && stats.feedback.helpful >= 10 && 
        !reputation.badges.includes(BADGES.MENTOR.name)) {
      newBadges.push(BADGES.MENTOR.name);
    }

    // Special badges
    if (reputation.badges.length === 0 && level >= 5) {
      newBadges.push(BADGES.CONTRIBUTOR.name);
    }

    return newBadges;
  }

  private saveToStorage(): void {
    try {
      // Convert Sets to Arrays for JSON serialization
      const serializableData = Array.from(this.reputations.entries()).map(([userId, rep]) => ({
        ...rep,
        stats: {
          ...rep.stats,
          collaboration: {
            ...rep.stats.collaboration,
            missions: Array.from(rep.stats.collaboration.missions),
          },
        },
      }));

      localStorage.setItem('userReputations', JSON.stringify(serializableData));
    } catch (error) {
      console.error('Failed to save user reputations:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const savedData = localStorage.getItem('userReputations');
      if (!savedData) return;

      const parsedData = JSON.parse(savedData);
      
      this.reputations = new Map(
        parsedData.map((item: any) => [
          item.userId,
          {
            ...item,
            stats: {
              ...item.stats,
              collaboration: {
                ...item.stats.collaboration,
                missions: new Set(item.stats.collaboration.missions || []),
              },
            },
          },
        ])
      );
    } catch (error) {
      console.error('Failed to load user reputations:', error);
    }
  }
}

// Singleton instance
export const userReputationManager = UserReputationManager.getInstance();
