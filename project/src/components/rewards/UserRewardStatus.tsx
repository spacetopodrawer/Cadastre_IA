import React from 'react';
import { useRewards } from '@/contexts/RewardContext';
import { UserRank, PrecisionRank } from '@/lib/rewards';

const rankIcons: Record<UserRank, string> = {
  [UserRank.NOVICE]: '⭐',
  [UserRank.CONTRIBUTOR]: '🌟',
  [UserRank.TRUSTED]: '💫',
  [UserRank.EXPERT]: '🚀',
  [UserRank.MASTER]: '🏆',
  [UserRank.GRANDMASTER]: '👑',
};

const rankColors: Record<UserRank, string> = {
  [UserRank.NOVICE]: 'text-gray-400',
  [UserRank.CONTRIBUTOR]: 'text-blue-400',
  [UserRank.TRUSTED]: 'text-green-400',
  [UserRank.EXPERT]: 'text-purple-500',
  [UserRank.MASTER]: 'text-yellow-500',
  [UserRank.GRANDMASTER]: 'text-red-500',
};

export const UserRewardStatus: React.FC = () => {
  const { userProfile, isLoading } = useRewards();

  if (isLoading || !userProfile) {
    return (
      <div className="p-4 bg-white rounded-lg shadow animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  const rankName = PrecisionRank.getRankName(userProfile.rank);
  const rankIcon = rankIcons[userProfile.rank] || '⭐';
  const rankColor = rankColors[userProfile.rank] || 'text-gray-600';

  return (
    <div className="p-6 bg-white rounded-xl shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Votre statut</h3>
          <div className={`flex items-center mt-1 ${rankColor}`}>
            <span className="text-2xl mr-2">{rankIcon}</span>
            <span className="text-lg font-medium capitalize">{rankName}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Crédits</div>
          <div className="text-2xl font-bold text-indigo-600">{userProfile.credits}</div>
        </div>
      </div>
      
      <div className="mt-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Progression</span>
          <span>
            {userProfile.stats.totalPoints} points • {userProfile.stats.totalContributions} contributions
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-indigo-600 h-2.5 rounded-full" 
            style={{ width: `${(userProfile.stats.totalPoints % 100 / 100) * 100}%` }}
          ></div>
        </div>
      </div>
      
      {userProfile.stats.lastContribution && (
        <div className="mt-3 text-xs text-gray-500">
          Dernière contribution: {new Date(userProfile.stats.lastContribution).toLocaleDateString('fr-FR')}
        </div>
      )}
    </div>
  );
};

export default UserRewardStatus;
