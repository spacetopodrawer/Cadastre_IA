export enum UserRank {
  NOVICE = 0,
  CONTRIBUTOR = 1,
  TRUSTED = 2,
  EXPERT = 3,
  MASTER = 4,
  GRANDMASTER = 5
}

export interface UserContribution {
  gnssQuality: number; // 0-5 scale
  photoContributions: number; // Number of georeferenced photos
  mappingSuggestions: number; // Number of mapping suggestions
  validatedLayers: number; // Number of validated layers
  fieldDataQuality: number; // 0-5 scale
  lastContributionDate: Date;
}

export class PrecisionRank {
  static calculateRank(contribution: UserContribution): UserRank {
    let score = 0;
    
    // GNSS Quality (max 20 points)
    score += contribution.gnssQuality * 4;
    
    // Photo contributions (max 20 points)
    score += Math.min(contribution.photoContributions * 0.5, 20);
    
    // Mapping suggestions (max 20 points)
    score += Math.min(contribution.mappingSuggestions * 0.3, 20);
    
    // Validated layers (max 20 points)
    score += Math.min(contribution.validatedLayers * 2, 20);
    
    // Field data quality (max 20 points)
    score += contribution.fieldDataQuality * 4;
    
    // Determine rank based on score (0-100 scale)
    if (score >= 90) return UserRank.GRANDMASTER;
    if (score >= 75) return UserRank.MASTER;
    if (score >= 60) return UserRank.EXPERT;
    if (score >= 40) return UserRank.TRUSTED;
    if (score >= 20) return UserRank.CONTRIBUTOR;
    return UserRank.NOVICE;
  }

  static getRankName(rank: UserRank): string {
    return UserRank[rank].toLowerCase();
  }

  static getRankBenefits(rank: UserRank): string[] {
    const benefits: Record<UserRank, string[]> = {
      [UserRank.NOVICE]: [
        'Accès aux tuiles de base',
        'Contributions limitées'
      ],
      [UserRank.CONTRIBUTOR]: [
        'Accès aux tuiles standard',
        'Contributions modérées',
        'Accès aux statistiques de base'
      ],
      [UserRank.TRUSTED]: [
        'Accès aux tuiles haute résolution',
        'Contributions illimitées',
        'Statistiques avancées',
        'Accès aux suggestions carto'
      ],
      [UserRank.EXPERT]: [
        'Tous les avantages Trusted',
        'Accès aux corrections décimétriques',
        'Accès aux données brutes',
        'Support prioritaire'
      ],
      [UserRank.MASTER]: [
        'Tous les avantages Expert',
        'Accès aux corrections centimétriques',
        'Accès aux couches premium',
        'Accès aux outils avancés'
      ],
      [UserRank.GRANDMASTER]: [
        'Tous les avantages Master',
        'Accès illimité à toutes les fonctionnalités',
        'Support personnalisé',
        'Accès anticipé aux nouvelles fonctionnalités'
      ]
    };

    return benefits[rank] || [];
  }
}
