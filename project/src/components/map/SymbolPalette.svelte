<script lang="ts">
  import { onMount } from 'svelte';
  import { symbolLibrary, getSymbolsByCategory, type SymbolDefinition } from '$lib/map/symbolLibrary';
  
  // Propriétés du composant
  export let selectedSymbol: SymbolDefinition | null = null;
  export let onSelect: (symbol: SymbolDefinition) => void = () => {};
  
  // État local
  let activeCategory: string = 'all';
  let searchQuery: string = '';
  let filteredSymbols: Record<string, SymbolDefinition> = {};
  
  // Catégories disponibles
  const categories = [
    { id: 'all', label: 'Tous les symboles' },
    { id: 'infrastructure', label: 'Infrastructures' },
    { id: 'vegetation', label: 'Végétation' },
    { id: 'building', label: 'Bâtiments' },
    { id: 'transport', label: 'Transports' },
    { id: 'water', label: 'Eau' },
    { id: 'hazard', label: 'Dangers' },
    { id: 'boundary', label: 'Limites' },
    { id: 'utility', label: 'Réseaux' },
    { id: 'special', label: 'Spéciaux' }
  ];
  
  // Filtre les symboles en fonction de la catégorie et de la recherche
  function filterSymbols() {
    // Filtre par catégorie
    const byCategory = activeCategory === 'all' 
      ? { ...symbolLibrary } 
      : getSymbolsByCategory(activeCategory);
    
    // Filtre par recherche
    if (!searchQuery.trim()) {
      filteredSymbols = byCategory;
      return;
    }
    
    const query = searchQuery.toLowerCase();
    filteredSymbols = Object.fromEntries(
      Object.entries(byCategory).filter(([_, symbol]) => {
        const searchText = [
          ...symbol.keywords,
          symbol.description,
          symbol.category
        ].join(' ').toLowerCase();
        
        return searchText.includes(query);
      })
    );
  }
  
  // Gestionnaire de sélection de symbole
  function selectSymbol(symbol: SymbolDefinition) {
    selectedSymbol = symbol;
    onSelect(symbol);
  }
  
  // Initialisation
  onMount(() => {
    filterSymbols();
  });
  
  // Réagit aux changements de catégorie et de recherche
  $: if (activeCategory || searchQuery) {
    filterSymbols();
  }
</script>

<div class="symbol-palette">
  <!-- Barre de recherche -->
  <div class="search-container">
    <input 
      type="text" 
      bind:value={searchQuery}
      placeholder="Rechercher un symbole..."
      class="search-input"
    />
  </div>
  
  <!-- Catégories -->
  <div class="categories">
    {#each categories as category}
      <button
        class="category-btn {activeCategory === category.id ? 'active' : ''}"
        on:click={() => activeCategory = category.id}
        aria-label={category.label}
        title={category.label}
      >
        {category.label}
      </button>
    {/each}
  </div>
  
  <!-- Grille de symboles -->
  <div class="symbols-grid">
    {#each Object.entries(filteredSymbols) as [id, symbol]}
      <button
        class="symbol-btn {selectedSymbol?.value === symbol.value ? 'selected' : ''}"
        on:click={() => selectSymbol(symbol)}
        aria-label={symbol.description}
        title={symbol.description}
      >
        {#if symbol.type === 'unicode'}
          <span class="symbol-char">{symbol.value}</span>
        {:else if symbol.type === 'svg'}
          <div class="symbol-svg" innerHTML={symbol.value}></div>
        {:else}
          <i class="material-icons">{symbol.value}</i>
        {/if}
      </button>
    {/each}
  </div>
  
  <!-- Détails du symbole sélectionné -->
  {#if selectedSymbol}
    <div class="symbol-details">
      <div class="symbol-preview">
        {#if selectedSymbol.type === 'unicode'}
          <span class="preview-char">{selectedSymbol.value}</span>
        {:else if selectedSymbol.type === 'svg'}
          <div class="preview-svg" innerHTML={selectedSymbol.value}></div>
        {:else}
          <i class="material-icons preview-icon">{selectedSymbol.value}</i>
        {/if}
      </div>
      <div class="symbol-info">
        <h3>{selectedSymbol.description}</h3>
        <div class="symbol-meta">
          <span class="category">{categories.find(c => c.id === selectedSymbol.category)?.label || selectedSymbol.category}</span>
          {#if selectedSymbol.metadata?.author}
            <span class="author">par {selectedSymbol.metadata.author}</span>
          {/if}
        </div>
        <div class="symbol-keywords">
          {#each selectedSymbol.keywords as keyword}
            <span class="keyword">{keyword}</span>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .symbol-palette {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #f8f9fa;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .search-container {
    padding: 12px;
    background: #fff;
    border-bottom: 1px solid #e9ecef;
  }
  
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 14px;
  }
  
  .categories {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    background: #f1f3f5;
    border-bottom: 1px solid #dee2e6;
    overflow-x: auto;
  }
  
  .category-btn {
    padding: 4px 12px;
    border: none;
    border-radius: 16px;
    background: #e9ecef;
    color: #495057;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }
  
  .category-btn:hover {
    background: #dee2e6;
  }
  
  .category-btn.active {
    background: #4dabf7;
    color: white;
  }
  
  .symbols-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 8px;
    padding: 12px;
    overflow-y: auto;
  }
  
  .symbol-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
  }
  
  .symbol-btn:hover {
    background: #f1f3f5;
    transform: translateY(-2px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .symbol-btn.selected {
    border-color: #4dabf7;
    background: #e7f5ff;
    box-shadow: 0 0 0 2px rgba(77, 171, 247, 0.3);
  }
  
  .symbol-char {
    font-size: 24px;
    line-height: 1;
  }
  
  .symbol-svg {
    width: 24px;
    height: 24px;
  }
  
  .material-icons {
    font-size: 24px;
    color: #495057;
  }
  
  .symbol-details {
    padding: 12px;
    background: white;
    border-top: 1px solid #e9ecef;
  }
  
  .symbol-preview {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 60px;
    margin-bottom: 12px;
    background: #f8f9fa;
    border-radius: 4px;
  }
  
  .preview-char {
    font-size: 40px;
    line-height: 1;
  }
  
  .preview-svg {
    width: 48px;
    height: 48px;
  }
  
  .preview-icon {
    font-size: 48px;
    color: #4dabf7;
  }
  
  .symbol-info h3 {
    margin: 0 0 8px;
    font-size: 14px;
    color: #212529;
  }
  
  .symbol-meta {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #6c757d;
  }
  
  .category {
    background: #e9ecef;
    padding: 2px 8px;
    border-radius: 10px;
  }
  
  .symbol-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .keyword {
    background: #e7f5ff;
    color: #1971c2;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
  }
</style>
