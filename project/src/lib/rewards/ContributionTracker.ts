import { UserRank, PrecisionRank } from './PrecisionRank';

export interface Contribution {
  id: string;
  userId: string;
  type: 'gnss' | 'photo' | 'suggestion' | 'validation' | 'layer' | 'other';
  timestamp: Date;
  value: number; // Points de contribution
  status: 'pending' | 'validated' | 'rejected';
  metadata: {
    quality?: number; // 1-5 scale
    size?: number; // Taille en octets ou autre unité pertinente
    location?: {
      lat: number;
      lng: number;
      accuracy?: number; // Précision en mètres
    };
    [key: string]: any;
  };
}

export class ContributionTracker {
  private contributions: Map<string, Contribution[]> = new Map();

  async addContribution(contribution: Omit<Contribution, 'id' | 'timestamp' | 'status'>): Promise<Contribution> {
    const contributionId = `cont_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();
    
    const newContribution: Contribution = {
      ...contribution,
      id: contributionId,
      timestamp,
      status: 'pending'
    };

    // Dans une implémentation réelle, cela serait sauvegardé dans une base de données
    if (!this.contributions.has(contribution.userId)) {
      this.contributions.set(contribution.userId, []);
    }
    this.contributions.get(contribution.userId)?.push(newContribution);

    return newContribution;
  }

  async getUserContributions(userId: string, options: {
    limit?: number;
    offset?: number;
    type?: string;
    status?: string;
  } = {}): Promise<{ contributions: Contribution[]; total: number }> {
    const userContributions = this.contributions.get(userId) || [];
    
    let filtered = [...userContributions];
    
    if (options.type) {
      filtered = filtered.filter(c => c.type === options.type);
    }
    
    if (options.status) {
      filtered = filtered.filter(c => c.status === options.status);
    }
    
    const total = filtered.length;
    
    if (options.offset !== undefined) {
      filtered = filtered.slice(options.offset);
    }
    
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return { contributions: filtered, total };
  }

  async validateContribution(contributionId: string, validatorId: string, notes?: string): Promise<boolean> {
    // Dans une implémentation réelle, cela mettrait à jour le statut dans la base de données
    for (const [userId, contributions] of this.contributions.entries()) {
      const contribution = contributions.find(c => c.id === contributionId);
      if (contribution) {
        contribution.status = 'validated';
        if (notes) {
          contribution.metadata.validationNotes = notes;
          contribution.metadata.validatedBy = validatorId;
          contribution.metadata.validatedAt = new Date();
        }
        return true;
      }
    }
    return false;
  }

  async rejectContribution(contributionId: string, validatorId: string, reason: string): Promise<boolean> {
    // Similaire à validateContribution mais marque comme rejeté
    for (const [userId, contributions] of this.contributions.entries()) {
      const contribution = contributions.find(c => c.id === contributionId);
      if (contribution) {
        contribution.status = 'rejected';
        contribution.metadata.rejectionReason = reason;
        contribution.metadata.reviewedBy = validatorId;
        contribution.metadata.reviewedAt = new Date();
        return true;
      }
    }
    return false;
  }

  async getUserContributionStats(userId: string) {
    const { contributions } = await this.getUserContributions(userId);
    const validatedContributions = contributions.filter(c => c.status === 'validated');
    
    const byType = validatedContributions.reduce((acc, curr) => {
      acc[curr.type] = (acc[curr.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const totalPoints = validatedContributions.reduce((sum, curr) => sum + (curr.value || 0), 0);
    
    // Calculer le rang basé sur les contributions
    const contributionData = {
      gnssQuality: Math.min(5, Math.floor((byType['gnss'] || 0) / 10)),
      photoContributions: byType['photo'] || 0,
      mappingSuggestions: byType['suggestion'] || 0,
      validatedLayers: byType['layer'] || 0,
      fieldDataQuality: Math.min(5, Math.floor((byType['validation'] || 0) / 5)),
      lastContributionDate: validatedContributions[0]?.timestamp || new Date(0)
    };
    
    const rank = PrecisionRank.calculateRank(contributionData);
    
    return {
      totalContributions: validatedContributions.length,
      totalPoints,
      byType,
      rank: {
        level: rank,
        name: PrecisionRank.getRankName(rank),
        nextLevelPoints: Math.max(0, 100 - (totalPoints % 100)) // Points jusqu'au prochain niveau
      },
      lastContribution: validatedContributions[0]?.timestamp || null
    };
  }
}
