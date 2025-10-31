import axios from 'axios';
import { getAuthToken } from '@/lib/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const rewardApi = axios.create({
  baseURL: `${API_BASE_URL}/rewards`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for auth token
rewardApi.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
rewardApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      window.location.href = '/login?session_expired=true';
    }
    return Promise.reject(error);
  }
);

export interface RewardClaimRequest {
  rewardId: string;
  metadata?: Record<string, unknown>;
}

export interface RewardClaimResponse {
  success: boolean;
  message: string;
  reward?: {
    id: string;
    name: string;
    value: number;
  };
  userBalance?: number;
}

export const rewardService = {
  async claimReward(data: RewardClaimRequest): Promise<RewardClaimResponse> {
    try {
      const response = await rewardApi.post<RewardClaimResponse>('/claim', data);
      return response.data;
    } catch (error) {
      console.error('Failed to claim reward:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to claim reward. Please try again.'
      );
    }
  },

  async getUserRewards() {
    try {
      const response = await rewardApi.get('/user/rewards');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user rewards:', error);
      throw error;
    }
  },

  async getAvailableRewards() {
    try {
      const response = await rewardApi.get('/available');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch available rewards:', error);
      throw error;
    }
  },

  // Add rate limiting protection
  async withRateLimit<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (error.response?.status === 429) {
          // Exponential backoff
          await new Promise(resolve => 
            setTimeout(resolve, Math.pow(2, i) * 1000 + Math.random() * 1000)
          );
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error('Request failed after multiple attempts');
  }
};

export default rewardService;
