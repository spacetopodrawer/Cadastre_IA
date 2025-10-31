import { UserRank, PrecisionRank } from './PrecisionRank';
import { RewardEngine } from './RewardEngine';
import { BillingBridge } from './BillingBridge';
import { ContributionTracker, type Contribution } from './ContributionTracker';

export interface UserProfileData {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  joinDate: Date;
  lastActive: Date;
  rank: UserRank;
  credits: number;
  preferences: {
    language: string;
    notifications: {
      email: boolean;
      push: boolean;
      newsletter: boolean;
    };
    units: 'metric' | 'imperial';
    theme: 'light' | 'dark' | 'system';
  };
  stats: {
    totalContributions: number;
    totalPoints: number;
    contributionsByType: Record<string, number>;
    lastContribution?: Date;
  };
  unlockedRewards: string[];
  activeSubscriptions: string[];
}

export class UserProfile {
  private rewardEngine: RewardEngine;
  private billingBridge: BillingBridge;
  private contributionTracker: ContributionTracker;

  constructor() {
    this.rewardEngine = new RewardEngine();
    this.billingBridge = new BillingBridge();
    this.contributionTracker = new ContributionTracker();
  }

  async getUserProfile(userId: string): Promise<UserProfileData> {
    // In a real implementation, this would fetch from your user database
    // For now, we'll return a mock user with some sample data
    const stats = await this.contributionTracker.getUserContributionStats(userId);
    
    const mockUser: UserProfileData = {
      id: userId,
      displayName: 'John Doe',
      email: 'john.doe@example.com',
      avatarUrl: 'https://ui-avatars.com/api/?name=John+Doe',
      joinDate: new Date('2023-01-15'),
      lastActive: new Date(),
      rank: stats.rank.level,
      credits: 750, // Would come from user's account
      preferences: {
        language: 'fr',
        notifications: {
          email: true,
          push: true,
          newsletter: true
        },
        units: 'metric',
        theme: 'system'
      },
      stats: {
        totalContributions: stats.totalContributions,
        totalPoints: stats.totalPoints,
        contributionsByType: stats.byType,
        lastContribution: stats.lastContribution || undefined
      },
      unlockedRewards: this.getUnlockedRewards(stats.rank.level),
      activeSubscriptions: ['basic']
    };

    return mockUser;
  }

  private getUnlockedRewards(rank: UserRank): string[] {
    // This would come from the database in a real implementation
    const baseRewards = [
      'highres_tiles',
      'advanced_stats'
    ];

    if (rank >= UserRank.EXPERT) {
      baseRewards.push('suggestions');
    }

    if (rank >= UserRank.MASTER) {
      baseRewards.push('centimetric_correction');
    }

    return baseRewards;
  }

  async updateUserPreferences(
    userId: string, 
    updates: Partial<UserProfileData['preferences']>
  ): Promise<boolean> {
    // In a real implementation, this would update the user's preferences in the database
    console.log(`Updating preferences for user ${userId}:`, updates);
    return true;
  }

  async getUserRankProgress(userId: string) {
    const stats = await this.contributionTracker.getUserContributionStats(userId);
    const currentRank = stats.rank.level;
    const nextRank = Math.min(currentRank + 1, UserRank.GRANDMASTER);
    
    return {
      currentRank: {
        level: currentRank,
        name: PrecisionRank.getRankName(currentRank as UserRank)
      },
      nextRank: {
        level: nextRank,
        name: PrecisionRank.getRankName(nextRank as UserRank),
        pointsNeeded: stats.rank.nextLevelPoints
      },
      progress: (stats.totalPoints % 100) / 100, // Assuming 100 points per level for simplicity
      rankBenefits: this.rewardEngine.getRankBenefits(currentRank as UserRank)
    };
  }

  async getAvailableRewards(userId: string) {
    const profile = await this.getUserProfile(userId);
    return this.rewardEngine.getAvailableRewards(profile.rank);
  }

  async claimReward(userId: string, rewardId: string) {
    const profile = await this.getUserProfile(userId);
    const reward = (await this.getAvailableRewards(userId)).find(r => r.id === rewardId);
    
    if (!reward) {
      throw new Error('Récompense non disponible');
    }

    if (reward.value > 0 && profile.credits < reward.value) {
      throw new Error('Crédits insuffisants');
    }

    // In a real implementation, you would:
    // 1. Deduct credits if needed
    // 2. Grant the reward (e.g., enable feature, add to unlocked rewards)
    // 3. Log the transaction
    
    return {
      success: true,
      rewardId,
      creditsSpent: reward.value,
      remainingCredits: profile.credits - (reward.value || 0),
      message: 'Récompense débloquée avec succès!'
    };
  }

  async getUserActivity(userId: string, options: { limit?: number } = {}) {
    const { contributions } = await this.contributionTracker.getUserContributions(
      userId, 
      { 
        limit: options.limit || 10,
        status: 'validated'
      }
    );

    return contributions.map(contribution => ({
      id: contribution.id,
      type: this.formatContributionType(contribution.type),
      points: contribution.value,
      date: contribution.timestamp,
      metadata: contribution.metadata
    }));
  }

  private formatContributionType(type: string): string {
    const types: Record<string, string> = {
      'gnss': 'Données GNSS',
      'photo': 'Photo géoréférencée',
      'suggestion': 'Suggestion carto',
      'validation': 'Validation',
      'layer': 'Couche partagée',
      'other': 'Autre contribution'
    };

    return types[type] || type;
  }
}
