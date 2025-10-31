import { useState } from 'react';
import { rewardService } from '@/lib/rewards';

type ContributionType = 'gnss' | 'photo' | 'suggestion' | 'validation' | 'layer' | 'other';

interface ContributionOptions {
  type: ContributionType;
  value?: number;
  metadata?: Record<string, any>;
  onSuccess?: (contribution: any) => void;
  onError?: (error: Error) => void;
}

export const useContributionTracker = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const trackContribution = async (userId: string, options: ContributionOptions) => {
    const { type, value = 10, metadata = {}, onSuccess, onError } = options;
    
    setIsTracking(true);
    setError(null);

    try {
      // In a real implementation, you would call your backend API
      // which would then use the rewardService to track the contribution
      const contribution = {
        userId,
        type,
        value,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          clientInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
          },
        },
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Tracked contribution:', contribution);
      }

      onSuccess?.(contribution);
      return contribution;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to track contribution');
      console.error('Error tracking contribution:', error);
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsTracking(false);
    }
  };

  return { trackContribution, isTracking, error };
};

// Example usage in a component:
/*
function MyComponent() {
  const { trackContribution } = useContributionTracker();
  
  const handleUploadPhoto = async (photoData) => {
    try {
      await trackContribution('user123', {
        type: 'photo',
        value: 15,
        metadata: {
          photoId: photoData.id,
          location: photoData.location,
          size: photoData.size,
        },
        onSuccess: () => {
          // Show success message
        },
      });
    } catch (error) {
      // Handle error
    }
  };
  
  // ...
}
*/
