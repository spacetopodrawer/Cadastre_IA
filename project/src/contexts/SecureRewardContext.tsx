import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { rewardService, type RewardClaimResponse } from '@/lib/api/rewardService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface RewardContextState {
  rewards: any[];
  userRewards: any[];
  isLoading: boolean;
  error: string | null;
  claimReward: (rewardId: string) => Promise<RewardClaimResponse>;
  refreshRewards: () => Promise<void>;
}

const RewardContext = createContext<RewardContextState | undefined>(undefined);

// Rate limiting and anti-spam protection
const claimCooldown = new Map<string, number>();
const CLAIM_COOLDOWN_MS = 5000; // 5 seconds cooldown between claims

export const SecureRewardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<RewardContextState, 'claimReward' | 'refreshRewards'>>({
    rewards: [],
    userRewards: [],
    isLoading: true,
    error: null,
  });

  const refreshRewards = useCallback(async () => {
    if (!user) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const [rewards, userRewards] = await Promise.all([
        rewardService.getAvailableRewards(),
        rewardService.getUserRewards(),
      ]);
      
      setState(prev => ({
        ...prev,
        rewards,
        userRewards,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to load rewards:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to load rewards. Please try again later.',
        isLoading: false,
      }));
    }
  }, [user]);

  const claimReward = useCallback(async (rewardId: string): Promise<RewardClaimResponse> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check cooldown
    const now = Date.now();
    const lastClaim = claimCooldown.get(rewardId) || 0;
    if (now - lastClaim < CLAIM_COOLDOWN_MS) {
      throw new Error('Please wait before claiming this reward again');
    }

    try {
      claimCooldown.set(rewardId, now);
      
      const response = await rewardService.withRateLimit(() => 
        rewardService.claimReward({ rewardId })
      );
      
      if (response.success) {
        await refreshRewards();
        toast.success('Reward claimed successfully!');
      }
      
      return response;
    } catch (error) {
      console.error('Claim reward error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to claim reward');
      throw error;
    }
  }, [user, refreshRewards]);

  // Initial load
  useEffect(() => {
    refreshRewards();
    
    // Set up refresh interval
    const interval = setInterval(refreshRewards, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [refreshRewards]);

  return (
    <RewardContext.Provider
      value={{
        ...state,
        claimReward,
        refreshRewards,
      }}
    >
      {children}
    </RewardContext.Provider>
  );
};

export const useSecureRewards = (): RewardContextState => {
  const context = useContext(RewardContext);
  if (!context) {
    throw new Error('useSecureRewards must be used within a SecureRewardProvider');
  }
  return context;
};

// HOC for protecting reward-related routes
export const withRewardProtection = <P extends object>(
  WrappedComponent: React.ComponentType<P>
) => {
  const WithRewardProtection: React.FC<P> = (props) => {
    const { user } = useAuth();
    
    useEffect(() => {
      if (!user) {
        // Redirect to login if not authenticated
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      
      // Additional permission checks can be added here
      if (user.role === 'BANNED') {
        window.location.href = '/banned';
      }
    }, [user]);

    return <WrappedComponent {...props} />;
  };

  return WithRewardProtection;
};
