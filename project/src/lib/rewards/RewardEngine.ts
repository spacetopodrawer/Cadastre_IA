import { UserRank, PrecisionRank } from './PrecisionRank';

export interface Reward {
  id: string;
  name: string;
  description: string;
  requiredRank: UserRank;
  type: 'access' | 'service' | 'data' | 'feature';
  value: number; // In credits or other relevant unit
  isRecurring: boolean;
}

export class RewardEngine {
  private availableRewards: Reward[] = [
    {
      id: 'highres_tiles',
      name: 'Tuiles haute résolution',
      description: 'Accès aux tuiles cartographiques haute résolution',
      requiredRank: UserRank.TRUSTED,
      type: 'access',
      value: 0,
      isRecurring: true
    },
    {
      id: 'centimetric_correction',
      name: 'Correction centimétrique',
      description: 'Accès aux corrections GNSS centimétriques',
      requiredRank: UserRank.MASTER,
      type: 'service',
      value: 100, // credits
      isRecurring: true
    },
    {
      id: 'advanced_stats',
      name: 'Statistiques avancées',
      description: 'Accès aux statistiques détaillées des contributions',
      requiredRank: UserRank.TRUSTED,
      type: 'feature',
      value: 0,
      isRecurring: true
    },
    {
      id: 'suggestions',
      name: 'Suggestions cartographiques',
      description: 'Accès aux suggestions cartographiques enrichies',
      requiredRank: UserRank.TRUSTED,
      type: 'feature',
      value: 0,
      isRecurring: true
    },
    {
      id: 'premium_export',
      name: 'Export premium',
      description: 'Export de données aux formats avancés',
      requiredRank: UserRank.EXPERT,
      type: 'service',
      value: 50, // credits per use
      isRecurring: false
    }
  ];

  getAvailableRewards(userRank: UserRank): Reward[] {
    return this.availableRewards.filter(reward => userRank >= reward.requiredRank);
  }

  canClaimReward(userRank: UserRank, rewardId: string): boolean {
    const reward = this.availableRewards.find(r => r.id === rewardId);
    if (!reward) return false;
    
    return userRank >= reward.requiredRank;
  }

  calculateRewardValue(contribution: any): number {
    // Calculate credit value based on contribution type and quality
    let value = 0;
    
    switch (contribution.type) {
      case 'gnss':
        value = 10 * (contribution.quality || 1); // 10-50 credits
        break;
      case 'photo':
        value = 5 * (contribution.quality || 1); // 5-25 credits
        break;
      case 'suggestion':
        value = 15 * (contribution.quality || 1); // 15-75 credits
        break;
      case 'validation':
        value = 20 * (contribution.quality || 1); // 20-100 credits
        break;
    }
    
    return Math.round(value);
  }

  getRankBenefits(userRank: UserRank): string[] {
    return PrecisionRank.getRankBenefits(userRank);
  }
}
