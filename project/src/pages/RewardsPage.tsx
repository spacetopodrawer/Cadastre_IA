import React from 'react';
import { useRewards } from '@/contexts/RewardContext';
import { UserRewardStatus } from '@/components/rewards/UserRewardStatus';
import RewardsList from '@/components/rewards/RewardsList';
import { UserRank } from '@/lib/rewards';

const RewardsPage: React.FC = () => {
  const { userProfile, isLoading, error } = useRewards();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-64 bg-white rounded-lg shadow"></div>
              <div className="md:col-span-2 space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-white rounded-lg shadow"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Erreur de chargement</h2>
          <p className="text-gray-600 mb-6">Impossible de charger les informations de récompenses.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord des récompenses</h1>
          <p className="text-gray-600 mt-2">
            Suivez votre progression et découvrez les récompenses disponibles
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sidebar - User status */}
          <div className="lg:col-span-1">
            <UserRewardStatus />
            
            {userProfile && (
              <div className="mt-6 p-6 bg-white rounded-xl shadow-md">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Progression</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Niveau actuel</span>
                      <span className="font-medium">
                        {userProfile.rank.charAt(0) + userProfile.rank.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${(userProfile.stats.totalPoints % 100 / 100) * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 text-right">
                      {userProfile.stats.totalPoints} / {Math.ceil(userProfile.stats.totalPoints / 100) * 100} points
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Contributions validées</span>
                      <span className="font-medium">{userProfile.stats.totalContributions}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main content - Rewards */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">Récompenses disponibles</h2>
                <p className="text-gray-600 mt-1">
                  Débloquez des récompenses en contribuant à la plateforme
                </p>
              </div>
              <div className="p-6">
                <RewardsList />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewardsPage;
