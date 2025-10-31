import React, { createContext, useContext, useEffect, useState } from 'react';
import { rewardService, type UserProfileData } from '@/lib/rewards';

interface RewardContextType {
  userProfile: UserProfileData | null;
  isLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  claimReward: (rewardId: string) => Promise<{ success: boolean; message: string }>;
}

const RewardContext = createContext<RewardContextType | undefined>(undefined);

export const RewardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = async (userId: string) => {
    try {
      setIsLoading(true);
      const profile = await rewardService.userProfile.getUserProfile(userId);
      setUserProfile(profile);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setError('Failed to load profile. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (userProfile?.id) {
      await fetchUserProfile(userProfile.id);
    }
  };

  const claimReward = async (rewardId: string) => {
    if (!userProfile?.id) {
      return { success: false, message: 'User not authenticated' };
    }

    try {
      const result = await rewardService.userProfile.claimReward(userProfile.id, rewardId);
      await refreshProfile();
      return { success: true, message: result.message };
    } catch (error) {
      console.error('Failed to claim reward:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to claim reward' 
      };
    }
  };

  // In a real app, you would get the user ID from your auth context
  useEffect(() => {
    const userId = 'current-user-id'; // Replace with actual user ID from auth
    if (userId) {
      fetchUserProfile(userId);
    }
  }, []);

  return (
    <RewardContext.Provider 
      value={{ 
        userProfile, 
        isLoading, 
        error, 
        refreshProfile, 
        claimReward 
      }}
    >
      {children}
    </RewardContext.Provider>
  );
};

export const useRewards = (): RewardContextType => {
  const context = useContext(RewardContext);
  if (context === undefined) {
    throw new Error('useRewards must be used within a RewardProvider');
  }
  return context;
};
