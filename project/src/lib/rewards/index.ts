export * from './PrecisionRank';
export * from './RewardEngine';
export * from './BillingBridge';
export * from './ContributionTracker';
export * from './UserProfile';

import { UserProfile } from './UserProfile';

// Singleton instance of the reward service
export class RewardService {
  private static instance: RewardService;
  public userProfile: UserProfile;

  private constructor() {
    this.userProfile = new UserProfile();
  }

  public static getInstance(): RewardService {
    if (!RewardService.instance) {
      RewardService.instance = new RewardService();
    }
    return RewardService.instance;
  }
}

// Export a default instance for convenience
export const rewardService = RewardService.getInstance();
