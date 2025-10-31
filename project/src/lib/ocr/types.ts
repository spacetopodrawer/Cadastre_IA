export interface CorrectionEntry {
  id: string;
  original: string;
  corrected: string;
  source: 'user' | 'agent' | 'external' | 'history';
  confidence: number;
  context?: string;
  createdAt: string;
  updatedAt: string;
  appliedCount: number;
  rejectedCount: number;
  lastAppliedAt?: string;
  lastRejectedAt?: string;
  metadata?: Record<string, any>;
}

export interface CorrectionFilter {
  source?: CorrectionEntry['source'] | 'all';
  searchTerm?: string;
  minConfidence?: number;
  dateRange?: {
    from: string;
    to: string;
  };
}

export interface CorrectionStats {
  total: number;
  bySource: {
    user: number;
    agent: number;
    external: number;
    history: number;
  };
  averageConfidence: number;
  lastUpdated: string;
}
