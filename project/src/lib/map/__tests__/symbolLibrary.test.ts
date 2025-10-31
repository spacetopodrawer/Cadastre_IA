import { describe, it, expect } from 'vitest';
import { 
  symbolLibrary, 
  findMatchingSymbol, 
  getSymbolsByCategory,
  searchSymbols,
  symbolToText,
  symbolCategories
} from '../symbolLibrary';

describe('Symbol Library', () => {
  it('should contain expected symbols', () => {
    // Vérifie que les symboles de base sont présents
    expect(symbolLibrary.bollard).toBeDefined();
    expect(symbolLibrary.tree).toBeDefined();
    expect(symbolLibrary.house).toBeDefined();
    expect(symbolLibrary.road).toBeDefined();
  });

  it('should find matching symbols by text', () => {
    // Test de correspondance exacte
    const borne = findMatchingSymbol('borne');
    expect(borne).toBeDefined();
    expect(borne?.keywords).toContain('borne');
    
    // Test de correspondance partielle
    const arbre = findMatchingSymbol('un bel arbre');
    expect(arbre).toBeDefined();
    expect(arbre?.keywords).toContain('arbre');
    
    // Test de non-correspondance
    const notFound = findMatchingSymbol('motquinexistepas');
    expect(notFound).toBeUndefined();
  });

  it('should filter symbols by category', () => {
    const infrastructure = getSymbolsByCategory('infrastructure');
    expect(Object.keys(infrastructure).length).toBeGreaterThan(0);
    
    // Vérifie que tous les symboles retournés sont bien dans la catégorie demandée
    Object.values(infrastructure).forEach(symbol => {
      expect(symbol.category).toBe('infrastructure');
    });
  });

  it('should search symbols by query', () => {
    const results = searchSymbols('arbre');
    expect(results.length).toBeGreaterThan(0);
    
    // Vérifie que les résultats contiennent le terme recherché dans les mots-clés ou la description
    results.forEach(symbol => {
      const searchableText = [
        ...symbol.keywords,
        symbol.description,
        symbol.category
      ].join(' ').toLowerCase();
      
      expect(searchableText).toContain('arbre');
    });
  });

  it('should convert symbols to text representation', () => {
    const symbol = symbolLibrary.tree;
    const text = symbolToText(symbol);
    
    // Vérifie que la représentation texte n'est pas vide
    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
    
    // Pour les symboles unicode, vérifie que c'est bien un caractère unique
    if (symbol.type === 'unicode') {
      expect([...text].length).toBe(1);
    }
  });

  it('should have valid categories', () => {
    // Vérifie que toutes les catégories sont définies et non vides
    Object.entries(symbolCategories).forEach(([key, label]) => {
      expect(key).toBeTruthy();
      expect(label).toBeTruthy();
      
      // Vérifie qu'il y a au moins un symbole dans chaque catégorie
      const symbols = getSymbolsByCategory(key);
      expect(Object.keys(symbols).length).toBeGreaterThan(0);
    });
  });

  it('should have valid symbol definitions', () => {
    // Vérifie que chaque symbole a une définition valide
    Object.entries(symbolLibrary).forEach(([id, symbol]) => {
      expect(symbol.type).toMatch(/^(unicode|svg|icon)$/);
      expect(symbol.value).toBeTruthy();
      expect(symbol.category).toBeTruthy();
      expect(Array.isArray(symbol.keywords)).toBe(true);
      expect(symbol.description).toBeTruthy();
      
      // Vérifie que la catégorie est valide
      expect(Object.keys(symbolCategories)).toContain(symbol.category);
      
      // Vérifie que l'ID est cohérent avec la clé
      expect(id).toMatch(/^[a-z0-9_]+$/); // snake_case
    });
  });
});
