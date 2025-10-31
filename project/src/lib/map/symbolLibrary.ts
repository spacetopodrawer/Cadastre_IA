/**
 * Bibliothèque de symboles pour la cartographie terrain
 * 
 * Cette bibliothèque fournit des symboles pour les objets cartographiques courants,
 * avec prise en charge de plusieurs formats (Unicode, SVG, et références d'icônes).
 * Elle est conçue pour fonctionner avec LLMAssistant.ts et OfflineMapRenderer.ts.
 */

type SymbolType = 'unicode' | 'svg' | 'icon';

interface SymbolDefinition {
  /** Type de symbole (unicode, svg, ou référence d'icône) */
  type: SymbolType;
  /** Représentation du symbole (caractère Unicode, code SVG, ou nom d'icône) */
  value: string;
  /** Catégorie de l'objet pour le filtrage */
  category: string;
  /** Mots-clés pour la recherche et la correspondance */
  keywords: string[];
  /** Description de l'objet */
  description: string;
  /** Auteur/contributeur du symbole */
  author?: string;
  /** Date d'ajout ou de dernière modification */
  lastUpdated?: Date;
  /** Métadonnées supplémentaires */
  metadata?: Record<string, any>;
}

/**
 * Bibliothèque principale de symboles
 * Clé : identifiant unique du symbole (en anglais, snake_case)
 * Valeur : définition complète du symbole
 */
export const symbolLibrary: Record<string, SymbolDefinition> = {
  // Infrastructure routière
  bollard: {
    type: 'unicode',
    value: '🟫',
    category: 'infrastructure',
    keywords: ['borne', 'bollard', 'poteau', 'bornage'],
    description: 'Borne ou poteau de signalisation',
    metadata: {
      height: 1.0,
      color: '#8B4513',
      isFixed: true
    }
  },
  
  // Végétation
  tree: {
    type: 'unicode',
    value: '🌳',
    category: 'vegetation',
    keywords: ['arbre', 'tree', 'végétation', 'forêt'],
    description: 'Arbre isolé ou en groupe',
    metadata: {
      height: 5.0,
      isNatural: true
    }
  },
  
  // Bâtiments
  house: {
    type: 'unicode',
    value: '🏠',
    category: 'building',
    keywords: ['maison', 'house', 'habitation', 'bâtiment'],
    description: 'Habitation individuelle',
    metadata: {
      height: 6.0,
      isBuilding: true
    }
  },
  
  // Infrastructure
  road: {
    type: 'unicode',
    value: '🛣️',
    category: 'infrastructure',
    keywords: ['route', 'road', 'chemin', 'voie'],
    description: 'Route ou voie de circulation',
    metadata: {
      isLinear: true,
      isNavigable: true
    }
  },
  
  // Points d'eau
  water_tap: {
    type: 'unicode',
    value: '🚰',
    category: 'water',
    keywords: ['point eau', 'borne incendie', 'fontaine', 'pompe'],
    description: 'Point d\'eau ou borne incendie',
    metadata: {
      isWaterSource: true,
      isEmergency: true
    }
  },
  
  // Autres catégories...
  // ... (autres symboles de la liste originale)
};

/**
 * Trouve le symbole le plus approprié pour un texte donné
 * @param text Texte à analyser pour la correspondance
 * @returns La définition du symbole correspondant ou undefined si non trouvé
 */
export function findMatchingSymbol(text: string): SymbolDefinition | undefined {
  if (!text) return undefined;
  
  const lowerText = text.toLowerCase();
  let bestMatch: { score: number; symbol: SymbolDefinition } | null = null;
  
  // Parcourir tous les symboles pour trouver la meilleure correspondance
  for (const [_, symbol] of Object.entries(symbolLibrary)) {
    // Vérifier les mots-clés
    const keywordScore = symbol.keywords.reduce((score, keyword) => {
      return score + (lowerText.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);
    
    // Vérifier la correspondance exacte avec la description
    const exactMatch = symbol.keywords.some(
      kw => kw.toLowerCase() === lowerText
    );
    
    const score = exactMatch ? 100 : keywordScore * 10;
    
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { score, symbol };
    }
  }
  
  return bestMatch?.symbol;
}

/**
 * Filtre les symboles par catégorie
 * @param category Catégorie de symboles à récupérer
 * @returns Objet contenant les symboles de la catégorie demandée
 */
export function getSymbolsByCategory(category: string): Record<string, SymbolDefinition> {
  return Object.fromEntries(
    Object.entries(symbolLibrary).filter(([_, def]) => def.category === category)
  );
}

/**
 * Recherche des symboles correspondant à une requête
 * @param query Terme de recherche
 * @returns Tableau des définitions de symboles correspondants
 */
export function searchSymbols(query: string): SymbolDefinition[] {
  if (!query) return [];
  
  const lowerQuery = query.toLowerCase();
  return Object.values(symbolLibrary).filter(symbol => {
    return (
      symbol.keywords.some(kw => kw.toLowerCase().includes(lowerQuery)) ||
      symbol.description.toLowerCase().includes(lowerQuery) ||
      symbol.category.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Convertit un symbole en représentation texte pour l'affichage
 * @param symbol Définition du symbole
 * @returns Représentation textuelle du symbole
 */
export function symbolToText(symbol: SymbolDefinition): string {
  switch (symbol.type) {
    case 'unicode':
      return symbol.value;
    case 'svg':
      return '📐';
    case 'icon':
      return '🖼️';
    default:
      return '📍';
  }
}

/**
 * Interface pour les catégories de symboles
 */
export const symbolCategories = {
  infrastructure: 'Infrastructure',
  vegetation: 'Végétation',
  building: 'Bâtiments',
  water: 'Eau',
  landmark: 'Points de repère',
  emergency: 'Urgence et sécurité',
  transport: 'Transports',
  utility: 'Utilitaires'
} as const;

export type SymbolCategory = keyof typeof symbolCategories;

// Export des types
export type { SymbolDefinition };

// Pour le support HMR
if (import.meta.hot) {
  // @ts-ignore - Vite HMR
  import.meta.hot.accept(() => {
    console.log('Mise à jour de la bibliothèque de symboles');
  });
}
