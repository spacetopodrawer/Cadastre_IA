import React from 'react';
import { useRewards } from '@/contexts/RewardContext';
import { CheckCircleIcon, LockClosedIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

type RewardType = 'access' | 'service' | 'data' | 'feature';

const rewardTypeIcons: Record<RewardType, string> = {
  'access': '🔓',
  'service': '⚙️',
  'data': '📊',
  'feature': '✨',
};

export const RewardsList: React.FC = () => {
  const { userProfile, isLoading, claimReward } = useRewards();
  const [isClaiming, setIsClaiming] = React.useState<Record<string, boolean>>({});

  const handleClaimReward = async (rewardId: string) => {
    if (!userProfile) return;
    
    setIsClaiming(prev => ({ ...prev, [rewardId]: true }));
    try {
      const result = await claimReward(rewardId);
      // Show success message
      console.log(result.message);
    } catch (error) {
      console.error('Failed to claim reward:', error);
    } finally {
      setIsClaiming(prev => ({ ...prev, [rewardId]: false }));
    }
  };

  if (isLoading || !userProfile) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 bg-white rounded-lg shadow animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  const availableRewards = userProfile.unlockedRewards.map(rewardId => {
    // In a real app, you would get this from your reward service
    const reward = {
      id: rewardId,
      name: rewardId.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      description: `Description for ${rewardId}`,
      type: 'feature' as RewardType,
      value: 0,
    };
    return {
      ...reward,
      claimed: userProfile.unlockedRewards.includes(rewardId),
    };
  });

  return (
    <div className="space-y-4">
      {availableRewards.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Aucune récompense disponible pour le moment. Continuez à contribuer pour débloquer des récompenses !
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {availableRewards.map((reward) => (
            <div 
              key={reward.id}
              className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">{rewardTypeIcons[reward.type] || '🎁'}</span>
                    <h3 className="text-lg font-medium text-gray-900">{reward.name}</h3>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {reward.description}
                  </p>
                </div>
                
                <div className="ml-4">
                  {reward.claimed ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      Débloqué
                    </span>
                  ) : reward.value > 0 ? (
                    <button
                      onClick={() => handleClaimReward(reward.id)}
                      disabled={isClaiming[reward.id]}
                      className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${
                        userProfile.credits >= reward.value
                          ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isClaiming[reward.id] ? (
                        <>
                          <ArrowPathIcon className="animate-spin h-4 w-4 mr-1" />
                          En cours...
                        </>
                      ) : (
                        `${reward.value} crédits`
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleClaimReward(reward.id)}
                      disabled={isClaiming[reward.id]}
                      className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    >
                      {isClaiming[reward.id] ? (
                        <>
                          <ArrowPathIcon className="animate-spin h-4 w-4 mr-1" />
                          En cours...
                        </>
                      ) : (
                        'Débloquer'
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {reward.value > 0 && !reward.claimed && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  {userProfile.credits >= reward.value ? (
                    `Coûte ${reward.value} crédits`
                  ) : (
                    `Il vous manque ${reward.value - userProfile.credits} crédits`
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RewardsList;
